# Docsearch

Raycast extension for performing search across groups of selected PDF documents. Currently it uses PDFKit to separate pdf files into their paragraphs. It then uses [Jina AI's small embedding model](https://huggingface.co/jinaai/jina-embeddings-v2-small-en) to encode the documents, and dot product similarity is used to get the most relevant documents defined in the collection.

## Define Collection

Create a collection by naming and selecting a group of files/directories from finder, which can also be removed from the menu. These files will be watched for changes so that they will be reindexed everytime a change is made to any of the files.

## Search Collection

When selected, the search bar will return the top results from the search query, with the document name and excerpt from the document that matches the search query. Selecting this will open the document and navigate to the section that contains the query at the location that matches.

## Roadmap

- [x] Ability to handle large file sizes without exceeding memory limit.
- [x] Open documents to exact page where match was found.
- [ ] Improve PDF parsing logic.
- [ ] Store embeddings into memory for faster retrieval.
- [ ] Hybrid search by using combination of BM25 with semantic re-rankers.
- [ ] Implement file watching to automatically update index when they are moved, deleted or updated.

## Getting Started

Run the script commands in `compile-model.sh` to compile `EmbeddingModel.mlpackage` and generate the Swift class for it.
