use crate::backend::FileDiff;
use glob::Pattern;

pub const DEFAULT_SECRET_PATTERNS: &[&str] = &[
    "*.env*", ".env*", "*.pem", "*.key", "*id_rsa*", "id_rsa*", "*.p12", "*secret*",
];

pub struct SecretFilter;

impl SecretFilter {
    /// Check whether a file path matches secret patterns (case-insensitive filename or pattern)
    pub fn is_secret(path: &str, custom_patterns: &[String]) -> bool {
        let normalized = path.replace('\\', "/");
        let file_name = normalized.rsplit('/').next().unwrap_or(&normalized);

        // Check default patterns
        for &pat_str in DEFAULT_SECRET_PATTERNS {
            if let Ok(pat) = Pattern::new(&pat_str.to_lowercase()) {
                if pat.matches(&file_name.to_lowercase()) || pat.matches(&normalized.to_lowercase())
                {
                    return true;
                }
            }
        }

        // Check custom patterns
        for pat_str in custom_patterns {
            if let Ok(pat) = Pattern::new(&pat_str.to_lowercase()) {
                if pat.matches(&file_name.to_lowercase()) || pat.matches(&normalized.to_lowercase())
                {
                    return true;
                }
            }
        }

        false
    }

    /// Filter a single FileDiff: if secret, erase its hunks and replace with exclusion notice
    pub fn filter_diff(diff: &FileDiff, custom_patterns: &[String]) -> (String, bool) {
        if Self::is_secret(&diff.path, custom_patterns) {
            return (
                format!("文件: {} [敏感文件：内容已排除]\n", diff.path),
                true,
            );
        }

        if diff.is_binary {
            return (format!("文件: {} [二进制文件改动]\n", diff.path), false);
        }

        let mut out = format!("--- a/{}\n+++ b/{}\n", diff.path, diff.path);
        for hunk in &diff.hunks {
            out.push_str(&hunk.header);
            out.push('\n');
            for line in &hunk.lines {
                out.push(line.origin);
                out.push_str(&line.content);
                if !line.content.ends_with('\n') {
                    out.push('\n');
                }
            }
        }

        (out, false)
    }

    /// Build sanitized diff prompt across all staged files, truncating if exceeding max_chars
    pub fn build_sanitized_diff(
        diffs: &[FileDiff],
        custom_patterns: &[String],
        max_chars: usize,
    ) -> String {
        let mut total = String::new();

        for diff in diffs {
            let (filtered, _) = Self::filter_diff(diff, custom_patterns);
            // PRD R-07 counts characters (Unicode scalars), not UTF-8 bytes.
            // The joining newline is part of the budget; the truncation notice is appended after it.
            let used = char_len(&total);
            let next = used.saturating_add(char_len(&filtered)).saturating_add(1);
            if next > max_chars {
                let remaining = max_chars.saturating_sub(used);
                if remaining > 0 {
                    let take_chars: String = filtered.chars().take(remaining).collect();
                    total.push_str(&take_chars);
                }
                total.push_str("\n\n[...剩余改动已截断]");
                break;
            }
            total.push_str(&filtered);
            total.push('\n');
        }

        total
    }
}

fn char_len(s: &str) -> usize {
    s.chars().count()
}
#[cfg(test)]
mod tests {
    use super::*;
    use crate::backend::{DiffHunk, DiffLine};

    fn make_diff(path: &str, is_binary: bool, hunks: Vec<DiffHunk>) -> FileDiff {
        FileDiff {
            path: path.to_string(),
            old_path: None,
            staged: true,
            is_binary,
            old_size: None,
            new_size: None,
            is_crlf_change: false,
            is_large: false,
            hunks,
        }
    }

    #[test]
    fn test_is_secret_default_patterns() {
        assert!(SecretFilter::is_secret(".env", &[]));
        assert!(SecretFilter::is_secret(".env.local", &[]));
        assert!(SecretFilter::is_secret("config/.env.prod", &[]));
        assert!(SecretFilter::is_secret("server.key", &[]));
        assert!(SecretFilter::is_secret("cert.pem", &[]));
        assert!(SecretFilter::is_secret("id_rsa", &[]));
        assert!(SecretFilter::is_secret("id_rsa.pub", &[]));
        assert!(SecretFilter::is_secret("backup.p12", &[]));
        assert!(SecretFilter::is_secret("app_secret_keys.txt", &[]));
        assert!(SecretFilter::is_secret("foo\\bar\\.env", &[]));
        assert!(SecretFilter::is_secret("CERT.PEM", &[]));
        assert!(SecretFilter::is_secret("ID_RSA", &[]));

        assert!(!SecretFilter::is_secret("src/main.rs", &[]));
        assert!(!SecretFilter::is_secret("Cargo.toml", &[]));
        assert!(!SecretFilter::is_secret("README.md", &[]));
    }

    #[test]
    fn test_is_secret_custom_patterns() {
        let custom = vec!["*.secret-ext".to_string(), "my_creds.json".to_string()];
        assert!(SecretFilter::is_secret("test.secret-ext", &custom));
        assert!(SecretFilter::is_secret("dir/my_creds.json", &custom));
        assert!(!SecretFilter::is_secret("test.txt", &custom));
    }

    #[test]
    fn test_filter_diff_secret_file() {
        let diff = make_diff(".env", false, vec![]);
        let (content, is_secret) = SecretFilter::filter_diff(&diff, &[]);
        assert!(is_secret);
        assert_eq!(content, "文件: .env [敏感文件：内容已排除]\n");
    }

