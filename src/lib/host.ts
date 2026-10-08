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

export type RepoState =
  | "Clean"
  | "Merge"
  | "Rebase"
  | "CherryPick"
  | "Revert"
  | "Bisect"
  | "Other";

export interface HeadInfo {
  branch?: string | null;
  oid?: string | null;
  unborn: boolean;
  repo_state?: RepoState;
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

export interface GitIdentity {
  name: string;
  email: string;
}

export interface AmendStatus {
  can_amend: boolean;
  disabled_reason?: string | null;
  head_message?: string | null;
  is_pushed: boolean;
  pushed_remote_branches: string[];
}

export interface CommitResult {
  oid: string;
  short_oid: string;
  summary: string;
}

export interface AiKeyStatus {
  kie: boolean;
  openai: boolean;
  ollama: boolean;
  keyring_available: boolean;
}

export type AiProvider = "kie" | "openai" | "ollama";

export interface AiSettings {
  provider: AiProvider;
  base_url?: string | null;
  model: string;
  language: string; // "follow" | "zh" | "en"
  conventional: boolean;
  timeout_seconds: number;
  max_diff_chars: number;
  custom_secret_patterns: string[];
  consented: boolean;
}

export async function checkCommitIdentity(
  rootPath: string
): Promise<GitIdentity | null> {
  return await invoke<GitIdentity | null>("check_commit_identity", { rootPath });
}

export async function getHeadMessage(rootPath: string): Promise<string | null> {
  return await invoke<string | null>("get_head_message", { rootPath });
}

export async function inspectAmend(rootPath: string): Promise<AmendStatus> {
  return await invoke<AmendStatus>("inspect_amend", { rootPath });
}

export async function createCommit(
  rootPath: string,
  message: string,
  amend: boolean
): Promise<CommitResult> {
  return await invoke<CommitResult>("create_commit", {
    rootPath,
    message,
    amend,
  });
}

export async function getAiKeyStatus(): Promise<AiKeyStatus> {
  return await invoke<AiKeyStatus>("get_ai_key_status");
}

export async function saveAiKey(provider: string, key: string): Promise<void> {
  return await invoke("save_ai_key", { provider, key });
}

export async function deleteAiKey(provider: string): Promise<void> {
  return await invoke("delete_ai_key", { provider });
}

export async function testAiConnection(settings: AiSettings): Promise<string> {
  return await invoke<string>("test_ai_connection", { settings });
}

export async function fetchOllamaModels(baseUrl?: string): Promise<string[]> {
  return await invoke<string[]>("fetch_ollama_models", { baseUrl });
}

export async function generateAiCommitMessage(
  rootPath: string,
  settings: AiSettings
): Promise<string> {
  return await invoke<string>("generate_ai_commit_message", {
    rootPath,
    settings,
  });
}

export interface BranchItem {
  name: string;
  is_remote: boolean;
  is_head: boolean;
  upstream?: string | null;
  ahead: number;
  behind: number;
  target_oid: string;
}

export interface ValidationResult {
  valid: boolean;
  error_message?: string | null;
}

export interface SwitchBranchResult {
  success: boolean;
  current_branch: string;
  conflicting_files: string[];
  error_message?: string | null;
}

export type RefKind = "Head" | "LocalBranch" | "RemoteBranch" | "Tag";

export interface RefBadge {
  name: string;
  kind: RefKind;
}

export interface GraphEdge {
  from_col: number;
  to_col: number;
}

export interface LogCommit {
  oid: string;
  short_oid: string;
  parents: string[];
  author_name: string;
  author_email: string;
  timestamp: number;
  summary: string;
  message: string;
  refs: RefBadge[];
  col: number;
  edges: GraphEdge[];
}

export interface LogQuery {
  all_branches: boolean;
  filter_author?: string | null;
  filter_query?: string | null;
  skip: number;
  limit: number;
}

export interface LogResult {
  commits: LogCommit[];
  total_matched: number;
  has_more: boolean;
}

export interface CommitFileChange {
  path: string;
  old_path?: string | null;
  kind: ChangeKind;
}

export interface CommitDetails {
  oid: string;
  short_oid: string;
  parents: string[];
  author_name: string;
  author_email: string;
  author_timestamp: number;
  committer_name: string;
  committer_email: string;
  commit_timestamp: number;
  message: string;
  files: CommitFileChange[];
}

export async function listBranches(rootPath: string): Promise<BranchItem[]> {
  return await invoke<BranchItem[]>("list_branches", { rootPath });
}

export async function validateBranchName(
  rootPath: string,
  name: string
): Promise<ValidationResult> {
  return await invoke<ValidationResult>("validate_branch_name", { rootPath, name });
}

export async function createBranch(
  rootPath: string,
  name: string,
  startPoint?: string | null,
  checkout = true
): Promise<void> {
  return await invoke("create_branch", { rootPath, name, startPoint, checkout });
}

export async function switchBranch(
  rootPath: string,
  targetName: string,
  isRemote: boolean
): Promise<SwitchBranchResult> {
  return await invoke<SwitchBranchResult>("switch_branch", {
    rootPath,
    targetName,
    isRemote,
  });
}

export async function getCommitLog(
  rootPath: string,
  query: LogQuery
): Promise<LogResult> {
  return await invoke<LogResult>("get_commit_log", { rootPath, query });
}

export async function getCommitDetails(
  rootPath: string,
  oid: string
): Promise<CommitDetails> {
  return await invoke<CommitDetails>("get_commit_details", { rootPath, oid });
}

export async function getCommitFileDiff(
  rootPath: string,
  oid: string,
  filePath: string
): Promise<FileDiff> {
  return await invoke<FileDiff>("get_commit_file_diff", {
    rootPath,
    oid,
    filePath,
  });
}

export interface FetchResult {
  success: boolean;
  output: string;
  error_message?: string | null;
}

export type PullStrategy = "Merge" | "Rebase" | "FastForwardOnly";

export interface PullResult {
  success: boolean;
  has_conflict: boolean;
  conflicting_files: string[];
  output: string;
  error_message?: string | null;
}

export interface PushCommit {
  oid: string;
  short_oid: string;
  summary: string;
  author_name: string;
}

export interface PushInspection {
  current_branch: string;
  upstream_branch?: string | null;
  default_remote: string;
  default_target_branch: string;
  needs_upstream_setup: boolean;
  ahead_count: number;
  ahead_commits: PushCommit[];
}

export interface PushResult {
  success: boolean;
  rejected: boolean;
  output: string;
  error_message?: string | null;
}

export interface AbortResult {
  success: boolean;
  action: string;
  output: string;
  error_message?: string | null;
}

export interface OperationLogEntry {
  id: string;
  timestamp_ms: number;
  command_line: string;
  cwd: string;
  duration_ms: number;
  exit_code?: number | null;
  error_message?: string | null;
}

export async function fetchRemote(
  rootPath: string,
  remote?: string | null,
  prune = false
): Promise<FetchResult> {
  return await invoke<FetchResult>("fetch_remote", { rootPath, remote, prune });
}

export async function pullRemote(
  rootPath: string,
  remote?: string | null,
  branch?: string | null,
  strategy: PullStrategy = "Merge"
): Promise<PullResult> {
  return await invoke<PullResult>("pull_remote", {
    rootPath,
    remote,
    branch,
    strategy,
  });
}

export async function inspectPush(rootPath: string): Promise<PushInspection> {
  return await invoke<PushInspection>("inspect_push", { rootPath });
}

export async function pushRemote(
  rootPath: string,
  remote: string,
  branch: string,
  setUpstream = false
): Promise<PushResult> {
  return await invoke<PushResult>("push_remote", {
    rootPath,
    remote,
    branch,
    setUpstream,
  });
}

export async function abortMergeOrRebase(rootPath: string): Promise<AbortResult> {
  return await invoke<AbortResult>("abort_merge_or_rebase", { rootPath });
}

export async function getOperationLogs(): Promise<OperationLogEntry[]> {
  return await invoke<OperationLogEntry[]>("get_operation_logs");
}

export async function clearOperationLogs(): Promise<void> {
  return await invoke("clear_operation_logs");
}

export async function selectFolder(): Promise<string | null> {
  return await invoke<string | null>("select_folder");
}

export async function initRepository(path: string): Promise<RepoInfo> {
  return await invoke<RepoInfo>("init_repository", { path });
}




