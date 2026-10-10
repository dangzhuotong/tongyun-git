import type { FileStatus, TreeFile } from "../../lib/host";

/** 文件树里的状态（对齐 IDEA Project 面板的着色习惯）。 */
export type TreeStatus = "conflict" | "deleted" | "added" | "modified" | "renamed" | "untracked";

/** 目录小圆点取子孙里优先级最高的状态。数字越小越优先。 */
export const STATUS_PRIORITY: Record<TreeStatus, number> = {
  conflict: 0,
  deleted: 1,
  added: 2,
  modified: 3,
  renamed: 4,
  untracked: 5,
};

export const STATUS_LETTER: Record<TreeStatus, string> = {
  conflict: "!",
  deleted: "D",
  added: "A",
  modified: "M",
  renamed: "R",
  untracked: "U",
};

export const STATUS_LABEL: Record<TreeStatus, string> = {
  conflict: "冲突",
  deleted: "已删除",
  added: "新增",
  modified: "已修改",
  renamed: "重命名",
  untracked: "未跟踪",
};

export const STATUS_COLOR_VAR: Record<TreeStatus, string> = {
  conflict: "var(--color-status-conflict)",
  deleted: "var(--color-status-deleted)",
  added: "var(--color-status-added)",
  modified: "var(--color-status-modified)",
  renamed: "var(--color-status-renamed)",
  untracked: "var(--color-status-untracked)",
};

/** 把 get_repo_status 的一条记录（和磁盘是否已删）映射成文件树状态；没有改动返回 null。 */
export function mapFileStatus(
  status: FileStatus | undefined,
  deletedOnDisk = false
): TreeStatus | null {
  if (status?.conflicted) return "conflict";
  if (status?.index === "Deleted" || status?.worktree === "Deleted" || deletedOnDisk) {
    return "deleted";
  }
  if (!status) return null;
  if (status.worktree === "Untracked" || status.index === "Untracked") return "untracked";
  if (status.index === "Added") return "added";
  if (status.index === "Renamed" || status.worktree === "Renamed") return "renamed";
  if (
    status.index === "Modified" ||
    status.worktree === "Modified" ||
    status.index === "TypeChange" ||
    status.worktree === "TypeChange"
  ) {
    return "modified";
  }
  return null;
}

export interface FileTreeNode {
  name: string;
  /** 相对仓库根、用 `/` 分隔；根节点为 ""。 */
  path: string;
  isDir: boolean;
  children: FileTreeNode[];
  /** 文件自己的状态。 */
  status: TreeStatus | null;
  /** 目录：子孙里优先级最高的状态（用于小圆点）。文件同 status。 */
  aggregate: TreeStatus | null;
  deletedOnDisk: boolean;
  fileStatus?: FileStatus;
}

function better(a: TreeStatus | null, b: TreeStatus | null): TreeStatus | null {
  if (!a) return b;
  if (!b) return a;
  return STATUS_PRIORITY[a] <= STATUS_PRIORITY[b] ? a : b;
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

function sortChildren(node: FileTreeNode) {
  node.children.sort((a, b) => {
    if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
    return collator.compare(a.name, b.name);
  });
  for (const child of node.children) if (child.isDir) sortChildren(child);
}

function computeAggregate(node: FileTreeNode): TreeStatus | null {
  if (!node.isDir) return node.aggregate;
  let agg: TreeStatus | null = null;
  for (const child of node.children) agg = better(agg, computeAggregate(child));
  node.aggregate = agg;
  return agg;
}

export interface BuildTreeOptions {
  /** 只保留有改动的文件（以及它们的父目录）。 */
  changedOnly?: boolean;
  /** 按路径子串过滤，不区分大小写。 */
  query?: string;
}

/**
 * 把 list_repo_files 的扁平列表 + get_repo_status 的改动合成目录树。
 * 改动列表里有、文件列表里没有的路径（例如刚好在两次刷新之间出现的文件）也会补进来。
 */
export function buildFileTree(
  treeFiles: TreeFile[],
  statusFiles: FileStatus[],
  options: BuildTreeOptions = {}
): FileTreeNode {
  const statusByPath = new Map<string, FileStatus>();
  for (const s of statusFiles) statusByPath.set(s.path.replace(/\\/g, "/"), s);

  const entries = new Map<string, boolean>();
  for (const f of treeFiles) entries.set(f.path.replace(/\\/g, "/"), f.deleted_on_disk);
  for (const p of statusByPath.keys()) {
    if (!entries.has(p)) {
      const s = statusByPath.get(p);
      entries.set(p, s?.index === "Deleted" || s?.worktree === "Deleted");
    }
  }

  const query = options.query?.trim().toLowerCase() ?? "";
  const root: FileTreeNode = {
    name: "",
    path: "",
    isDir: true,
    children: [],
    status: null,
    aggregate: null,
    deletedOnDisk: false,
  };
  const dirs = new Map<string, FileTreeNode>([["", root]]);

  const ensureDir = (dirPath: string): FileTreeNode => {
    const existing = dirs.get(dirPath);
    if (existing) return existing;
    const slash = dirPath.lastIndexOf("/");
    const parent = ensureDir(slash < 0 ? "" : dirPath.slice(0, slash));
    const node: FileTreeNode = {
      name: slash < 0 ? dirPath : dirPath.slice(slash + 1),
      path: dirPath,
      isDir: true,
      children: [],
      status: null,
      aggregate: null,
      deletedOnDisk: false,
    };
    parent.children.push(node);
    dirs.set(dirPath, node);
    return node;
  };

  for (const [path, deletedOnDisk] of entries) {
    if (!path) continue;
    const fileStatus = statusByPath.get(path);
    const status = mapFileStatus(fileStatus, deletedOnDisk);
    if (options.changedOnly && !status) continue;
    if (query && !path.toLowerCase().includes(query)) continue;
    const slash = path.lastIndexOf("/");
    const parent = ensureDir(slash < 0 ? "" : path.slice(0, slash));
    parent.children.push({
      name: slash < 0 ? path : path.slice(slash + 1),
      path,
      isDir: false,
      children: [],
      status,
      aggregate: status,
      deletedOnDisk,
      fileStatus,
    });
  }

  sortChildren(root);
  computeAggregate(root);
  return root;
}

export interface VisibleRow {
  node: FileTreeNode;
  depth: number;
  expanded: boolean;
}

/** 只展开到用户展开过的目录；forceExpand 为 true 时（搜索中）全部展开。 */
export function flattenVisible(
  root: FileTreeNode,
  expanded: ReadonlySet<string>,
  forceExpand = false
): VisibleRow[] {
  const rows: VisibleRow[] = [];
  const walk = (node: FileTreeNode, depth: number) => {
    for (const child of node.children) {
      const isOpen = child.isDir && (forceExpand || expanded.has(child.path));
      rows.push({ node: child, depth, expanded: isOpen });
      if (isOpen) walk(child, depth + 1);
    }
  };
  walk(root, 0);
  return rows;
}

/** 所有父目录路径，例如 a/b/c.ts → ["a", "a/b"]。 */
export function parentDirs(path: string): string[] {
  const parts = path.split("/");
  const out: string[] = [];
  for (let i = 1; i < parts.length; i++) out.push(parts.slice(0, i).join("/"));
  return out;
}
