use crate::backend::DiffHunk;
use crate::error::{CoreError, Result};
use git2::{ApplyLocation, Diff, Repository};
use std::path::Path;

pub fn apply_patch_to_index(repo_root: &Path, patch_text: &str) -> Result<()> {
    validate_index_patch(patch_text)?;
    let repo = Repository::open(repo_root)?;
    let diff = Diff::from_buffer(patch_text.as_bytes())?;
    repo.apply(&diff, ApplyLocation::Index, None)?;
    Ok(())
}

pub fn build_selected_patch(
    path: &str,
    hunk: &DiffHunk,
    selected_line_indices: &[usize],
    reverse: bool,
    is_new_file: bool,
) -> Result<String> {
    let normalized = path.replace('\\', "/");
    let is_all_selected = selected_line_indices.is_empty();

    let mut patch_lines: Vec<String> = Vec::new();
    let mut old_count = 0;
    let mut new_count = 0;

    for (idx, line) in hunk.lines.iter().enumerate() {
        let is_selected = is_all_selected || selected_line_indices.contains(&idx);

        if !reverse {
            match line.origin {
                ' ' => {
                    old_count += 1;
                    new_count += 1;
                    patch_lines.push(format!(" {}", line.content.trim_end_matches(['\r', '\n'])));
                }
                '-' => {
                    if is_selected {
                        old_count += 1;
                        patch_lines
                            .push(format!("-{}", line.content.trim_end_matches(['\r', '\n'])));
                    } else {
                        old_count += 1;
                        new_count += 1;
                        patch_lines
                            .push(format!(" {}", line.content.trim_end_matches(['\r', '\n'])));
                    }
                }
                '+' if is_selected => {
                    new_count += 1;
                    patch_lines.push(format!("+{}", line.content.trim_end_matches(['\r', '\n'])));
                }
                _ => {}
            }
        } else {
            // Unstaging
            match line.origin {
                ' ' => {
                    old_count += 1;
                    new_count += 1;
                    patch_lines.push(format!(" {}", line.content.trim_end_matches(['\r', '\n'])));
                }
                '+' => {
                    if is_selected {
                        old_count += 1;
                        patch_lines
                            .push(format!("-{}", line.content.trim_end_matches(['\r', '\n'])));
                    } else {
                        old_count += 1;
                        new_count += 1;
                        patch_lines
                            .push(format!(" {}", line.content.trim_end_matches(['\r', '\n'])));
                    }
                }
                '-' if is_selected => {
                    new_count += 1;
                    patch_lines.push(format!("+{}", line.content.trim_end_matches(['\r', '\n'])));
                }
                _ => {}
            }
        }
    }

    let mut header = String::new();
    if is_new_file {
        header.push_str(&format!(
            "diff --git a/{normalized} b/{normalized}\nnew file mode 100644\n--- /dev/null\n+++ b/{normalized}\n"
        ));
        header.push_str(&format!("@@ -0,0 +1,{} @@\n", new_count));
    } else {
        header.push_str(&format!(
            "diff --git a/{normalized} b/{normalized}\n--- a/{normalized}\n+++ b/{normalized}\n"
        ));
        if !reverse {
            header.push_str(&format!(
                "@@ -{},{} +{},{} @@\n",
                hunk.old_start, old_count, hunk.new_start, new_count
            ));
        } else {
            header.push_str(&format!(
                "@@ -{},{} +{},{} @@\n",
                hunk.new_start, old_count, hunk.old_start, new_count
            ));
        }
    }

    for pl in patch_lines {
        header.push_str(&pl);
        header.push('\n');
    }

    Ok(header)
}

