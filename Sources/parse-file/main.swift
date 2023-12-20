import Foundation
import PDFKit
import NaturalLanguage

func getContent(pdfDoc: PDFDocument) {
    var tokens = [[String: Any]]()
    let tokeniser = NLTokenizer(unit: .paragraph)
    for pageIndex in 0..<pdfDoc.pageCount {
        guard let page = pdfDoc.page(at: pageIndex), let pageContent = page.string else { continue }
        tokeniser.string = pageContent
        tokeniser.enumerateTokens(in: pageContent.startIndex..<pageContent.endIndex) { tokenRange, _ in
            let word = pageContent[tokenRange]
            // let position = pageContent.distance(from: pageContent.startIndex, to: tokenRange.lowerBound)
            tokens.append(["word": word, "page": pageIndex + 1])
            return true
        }
    }
    if let jsonData = try? JSONSerialization.data(withJSONObject: tokens),
       let jsonString = String(data: jsonData, encoding: .utf8) {
        print(jsonString)
    }
}

if CommandLine.argc < 2 {
    print("Usage: FileParser <file_path>")
    exit(1)
}

let filePath = CommandLine.arguments[1]
if let pdfDoc = PDFDocument(url: URL(fileURLWithPath: filePath)) {
    getContent(pdfDoc: pdfDoc)
    exit(0)
} else {
    print("Failed to load PDF.")
    exit(1)
}
