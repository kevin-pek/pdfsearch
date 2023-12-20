import { environment } from "@raycast/api";
import { Collection, Document, bm25 } from "./wink";
import { showFailureToast } from "@raycast/utils";
import fs, { lstatSync, readdirSync } from "fs";
import path from "path";
import { chmod } from "fs/promises";
import { execa } from "execa";

const supportedFiletypes = [".pdf"];

export async function processCollection(collection: Collection) {
  if (!collection) {
    showFailureToast("No collection provided in context to search!");
    return;
  }
  let files = collection.files;
  files = files.flatMap((file) => {
    if (fs.lstatSync(file).isDirectory()) {
      return loadDir(file);
    } else if (supportedFiletypes.includes(path.extname(file))) {
      return file;
    }
    return [];
  });
  files = [...new Set(files)]; // get unique filepaths from array
  console.debug("Getting files done");

  const documents: Document[] = [];
  await Promise.allSettled(
    files.map(async (file) => {
      // execute swift bianry that will load given filepath and return tokens
      const command = path.join(environment.assetsPath, "parse-file");
      await chmod(command, "755");
      console.time(`Opening ${file}`);
      const { stdout, exitCode } = await execa(command, [file]);
      console.timeEnd(`Done processing ${file}`);
      if (exitCode == 0) {
        for (const chunk of JSON.parse(stdout)) {
          const { word, page } = chunk;
          documents.push({ content: word, page, file });
        }
      } else {
        console.log("Error when parsing " + file);
      }
    }),
  );
  console.debug("Loading done");
  documents.forEach((doc, i) => {
    bm25.addDoc(doc, i);
  });
  bm25.consolidate();
  const model = bm25.exportJSON();
  bm25.reset(); // reset the search
  return { model, documents };
}

const loadDir = (dirpath: string) => {
  const files = readdirSync(dirpath);
  files.flatMap((file) => {
    const fullPath = path.join(dirpath, file);
    if (lstatSync(fullPath).isDirectory()) {
      return loadDir(path.join(dirpath, file));
    } else if (supportedFiletypes.includes(path.extname(file))) {
      files.push(fullPath);
    }
  });
  return files;
};
