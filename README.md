# Docsearch

Raycast extension for performing search across groups of selected PDF documents. Currently it uses BM25 to search across all documents defined in the collection.

## Define Collection

Create a collection by naming and selecting a group of files/directories from finder, which can also be removed from the menu. These files will be watched for changes so that they will be reindexed everytime a change is made to any of the files.

## Search Collection

When selected, the search bar will return the top results from the search query, with the document name and excerpt from the document that matches the search query. Selecting this will open the document and navigate to the section that contains the query at the location that matches.

## Roadmap

- [ ] Ability to handle large file sizes.
- [ ] Open documents to exact page where match was found.
- [ ] Hybrid search by using combination of BM25 with semantic re-rankers.
- [ ] Implement file watching to automatically update index when they are moved, deleted or updated.