    #[test]
    fn test_filter_diff_binary_file() {
        let diff = make_diff("image.png", true, vec![]);
        let (content, is_secret) = SecretFilter::filter_diff(&diff, &[]);
        assert!(!is_secret);
        assert_eq!(content, "文件: image.png [二进制文件改动]\n");
    }

    #[test]
    fn test_filter_diff_normal_file() {
        let hunk = DiffHunk {
            old_start: 1,
            old_lines: 1,
            new_start: 1,
            new_lines: 2,
            header: "@@ -1,1 +1,2 @@".to_string(),
            lines: vec![
                DiffLine {
                    origin: ' ',
                    old_lineno: Some(1),
                    new_lineno: Some(1),
                    content: "hello world\n".to_string(),
                },
                DiffLine {
                    origin: '+',
                    old_lineno: None,
                    new_lineno: Some(2),
                    content: "added line".to_string(),
                },
            ],
        };
        let diff = make_diff("src/lib.rs", false, vec![hunk]);
        let (content, is_secret) = SecretFilter::filter_diff(&diff, &[]);
        assert!(!is_secret);
        assert_eq!(
            content,
            "--- a/src/lib.rs\n+++ b/src/lib.rs\n@@ -1,1 +1,2 @@\n hello world\n+added line\n"
        );
    }

    #[test]
    fn test_build_sanitized_diff() {
        let hunk = DiffHunk {
            old_start: 1,
            old_lines: 1,
            new_start: 1,
            new_lines: 1,
            header: "@@ -1,1 +1,1 @@".to_string(),
            lines: vec![DiffLine {
                origin: '+',
                old_lineno: None,
                new_lineno: Some(1),
                content: "new code\n".to_string(),
            }],
        };
        let diff1 = make_diff(".env", false, vec![]);
        let diff2 = make_diff("src/lib.rs", false, vec![hunk]);

        let result = SecretFilter::build_sanitized_diff(&[diff1, diff2], &[], 1000);
        assert!(result.contains("文件: .env [敏感文件：内容已排除]\n"));
        assert!(result.contains("--- a/src/lib.rs\n+++ b/src/lib.rs\n"));
    }

    #[test]
    fn test_build_sanitized_diff_truncation() {
        let hunk = DiffHunk {
            old_start: 1,
            old_lines: 1,
            new_start: 1,
            new_lines: 1,
            header: "@@ -1,1 +1,1 @@".to_string(),
            lines: vec![DiffLine {
                origin: '+',
                old_lineno: None,
                new_lineno: Some(1),
                content: "a very long line of code that will exceed character limit\n".to_string(),
            }],
        };
        let diff = make_diff("src/lib.rs", false, vec![hunk]);
        let result = SecretFilter::build_sanitized_diff(&[diff], &[], 20);
        assert!(result.ends_with("\n\n[...剩余改动已截断]"));
        let body = result.trim_end_matches("\n\n[...剩余改动已截断]");
        assert!(body.chars().count() <= 20, "{body}");
    }

    #[test]
    fn test_build_sanitized_diff_counts_unicode_scalars() {
        let hunk = DiffHunk {
            old_start: 1,
            old_lines: 0,
            new_start: 1,
            new_lines: 1,
            header: "@@ -0,0 +1,1 @@".to_string(),
            lines: vec![DiffLine {
                origin: '+',
                old_lineno: None,
                new_lineno: Some(1),
                content: "中文改动行\n".to_string(),
            }],
        };
        let diff = make_diff("notes.txt", false, vec![hunk]);
        let full = SecretFilter::build_sanitized_diff(std::slice::from_ref(&diff), &[], usize::MAX);
        let chars = full.chars().count();
        assert!(
            full.len() > chars,
            "fixture must be wider in bytes than in characters"
        );
        assert!(full.contains("中文改动行"));

        let kept = SecretFilter::build_sanitized_diff(std::slice::from_ref(&diff), &[], chars);
        assert_eq!(kept, full);
        assert!(!kept.contains("截断"));

        let truncated = SecretFilter::build_sanitized_diff(
            std::slice::from_ref(&diff),
            &[],
            chars.saturating_sub(1),
        );
        assert!(truncated.contains("截断"));
        let body = truncated.trim_end_matches("\n\n[...剩余改动已截断]");
        assert_eq!(body.chars().count(), chars.saturating_sub(1));
    }

    #[test]
    fn test_is_secret_windows_backslash_and_extensions() {
        assert!(SecretFilter::is_secret("sub\\dir\\cert.PEM", &[]));
        assert!(SecretFilter::is_secret("sub\\dir\\.env.staging", &[]));
        assert!(SecretFilter::is_secret("keys\\client.KEY", &[]));
        assert!(SecretFilter::is_secret("keys\\backup.P12", &[]));
        assert!(SecretFilter::is_secret("secrets.json", &[]));
        assert!(!SecretFilter::is_secret("sub\\dir\\normal.rs", &[]));
    }

    #[test]
    fn test_is_secret_custom_glob_patterns() {
        let custom = vec!["*.token".to_string(), "secrets/**".to_string()];
        assert!(SecretFilter::is_secret("auth.token", &custom));
        assert!(SecretFilter::is_secret("secrets/api_config.json", &custom));
        assert!(!SecretFilter::is_secret("other/api_config.json", &custom));
    }
}
