export type Collection = {
  name: string;
  description?: string;
  files: string[];
  model: string;
  documents: Document[];
};

export type Document = {
  content: string;
  page: number;
  file: string;
};

// eslint-disable-next-line @typescript-eslint/no-var-requires
const nlp = require("wink-nlp-utils");
// eslint-disable-next-line @typescript-eslint/no-var-requires
export const getSpottedTerms = require("wink-bm25-text-search/runkit/get-spotted-terms");
export const pipe = [
  nlp.string.lowerCase,
  nlp.string.tokenize0,
  nlp.tokens.removeWords,
  nlp.tokens.stem,
  nlp.tokens.propagateNegations,
];
// eslint-disable-next-line @typescript-eslint/no-var-requires
export const bm25 = require("wink-bm25-text-search")();
bm25.defineConfig({ fldWeights: { content: 2, file: 1 } });
bm25.definePrepTasks(pipe);
