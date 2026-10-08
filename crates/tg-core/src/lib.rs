pub mod ai;
pub mod backend;
pub mod branch;
pub mod cli;
pub mod commit;
pub mod discard;
pub mod error;
pub mod log;
pub mod patch;
pub mod redact;

#[cfg(windows)]
mod win_job;

pub use ai::{
    AiProviderType, AiService, AiSettings, KeyringStore, MemoryKeyring, SecretFilter, SystemKeyring,
};
pub use backend::{
    ChangeKind, DiffHunk, DiffLine, FileDiff, FileStatus, Git2Backend, GitBackend, HeadInfo,
};
pub use branch::{BranchItem, BranchService, SwitchBranchResult, ValidationResult};
pub use cli::{
    parse_git_version, version_at_least, CliOutput, CliRunner, RunOptions, MIN_GIT_VERSION,
};
pub use commit::{AmendStatus, CommitResult, CommitService, GitIdentity};
pub use discard::{
    DiscardCandidate, DiscardResult, DiscardService, UndoDiscardResult, MAX_SINGLE_FILE_SNAPSHOT,
    MAX_SNAPSHOT_COUNT, MAX_TOTAL_SNAPSHOT,
};
pub use error::{CoreError, Result};
pub use log::{
    CommitDetails, CommitFileChange, GraphEdge, LogCommit, LogQuery, LogResult, LogService,
    RefBadge, RefKind,
};
pub use patch::{apply_patch_to_index, build_selected_patch};
pub use redact::redact_url_credentials;

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
