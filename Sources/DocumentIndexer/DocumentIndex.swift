import Foundation
import CoreML
import Accelerate
import PDFKit
import NaturalLanguage

class DocumentIndex {
    private var embeddingModel: EmbeddingModel
    var documents: [Int: Document]

    init(filepath: String, model: EmbeddingModel) throws { // Dictionary: Document ID -> Document Content
        if let pdfDoc = PDFDocument(url: URL(fileURLWithPath: filepath)) {
            documents = [Int: Document]() // Dictionary to hold each page's content
            embeddingModel = model
            let tokeniser = NLTokenizer(unit: .paragraph)
            for pageIndex in 0..<pdfDoc.pageCount {
                guard let page = pdfDoc.page(at: pageIndex), let pageContent = page.string else { continue }
                tokeniser.string = pageContent
                tokeniser.enumerateTokens(in: pageContent.startIndex..<pageContent.endIndex) { tokenRange, _ in
                    let string = String(pageContent[tokenRange])
                    let documentId = "\(filepath):\(page):\(tokenRange.lowerBound)".hashValue
                    documents[documentId.hashValue] = Document(content: string, page: pageIndex + 1, file: filepath)
                    return true
                }
            }
        } else {
            fatalError("Failed to load PDF.")
        }
    }

    func findTopKSimilarDocuments(query: String, topK: Int = 25) throws -> [(documentId: Int, score: Double)] {
        do {
            let queryModelInput = ModelInput(inputString: query).modelInput!
            let queryPrediction = try embeddingModel.prediction(input: queryModelInput)
            let queryPoolerOutput = DocumentIndex.normalise(vector: queryPrediction.pooler_output.doubleArray())

            var scores: [(documentId: Int, score: Double)] = []
            let scoreQueue = DispatchQueue(label: "com.docsearch.scoreQueue", attributes: .concurrent)
            let dispatchGroup = DispatchGroup()

            // let start = DispatchTime.now()
            for (id, document) in documents {
                dispatchGroup.enter()
                DispatchQueue.global(qos: .userInitiated).async {
                    do {
                        let modelInput = ModelInput(inputString: document.content).modelInput!
                        let prediction = try self.embeddingModel.prediction(input: modelInput)
                        let documentPoolerOutput = DocumentIndex.normalise(vector: prediction.pooler_output.doubleArray())
                        let score = DocumentIndex.dotProduct(vectorA: documentPoolerOutput, vectorB: queryPoolerOutput)
                        
                        scoreQueue.async(flags: .barrier) {
                            scores.append((documentId: id, score: score))
                            dispatchGroup.leave()
                        }
                    } catch {
                        print("Error processing document ID \(id): \(error)")
                        dispatchGroup.leave()
                    }
                }
            }
            dispatchGroup.wait()
            // print("Dispatch Group Done: \(Double(DispatchTime.now().uptimeNanoseconds - start.uptimeNanoseconds) / 1_000_000_000)")
            return scoreQueue.sync {
                scores.sorted { $0.score > $1.score }.prefix(topK).map { ($0.documentId, $0.score) }
            }
        } catch {
            print("Error during model prediction: \(error)")
            throw error
        }
    }

    static func normalise(vector: [Double]) -> [Double] {
        if vector.allSatisfy({ $0.isNaN }) { return vector.map { _ in 0.0 } }
        var norm: Double = 0.0
        vDSP_svesqD(vector, 1, &norm, vDSP_Length(vector.count))
        if norm == 0 { return vector.map { _ in 0.0 } }
        norm = sqrt(norm)
        var normalizedVector = vector
        vDSP_vsdivD(vector, 1, &norm, &normalizedVector, 1, vDSP_Length(vector.count))
        return normalizedVector
    }

    static func dotProduct(vectorA: [Double], vectorB: [Double]) -> Double {
        var dotProduct: Double = 0.0
        vDSP_dotprD(vectorA, 1, vectorB, 1, &dotProduct, vDSP_Length(vectorA.count))
        if dotProduct.isNaN { return 0.0 }
        return dotProduct
    }
}

extension MLMultiArray {
    /// Creates a copy of the multi-array's contents into a Doubles array.
    ///
    /// - returns: An array of Doubles.
    func doubleArray() -> [Double] {
        // Bind the underlying `dataPointer` memory to make a native swift `Array<Double>`
        let unsafeMutablePointer = dataPointer.bindMemory(to: Double.self, capacity: count)
        let unsafeBufferPointer = UnsafeBufferPointer(start: unsafeMutablePointer, count: count)
        return [Double](unsafeBufferPointer)
    }
}
