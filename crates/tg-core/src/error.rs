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

    #[error("git cli error (exit code {exit_code:?}): {stderr}")]
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
}

pub type Result<T> = std::result::Result<T, CoreError>;
