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
