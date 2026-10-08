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
            if total.len() + filtered.len() > max_chars {
                let remaining = max_chars.saturating_sub(total.len());
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