/// Refuses patches that line-level staging must not apply: paths that leave the
/// work tree, symlink or submodule modes, and binary diffs (R-05).
fn validate_index_patch(patch: &str) -> Result<()> {
    // `---` / `+++` are file headers only before the first hunk. Inside a hunk the
    // same bytes are a deleted line whose text starts with `--`.
    let mut in_hunk = false;
    for raw_line in patch.split('\n') {
        let line = raw_line.trim_end_matches('\r');
        if line.starts_with("diff --git ") {
            in_hunk = false;
        }
        if line.starts_with("@@") {
            in_hunk = true;
            continue;
        }
        if line.starts_with("GIT binary patch") || line.starts_with("Binary files ") {
            return Err(CoreError::RejectedPatch(
                "binary patches cannot be applied as a line-level index update",
            ));
        }
        if in_hunk {
            continue;
        }
        if header_has_disallowed_mode(line) {
            return Err(CoreError::RejectedPatch(
                "symlink and submodule patches cannot be applied as a line-level index update",
            ));
        }
        if let Some(rest) = line.strip_prefix("diff --git ") {
            let tokens = split_diff_tokens(rest).ok_or(CoreError::RejectedPatch(
                "patch path escapes the repository",
            ))?;
            for token in tokens {
                let path = unquote_path(&token).ok_or(CoreError::RejectedPatch(
                    "patch path escapes the repository",
                ))?;
                check_diff_spec(&path)?;
            }
        } else if let Some(rest) = line.strip_prefix("rename from ") {
            check_rename_path(rest)?;
        } else if let Some(rest) = line.strip_prefix("rename to ") {
            check_rename_path(rest)?;
        } else if let Some(rest) = line
            .strip_prefix("--- ")
            .or_else(|| line.strip_prefix("+++ "))
        {
            let token = split_diff_tokens(rest)
                .ok_or(CoreError::RejectedPatch(
                    "patch path escapes the repository",
                ))?
                .into_iter()
                .next()
                .ok_or(CoreError::RejectedPatch(
                    "patch path escapes the repository",
                ))?;
            let path = unquote_path(&token).ok_or(CoreError::RejectedPatch(
                "patch path escapes the repository",
            ))?;
            if path != "/dev/null" {
                check_diff_spec(&path)?;
            }
        }
    }
    Ok(())
}

fn check_rename_path(rest: &str) -> Result<()> {
    let token = rest.trim();
    let path = unquote_path(token).ok_or(CoreError::RejectedPatch(
        "patch path escapes the repository",
    ))?;
    if !repo_relative_path_ok(&path) {
        return Err(CoreError::RejectedPatch(
            "patch path escapes the repository",
        ));
    }
    Ok(())
}

fn check_diff_spec(spec: &str) -> Result<()> {
    if spec == "/dev/null" {
        return Ok(());
    }
    let path = spec
        .strip_prefix("a/")
        .or_else(|| spec.strip_prefix("b/"))
        .unwrap_or(spec);
    if !repo_relative_path_ok(path) {
        return Err(CoreError::RejectedPatch(
            "patch path escapes the repository",
        ));
    }
    Ok(())
}

fn repo_relative_path_ok(path: &str) -> bool {
    if path.is_empty() || path.contains('\0') || path.contains('\n') || path.contains('\r') {
        return false;
    }
    if path.starts_with('/') || path.starts_with('\\') || is_drive_path(path) {
        return false;
    }
    for component in path.split(['/', '\\']) {
        // `.git` is the repository itself. A patch that stages it can write hooks
        // or config on checkout, including the case-insensitive `.GIT` on Windows/macOS.
        if component == ".." || component.eq_ignore_ascii_case(".git") {
            return false;
        }
    }
    true
}

fn is_drive_path(path: &str) -> bool {
    let b = path.as_bytes();
    b.len() >= 3 && b[0].is_ascii_alphabetic() && b[1] == b':' && (b[2] == b'/' || b[2] == b'\\')
}

fn header_has_disallowed_mode(line: &str) -> bool {
    let mode = if let Some(rest) = line
        .strip_prefix("new file mode ")
        .or_else(|| line.strip_prefix("deleted file mode "))
        .or_else(|| line.strip_prefix("old mode "))
        .or_else(|| line.strip_prefix("new mode "))
    {
        rest.trim()
    } else if let Some(rest) = line.strip_prefix("index ") {
        rest.split_whitespace().nth(1).unwrap_or("")
    } else {
        return false;
    };
    mode == "120000" || mode == "160000"
}

fn split_diff_tokens(s: &str) -> Option<Vec<String>> {
    let bytes = s.as_bytes();
    let mut out = Vec::new();
    let mut i = 0;
    while i < bytes.len() {
        while i < bytes.len() && bytes[i] == b' ' {
            i += 1;
        }
        if i >= bytes.len() {
            break;
        }
        if bytes[i] == b'"' {
            let start = i;
            i += 1;
            while i < bytes.len() && bytes[i] != b'"' {
                if bytes[i] == b'\\' {
                    i += 1;
                    if i >= bytes.len() {
                        return None;
                    }
                }
                i += 1;
            }
            if i >= bytes.len() {
                return None;
            }
            i += 1;
            out.push(s[start..i].to_string());
        } else {
            let start = i;
            while i < bytes.len() && bytes[i] != b' ' {
                i += 1;
            }
            out.push(s[start..i].to_string());
        }
    }
    Some(out)
}

