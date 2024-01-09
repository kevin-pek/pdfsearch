import Foundation
import PDFKit
import NaturalLanguage
import CoreML

struct Document: Codable {
    var content: String
    var page: Int
    var file: String
    var id: Int?
    var score: Double?
}

if CommandLine.argc < 3 {
    print("Usage: FileParser <file_path> <search_query> [top_k]")
    exit(1)
}

let model: EmbeddingModel
do {
    let defaultConfig = MLModelConfiguration()
    // way of loading from stack overflow https://stackoverflow.com/questions/64379775/how-to-add-a-coreml-model-into-a-swift-package
    if let url = Bundle.module.url(forResource: "EmbeddingModel", withExtension: "mlmodelc") {
        model = try EmbeddingModel(contentsOf: url, configuration: defaultConfig) // ERROR
        let filePath = CommandLine.arguments[1]
        let searchQuery = CommandLine.arguments[2]
        let k: Int? = CommandLine.argc > 3 ? Int(CommandLine.arguments[3]) : nil
        let documentIndex = try DocumentIndex(filepath: filePath, model: model)
        let topDocumentIds: [(documentId: Int, score: Double)]
        if let topK = k {
            topDocumentIds = try documentIndex.findTopKSimilarDocuments(query: searchQuery, topK: topK)
        } else {
            topDocumentIds = try documentIndex.findTopKSimilarDocuments(query: searchQuery)
        }
        var resultDocuments = [Document]()
        for doc in topDocumentIds {
            if var document = documentIndex.documents[doc.documentId] {
                document.id = doc.documentId
                document.score = doc.score
                resultDocuments.append(document)
            } else {
                fatalError("\(doc.documentId) does not have a corresponding document!")
            }
        }
        do {
            
            let jsonData = try JSONEncoder().encode(resultDocuments)
            if let jsonString = String(data: jsonData, encoding: .utf8) {
                print(jsonString)
            }
        } catch {
            fatalError("Error serializing JSON: \(error)")
        }
        exit(0)
    } else {
        fatalError("URL does not exist!")
    }
    exit(1)
} catch {
    fatalError("Couldn't load BERT model due to: \(error.localizedDescription)")
}
