import { describe, it, expect } from "vitest";
import type { FileStatus, TreeFile } from "../../lib/host";
import {
  STATUS_PRIORITY,
  STATUS_LETTER,
  STATUS_LABEL,
  STATUS_COLOR_VAR,
  mapFileStatus,
  buildFileTree,
  flattenVisible,
  parentDirs,
  type TreeStatus,
  type FileTreeNode,
} from "./buildTree";

const makeStatus = (path: string, extra: Partial<FileStatus> = {}): FileStatus => ({
  path,
  conflicted: false,
  ...extra,
});

const makeTreeFile = (path: string, deleted_on_disk = false): TreeFile => ({
  path,
  deleted_on_disk,
});

const getChildNames = (node: FileTreeNode): string[] => node.children.map((c) => c.name);

const findNode = (root: FileTreeNode, path: string): FileTreeNode | undefined => {
  for (const child of root.children) {
    if (child.path === path) return child;
    if (child.isDir) {
      const hit = findNode(child, path);
      if (hit) return hit;
    }
  }
  return undefined;
};

describe("tree coloring constants", () => {
  it("defines strict priority hierarchy where smaller value means higher priority", () => {
    const statuses: TreeStatus[] = [
      "conflict",
      "deleted",
      "added",
      "modified",
      "renamed",
      "untracked",
    ];

    for (let i = 0; i < statuses.length - 1; i++) {
      const current = statuses[i];
      const next = statuses[i + 1];
      expect(STATUS_PRIORITY[current]).toBeLessThan(STATUS_PRIORITY[next]);
    }

    expect(STATUS_PRIORITY.conflict).toBe(0);
    expect(STATUS_PRIORITY.untracked).toBe(5);
  });

  it("provides single-letter badges for each tree status", () => {
    expect(STATUS_LETTER).toEqual({
      conflict: "!",
      deleted: "D",
      added: "A",
      modified: "M",
      renamed: "R",
      untracked: "U",
    });
  });

  it("provides localized labels for each status", () => {
    expect(STATUS_LABEL).toEqual({
      conflict: "冲突",
      deleted: "已删除",
      added: "新增",
      modified: "已修改",
      renamed: "重命名",
      untracked: "未跟踪",
    });
  });

  it("defines corresponding CSS variable names for each status", () => {
    expect(STATUS_COLOR_VAR.conflict).toBe("var(--color-status-conflict)");
    expect(STATUS_COLOR_VAR.deleted).toBe("var(--color-status-deleted)");
    expect(STATUS_COLOR_VAR.added).toBe("var(--color-status-added)");
    expect(STATUS_COLOR_VAR.modified).toBe("var(--color-status-modified)");
    expect(STATUS_COLOR_VAR.renamed).toBe("var(--color-status-renamed)");
    expect(STATUS_COLOR_VAR.untracked).toBe("var(--color-status-untracked)");
  });
});

