import { describe, it, expect } from "vitest";
import type { FileStatus, TreeFile } from "../../lib/host";
import {
  STATUS_PRIORITY,
  STATUS_LETTER,
  STATUS_LABEL,
  STATUS_COLOR_VAR,
  buildFileTree,
  type FileTreeNode,
  type TreeStatus,
} from "./buildTree";

const ALL_STATUSES: TreeStatus[] = [
  "conflict",
  "deleted",
  "added",
  "modified",
  "renamed",
  "untracked",
];

const st = (path: string, extra: Partial<FileStatus>): FileStatus => ({
  path,
  conflicted: false,
  ...extra,
});
const tf = (path: string): TreeFile => ({ path, deleted_on_disk: false });
const find = (root: FileTreeNode, path: string): FileTreeNode | undefined => {
  for (const c of root.children) {
    if (c.path === path) return c;
    const hit = c.isDir ? find(c, path) : undefined;
    if (hit) return hit;
  }
  return undefined;
};

describe("tree status palette", () => {
  it("defines every status in every lookup table", () => {
    for (const status of ALL_STATUSES) {
      expect(STATUS_PRIORITY[status]).toBeTypeOf("number");
      expect(STATUS_LETTER[status]).toMatch(/^.$/);
      expect(STATUS_LABEL[status].length).toBeGreaterThan(0);
      expect(STATUS_COLOR_VAR[status]).toMatch(/^var\(--color-status-[a-z]+\)$/);
    }
    expect(Object.keys(STATUS_PRIORITY).sort()).toEqual([...ALL_STATUSES].sort());
    expect(Object.keys(STATUS_LETTER).sort()).toEqual([...ALL_STATUSES].sort());
    expect(Object.keys(STATUS_LABEL).sort()).toEqual([...ALL_STATUSES].sort());
    expect(Object.keys(STATUS_COLOR_VAR).sort()).toEqual([...ALL_STATUSES].sort());
  });

  it("assigns the documented letters and Chinese labels", () => {
    expect(STATUS_LETTER).toEqual({
      conflict: "!",
      deleted: "D",
      added: "A",
      modified: "M",
      renamed: "R",
      untracked: "U",
    });
    expect(STATUS_LABEL).toEqual({
      conflict: "冲突",
      deleted: "已删除",
      added: "新增",
      modified: "已修改",
      renamed: "重命名",
      untracked: "未跟踪",
    });
  });

  it("uses distinct CSS variables per status and orders priorities conflict-first", () => {
    const vars = ALL_STATUSES.map((s) => STATUS_COLOR_VAR[s]);
    expect(new Set(vars).size).toBe(ALL_STATUSES.length);
    expect(STATUS_PRIORITY.conflict).toBeLessThan(STATUS_PRIORITY.deleted);
    expect(STATUS_PRIORITY.deleted).toBeLessThan(STATUS_PRIORITY.added);
    expect(STATUS_PRIORITY.added).toBeLessThan(STATUS_PRIORITY.modified);
    expect(STATUS_PRIORITY.modified).toBeLessThan(STATUS_PRIORITY.renamed);
    expect(STATUS_PRIORITY.renamed).toBeLessThan(STATUS_PRIORITY.untracked);
  });

  describe("directory aggregate follows priority", () => {
    const aggregateFor = (statuses: Array<[string, Partial<FileStatus>]>) => {
      const root = buildFileTree(
        statuses.map(([p]) => tf(p)),
        statuses.map(([p, extra]) => st(p, extra))
      );
      return find(root, "d")?.aggregate;
    };

    it("picks the highest-priority child status", () => {
      expect(aggregateFor([["d/a", { worktree: "Untracked" }], ["d/b", { worktree: "Renamed" }]])).toBe(
        "renamed"
      );
      expect(aggregateFor([["d/a", { worktree: "Renamed" }], ["d/b", { worktree: "Modified" }]])).toBe(
        "modified"
      );
      expect(aggregateFor([["d/a", { worktree: "Modified" }], ["d/b", { index: "Added" }]])).toBe(
        "added"
      );
      expect(aggregateFor([["d/a", { index: "Added" }], ["d/b", { worktree: "Deleted" }]])).toBe(
        "deleted"
      );
      expect(
        aggregateFor([["d/a", { worktree: "Deleted" }], ["d/b", { worktree: "Modified", conflicted: true }]])
      ).toBe("conflict");
    });
  });
});
