pub mod ai;
pub mod backend;
pub mod branch;
pub mod cli;
pub mod commit;
pub mod conflict;
pub mod context_pack;
pub mod discard;
pub mod error;
pub mod log;
pub mod patch;
pub mod rebase;
pub mod redact;
pub mod remote;
pub mod snapshot;
pub mod stash;
pub mod tag;
pub mod workspace;
pub mod worktree;

#[cfg(windows)]
mod win_job;

pub use ai::{
    AiLogMatch, AiLogQueryResult, AiProviderType, AiService, AiSettings, DiffReviewResult,
    KeyringStore, MemoryKeyring, ReviewIssue, SecretFilter, SystemKeyring,
};

pub use backend::{
    map_repo_state, ChangeKind, DiffHunk, DiffLine, FileDiff, FileStatus, Git2Backend, GitBackend,
    HeadInfo, RepoState, TreeFile,
};
pub use branch::{BranchItem, BranchService, SwitchBranchResult, ValidationResult};
pub use cli::{
    clear_operation_logs, get_operation_logs, parse_git_version, record_operation_log,
    version_at_least, CliOutput, CliRunner, OperationLogEntry, RunOptions, MIN_GIT_VERSION,
};
pub use commit::{AmendStatus, CommitResult, CommitService, GitIdentity};
pub use conflict::{ConflictFileDetails, ConflictFileSummary, ConflictHunk, ConflictService};
pub use context_pack::{ContextFileSummary, ContextPack, ContextPackGenerator, ContextPackSummary};
pub use discard::{
    DiscardCandidate, DiscardResult, DiscardService, UndoDiscardResult, MAX_SINGLE_FILE_SNAPSHOT,
    MAX_SNAPSHOT_COUNT, MAX_TOTAL_SNAPSHOT,
};
pub use error::{CoreError, Result};
pub use log::{
    CommitDetails, CommitFileChange, FileHistoryItem, GraphEdge, LogCommit, LogQuery, LogResult,
    LogService, RefBadge, RefKind,
};
pub use patch::{apply_patch_to_index, build_selected_patch};
pub use rebase::{RebaseAction, RebaseItem, RebasePlan, RebaseResult, RebaseService};
pub use redact::redact_url_credentials;
pub use remote::{
    AbortResult, CloneResult, FetchResult, MultiPushItemResult, PullResult, PullStrategy,
    PushCommit, PushInspection, PushResult, RemoteDetail, RemoteService,
};
pub use stash::{StashApplyResult, StashItem, StashService};
pub use tag::{TagItem, TagService};
pub use worktree::{WorktreeItem, WorktreeService};

/// Thin wrapper preserving backwards compatibility for callers of `git_version`.
pub fn git_version(git_path: &str) -> std::result::Result<String, String> {
    CliRunner::new(git_path)
        .version()
        .map_err(|e| e.to_string())
}

pub fn libgit2_version() -> String {
    let (major, minor, rev) = git2::Version::get().libgit2_version();
    format!("{}.{}.{}", major, minor, rev)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_git_version_success() {
        let version = git_version("git").expect("git should be available in PATH");
        assert!(!version.is_empty(), "version should not be empty");
        assert!(version.contains('.'), "version should contain a dot");
    }

    #[test]
    fn test_git_version_not_found() {
        let result = git_version("non_existent_git_binary_path_12345");
        assert!(
            result.is_err(),
            "should return Err for non-existent git path"
        );
    }

    #[test]
    fn test_libgit2_version() {
        let v = libgit2_version();
        assert!(!v.is_empty());
        assert!(v.contains('.'));
    }
}
