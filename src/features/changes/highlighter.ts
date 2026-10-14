import {
  createHighlighter,
  type Highlighter,
  type ThemedToken,
  bundledLanguages,
} from "shiki";
import { useEffect, useState, useMemo } from "react";
import type { FileDiff } from "../../lib/host";

export interface HighlightToken {
  content: string;
  color?: string;
  fontStyle?: number;
}

export type DiffTheme = "github-dark" | "github-light";

const EXTENSION_MAP: Record<string, string> = {
  ts: "typescript",
  tsx: "tsx",
  mts: "typescript",
  cts: "typescript",
  js: "javascript",
  jsx: "jsx",
  mjs: "javascript",
  cjs: "javascript",
  rs: "rust",
  json: "json",
  jsonc: "jsonc",
  py: "python",
  pyw: "python",
  md: "markdown",
  markdown: "markdown",
  html: "html",
  htm: "html",
  css: "css",
  scss: "scss",
  sass: "sass",
  less: "less",
  yaml: "yaml",
  yml: "yaml",
  toml: "toml",
  xml: "xml",
  svg: "xml",
  sql: "sql",
  sh: "bash",
  bash: "bash",
  zsh: "bash",
  java: "java",
  c: "c",
  h: "c",
  cpp: "cpp",
  cc: "cpp",
  cxx: "cpp",
  hpp: "cpp",
  go: "go",
  rb: "ruby",
  php: "php",
  swift: "swift",
  kt: "kotlin",
  kts: "kotlin",
  lua: "lua",
  vue: "vue",
  svelte: "svelte",
  diff: "diff",
  patch: "diff",
  dockerfile: "dockerfile",
  makefile: "makefile",
  ini: "ini",
};

const FILENAME_MAP: Record<string, string> = {
  dockerfile: "dockerfile",
  makefile: "makefile",
  gemfile: "ruby",
  rakefile: "ruby",
  "cargo.toml": "toml",
  "cargo.lock": "toml",
  "package.json": "json",
  "tsconfig.json": "jsonc",
};

/**
 * Detect language from file path or file name.
 */
export function detectLanguage(filePath: string): string | null {
  if (!filePath) return null;
  const normalized = filePath.toLowerCase().replace(/\\/g, "/");
  const fileName = normalized.split("/").pop() || "";

  if (FILENAME_MAP[fileName]) {
    return FILENAME_MAP[fileName];
  }

  const dotIdx = fileName.lastIndexOf(".");
  if (dotIdx !== -1 && dotIdx < fileName.length - 1) {
    const ext = fileName.slice(dotIdx + 1);
    if (EXTENSION_MAP[ext]) {
      return EXTENSION_MAP[ext];
    }
  }

  return null;
}

const PRELOAD_LANGUAGES = [
  "typescript",
  "javascript",
  "tsx",
  "jsx",
  "rust",
  "json",
  "python",
  "markdown",
  "html",
  "css",
  "yaml",
  "toml",
  "bash",
  "sql",
  "java",
  "c",
  "cpp",
  "go",
];

let highlighterPromise: Promise<Highlighter> | null = null;
let highlighterInstance: Highlighter | null = null;

/**
 * Singleton highlighter getter.
 */
export async function getHighlighter(): Promise<Highlighter> {
  if (highlighterInstance) {
    return highlighterInstance;
  }

  if (!highlighterPromise) {
    highlighterPromise = createHighlighter({
      themes: ["github-light", "github-dark"],
      langs: PRELOAD_LANGUAGES,
    }).then((hl) => {
      highlighterInstance = hl;
      return hl;
    });
  }

  return highlighterPromise;
}

export function getLoadedHighlighter(): Highlighter | null {
  return highlighterInstance;
}

// Token cache: key -> ThemedToken[][]
const tokenCache = new Map<string, HighlightToken[][]>();

/**
 * Ensure language is loaded into highlighter instance.
 */
export async function ensureLanguage(lang: string): Promise<boolean> {
  const hl = await getHighlighter();
  const loaded = hl.getLoadedLanguages();
  if (loaded.includes(lang)) {
    return true;
  }

  if (lang in bundledLanguages) {
    try {
      await hl.loadLanguage(lang as any);
      return true;
    } catch {
      return false;
    }
  }

  return false;
}

/**
 * Tokenize an array of code lines for a given language and theme.
 */
export async function highlightLines(
  lines: string[],
  filePath: string,
  theme: DiffTheme
): Promise<HighlightToken[][]> {
  const lang = detectLanguage(filePath);
  if (!lang) {
    return lines.map((line) => [{ content: line }]);
  }

  const cacheKey = `${theme}:${lang}:${lines.join("\n")}`;
  const cached = tokenCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  try {
    const hl = await getHighlighter();
    const isLangReady = await ensureLanguage(lang);
    if (!isLangReady) {
      return lines.map((line) => [{ content: line }]);
    }

    const sanitizedLines = lines.map((l) => l.replace(/\r?\n$/, ""));
    const code = sanitizedLines.join("\n");
    const res = hl.codeToTokens(code, {
      lang: lang as any,
      theme,
    });

    const tokens: HighlightToken[][] = res.tokens.map((lineTokens: ThemedToken[]) =>
      lineTokens.map((t) => ({
        content: t.content,
        color: t.color,
        fontStyle: t.fontStyle,
      }))
    );

    // If lines count mismatch for any reason, pad or trim safely
    while (tokens.length < lines.length) {
      tokens.push([{ content: lines[tokens.length] || "" }]);
    }

    tokenCache.set(cacheKey, tokens);
    return tokens;
  } catch {
    return lines.map((line) => [{ content: line }]);
  }
}