fn unquote_path(token: &str) -> Option<String> {
    if !token.starts_with('"') {
        return Some(token.to_string());
    }
    if token.len() < 2 || !token.ends_with('"') {
        return None;
    }
    decode_c_quoted(&token[1..token.len() - 1])
}

fn decode_c_quoted(inner: &str) -> Option<String> {
    let bytes = inner.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] != b'\\' {
            out.push(bytes[i]);
            i += 1;
            continue;
        }
        i += 1;
        if i >= bytes.len() {
            return None;
        }
        match bytes[i] {
            b'\\' => out.push(b'\\'),
            b'"' => out.push(b'"'),
            b'n' => return None,
            b't' => out.push(b'\t'),
            b'0'..=b'7' => {
                let mut val = (bytes[i] - b'0') as u32;
                i += 1;
                let mut digits = 1;
                while digits < 3 && i < bytes.len() && (b'0'..=b'7').contains(&bytes[i]) {
                    val = (val << 3) | (bytes[i] - b'0') as u32;
                    i += 1;
                    digits += 1;
                }
                if val > 0xff {
                    return None;
                }
                out.push(val as u8);
                continue;
            }
            _ => return None,
        }
        i += 1;
    }
    String::from_utf8(out).ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_ordinary_text_patch() {
        let patch = "\
diff --git a/multi_hunk.txt b/multi_hunk.txt
--- a/multi_hunk.txt
+++ b/multi_hunk.txt
@@ -1,1 +1,1 @@
-line
+line 2
";
        validate_index_patch(patch).unwrap();
    }

    #[test]
    fn rejects_parent_dir_and_absolute_paths() {
        assert!(validate_index_patch(
            "diff --git a/../outside b/../outside\n--- /dev/null\n+++ b/../outside\n"
        )
        .is_err());
        assert!(validate_index_patch("+++ /etc/passwd\n").is_err());
        assert!(validate_index_patch("rename to ../x\n").is_err());
        assert!(validate_index_patch("diff --git \"a/../x\" \"b/../x\"\n").is_err());
        assert!(
            validate_index_patch("diff --git \"a/\\056\\056/x\" \"b/\\056\\056/x\"\n").is_err()
        );
        assert!(validate_index_patch("diff --git a/.git/config b/.git/config\n").is_err());
        assert!(validate_index_patch(
            "diff --git a/.GIT/hooks/pre-commit b/.GIT/hooks/pre-commit\n"
        )
        .is_err());
        assert!(validate_index_patch("rename to .git/hooks/pre-commit\n").is_err());
        assert!(
            validate_index_patch("diff --git \"a/\\056git/config\" \"b/\\056git/config\"\n")
                .is_err()
        );
        validate_index_patch("diff --git a/.gitignore b/.gitignore\n").unwrap();
        validate_index_patch("diff --git a/.gitmodules b/.gitmodules\n").unwrap();
    }

    #[test]
    fn rejects_binary_symlink_and_submodule() {
        assert!(validate_index_patch("GIT binary patch\n").is_err());
        assert!(validate_index_patch("Binary files a/a.bin and b/a.bin differ\n").is_err());
        assert!(validate_index_patch("new file mode 120000\n").is_err());
        assert!(validate_index_patch("index 0000000..1111111 160000\n").is_err());
        validate_index_patch("new file mode 100644\nindex 0000000..a92d664 100755\n").unwrap();
    }

    #[test]
    fn hunk_body_may_look_like_a_header() {
        let patch = "\
diff --git a/f.txt b/f.txt
--- a/f.txt
+++ b/f.txt
@@ -1,1 +1,1 @@
--- not a path header
+++ also not a path header
";
        validate_index_patch(patch).unwrap();
    }

    #[test]
    fn test_build_selected_patch_staging_partial_lines() {
        let hunk = DiffHunk {
            old_start: 1,
            old_lines: 3,
            new_start: 1,
            new_lines: 3,
            header: "@@ -1,3 +1,3 @@".to_string(),
            lines: vec![
                crate::backend::DiffLine {
                    origin: ' ',
                    old_lineno: Some(1),
                    new_lineno: Some(1),
                    content: "context 1\n".to_string(),
                },
                crate::backend::DiffLine {
                    origin: '-',
                    old_lineno: Some(2),
                    new_lineno: None,
                    content: "removed line\n".to_string(),
                },
                crate::backend::DiffLine {
                    origin: '+',
                    old_lineno: None,
                    new_lineno: Some(2),
                    content: "added line\n".to_string(),
                },
            ],
        };

        // Only select the added line (index 2); the deleted line (index 1) should become a context line
        let patch = build_selected_patch("src/file.txt", &hunk, &[2], false, false).unwrap();
        assert!(patch.contains("--- a/src/file.txt\n+++ b/src/file.txt\n"));
        assert!(patch.contains("@@ -1,2 +1,3 @@\n"));
        assert!(patch.contains(" context 1\n removed line\n+added line\n"));
    }

    #[test]
    fn test_build_selected_patch_unstaging_reverse() {
        let hunk = DiffHunk {
            old_start: 1,
            old_lines: 2,
            new_start: 1,
            new_lines: 3,
            header: "@@ -1,2 +1,3 @@".to_string(),
            lines: vec![
                crate::backend::DiffLine {
                    origin: ' ',
                    old_lineno: Some(1),
                    new_lineno: Some(1),
                    content: "context\n".to_string(),
                },
                crate::backend::DiffLine {
                    origin: '+',
                    old_lineno: None,
                    new_lineno: Some(2),
                    content: "staged line\n".to_string(),
                },
            ],
        };

        // Unstage line index 1 (reverse = true) -> '+' becomes '-'
        let patch = build_selected_patch("src/staged.txt", &hunk, &[1], true, false).unwrap();
        assert!(patch.contains("--- a/src/staged.txt\n+++ b/src/staged.txt\n"));
        assert!(patch.contains("@@ -1,2 +1,1 @@\n"));
        assert!(patch.contains(" context\n-staged line\n"));
    }

    #[test]
    fn test_build_selected_patch_new_untracked_file() {
        let hunk = DiffHunk {
            old_start: 0,
            old_lines: 0,
            new_start: 1,
            new_lines: 3,
            header: "@@ -0,0 +1,3 @@".to_string(),
            lines: vec![
                crate::backend::DiffLine {
                    origin: '+',
                    old_lineno: None,
                    new_lineno: Some(1),
                    content: "first line\n".to_string(),
                },
                crate::backend::DiffLine {
                    origin: '+',
                    old_lineno: None,
                    new_lineno: Some(2),
                    content: "second line\n".to_string(),
                },
                crate::backend::DiffLine {
                    origin: '+',
                    old_lineno: None,
                    new_lineno: Some(3),
                    content: "third line\n".to_string(),
                },
            ],
        };

        // Only stage the first 2 lines (indices 0 and 1)
        let patch = build_selected_patch("new_file.txt", &hunk, &[0, 1], false, true).unwrap();
        assert!(patch.contains("new file mode 100644\n--- /dev/null\n+++ b/new_file.txt\n"));
        assert!(patch.contains("@@ -0,0 +1,2 @@\n"));
        assert!(patch.contains("+first line\n+second line\n"));
        assert!(!patch.contains("third line"));
    }

    #[test]
    fn test_decode_c_quoted_valid_and_invalid() {
        assert_eq!(decode_c_quoted("plain").unwrap(), "plain");
        assert_eq!(decode_c_quoted(r#"\"escaped\""#).unwrap(), r#""escaped""#);
        assert_eq!(decode_c_quoted(r#"tab\tchar"#).unwrap(), "tab\tchar");
        assert_eq!(decode_c_quoted(r#"backslash\\"#).unwrap(), "backslash\\");
        assert_eq!(decode_c_quoted(r#"\056\056"#).unwrap(), "..");
        assert_eq!(decode_c_quoted(r#"\101"#).unwrap(), "A");

        // Disallowed or invalid escapes
        assert!(decode_c_quoted(r#"invalid\n"#).is_none());
        assert!(decode_c_quoted(r#"trailing\"#).is_none());
        assert!(decode_c_quoted(r#"bad\x"#).is_none());
    }

    #[test]
    fn test_unquote_path() {
        assert_eq!(unquote_path("src/lib.rs").unwrap(), "src/lib.rs");
        assert_eq!(unquote_path(r#""src/lib.rs""#).unwrap(), "src/lib.rs");
        assert_eq!(unquote_path(r#""a/b\tc""#).unwrap(), "a/b\tc");
        assert!(unquote_path(r#""unclosed"#).is_none());
        assert!(unquote_path(r#"""#).is_none());
    }

    #[test]
    fn test_split_diff_tokens() {
        let tokens = split_diff_tokens("a/foo.txt b/bar.txt").unwrap();
        assert_eq!(tokens, vec!["a/foo.txt", "b/bar.txt"]);

        let tokens_quoted = split_diff_tokens(r#""a/my file.txt" "b/my file.txt""#).unwrap();
        assert_eq!(
            tokens_quoted,
            vec![r#""a/my file.txt""#, r#""b/my file.txt""#]
        );

        let extra_spaces = split_diff_tokens("   a/x     b/y   ").unwrap();
        assert_eq!(extra_spaces, vec!["a/x", "b/y"]);
    }

    #[test]
    fn test_is_drive_path() {
        assert!(is_drive_path("C:/folder/file.txt"));
        assert!(is_drive_path("d:\\folder\\file.txt"));
        assert!(is_drive_path("Z:/"));
        assert!(!is_drive_path("/usr/local/bin"));
        assert!(!is_drive_path("relative/path"));
        assert!(!is_drive_path("C:relative"));
    }

    #[test]
    fn test_repo_relative_path_ok() {
        assert!(repo_relative_path_ok("src/main.rs"));
        assert!(repo_relative_path_ok("a.txt"));
        assert!(repo_relative_path_ok("sub/dir/nested.ext"));

        assert!(!repo_relative_path_ok(""));
        assert!(!repo_relative_path_ok("/etc/passwd"));
        assert!(!repo_relative_path_ok("\\Windows\\System32"));
        assert!(!repo_relative_path_ok("C:/drive"));
        assert!(!repo_relative_path_ok("../outside"));
        assert!(!repo_relative_path_ok("foo/../../bar"));
        assert!(!repo_relative_path_ok(".git/config"));
        assert!(!repo_relative_path_ok("dir/.GIT/hooks/pre-commit"));
        assert!(repo_relative_path_ok(".gitignore"));
        assert!(repo_relative_path_ok(".gitmodules"));
        assert!(!repo_relative_path_ok("has\0null"));
        assert!(!repo_relative_path_ok("has\nnewline"));
        assert!(!repo_relative_path_ok("has\rcarriage"));
    }

    #[test]
    fn test_header_has_disallowed_mode() {
        assert!(header_has_disallowed_mode("new file mode 120000"));
        assert!(header_has_disallowed_mode("new file mode 160000"));
        assert!(header_has_disallowed_mode("deleted file mode 120000"));
        assert!(header_has_disallowed_mode("old mode 120000"));
        assert!(header_has_disallowed_mode("new mode 160000"));
        assert!(header_has_disallowed_mode("index 0000000..1111111 120000"));
        assert!(header_has_disallowed_mode("index 0000000..1111111 160000"));

        assert!(!header_has_disallowed_mode("new file mode 100644"));
        assert!(!header_has_disallowed_mode("new file mode 100755"));
        assert!(!header_has_disallowed_mode("index 0000000..1111111 100644"));
        assert!(!header_has_disallowed_mode("random header"));
    }

    #[test]
    fn test_validate_index_patch_renames_and_dev_null() {
        let valid_rename = "\
diff --git a/old.txt b/new.txt
rename from old.txt
rename to new.txt
";
        assert!(validate_index_patch(valid_rename).is_ok());

        let invalid_rename = "\
diff --git a/old.txt b/new.txt
rename from old.txt
rename to ../escaped.txt
";
        assert!(validate_index_patch(invalid_rename).is_err());

        let dev_null_patch = "\
diff --git a/deleted.txt b/deleted.txt
--- a/deleted.txt
+++ /dev/null
@@ -1,1 +0,0 @@
-bye
";
        assert!(validate_index_patch(dev_null_patch).is_ok());
    }

    #[test]
    fn test_build_selected_patch_all_selected_and_crlf_normalization() {
        let hunk = DiffHunk {
            old_start: 1,
            old_lines: 2,
            new_start: 1,
            new_lines: 2,
            header: "@@ -1,2 +1,2 @@".to_string(),
            lines: vec![
                crate::backend::DiffLine {
                    origin: '-',
                    old_lineno: Some(1),
                    new_lineno: None,
                    content: "line 1\r\n".to_string(),
                },
                crate::backend::DiffLine {
                    origin: '+',
                    old_lineno: None,
                    new_lineno: Some(1),
                    content: "line 1 mod\r\n".to_string(),
                },
            ],
        };

        // When selected_line_indices is empty, it means ALL lines selected
        let patch =
            build_selected_patch("src\\folder\\file.txt", &hunk, &[], false, false).unwrap();
        // Path backslash converted to forward slash
        assert!(patch.contains("--- a/src/folder/file.txt\n+++ b/src/folder/file.txt\n"));
        // CRLF stripped before appending \n
        assert!(patch.contains("-line 1\n+line 1 mod\n"));
        assert!(!patch.contains("\r"));
    }
}
