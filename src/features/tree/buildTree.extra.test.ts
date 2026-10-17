import { describe, it, expect } from "vitest";
import type { FileStatus, TreeFile } from "../../lib/host";
import {
  buildFileTree,
  flattenVisible,
  mapFileStatus,
  parentDirs,
  type FileTreeNode,
} from "./buildTree";

const st = (path: string, extra: Partial<FileStatus>): FileStatus => ({
  path,
  conflicted: false,
  ...extra,
});
const tf = (path: string, deleted_on_disk = false): TreeFile => ({ path, deleted_on_disk });
const find = (root: FileTreeNode, path: string): FileTreeNode | undefined => {
  for (const c of root.children) {
    if (c.path === path) return c;
    const hit = c.isDir ? find(c, path) : undefined;
    if (hit) return hit;
  }
  return undefined;
};
const allPaths = (root: FileTreeNode): string[] => {
  const out: string[] = [];
  const walk = (n: FileTreeNode) => {
    for (const c of n.children) {
      out.push(c.path);
      if (c.isDir) walk(c);
    }
  };
  walk(root);
  return out;
};

describe("mapFileStatus precedence", () => {
  it("lets conflict win over any other status", () => {
    expect(mapFileStatus(st("a", { worktree: "Deleted", conflicted: true }))).toBe("conflict");
    expect(mapFileStatus(st("a", { index: "Added", worktree: "Modified", conflicted: true }))).toBe(
      "conflict"
    );
  });

  it("treats deletion as stronger than untracked", () => {
    expect(mapFileStatus(st("a", { index: "Deleted", worktree: "Untracked" }))).toBe("deleted");
  });

  it("maps a worktree TypeChange to modified", () => {
    expect(mapFileStatus(st("a", { worktree: "TypeChange" }))).toBe("modified");
  });

  it("returns null for a clean file that still exists on disk", () => {
    expect(mapFileStatus(st("a", {}))).toBeNull();
  });
});

describe("buildFileTree extra edge cases", () => {
  it("backfills a status-only deleted file that is absent from the file list", () => {
    const root = buildFileTree([tf("keep.ts")], [st("gone.ts", { index: "Deleted" })]);
    const node = find(root, "gone.ts");
    expect(node?.status).toBe("deleted");
    expect(node?.deletedOnDisk).toBe(true);
    expect(node?.fileStatus?.index).toBe("Deleted");
  });

  it("deduplicates paths that differ only by separator style", () => {
    const root = buildFileTree([tf("src\\win.ts")], [st("src/win.ts", { worktree: "Modified" })]);
    expect(allPaths(root).filter((p) => p === "src/win.ts")).toHaveLength(1);
    expect(find(root, "src/win.ts")?.status).toBe("modified");
  });

  it("ignores duplicate entries in the file list", () => {
    const root = buildFileTree([tf("a.ts"), tf("a.ts")], []);
    expect(root.children.filter((c) => c.path === "a.ts")).toHaveLength(1);
  });

  it("treats a blank/whitespace query as no filter", () => {
    const root = buildFileTree([tf("a.ts"), tf("b.ts")], [], { query: "   " });
    expect(root.children.map((c) => c.name)).toEqual(["a.ts", "b.ts"]);
  });

  it("changedOnly keeps untracked files and drops clean ones", () => {
    const root = buildFileTree(
      [tf("src/clean.ts"), tf("src/new.ts")],
      [st("src/new.ts", { worktree: "Untracked" })],
      { changedOnly: true }
    );
    expect(allPaths(root)).toEqual(["src", "src/new.ts"]);
  });

  it("aggregates through several nested directory levels", () => {
    const root = buildFileTree(
      [tf("a/b/c/d.ts")],
      [st("a/b/c/d.ts", { worktree: "Modified" })]
    );
    expect(find(root, "a")?.aggregate).toBe("modified");
    expect(find(root, "a/b")?.aggregate).toBe("modified");
    expect(find(root, "a/b/c")?.aggregate).toBe("modified");
    expect(find(root, "a/b/c/d.ts")?.aggregate).toBe("modified");
  });
});

describe("flattenVisible extra edge cases", () => {
  const root = buildFileTree([tf("a/b/c.ts"), tf("top.ts")], []);

  it("never includes the synthetic root node", () => {
    expect(flattenVisible(root, new Set(), true).some((r) => r.node.path === "")).toBe(false);
  });

  it("ignores expanded paths that do not exist", () => {
    expect(flattenVisible(root, new Set(["missing", "a"])).map((r) => r.node.path)).toEqual([
      "a",
      "a/b",
      "top.ts",
    ]);
  });
});

describe("parentDirs extra edge cases", () => {
  it("lists every ancestor of a deeply nested path", () => {
    expect(parentDirs("a/b/c/d.ts")).toEqual(["a", "a/b", "a/b/c"]);
  });

  it("returns an empty list for root-level paths", () => {
    expect(parentDirs("top.ts")).toEqual([]);
    expect(parentDirs("")).toEqual([]);
  });
});