/**
 * Synchronous attempt to get tokens if highlighter and language are already loaded.
 */
export function getTokensSync(
  lines: string[],
  filePath: string,
  theme: DiffTheme
): HighlightToken[][] | null {
  const lang = detectLanguage(filePath);
  if (!lang) {
    return lines.map((line) => [{ content: line }]);
  }

  const cacheKey = `${theme}:${lang}:${lines.join("\n")}`;
  const cached = tokenCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const hl = highlighterInstance;
  if (!hl || !hl.getLoadedLanguages().includes(lang)) {
    return null;
  }

  try {
    const sanitizedLines = lines.map((l) => l.replace(/\r?\n$/, ""));
    const code = sanitizedLines.join("\n");
    const res = hl.codeToTokens(code, {
      lang: lang as any,
      theme,
    });

    const tokens: HighlightToken[][] = res.tokens.map((lineTokens: ThemedToken[]) =>
      lineTokens.map((t) => ({
        content: t.content,
        color: t.color,
        fontStyle: t.fontStyle,
      }))
    );

    tokenCache.set(cacheKey, tokens);
    return tokens;
  } catch {
    return null;
  }
}

/**
 * Detect effective theme from DOM (supporting dark class or data-theme).
 */
export function getEffectiveDiffTheme(): DiffTheme {
  if (typeof document === "undefined") {
    return "github-dark";
  }
  const root = document.documentElement;
  if (root.getAttribute("data-theme") === "dark" || root.classList.contains("dark")) {
    return "github-dark";
  }
  if (root.getAttribute("data-theme") === "light") {
    return "github-light";
  }
  if (typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches) {
    return "github-dark";
  }
  return "github-light";
}

function computeSyncTokens(
  diff: FileDiff | null,
  theme: DiffTheme
): { tokens: Record<number, HighlightToken[][]>; allSync: boolean } {
  if (!diff || diff.is_binary || diff.hunks.length === 0) {
    return { tokens: {}, allSync: true };
  }

  const path = diff.path;
  const syncResults: Record<number, HighlightToken[][]> = {};
  let allSync = true;

  diff.hunks.forEach((hunk, hunkIdx) => {
    const lines = hunk.lines.map((l) => l.content);
    const syncTokens = getTokensSync(lines, path, theme);
    if (syncTokens) {
      syncResults[hunkIdx] = syncTokens;
    } else {
      allSync = false;
      syncResults[hunkIdx] = lines.map((l) => [{ content: l }]);
    }
  });

  return { tokens: syncResults, allSync };
}

/**
 * React hook to highlight file diff hunks.
 * Returns map of [hunkIndex]: HighlightToken[][].
 */
export function useDiffHighlighter(
  diff: FileDiff | null
): Record<number, HighlightToken[][]> {
  const [theme, setTheme] = useState<DiffTheme>(getEffectiveDiffTheme);
  const [asyncTokens, setAsyncTokens] = useState<{
    diff: FileDiff | null;
    theme: DiffTheme;
    tokens: Record<number, HighlightToken[][]>;
  } | null>(null);

  // Monitor DOM theme changes
  useEffect(() => {
    const updateTheme = () => {
      setTheme(getEffectiveDiffTheme());
    };

    updateTheme();
    const observer = new MutationObserver(updateTheme);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "data-theme"],
    });

    const media = window.matchMedia?.("(prefers-color-scheme: dark)");
    media?.addEventListener?.("change", updateTheme);

    return () => {
      observer.disconnect();
      media?.removeEventListener?.("change", updateTheme);
    };
  }, []);

  const { tokens: syncTokens, allSync } = useMemo(
    () => computeSyncTokens(diff, theme),
    [diff, theme]
  );

  useEffect(() => {
    if (!diff || diff.is_binary || diff.hunks.length === 0 || allSync) {
      return;
    }

    let isMounted = true;
    const path = diff.path;

    Promise.all(
      diff.hunks.map(async (hunk, hunkIdx) => {
        const lines = hunk.lines.map((l) => l.content);
        const tokens = await highlightLines(lines, path, theme);
        return { hunkIdx, tokens };
      })
    ).then((results) => {
      if (!isMounted) return;
      const nextMap: Record<number, HighlightToken[][]> = {};
      results.forEach((r) => {
        nextMap[r.hunkIdx] = r.tokens;
      });
      setAsyncTokens({ diff, theme, tokens: nextMap });
    });

    return () => {
      isMounted = false;
    };
  }, [diff, theme, allSync]);

  if (asyncTokens && asyncTokens.diff === diff && asyncTokens.theme === theme) {
    return asyncTokens.tokens;
  }

  return syncTokens;
}
