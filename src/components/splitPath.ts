export interface SplitPathResult {
  fileName: string;
  dirPath: string;
}

/**
 * 拆分文件路径为文件名和所在目录（规范化斜杠）。
 * 根目录文件目录为空字符串。
 * 例：
 * - "src/a/b.ts" → { fileName: "b.ts", dirPath: "src/a" }
 * - "README.md"  → { fileName: "README.md", dirPath: "" }
 * - "a/b"        → { fileName: "b", dirPath: "a" }
 */
export function splitPath(path: string): SplitPathResult {
  const normalized = path.replace(/\\/g, "/");
  const lastSlash = normalized.lastIndexOf("/");
  if (lastSlash === -1) {
    return {
      fileName: normalized,
      dirPath: "",
    };
  }
  return {
    fileName: normalized.slice(lastSlash + 1),
    dirPath: normalized.slice(0, lastSlash),
  };
}
