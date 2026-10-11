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

export interface TreeFile {
  path: string;
  deleted_on_disk: boolean;
}

export async function listRepoFiles(rootPath: string): Promise<TreeFile[]> {
  return await invoke<TreeFile[]>("list_repo_files", { rootPath });
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

export async function setCommitIdentity(
  rootPath: string,
  name: string,
  email: string,
  global: boolean
): Promise<void> {
  return await invoke("set_commit_identity", { rootPath, name, email, global });
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

export interface ReviewIssue {
  level: "danger" | "warning" | "info";
  file?: string | null;
  message: string;
  suggestion?: string | null;
}

export interface DiffReviewResult {
  summary: string;
  issues: ReviewIssue[];
  passed: boolean;
}

export interface AiLogMatch {
  oid: string;
  reason: string;
}

export interface AiLogQueryResult {
  answer: string;
  matched_oids: AiLogMatch[];
}

export async function reviewStagedDiff(
  rootPath: string,
  settings: AiSettings
): Promise<DiffReviewResult> {
  return await invoke<DiffReviewResult>("review_staged_diff", {
    rootPath,
    settings,
  });
}

export async function aiSearchLog(
  rootPath: string,
  query: string,
  settings: AiSettings
): Promise<AiLogQueryResult> {
  return await invoke<AiLogQueryResult>("ai_search_log", {
    rootPath,
    query,
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

export interface RemoteDetail {
  name: string;
  url?: string | null;
  push_url?: string | null;
}

export interface PushInspection {
  current_branch: string;
  upstream_branch?: string | null;
  default_remote: string;
  default_target_branch: string;
  needs_upstream_setup: boolean;
  ahead_count: number;
  ahead_commits: PushCommit[];
  available_remotes?: RemoteDetail[];
}

export interface MultiPushItemResult {
  remote: string;
  success: boolean;
  rejected: boolean;
  output: string;
  error_message?: string | null;
}

export interface CloneResult {
  success: boolean;
  output: string;
  error_message?: string | null;
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

export async function cloneRepository(
  url: string,
  targetPath: string
): Promise<RepoInfo> {
  return await invoke<RepoInfo>("clone_repository", { url, targetPath });
}

export async function listRemotes(rootPath: string): Promise<RemoteDetail[]> {
  return await invoke<RemoteDetail[]>("list_remotes", { rootPath });
}

export async function pushMultipleRemotes(
  rootPath: string,
  remotes: string[],
  branch: string,
  setUpstream = false
): Promise<MultiPushItemResult[]> {
  return await invoke<MultiPushItemResult[]>("push_multiple_remotes", {
    rootPath,
    remotes,
    branch,
    setUpstream,
  });
}

export interface StashItem {
  index: number;
  name: string;
  branch: string;
  message: string;
  date: string | null;
}

export interface StashApplyResult {
  success: boolean;
  has_conflict: boolean;
  message: string | null;
}

export async function listStashes(rootPath: string): Promise<StashItem[]> {
  return await invoke<StashItem[]>("list_stashes", { rootPath });
}

export async function createStash(
  rootPath: string,
  message?: string | null,
  includeUntracked = false
): Promise<void> {
  return await invoke("create_stash", {
    rootPath,
    message,
    includeUntracked,
  });
}

export async function applyStash(
  rootPath: string,
  index: number,
  pop = false
): Promise<StashApplyResult> {
  return await invoke<StashApplyResult>("apply_stash", {
    rootPath,
    index,
    pop,
  });
}

export async function dropStash(rootPath: string, index: number): Promise<void> {
  return await invoke("drop_stash", { rootPath, index });
}

export async function clearStashes(rootPath: string): Promise<void> {
  return await invoke("clear_stashes", { rootPath });
}

export async function showStashDiff(
  rootPath: string,
  index: number
): Promise<string> {
  return await invoke<string>("show_stash_diff", { rootPath, index });
}

export interface TagItem {
  name: string;
  target_oid: string;
  short_oid: string;
  message?: string | null;
  tagger_name?: string | null;
  tagger_email?: string | null;
  timestamp?: number | null;
  is_annotated: boolean;
}

export interface FileHistoryItem {
  oid: string;
  short_oid: string;
  author_name: string;
  author_email: string;
  timestamp: number;
  summary: string;
}

export async function listTags(rootPath: string): Promise<TagItem[]> {
  return await invoke<TagItem[]>("list_tags", { rootPath });
}

export async function createTag(
  rootPath: string,
  name: string,
  targetOid?: string | null,
  message?: string | null
): Promise<TagItem> {
  return await invoke<TagItem>("create_tag", {
    rootPath,
    name,
    targetOid,
    message,
  });
}

export async function deleteTag(rootPath: string, name: string): Promise<void> {
  return await invoke("delete_tag", { rootPath, name });
}

export async function pushTag(
  rootPath: string,
  name: string,
  remote?: string | null
): Promise<void> {
  return await invoke("push_tag", { rootPath, name, remote });
}

export async function pushAllTags(
  rootPath: string,
  remote?: string | null
): Promise<void> {
  return await invoke("push_all_tags", { rootPath, remote });
}

export async function deleteRemoteTag(
  rootPath: string,
  name: string,
  remote?: string | null
): Promise<void> {
  return await invoke("delete_remote_tag", { rootPath, name, remote });
}

export async function getFileHistory(
  rootPath: string,
  filePath: string,
  limit = 50
): Promise<FileHistoryItem[]> {
  return await invoke<FileHistoryItem[]>("get_file_history", {
    rootPath,
    filePath,
    limit,
  });
}

export async function checkoutCommit(
  rootPath: string,
  oid: string
): Promise<void> {
  return await invoke("checkout_commit", { rootPath, oid });
}

export async function resetToCommit(
  rootPath: string,
  oid: string,
  mode: "soft" | "mixed"
): Promise<void> {
  return await invoke("reset_to_commit", { rootPath, oid, mode });
}

export interface ConflictFileSummary {
  path: string;
  has_ancestor: boolean;
  has_our: boolean;
  has_their: boolean;
}

export interface ConflictHunk {
  hunk_index: number;
  our_start_line: number;
  our_lines: string[];
  their_start_line: number;
  their_lines: string[];
  base_lines: string[];
}

export interface ConflictFileDetails {
  path: string;
  base_content: string | null;
  our_content: string | null;
  their_content: string | null;
  worktree_content: string;
  hunks: ConflictHunk[];
  is_binary: boolean;
}

export async function listConflicts(rootPath: string): Promise<ConflictFileSummary[]> {
  return await invoke<ConflictFileSummary[]>("list_conflicts", { rootPath });
}

export async function getConflictDetails(
  rootPath: string,
  filePath: string
): Promise<ConflictFileDetails> {
  return await invoke<ConflictFileDetails>("get_conflict_details", {
    rootPath,
    filePath,
  });
}

export async function resolveConflictFile(
  rootPath: string,
  filePath: string,
  resolvedContent: string
): Promise<void> {
  return await invoke("resolve_conflict_file", {
    rootPath,
    filePath,
    resolvedContent,
  });
}

export async function acceptOurs(
  rootPath: string,
  filePath: string
): Promise<void> {
  return await invoke("accept_ours", { rootPath, filePath });
}

export async function acceptTheirs(
  rootPath: string,
  filePath: string
): Promise<void> {
  return await invoke("accept_theirs", { rootPath, filePath });
}

export async function continueMergeOrRebase(rootPath: string): Promise<void> {
  return await invoke("continue_merge_or_rebase", { rootPath });
}

export type RebaseAction = "pick" | "reword" | "squash" | "fixup" | "drop";

export interface RebaseItem {
  oid: string;
  short_oid: string;
  summary: string;
  author_name: string;
  action: RebaseAction;
  new_message?: string | null;
}

export interface RebasePlan {
  base_oid: string;
  items: RebaseItem[];
}

export interface RebaseResult {
  success: boolean;
  has_conflict: boolean;
  message: string;
}

export async function getRebaseCommits(
  rootPath: string,
  baseOid: string
): Promise<RebaseItem[]> {
  return await invoke<RebaseItem[]>("get_rebase_commits", {
    rootPath,
    baseOid,
  });
}

export async function executeInteractiveRebase(
  rootPath: string,
  plan: RebasePlan
): Promise<RebaseResult> {
  return await invoke<RebaseResult>("execute_interactive_rebase", {
    rootPath,
    plan,
  });
}

export interface WorktreeItem {
  name: string;
  path: string;
  head_oid?: string | null;
  branch?: string | null;
  is_main: boolean;
  is_locked: boolean;
  lock_reason?: string | null;
  is_bare: boolean;
  is_detached: boolean;
}

export async function listWorktrees(rootPath: string): Promise<WorktreeItem[]> {
  return await invoke<WorktreeItem[]>("list_worktrees", { rootPath });
}

export async function addWorktree(
  rootPath: string,
  worktreePath: string,
  branch?: string | null,
  createBranch = false
): Promise<void> {
  return await invoke("add_worktree", {
    rootPath,
    worktreePath,
    branch,
    createBranch,
  });
}

export async function removeWorktree(
  rootPath: string,
  worktreePath: string,
  force = false
): Promise<void> {
  return await invoke("remove_worktree", {
    rootPath,
    worktreePath,
    force,
  });
}

export async function lockWorktree(
  rootPath: string,
  worktreePath: string,
  reason?: string | null
): Promise<void> {
  return await invoke("lock_worktree", {
    rootPath,
    worktreePath,
    reason,
  });
}

export async function unlockWorktree(
  rootPath: string,
  worktreePath: string
): Promise<void> {
  return await invoke("unlock_worktree", {
    rootPath,
    worktreePath,
  });
}

export async function pruneWorktrees(rootPath: string): Promise<void> {
  return await invoke("prune_worktrees", { rootPath });
}





// Additional local workspace workflows. No AI requests or secrets cross this API.
export interface SnapshotVersion { oid: string; mode: number }
export interface WorkspaceSnapshot {
  reference: string; label: string; kind: string; root: string; head: string | null;
  created_ms: number; files: Record<string, SnapshotVersion | null>;
}
export interface SnapshotChange {
  path: string; saved: SnapshotVersion | null; current: SnapshotVersion | null;
  current_index: SnapshotVersion | null; can_restore: boolean;
}
export interface WorkspaceOverview {
  worktrees: { path: string; branch: string | null; changed: string[]; ahead: number | null; behind: number | null; error: string | null }[];
  overlaps: Record<string, string[]>;
  hunk_overlaps: string[];
}
export interface BranchComparison { from: string; to: string; patch: string; files: number; additions: number; deletions: number }
export interface BlameLine { line: number; oid: string; author: string; content: string }
export type HistoryAction = "cherry_pick" | "revert" | "merge" | "continue" | "abort";
export type WorkspaceRequest =
  | { type: "overview" | "snapshots" }
  | { type: "compare"; from: string; to: string }
  | { type: "blame"; path: string; start: number; count: number }
  | { type: "history"; action: HistoryAction; target: string }
  | { type: "capture"; label: string }
  | { type: "finish" | "changes" | "delete"; reference: string }
  | { type: "restore"; reference: string; changes: SnapshotChange[] }
  | { type: "shelve"; label: string; paths: string[] }
  | { type: "discard_lines"; expected: FileDiff; hunk_index: number; selected: number[] }
  | { type: "open"; application: "idea" | "terminal" | "folder" };
export async function workspaceTask<T>(rootPath: string, request: WorkspaceRequest): Promise<T> {
  return invoke<T>("workspace_task", { rootPath, request, gitPath: localStorage.getItem("tongyun_git_path") || null });
}
