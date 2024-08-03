import { Cache, environment, LocalStorage } from "@raycast/api";
import { runAppleScript } from "@raycast/utils";
import { lstatSync, readdirSync, watch } from "fs";
import path from "path";
import { Collection } from "./type";
import { createOrUpdateCollection } from "swift:../swift"

export const supportedFiletypes = [".pdf"];

// returns all POSIX filepaths in directory with supportedFiletype
export const loadDir = (dirpath: string) => {
  let validFiles: string[] = [];
  const files = readdirSync(dirpath);

  files.forEach((file) => {
    const fullPath = path.join(dirpath, file);
    if (lstatSync(fullPath).isDirectory()) {
      validFiles = validFiles.concat(loadDir(fullPath));
    } else if (supportedFiletypes.includes(path.extname(file))) {
      validFiles.push(fullPath);
    }
  });

  return validFiles;
};

/**
 * Listen for changes to folder belonging to a collection. If any change is made to a file,
 * reindex it under a new name and remove the old version of the documents.
 * @param dirpath
 * @param collectionName
 */
export const watchDirectory = (dirpath: string, collectionName: string) => {
  const watcher = watch(dirpath, async (eventType, filename) => {
    if (eventType === 'change' || eventType === 'rename') {
      const collection: Collection = await LocalStorage.getItem(collectionName)
      const validFiles = getValidFiles(collection.files)
      const response = await createOrUpdateCollection(collection.name, environment.supportPath, validFiles)
    }
  })
}

// load array of unique supported files from files and directories
export const getValidFiles = (files: string[]) => {
  let validFiles: string[] = [];
  files.forEach((file) => {
    if (lstatSync(file).isDirectory()) {
      validFiles = validFiles.concat(loadDir(file));
    } else if (supportedFiletypes.includes(path.extname(file))) {
      validFiles.push(file);
    }
  });
  return [...new Set(validFiles)];
};

export const openFileCallback = async (page: number) => {
  const script = `
    delay 1
    tell application "System Events"
        keystroke "g" using {option down, command down}
        keystroke "${page + 1}"
        keystroke return
    end tell
    `;

  await runAppleScript(script);
};

export const selectPDFFile = async () => {
  const file = await runAppleScript(
    `
set selectedFile to choose file with prompt "Please select a PDF file" of type ("pdf")
set raycastPath to POSIX path of (path to application "Raycast")
do shell script "open " & raycastPath
return POSIX path of selectedFile
          `,
  );
  return file;
};

export const cache = new Cache();
