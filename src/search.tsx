import { environment } from "@raycast/api";
import { Action, ActionPanel, LaunchProps, List, LocalStorage, Toast, showHUD, showToast } from "@raycast/api";
import { runAppleScript, showFailureToast, usePromise } from "@raycast/utils";
import { useCallback, useEffect, useRef, useState } from "react";
import { chmod } from "fs/promises";
import { ExecaChildProcess, execa } from "execa";
import path from "path";
import { Collection, Document } from "./type";

export default function Command(props: LaunchProps<{ arguments: Arguments.Search }>) {
  if (!props.arguments) {
    showHUD("No collection provided to search!");
    return;
  }
  const [isQuerying, setIsQuerying] = useState(false);
  const [results, setResults] = useState<(Document & { id: number })[]>([]);
  const [query, setQuery] = useState("");
  const processes = useRef<ExecaChildProcess<string>[]>([]);

  const terminateAllProcesses = () => {
    processes.current.forEach((proc) => {
      if (proc) proc.cancel();
    });
    processes.current = [];
  };

  const { data: files, isLoading } = usePromise(async () => {
    const index = (await LocalStorage.getItem(props.arguments.collection)) as string | undefined;
    if (!index) {
      showFailureToast(`Couldn't find collection ${props.arguments.collection}!`);
      throw new Error(`Failed to get collection ${props.arguments.collection}!`);
    }
    const collection = JSON.parse(index) as Collection;
    showToast({
      style: Toast.Style.Success,
      title: "Loaded",
      message: `Loaded collection ${props.arguments.collection}`,
    });
    return collection.files || [];
  });

  const searchFiles = useCallback(
    async (query: string) => {
      if (!files) return [];
      const documents: (Document & { id: number })[] = [];
      terminateAllProcesses();
      setIsQuerying(true);
      await Promise.allSettled(
        files.map(async (file) => {
          // execute swift bianry that will load given filepath and return tokens
          const command = path.join(environment.assetsPath, "DocumentIndexer");
          await chmod(command, "755");
          const process = execa(command, [file, query]);
          processes.current.push(process);

          try {
            const { stdout, exitCode } = await process;
            processes.current = processes.current.filter((p) => p !== process);
            setIsQuerying(processes.current.length !== 0);
            if (exitCode == 0) {
              for (const { content, page, file, id, score } of JSON.parse(stdout)) {
                documents.push({ content, page, file, id, score });
              }
            } else {
              showFailureToast("Error when parsing " + file);
              // console.log("Error when parsing " + file);
            }
          } catch (err) {
            showFailureToast(err);
            // console.log("Cancelled or failed process for file: " + err)
          }
        }),
      );
      return documents.sort((a, b) => b.score - a.score);
    },
    [files],
  );

  const openFile = async (filepath: string, page: number) => {
    try {
      if (!filepath.toLowerCase().endsWith(".pdf")) {
        throw new Error("The file is not a PDF.");
      }

      const appleScriptFilePath = filepath.replace(/"/g, '\\"');
      const script = `
      set posixFile to POSIX file "${appleScriptFilePath}"
      tell application "Finder" to open posixFile

      delay 1
      tell application "System Events"
          keystroke "g" using {option down, command down}
          keystroke "${page}"
          keystroke return
      end tell
      `;

      await runAppleScript(script);
      await showHUD(`Opened ${filepath} at page ${page}`);
    } catch (error) {
      await showHUD(error instanceof Error ? error.message : `Could not open: ${filepath}`);
    }
  };

  // search and update results for the search query everytime the query changes
  useEffect(() => {
    if (!query) {
      // if search query becomes empty, terminate all ongoing searches
      setResults([]);
      terminateAllProcesses();
      setIsQuerying(false);
    } else if (files) {
      const handleSearch = async () => {
        const documents = await searchFiles(query);
        setResults(documents);
      };
      handleSearch();
    }
  }, [query]);

  // Clean up running processes when component unmounts
  useEffect(() => {
    return () => {
      terminateAllProcesses();
    };
  }, []);

  return (
    <List
      isLoading={isLoading || isQuerying}
      onSearchTextChange={setQuery}
      searchBarPlaceholder={`Searching ${props.arguments.collection}...`}
      throttle
      isShowingDetail
    >
      {files ? (
        <List.Section title="Results" subtitle={results.length + ""}>
          {results.map((result) => (
            <List.Item
              key={result.id}
              title={result.file.match(/[^\\/]+$/)?.[0] ?? "Unknown File"}
              subtitle={`Page ${result.page}`}
              actions={
                <ActionPanel>
                  <Action onAction={() => openFile(result.file, result.page)} title="Open File" />
                </ActionPanel>
              }
              detail={<List.Item.Detail markdown={result.content} />}
            />
          ))}
        </List.Section>
      ) : null}
    </List>
  );
}