describe("mapFileStatus comprehensive mapping", () => {
  it("returns null for clean files without status and not deleted on disk", () => {
    expect(mapFileStatus(undefined)).toBeNull();
    expect(mapFileStatus(undefined, false)).toBeNull();
    expect(mapFileStatus(makeStatus("clean.ts"))).toBeNull();
  });

  it("prioritizes conflict over all other statuses", () => {
    expect(
      mapFileStatus(makeStatus("file.ts", { conflicted: true, index: "Added" }))
    ).toBe("conflict");
    expect(
      mapFileStatus(makeStatus("file.ts", { conflicted: true, index: "Deleted" }))
    ).toBe("conflict");
    expect(
      mapFileStatus(makeStatus("file.ts", { conflicted: true, worktree: "Modified" }))
    ).toBe("conflict");
    expect(
      mapFileStatus(makeStatus("file.ts", { conflicted: true }), true)
    ).toBe("conflict");
  });

  it("maps deleted when deleted in worktree, index, or marked deleted on disk", () => {
    expect(mapFileStatus(makeStatus("file.ts", { index: "Deleted" }))).toBe("deleted");
    expect(mapFileStatus(makeStatus("file.ts", { worktree: "Deleted" }))).toBe("deleted");
    expect(mapFileStatus(makeStatus("file.ts", { worktree: "Modified" }), true)).toBe(
      "deleted"
    );
    expect(mapFileStatus(undefined, true)).toBe("deleted");
  });

  it("maps untracked when worktree or index is Untracked", () => {
    expect(mapFileStatus(makeStatus("file.ts", { worktree: "Untracked" }))).toBe(
      "untracked"
    );
    expect(mapFileStatus(makeStatus("file.ts", { index: "Untracked" }))).toBe(
      "untracked"
    );
  });

  it("maps added when index is Added", () => {
    expect(mapFileStatus(makeStatus("file.ts", { index: "Added" }))).toBe("added");
    expect(
      mapFileStatus(makeStatus("file.ts", { index: "Added", worktree: "Modified" }))
    ).toBe("added");
  });

  it("maps renamed when index or worktree is Renamed", () => {
    expect(mapFileStatus(makeStatus("file.ts", { index: "Renamed" }))).toBe("renamed");
    expect(mapFileStatus(makeStatus("file.ts", { worktree: "Renamed" }))).toBe("renamed");
  });

  it("maps modified for Modified and TypeChange changes", () => {
    expect(mapFileStatus(makeStatus("file.ts", { index: "Modified" }))).toBe("modified");
    expect(mapFileStatus(makeStatus("file.ts", { worktree: "Modified" }))).toBe("modified");
    expect(mapFileStatus(makeStatus("file.ts", { index: "TypeChange" }))).toBe("modified");
    expect(mapFileStatus(makeStatus("file.ts", { worktree: "TypeChange" }))).toBe(
      "modified"
    );
  });
});

describe("directory aggregate coloring and tree building", () => {
  it("builds empty root for empty file and status lists", () => {
    const root = buildFileTree([], []);
    expect(root.name).toBe("");
    expect(root.path).toBe("");
    expect(root.isDir).toBe(true);
    expect(root.children).toEqual([]);
    expect(root.status).toBeNull();
    expect(root.aggregate).toBeNull();
  });

  it("bubbles highest priority status to root and intermediate folders", () => {
    const tree = [
      makeTreeFile("src/features/a.ts"),
      makeTreeFile("src/features/b.ts"),
      makeTreeFile("src/utils/c.ts"),
      makeTreeFile("docs/guide.md"),
    ];
    const status = [
      makeStatus("src/features/a.ts", { worktree: "Untracked" }),
      makeStatus("src/features/b.ts", { index: "Added" }),
      makeStatus("src/utils/c.ts", { worktree: "Modified" }),
      makeStatus("docs/guide.md", { index: "Deleted" }),
    ];

    const root = buildFileTree(tree, status);

    // In src/features: b.ts is "added" (prio 2), a.ts is "untracked" (prio 5) => features aggregate is "added"
    expect(findNode(root, "src/features")?.aggregate).toBe("added");
    // In src/utils: c.ts is "modified" (prio 3) => utils aggregate is "modified"
    expect(findNode(root, "src/utils")?.aggregate).toBe("modified");
    // In src: children have "added" (2) and "modified" (3) => src aggregate is "added"
    expect(findNode(root, "src")?.aggregate).toBe("added");
    // In docs: guide.md is "deleted" (prio 1) => docs aggregate is "deleted"
    expect(findNode(root, "docs")?.aggregate).toBe("deleted");
    // Root level: children are docs (deleted: 1) and src (added: 2) => root aggregate is "deleted"
    expect(root.aggregate).toBe("deleted");
  });

  it("prioritizes conflict at all directory levels when present", () => {
    const tree = [
      makeTreeFile("deep/nested/sub/conflict.ts"),
      makeTreeFile("deep/nested/deleted.ts"),
      makeTreeFile("deep/added.ts"),
    ];
    const status = [
      makeStatus("deep/nested/sub/conflict.ts", { conflicted: true, worktree: "Modified" }),
      makeStatus("deep/nested/deleted.ts", { worktree: "Deleted" }),
      makeStatus("deep/added.ts", { index: "Added" }),
    ];

    const root = buildFileTree(tree, status);

    expect(findNode(root, "deep/nested/sub")?.aggregate).toBe("conflict");
    expect(findNode(root, "deep/nested")?.aggregate).toBe("conflict");
    expect(findNode(root, "deep")?.aggregate).toBe("conflict");
    expect(root.aggregate).toBe("conflict");
  });

  it("keeps aggregate as null when entire subfolder is clean", () => {
    const tree = [
      makeTreeFile("clean/a.ts"),
      makeTreeFile("clean/sub/b.ts"),
      makeTreeFile("dirty/c.ts"),
    ];
    const status = [makeStatus("dirty/c.ts", { worktree: "Modified" })];

    const root = buildFileTree(tree, status);

    expect(findNode(root, "clean/sub")?.aggregate).toBeNull();
    expect(findNode(root, "clean")?.aggregate).toBeNull();
    expect(findNode(root, "dirty")?.aggregate).toBe("modified");
  });

  it("sorts directories before files, then natural alphanumeric order", () => {
    const tree = [
      makeTreeFile("file10.txt"),
      makeTreeFile("file2.txt"),
      makeTreeFile("dirB/x.txt"),
      makeTreeFile("dirA/y.txt"),
      makeTreeFile("file1.txt"),
    ];

    const root = buildFileTree(tree, []);
    expect(getChildNames(root)).toEqual(["dirA", "dirB", "file1.txt", "file2.txt", "file10.txt"]);
  });

  it("handles changedOnly and query filter combinations", () => {
    const tree = [
      makeTreeFile("src/components/Button.tsx"),
      makeTreeFile("src/components/Input.tsx"),
      makeTreeFile("src/utils/format.ts"),
    ];
    const status = [
      makeStatus("src/components/Button.tsx", { worktree: "Modified" }),
      makeStatus("src/utils/format.ts", { worktree: "Modified" }),
    ];

    // Filter changed files with query "format"
    const root = buildFileTree(tree, status, { changedOnly: true, query: "format" });
    expect(getChildNames(root)).toEqual(["src"]);
    const srcNode = findNode(root, "src");
    expect(srcNode).toBeDefined();
    expect(getChildNames(srcNode!)).toEqual(["utils"]);
    const utilsNode = findNode(root, "src/utils");
    expect(getChildNames(utilsNode!)).toEqual(["format.ts"]);
  });
});

