use std::path::PathBuf;

#[derive(Debug, thiserror::Error)]
pub enum CoreError {
    #[error("not a git repository")]
    NotARepository,

    #[error("bare repository is not supported")]
    BareRepository,

    #[error("git executable not found")]
    GitNotFound,

    #[error(transparent)]
    Git2(#[from] git2::Error),

    #[error(transparent)]
    Io(#[from] std::io::Error),

    #[error("git command timed out after {after_ms}ms: {command_line}")]
    Timeout { command_line: String, after_ms: u64 },

    #[error("git cli error (exit code {}): {stderr}", display_exit_code(exit_code))]
    Cli {
        exit_code: Option<i32>,
        stderr: String,
    },

    #[error("invalid git version: {0}")]
    InvalidVersion(String),

    #[error("path error: {0}")]
    PathError(PathBuf),

    /// Line-level index apply refused the patch before touching the repository.
    #[error("rejected patch: {0}")]
    RejectedPatch(&'static str),

    #[error("discard snapshot error: {0}")]
    DiscardError(String),

    #[error("commit error: {0}")]
    CommitError(String),

    #[error("ai error: {0}")]
    AiError(String),

    #[error("keyring error: {0}")]
    KeyringError(String),

    #[error("branch error: {0}")]
    InvalidBranchName(String),

    #[error("log error: {0}")]
    LogError(String),

    #[error("tag error: {0}")]
    TagError(String),

    #[error("reset error: {0}")]
    ResetError(String),

    #[error("conflict error: {0}")]
    ConflictError(String),

    #[error("rebase error: {0}")]
    RebaseError(String),

    #[error("worktree error: {0}")]
    WorktreeError(String),
}

pub type Result<T> = std::result::Result<T, CoreError>;

fn display_exit_code(code: &Option<i32>) -> String {
    match code {
        Some(n) => n.to_string(),
        None => "none".to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_error_display() {
        assert_eq!(
            CoreError::NotARepository.to_string(),
            "not a git repository"
        );
        assert_eq!(
            CoreError::BareRepository.to_string(),
            "bare repository is not supported"
        );
        assert_eq!(
            CoreError::GitNotFound.to_string(),
            "git executable not found"
        );

        assert_eq!(
            CoreError::Timeout {
                command_line: "git status".to_string(),
                after_ms: 5000,
            }
            .to_string(),
            "git command timed out after 5000ms: git status"
        );

        assert_eq!(
            CoreError::Cli {
                exit_code: Some(1),
                stderr: "fatal error".to_string(),
            }
            .to_string(),
            "git cli error (exit code 1): fatal error"
        );

        assert_eq!(
            CoreError::Cli {
                exit_code: None,
                stderr: "killed".to_string(),
            }
            .to_string(),
            "git cli error (exit code none): killed"
        );

        assert_eq!(
            CoreError::InvalidVersion("abc".to_string()).to_string(),
            "invalid git version: abc"
        );

        assert_eq!(
            CoreError::PathError(PathBuf::from("my_path")).to_string(),
            "path error: my_path"
        );

        assert_eq!(
            CoreError::RejectedPatch("corrupted header").to_string(),
            "rejected patch: corrupted header"
        );

        assert_eq!(
            CoreError::DiscardError("snapshot failed".to_string()).to_string(),
            "discard snapshot error: snapshot failed"
        );

        assert_eq!(
            CoreError::CommitError("commit failed".to_string()).to_string(),
            "commit error: commit failed"
        );

        assert_eq!(
            CoreError::AiError("ai failed".to_string()).to_string(),
            "ai error: ai failed"
        );

        assert_eq!(
            CoreError::KeyringError("keyring failed".to_string()).to_string(),
            "keyring error: keyring failed"
        );

        assert_eq!(
            CoreError::InvalidBranchName("bad branch".to_string()).to_string(),
            "branch error: bad branch"
        );

        assert_eq!(
            CoreError::LogError("log failed".to_string()).to_string(),
            "log error: log failed"
        );

        assert_eq!(
            CoreError::TagError("tag failed".to_string()).to_string(),
            "tag error: tag failed"
        );

        assert_eq!(
            CoreError::ResetError("reset failed".to_string()).to_string(),
            "reset error: reset failed"
        );

        assert_eq!(
            CoreError::ConflictError("conflict failed".to_string()).to_string(),
            "conflict error: conflict failed"
        );

        assert_eq!(
            CoreError::RebaseError("rebase failed".to_string()).to_string(),
            "rebase error: rebase failed"
        );

        assert_eq!(
            CoreError::WorktreeError("worktree failed".to_string()).to_string(),
            "worktree error: worktree failed"
        );
    }

    #[test]
    fn test_error_from_io() {
        let io_err = std::io::Error::new(std::io::ErrorKind::PermissionDenied, "access denied");
        let core_err: CoreError = io_err.into();
        assert_eq!(core_err.to_string(), "access denied");
        match core_err {
            CoreError::Io(err) => assert_eq!(err.kind(), std::io::ErrorKind::PermissionDenied),
            _ => panic!("expected CoreError::Io"),
        }
    }
}
