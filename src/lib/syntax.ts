import Prism from "prismjs";

// Load syntax grammars for commonly used languages
import "prismjs/components/prism-clike";
import "prismjs/components/prism-javascript";
import "prismjs/components/prism-typescript";
import "prismjs/components/prism-jsx";
import "prismjs/components/prism-tsx";
import "prismjs/components/prism-rust";
import "prismjs/components/prism-python";
import "prismjs/components/prism-json";
import "prismjs/components/prism-markdown";
import "prismjs/components/prism-bash";
import "prismjs/components/prism-yaml";
import "prismjs/components/prism-java";
import "prismjs/components/prism-go";
import "prismjs/components/prism-c";
import "prismjs/components/prism-cpp";
import "prismjs/components/prism-sql";
import "prismjs/components/prism-toml";

const EXTENSION_MAP: Record<string, string> = {
  ts: "typescript",
  mts: "typescript",
  cts: "typescript",
  tsx: "tsx",
  js: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  jsx: "jsx",
  rs: "rust",
  py: "python",
  json: "json",
  md: "markdown",
  markdown: "markdown",
  sh: "bash",
  bash: "bash",
  zsh: "bash",
  yml: "yaml",
  yaml: "yaml",
  java: "java",
  go: "go",
  c: "c",
  h: "c",
  cpp: "cpp",
  cc: "cpp",
  cxx: "cpp",
  hpp: "cpp",
  css: "css",
  html: "markup",
  htm: "markup",
  svg: "markup",
  xml: "markup",
  toml: "toml",
  sql: "sql",
};

export function getLanguageFromPath(path?: string | null): string | null {
  if (!path) return null;
  const fileName = path.split("/").pop() || path;
  const ext = fileName.includes(".")
    ? fileName.split(".").pop()?.toLowerCase()
    : null;
  if (!ext) return null;
  return EXTENSION_MAP[ext] || null;
}

export function tokenizeCode(content: string, language: string | null): (string | Prism.Token)[] {
  const text = content.replace(/\r?\n$/, "");
  if (!text) return [];
  if (!language || !Prism.languages[language]) {
    return [text];
  }
  try {
    return Prism.tokenize(text, Prism.languages[language]);
  } catch {
    return [text];
  }
}
