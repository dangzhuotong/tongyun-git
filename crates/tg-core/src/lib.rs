pub mod backend;
pub mod cli;
pub mod error;
pub mod redact;

pub use backend::{ChangeKind, FileStatus, Git2Backend, GitBackend, HeadInfo};
pub use cli::{
    parse_git_version, version_at_least, CliOutput, CliRunner, RunOptions, MIN_GIT_VERSION,
};
pub use error::{CoreError, Result};
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
