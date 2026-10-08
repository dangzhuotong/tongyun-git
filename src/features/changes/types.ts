import type { FileStatus } from "../../lib/host";

export interface SelectedFileTarget {
  path: string;
  staged: boolean;
  status: FileStatus;
}

export type ViewMode = "flat" | "tree";
export type DiffLayout = "unified" | "split";

export interface TreeNode {
  name: string;
  path: string;
  isFolder: boolean;
  children: TreeNode[];
  fileStatus?: FileStatus;
  staged?: boolean;
}
