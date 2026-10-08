import { invoke } from "@tauri-apps/api/core";

export interface AppInfo {
  name: string;
  version: string;
  identifier: string;
  git_version: string | null;
  libgit2_version: string;
}

export type ChangeKind =
  | "Added"
  | "Modified"
  | "Deleted"
  | "Renamed"
  | "TypeChange"
  | "Untracked";

export interface FileStatus {
  path: string;
  old_path?: string | null;
  index?: ChangeKind | null;
  worktree?: ChangeKind | null;
  conflicted: boolean;
}

export interface HeadInfo {
  branch?: string | null;
  oid?: string | null;
  unborn: boolean;
}

export interface RepoInfo {
  root_path: string;
  name: string;
  head: HeadInfo;
}

export interface RepoStatusResult {
  head: HeadInfo;
  files: FileStatus[];
}

export interface DiffLine {
  origin: string; // '+', '-', ' '
  old_lineno?: number | null;
  new_lineno?: number | null;
  content: string;
}

export interface DiffHunk {
  old_start: number;
  old_lines: number;
  new_start: number;
  new_lines: number;
  header: string;
  lines: DiffLine[];
}

export interface FileDiff {
  path: string;
  old_path?: string | null;
  staged: boolean;
  is_binary: boolean;
  old_size?: number | null;
  new_size?: number | null;
  is_crlf_change: boolean;
  is_large: boolean;
  hunks: DiffHunk[];
}

export interface GitCheckResult {
  available: boolean;
  version?: string | null;
  error?: string | null;
}

export async function getAppInfo(): Promise<AppInfo> {
  return await invoke<AppInfo>("app_info");
}

export async function checkGit(customPath?: string): Promise<GitCheckResult> {
  return await invoke<GitCheckResult>("check_git", { customPath });
}

export async function openRepository(path: string): Promise<RepoInfo> {
  return await invoke<RepoInfo>("open_repository", { path });
}

export async function getRepoStatus(rootPath: string): Promise<RepoStatusResult> {
  return await invoke<RepoStatusResult>("get_repo_status", { rootPath });
}

export async function getFileDiff(
  rootPath: string,
  path: string,
  staged: boolean
): Promise<FileDiff> {
  return await invoke<FileDiff>("get_file_diff", { rootPath, path, staged });
}

export interface DiscardCandidate {
  path: string;
  will_delete: boolean;
  unrestorable: boolean;
  size: number;
}

export interface DiscardResult {
  snapshot_ref: string | null;
  discarded_count: number;
  unrestorable_files: string[];
}

export interface UndoDiscardResult {
  restored_count: number;
  skipped_files: string[];
}

export async function stageFiles(rootPath: string, paths: string[]): Promise<void> {
  return await invoke("stage_files", { rootPath, paths });
}

export async function unstageFiles(rootPath: string, paths: string[]): Promise<void> {
  return await invoke("unstage_files", { rootPath, paths });
}

export async function stageLines(
  rootPath: string,
  path: string,
  hunkIndex: number,
  selectedLineIndices: number[],
  reverse: boolean,
  isNewFile: boolean
): Promise<void> {
  return await invoke("stage_lines", {
    rootPath,
    path,
    hunkIndex,
    selectedLineIndices,
    reverse,
    isNewFile,
  });
}

export async function inspectDiscard(
  rootPath: string,
  paths: string[]
): Promise<DiscardCandidate[]> {
  return await invoke<DiscardCandidate[]>("inspect_discard", { rootPath, paths });
}

export async function discardFiles(
  rootPath: string,
  paths: string[]
): Promise<DiscardResult> {
  return await invoke<DiscardResult>("discard_files", { rootPath, paths });
}

export async function undoDiscard(
  rootPath: string,
  skipConflict: boolean
): Promise<UndoDiscardResult> {
  return await invoke<UndoDiscardResult>("undo_discard", { rootPath, skipConflict });
}
