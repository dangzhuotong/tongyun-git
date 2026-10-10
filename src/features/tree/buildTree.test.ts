import { describe, it, expect } from "vitest";
import type { FileStatus, TreeFile } from "../../lib/host";
import { buildFileTree, flattenVisible, mapFileStatus, parentDirs, type FileTreeNode } from "./buildTree";

const st = (path: string, extra: Partial<FileStatus>): FileStatus => ({ path, conflicted: false, ...extra });
const tf = (path: string, deleted_on_disk = false): TreeFile => ({ path, deleted_on_disk });
const names = (n: FileTreeNode) => n.children.map((c) => c.name);
const find = (root: FileTreeNode, path: string): FileTreeNode | undefined => {
  for (const c of root.children) {
    if (c.path === path) return c;
    const hit = c.isDir ? find(c, path) : undefined;
    if (hit) return hit;
  }
  return undefined;
};

describe("mapFileStatus", () => {
  it("maps each git status to a tree status", () => {
    expect(mapFileStatus(undefined)).toBeNull();
    expect(mapFileStatus(st("a", { index: "Added" }))).toBe("added");
    expect(mapFileStatus(st("a", { index: "Added", worktree: "Modified" }))).toBe("added");
    expect(mapFileStatus(st("a", { worktree: "Modified" }))).toBe("modified");
    expect(mapFileStatus(st("a", { index: "Modified" }))).toBe("modified");
    expect(mapFileStatus(st("a", { index: "TypeChange" }))).toBe("modified");
    expect(mapFileStatus(st("a", { worktree: "Deleted" }))).toBe("deleted");
    expect(mapFileStatus(st("a", { index: "Deleted" }))).toBe("deleted");
    expect(mapFileStatus(st("a", { worktree: "Untracked" }))).toBe("untracked");
    expect(mapFileStatus(st("a", { index: "Renamed" }))).toBe("renamed");
    expect(mapFileStatus(st("a", { worktree: "Modified", conflicted: true }))).toBe("conflict");
  });

  it("treats a file missing on disk as deleted even without a status entry", () => {
    expect(mapFileStatus(undefined, true)).toBe("deleted");
  });
});

describe("buildFileTree", () => {
  it("nests by '/', dirs first, then files, case-insensitive natural order", () => {
    const root = buildFileTree(
      [tf("src/b.ts"), tf("README.md"), tf("src/A.ts"), tf("docs/x.md"), tf("src/lib/z.ts"), tf("a.txt"), tf("src/file10.ts"), tf("src/file2.ts")],
      []
    );
    expect(names(root)).toEqual(["docs", "src", "a.txt", "README.md"]);
    expect(names(find(root, "src")!)).toEqual(["lib", "A.ts", "b.ts", "file2.ts", "file10.ts"]);
    expect(find(root, "src/lib/z.ts")?.isDir).toBe(false);
  });

  it("colors files, adds deleted files not on disk and status-only files", () => {
    const root = buildFileTree(
      [tf("src/app.ts"), tf("src/gone.ts", true), tf("README.md")],
      [
        st("src/app.ts", { worktree: "Modified" }),
        st("src/gone.ts", { worktree: "Deleted" }),
        st("notes/new.md", { worktree: "Untracked" }),
      ]
    );
    expect(find(root, "src/app.ts")?.status).toBe("modified");
    expect(find(root, "src/gone.ts")?.status).toBe("deleted");
    expect(find(root, "src/gone.ts")?.deletedOnDisk).toBe(true);
    expect(find(root, "notes/new.md")?.status).toBe("untracked");
    expect(find(root, "README.md")?.status).toBeNull();
  });

  it("aggregates the highest-priority status into parent folders", () => {
    const root = buildFileTree(
      [tf("a/b/c.ts"), tf("a/d.ts"), tf("e/f.ts"), tf("clean/x.ts")],
      [
        st("a/b/c.ts", { worktree: "Untracked" }),
        st("a/d.ts", { index: "Added" }),
        st("e/f.ts", { worktree: "Modified", conflicted: true }),
      ]
    );
    expect(find(root, "a")?.aggregate).toBe("added");
    expect(find(root, "a/b")?.aggregate).toBe("untracked");
    expect(find(root, "e")?.aggregate).toBe("conflict");
    expect(find(root, "clean")?.aggregate).toBeNull();
  });

  it("filters to changed files only", () => {
    const root = buildFileTree(
      [tf("src/a.ts"), tf("src/b.ts"), tf("lib/c.ts")],
      [st("src/b.ts", { worktree: "Modified" })],
      { changedOnly: true }
    );
    expect(names(root)).toEqual(["src"]);
    expect(names(find(root, "src")!)).toEqual(["b.ts"]);
  });

  it("filters by case-insensitive path substring", () => {
    const root = buildFileTree([tf("src/Widget.tsx"), tf("src/app.ts"), tf("docs/widget.md")], [], {
      query: "WIDGET",
    });
    expect(names(root)).toEqual(["docs", "src"]);
    expect(names(find(root, "src")!)).toEqual(["Widget.tsx"]);
  });

  it("normalizes Windows separators", () => {
    const root = buildFileTree([tf("src\\win.ts")], [st("src\\win.ts", { worktree: "Modified" })]);
    expect(find(root, "src/win.ts")?.status).toBe("modified");
  });
});

describe("flattenVisible", () => {
  const root = buildFileTree([tf("a/b/c.ts"), tf("a/d.ts"), tf("top.ts")], []);

  it("only shows children of expanded folders", () => {
    expect(flattenVisible(root, new Set()).map((r) => r.node.path)).toEqual(["a", "top.ts"]);
    expect(flattenVisible(root, new Set(["a"])).map((r) => [r.node.path, r.depth])).toEqual([
      ["a", 0],
      ["a/b", 1],
      ["a/d.ts", 1],
      ["top.ts", 0],
    ]);
  });

  it("expands everything when forced (search)", () => {
    expect(flattenVisible(root, new Set(), true).map((r) => r.node.path)).toEqual([
      "a",
      "a/b",
      "a/b/c.ts",
      "a/d.ts",
      "top.ts",
    ]);
  });

  it("lists parent dirs", () => {
    expect(parentDirs("a/b/c.ts")).toEqual(["a", "a/b"]);
    expect(parentDirs("top.ts")).toEqual([]);
  });
});
