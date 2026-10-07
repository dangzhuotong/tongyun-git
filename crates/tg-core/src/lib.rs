use std::process::Command;

pub fn git_version(git_path: &str) -> Result<String, String> {
    let output = Command::new(git_path)
        .arg("--version")
        .env("LC_ALL", "C")
        .env("GIT_TERMINAL_PROMPT", "0")
        .output()
        .map_err(|e| e.to_string())?;

    if !output.status.success() {
        return Err(format!(
            "git --version exited with status: {}",
            output.status
        ));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    parse_git_version(&stdout)
        .ok_or_else(|| format!("Failed to parse git version from: {}", stdout.trim()))
}

fn parse_git_version(output: &str) -> Option<String> {
    let trimmed = output.trim();
    if let Some(pos) = trimmed.find("git version ") {
        let rest = &trimmed[pos + "git version ".len()..];
        let version = rest.split_whitespace().next()?;
        if !version.is_empty() {
            return Some(version.to_string());
        }
    }
    None
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
        // Verify it contains digits and dots
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
