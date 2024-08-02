import PDFKit
import CoreServices
import Foundation
import RaycastSwiftMacros
import UniformTypeIdentifiers

enum IndexingError: Error {
    case unableToOpenOrCreateIndex(String)
    case fileNotFound(String)
    case noPermissions(String)
    case failedToAddDocument(String)
    case invalidURL(String)
}

enum CollectionError: Error {
    case invalidSupportPath
    case notADirectory
    case fileDoesNotExist
    case deletionFailed(String)
}

/// Returned objects must be Encodable
struct Document: Encodable {
    let id: Int
    let page: Int
    let file: String
    let score: Float
    var lower: Int?
    var upper: Int?
//    let summary: String
}

struct IndexResult: Encodable {
    let messages: [String]
}

struct SearchResult: Encodable {
    let messages: [String]
    let documents: [Document]
}

enum SearchError: Error {
    case unableToOpenIndex(String)
    case flushFailed(String)
    case noResults(String)
    case resultParsing(String)
    case missingFile(String)
}

struct UniqueIdentifier: Hashable {
    let page: Int
    let lowerBound: Int
    let upperBound: Int
}

let compatibleMimeTypes: Set<String> = [
    "text/plain",
    "text/rtf",
    "text/markdown",
    "application/pdf",
    "application/msword",
]

func getMimeType(url: URL) -> CFString? {
    let pathExtension = url.pathExtension
    if let uti = UTType(filenameExtension: pathExtension),
       let mimeType = uti.preferredMIMEType {
        return mimeType as CFString
    }
    return nil
}

func isDirectory(url: URL) -> Bool {
    var isDir: ObjCBool = false
    if FileManager.default.fileExists(atPath: url.path, isDirectory: &isDir) {
        return isDir.boolValue
    }
    return false
}

func createOrOpenIndex(_ collection: String, _ supportPath: String) -> SKIndex? {
    let supportDirectoryURL = URL(fileURLWithPath: supportPath)
    if !isDirectory(url: supportDirectoryURL) {
        return nil
    }
    let indexURL = supportDirectoryURL.appendingPathComponent("\(collection).index")
    if FileManager.default.fileExists(atPath: indexURL.path) {
        let unmanagedIndex = SKIndexOpenWithURL(indexURL as CFURL, collection as CFString, true)
        return unmanagedIndex?.takeRetainedValue()
    } else {
        let unmanagedIndex = SKIndexCreateWithURL(indexURL as CFURL, collection as CFString, kSKIndexInvertedVector, nil)
        return unmanagedIndex?.takeRetainedValue()
    }
}

func openIndex(_ collection: String, _ supportPath: String) -> SKIndex? {
    let supportDirectoryURL = URL(fileURLWithPath: supportPath)
    if !isDirectory(url: supportDirectoryURL) {
        return nil
    }
    let indexURL = supportDirectoryURL.appendingPathComponent("\(collection).index")
    let unmanagedIndex = SKIndexOpenWithURL(indexURL as CFURL, collection as CFString, true)
    return unmanagedIndex?.takeRetainedValue()
}

/// Called whenever user saves changes to either a new or existing collection. Triggers update or creating new index file depending on whether it is a new or existing collection.
@raycast func createOrUpdateCollection(collectionName: String, supportPath: String, filepaths: [String]) throws -> IndexResult {
    guard let index = createOrOpenIndex(collectionName, supportPath) else {
        throw IndexingError.unableToOpenOrCreateIndex("Unable to open or create new index file for collection \(collectionName).")
    }
    var messages = [String]()

    let queue = DispatchQueue.global(qos: .userInitiated)
    let group = DispatchGroup()

    SKLoadDefaultExtractorPlugIns()
    let lock = NSRecursiveLock() // allows a single thread to acquire the lock multiple times
    for filepath in filepaths {
        let documentURL = URL(fileURLWithPath: filepath)
        if !documentURL.isFileURL {
            throw IndexingError.invalidURL("Not file URL: \(documentURL.path).")
        }

        if !FileManager.default.fileExists(atPath: filepath) {
            throw IndexingError.fileNotFound("File does not exist: \(documentURL.path)")
        }

        if !FileManager.default.isReadableFile(atPath: filepath) {
            throw IndexingError.noPermissions("No read permissions for file: \(documentURL.path)")
        }

        // TODO: Handle other document types
        let mimeType = getMimeType(url: documentURL)

        guard let pdfDocument = PDFDocument(url: documentURL) else {
            throw IndexingError.failedToAddDocument("Failed to load pdf docuemnt.")
        }

        // Create smaller documents for each page in the PDF document
        for i in 0..<pdfDocument.pageCount {
            group.enter()
            queue.async {
                defer { group.leave() }
                if let page = pdfDocument.page(at: i), let text = page.string {
                    let documentURL = URL(fileURLWithPath: "\(documentURL.path)_\(i)")
                    let documentRef = SKDocumentCreateWithURL(documentURL as CFURL).takeRetainedValue()
                    lock.lock()
                    defer { lock.unlock() }
                    SKIndexAddDocumentWithText(index, documentRef, text as CFString, true)
                }
            }
        }
    }

    group.wait()

    guard SKIndexFlush(index) else {
        throw IndexingError.failedToAddDocument("Error occurred while saving changes to index.")
    }

    return IndexResult(messages: messages)
}