describe("flattenVisible and parentDirs", () => {
  it("flattens with depth and respect for expanded paths", () => {
    const tree = [
      makeTreeFile("a/b/c.ts"),
      makeTreeFile("a/b/d.ts"),
      makeTreeFile("a/e.ts"),
      makeTreeFile("root.ts"),
    ];
    const root = buildFileTree(tree, []);

    // Nothing expanded
    const collapsedRows = flattenVisible(root, new Set());
    expect(collapsedRows.map((r) => [r.node.path, r.depth, r.expanded])).toEqual([
      ["a", 0, false],
      ["root.ts", 0, false],
    ]);

    // Expand 'a', but keep 'a/b' collapsed
    const partialRows = flattenVisible(root, new Set(["a"]));
    expect(partialRows.map((r) => [r.node.path, r.depth, r.expanded])).toEqual([
      ["a", 0, true],
      ["a/b", 1, false],
      ["a/e.ts", 1, false],
      ["root.ts", 0, false],
    ]);

    // Force expand all
    const forcedRows = flattenVisible(root, new Set(), true);
    expect(forcedRows.map((r) => [r.node.path, r.depth, r.expanded])).toEqual([
      ["a", 0, true],
      ["a/b", 1, true],
      ["a/b/c.ts", 2, false],
      ["a/b/d.ts", 2, false],
      ["a/e.ts", 1, false],
      ["root.ts", 0, false],
    ]);
  });

  it("computes parent directories correctly", () => {
    expect(parentDirs("")).toEqual([]);
    expect(parentDirs("file.ts")).toEqual([]);
    expect(parentDirs("a/b")).toEqual(["a"]);
    expect(parentDirs("a/b/c/d.ts")).toEqual(["a", "a/b", "a/b/c"]);
  });
});
