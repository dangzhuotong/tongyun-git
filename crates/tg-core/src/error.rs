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
}

pub type Result<T> = std::result::Result<T, CoreError>;