/// Extracts the file path and page number from a URL where the page number is assumed to be after the last underscore in the filename.
/// - Parameter url: The URL containing the filepath and page number.
/// - Returns: A tuple containing the filepath and the page number as an integer.
func extractFilePathAndPageNumber(from url: URL) -> (filepath: String, pageIndex: Int)? {
    let fullpath = url.path

    guard let filename = url.lastPathComponent.split(separator: "_").last else {
        print("No underscore found in the filename.")
        return nil
    }

    // Attempt to extract page number from the last part of the filename
    if let pageIndex = Int(filename) {
        // Build the file path excluding the page number
        let filePathWithoutPageNumber = fullpath.dropLast(filename.count + 1)
        return (filepath: String(filePathWithoutPageNumber), pageIndex: pageIndex)
    } else {
        print("The last part of the filename is not numeric.")
        return nil
    }
}

@raycast func searchCollection(query: String, collectionName: String, supportPath: String) throws -> [Document] {
    guard let index = openIndex(collectionName, supportPath) else {
        throw SearchError.unableToOpenIndex("Index \(collectionName) does not exist.")
    }

    // Flush the index to make sure all documents have been added
    guard SKIndexFlush(index) else {
        throw SearchError.flushFailed("Error occurred while saving changes to index.")
    }

    let options = SKSearchOptions(kSKSearchOptionFindSimilar) // find purely based on similarity instead of boolean query
    let search = SKSearchCreate(index, query as CFString, options).takeRetainedValue()
    let k = 25
    var returnDocuments = [Document]()
    var documentIDs = UnsafeMutablePointer<SKDocumentID>.allocate(capacity: k)
    var scores = UnsafeMutablePointer<Float>.allocate(capacity: k)
    var numResults: CFIndex = 0
    let numSummarySentences: Int = 1

    // Returns the search results by every k items until no results are left
    var hasMore = true
    repeat {
        hasMore = SKSearchFindMatches(search, k, documentIDs, scores, 4, &numResults)
        if numResults > 0 {
            var documentURLs = UnsafeMutablePointer<Unmanaged<CFURL>?>.allocate(capacity: numResults)
            SKIndexCopyDocumentURLsForDocumentIDs(index, numResults, documentIDs, documentURLs)
            for i in 0..<numResults {
                if let unmanagedURL = documentURLs[i] {
                    let score = scores[i]
                    let url = unmanagedURL.takeRetainedValue() as URL
                    guard let (filepath, pageidx) = extractFilePathAndPageNumber(from: url) else {
                        throw SearchError.resultParsing("Unable to extract file path and page index of result \(url).")
                    }

                    guard let pdfDocument = PDFDocument(url: URL(fileURLWithPath: filepath)) else {
                        throw SearchError.missingFile("Failed to load pdf document.")
                    }

                    let selection = pdfDocument.findString(query, withOptions: [.caseInsensitive, NSString.CompareOptions .diacriticInsensitive]).first
                    guard let content = pdfDocument.page(at: pageidx)?.string else {
                        continue
                    }
                    let range = (content as NSString).range(of: query)
                    if range.location != NSNotFound {
                        returnDocuments.append(Document(
                            id: documentIDs[i],
                            page: pageidx,
                            file: filepath,
                            score: score,
                            lower: range.location,
                            upper: range.upperBound
                        ))
                    } else {
                        returnDocuments.append(Document(
                            id: documentIDs[i],
                            page: pageidx,
                            file: filepath,
                            score: score
                        ))
                    }

//                    if let summary = SKSummaryCreateWithString(content as CFString)?.takeRetainedValue(),
//                       let highlightedSummary = SKSummaryCopyParagraphSummaryString(summary, numSummarySentences)?.takeRetainedValue() {
//                        returnDocuments.append(Document(id: documentIDs[i], page: pageidx, file: filepath, score: score, summary: content))
//                    }
                }
            }
            documentURLs.deallocate()
        }
    } while hasMore && numResults > 0

    documentIDs.deallocate()
    scores.deallocate()
    return returnDocuments
}

@raycast func deleteCollection(collectionName: String, supportPath: String) throws -> Void {
    let supportDirectoryURL = URL(fileURLWithPath: supportPath)
    if !isDirectory(url: supportDirectoryURL) {
        throw CollectionError.notADirectory
    }
    let indexURL = supportDirectoryURL.appendingPathComponent("\(collectionName).index")
    guard FileManager.default.fileExists(atPath: indexURL.path) else {
        throw CollectionError.fileDoesNotExist
    }
    try FileManager.default.removeItem(at: indexURL)
}
