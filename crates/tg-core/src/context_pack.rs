use serde::{Deserialize, Serialize};
use std::path::Path;

use crate::backend::{ChangeKind, Git2Backend, GitBackend};
use crate::error::Result;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContextPack {
    pub repo_name: String,
    pub root_path: String,
    pub branch: Option<String>,
    pub head_oid: Option<String>,
    pub summary: ContextPackSummary,
    pub files: Vec<ContextFileSummary>,
    pub prompt_context: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContextPackSummary {
    pub total_changed_files: usize,
    pub staged_count: usize,
    pub unstaged_count: usize,
    pub untracked_count: usize,
    pub additions: usize,
    pub deletions: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContextFileSummary {
    pub path: String,
    pub status: String,
    pub staged: bool,
    pub additions: usize,
    pub deletions: usize,
    pub hunk_count: usize,
    pub hunk_headers: Vec<String>,
}

pub struct ContextPackGenerator;

impl ContextPackGenerator {
    pub fn generate(root_path: &Path, max_chars: Option<usize>) -> Result<ContextPack> {
        let backend = Git2Backend::open(root_path)?;
        let head = backend.head()?;
        let files = backend.status()?;
        let repo_root = backend.repo_root().to_string_lossy().to_string();
        let repo_name = backend
            .repo_root()
            .file_name()
            .map(|s| s.to_string_lossy().to_string())
            .unwrap_or_else(|| repo_root.clone());

        let mut staged_count = 0;
        let mut unstaged_count = 0;
        let mut untracked_count = 0;
        let mut total_additions = 0;
        let mut total_deletions = 0;

        let mut file_summaries = Vec::new();
        let mut diff_sections = Vec::new();

        let max_len = max_chars.unwrap_or(32_000);

        for f in &files {
            if f.index.is_some() {
                staged_count += 1;
            }
            if f.worktree.is_some() {
                unstaged_count += 1;
            }
            if f.worktree == Some(ChangeKind::Untracked) {
                untracked_count += 1;
            }

            // Inspect staged diff if present
            if f.index.is_some() {
                if let Ok(diff) = backend.diff_file(&f.path, true) {
                    let mut adds = 0;
                    let mut dels = 0;
                    let mut headers = Vec::new();

                    for h in &diff.hunks {
                        headers.push(h.header.clone());
                        for l in &h.lines {
                            if l.origin == '+' {
                                adds += 1;
                            } else if l.origin == '-' {
                                dels += 1;
                            }
                        }
                    }

                    total_additions += adds;
                    total_deletions += dels;

                    let status_str = match f.index {
                        Some(ChangeKind::Added) => "A",
                        Some(ChangeKind::Modified) => "M",
                        Some(ChangeKind::Deleted) => "D",
                        Some(ChangeKind::Renamed) => "R",
                        _ => "M",
                    };

                    file_summaries.push(ContextFileSummary {
                        path: f.path.clone(),
                        status: status_str.to_string(),
                        staged: true,
                        additions: adds,
                        deletions: dels,
                        hunk_count: diff.hunks.len(),
                        hunk_headers: headers,
                    });

                    diff_sections.push(format_file_diff_markdown(&diff, true));
                }
            }

            // Inspect unstaged diff if present
            if f.worktree.is_some() {
                if let Ok(diff) = backend.diff_file(&f.path, false) {
                    let mut adds = 0;
                    let mut dels = 0;
                    let mut headers = Vec::new();

                    for h in &diff.hunks {
                        headers.push(h.header.clone());
                        for l in &h.lines {
                            if l.origin == '+' {
                                adds += 1;
                            } else if l.origin == '-' {
                                dels += 1;
                            }
                        }
                    }

                    total_additions += adds;
                    total_deletions += dels;

                    let status_str = match f.worktree {
                        Some(ChangeKind::Untracked) => "U",
                        Some(ChangeKind::Modified) => "M",
                        Some(ChangeKind::Deleted) => "D",
                        _ => "M",
                    };

                    file_summaries.push(ContextFileSummary {
                        path: f.path.clone(),
                        status: status_str.to_string(),
                        staged: false,
                        additions: adds,
                        deletions: dels,
                        hunk_count: diff.hunks.len(),
                        hunk_headers: headers,
                    });

                    diff_sections.push(format_file_diff_markdown(&diff, false));
                }
            }
        }

        // Build Markdown prompt
        let mut md = String::new();
        md.push_str(&format!("# Git Working Context: {}\n\n", repo_name));
        md.push_str(&format!(
            "- **Branch**: `{}`\n",
            head.branch.as_deref().unwrap_or("HEAD (detached)")
        ));
        if let Some(oid) = &head.oid {
            let short = if oid.len() >= 8 { &oid[..8] } else { oid };
            md.push_str(&format!("- **Head Commit**: `{}`\n", short));
        }
        md.push_str(&format!(
            "- **Changes Summary**: {} changed files (+{} / -{} lines)\n",
            files.len(),
            total_additions,
            total_deletions
        ));
        md.push_str(&format!(
            "  - Staged: {} | Unstaged: {} | Untracked: {}\n\n",
            staged_count, unstaged_count, untracked_count
        ));

        md.push_str("## Changed Files Inventory\n");
        if file_summaries.is_empty() {
            md.push_str("*(Working tree is clean, no changes detected)*\n\n");
        } else {
            for item in &file_summaries {
                let stage_label = if item.staged { "Staged" } else { "Unstaged" };
                md.push_str(&format!(
                    "- `[{}]` **{}** ({}) `+{} / -{}` ({} hunks)\n",
                    item.status,
                    item.path,
                    stage_label,
                    item.additions,
                    item.deletions,
                    item.hunk_count
                ));
            }
            md.push('\n');
        }

        md.push_str("## Code Changes Digest\n\n");
        let mut current_len = md.len();
        let mut truncated = false;

        for section in diff_sections {
            if current_len + section.len() > max_len {
                md.push_str("*(Diff truncated to remain within token budget. Additional changes omitted.)*\n");
                truncated = true;
                break;
            }
            md.push_str(&section);
            md.push('\n');
            current_len = md.len();
        }

        if !truncated && files.is_empty() {
            md.push_str("*(No code diff to display)*\n");
        }

        Ok(ContextPack {
            repo_name,
            root_path: repo_root,
            branch: head.branch,
            head_oid: head.oid,
            summary: ContextPackSummary {
                total_changed_files: files.len(),
                staged_count,
                unstaged_count,
                untracked_count,
                additions: total_additions,
                deletions: total_deletions,
            },
            files: file_summaries,
            prompt_context: md,
        })
    }
}

fn format_file_diff_markdown(diff: &crate::backend::FileDiff, staged: bool) -> String {
    let mut out = String::new();
    let stage_text = if staged {
        "Index vs HEAD"
    } else {
        "Worktree vs Index"
    };
    out.push_str(&format!("### `{}` ({})\n", diff.path, stage_text));

    if diff.is_binary {
        out.push_str("*(Binary file changed)*\n\n");
        return out;
    }

    out.push_str("```diff\n");
    for h in &diff.hunks {
        out.push_str(&h.header);
        out.push('\n');
        for l in &h.lines {
            out.push(l.origin);
            out.push_str(&l.content);
            if !l.content.ends_with('\n') {
                out.push('\n');
            }
        }
    }
    out.push_str("```\n");
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::backend::{DiffHunk, DiffLine, FileDiff};

    #[test]
    fn test_format_file_diff_markdown_binary() {
        let diff = FileDiff {
            path: "assets/logo.png".to_string(),
            old_path: None,
            staged: true,
            is_binary: true,
            old_size: Some(100),
            new_size: Some(120),
            is_crlf_change: false,
            is_large: false,
            hunks: vec![],
        };

        let formatted = format_file_diff_markdown(&diff, true);
        assert!(formatted.contains("### `assets/logo.png` (Index vs HEAD)\n"));
        assert!(formatted.contains("*(Binary file changed)*\n\n"));
    }

    #[test]
    fn test_format_file_diff_markdown_staged_and_unstaged_headers() {
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
                    content: "unchanged\n".to_string(),
                },
                DiffLine {
                    origin: '+',
                    old_lineno: None,
                    new_lineno: Some(2),
                    content: "new line".to_string(),
                },
            ],
        };

        let diff = FileDiff {
            path: "src/main.rs".to_string(),
            old_path: None,
            staged: true,
            is_binary: false,
            old_size: Some(10),
            new_size: Some(20),
            is_crlf_change: false,
            is_large: false,
            hunks: vec![hunk],
        };

        let staged_md = format_file_diff_markdown(&diff, true);
        assert!(staged_md.contains("### `src/main.rs` (Index vs HEAD)\n"));
        assert!(staged_md.contains("```diff\n@@ -1,1 +1,2 @@\n unchanged\n+new line\n```\n"));

        let unstaged_md = format_file_diff_markdown(&diff, false);
        assert!(unstaged_md.contains("### `src/main.rs` (Worktree vs Index)\n"));
    }

    #[test]
    fn test_context_pack_summary_serde_roundtrip() {
        let summary = ContextPackSummary {
            total_changed_files: 3,
            staged_count: 1,
            unstaged_count: 2,
            untracked_count: 1,
            additions: 15,
            deletions: 5,
        };
        let json = serde_json::to_string(&summary).unwrap();
        let de: ContextPackSummary = serde_json::from_str(&json).unwrap();
        assert_eq!(summary.total_changed_files, de.total_changed_files);
        assert_eq!(summary.additions, de.additions);
        assert_eq!(summary.deletions, de.deletions);

        let file_summary = ContextFileSummary {
            path: "file.txt".to_string(),
            status: "M".to_string(),
            staged: true,
            additions: 10,
            deletions: 2,
            hunk_count: 1,
            hunk_headers: vec!["@@ -1,5 +1,13 @@".to_string()],
        };
        let fs_json = serde_json::to_string(&file_summary).unwrap();
        let fs_de: ContextFileSummary = serde_json::from_str(&fs_json).unwrap();
        assert_eq!(file_summary.path, fs_de.path);
        assert_eq!(file_summary.hunk_headers, fs_de.hunk_headers);
    }
}

