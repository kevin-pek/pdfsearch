import { Action, ActionPanel, LaunchProps, List, LocalStorage, Toast, showHUD, showToast } from "@raycast/api";
import { showFailureToast, usePromise } from "@raycast/utils";
import { useEffect, useState } from "react";
import { Collection, bm25 } from "./wink";

export default function Command(props: LaunchProps<{ arguments: Arguments.Search }>) {
  if (!props.arguments) {
    showHUD("No collection provided to search!");
    return;
  }

  const [results, setResults] = useState([]);
  const [query, setQuery] = useState("");

  const { data, isLoading } = usePromise(async () => {
    const index = (await LocalStorage.getItem(props.arguments.collection)) as string | undefined;
    if (!index) {
      showFailureToast(`Couldn't find collection ${props.arguments.collection}!`);
      throw new Error(`Failed to get collection ${props.arguments.collection}!`);
    }
    const collection = JSON.parse(index) as Collection;
    showToast({
      style: Toast.Style.Success,
      title: "Loaded",
      message: `Loaded BM25 model for collection ${props.arguments.collection}`,
    });
    bm25.importJSON(collection.model); // import saved model from ingest process
    return { engine: bm25, documents: collection.documents };
  });

  // search and update results for the search query everytime the query changes
  useEffect(() => {
    if (!query) {
      setResults([]);
    } else if (data) {
      const searchResults = data.engine.search(query) ?? [];
      // console.log(getSpottedTerms(searchResults, query, data.documents, ["content", "file", "page"], pipe, 3));
      setResults(searchResults);
    }
  }, [query]);

  // teardown function to reset bm25 engine when component unmounts
  useEffect(() => () => bm25.reset(), []);

  return (
    <List
      isLoading={isLoading}
      onSearchTextChange={setQuery}
      searchBarPlaceholder={`Searching ${props.arguments.collection}...`}
      throttle
      isShowingDetail
    >
      {data ? (
        <List.Section title="Results" subtitle={results.length + ""}>
          {results.map((result) => (
            <List.Item
              key={result[0]}
              title={data.documents[result[0]].file.match(/[^\\/]+$/)?.[0] ?? "Unknown File"}
              subtitle={`Page ${data.documents[result[0]].page}`}
              actions={
                <ActionPanel>
                  <Action.Open target={data.documents[result[0]].file} title="Open File" />
                </ActionPanel>
              }
              detail={<List.Item.Detail markdown={data.documents[result[0]].content} />}
            />
          ))}
        </List.Section>
      ) : null}
    </List>
  );
}
