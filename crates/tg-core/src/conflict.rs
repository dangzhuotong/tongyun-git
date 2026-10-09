use std::fs;
use std::path::Path;

use git2::Repository;
use serde::{Deserialize, Serialize};

use crate::cli::{CliOutput, CliRunner, RunOptions};
use crate::error::{CoreError, Result};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ConflictFileSummary {
    pub path: String,
    pub has_ancestor: bool,
    pub has_our: bool,
    pub has_their: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ConflictHunk {
    pub hunk_index: usize,
    pub our_start_line: usize,
    pub our_lines: Vec<String>,
    pub their_start_line: usize,
    pub their_lines: Vec<String>,
    pub base_lines: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ConflictFileDetails {
    pub path: String,
    pub base_content: Option<String>,
    pub our_content: Option<String>,
    pub their_content: Option<String>,
    pub worktree_content: String,
    pub hunks: Vec<ConflictHunk>,
    pub is_binary: bool,
}

pub struct ConflictService;

impl ConflictService {
    /// List all currently conflicted files in the repository index.
    pub fn list_conflicts(repo_path: &Path) -> Result<Vec<ConflictFileSummary>> {
        let repo = Repository::open(repo_path)?;
        let index = repo.index()?;

        let mut conflicts = Vec::new();
        if !index.has_conflicts() {
            return Ok(conflicts);
        }

        let conflict_iter = index.conflicts()?;
        for entry in conflict_iter {
            let conflict = entry?;
            let path = conflict
                .ancestor
                .as_ref()
                .or(conflict.our.as_ref())
                .or(conflict.their.as_ref())
                .map(|e| String::from_utf8_lossy(&e.path).to_string())
                .unwrap_or_default();

            if !path.is_empty()
                && !conflicts
                    .iter()
                    .any(|c: &ConflictFileSummary| c.path == path)
            {
                conflicts.push(ConflictFileSummary {
                    path,
                    has_ancestor: conflict.ancestor.is_some(),
                    has_our: conflict.our.is_some(),
                    has_their: conflict.their.is_some(),
                });
            }
        }

        Ok(conflicts)
    }

    /// Retrieve full Base (Ancestor), Ours (Local), Theirs (Remote), and Worktree contents for a conflicted file.
    pub fn get_conflict_details(repo_path: &Path, file_path: &str) -> Result<ConflictFileDetails> {
        let repo = Repository::open(repo_path)?;
        let index = repo.index()?;

        let mut base_content = None;
        let mut our_content = None;
        let mut their_content = None;
        let mut is_binary = false;

        let conflict_iter = index.conflicts()?;
        for entry in conflict_iter {
            let conflict = entry?;
            let p = conflict
                .ancestor
                .as_ref()
                .or(conflict.our.as_ref())
                .or(conflict.their.as_ref())
                .map(|e| String::from_utf8_lossy(&e.path).to_string())
                .unwrap_or_default();

            if p == file_path {
                if let Some(anc) = conflict.ancestor {
                    if let Ok(blob) = repo.find_blob(anc.id) {
                        if blob.is_binary() {
                            is_binary = true;
                        } else {
                            base_content = String::from_utf8(blob.content().to_vec()).ok();
                        }
                    }
                }
                if let Some(our) = conflict.our {
                    if let Ok(blob) = repo.find_blob(our.id) {
                        if blob.is_binary() {
                            is_binary = true;
                        } else {
                            our_content = String::from_utf8(blob.content().to_vec()).ok();
                        }
                    }
                }
                if let Some(their) = conflict.their {
                    if let Ok(blob) = repo.find_blob(their.id) {
                        if blob.is_binary() {
                            is_binary = true;
                        } else {
                            their_content = String::from_utf8(blob.content().to_vec()).ok();
                        }
                    }
                }
                break;
            }
        }

        let worktree_file_path = repo
            .workdir()
            .ok_or(CoreError::BareRepository)?
            .join(file_path);

        let worktree_content = if worktree_file_path.exists() {
            fs::read_to_string(&worktree_file_path).unwrap_or_default()
        } else {
            String::new()
        };

        let hunks = Self::parse_conflict_hunks(&worktree_content);

        Ok(ConflictFileDetails {
            path: file_path.to_string(),
            base_content,
            our_content,
            their_content,
            worktree_content,
            hunks,
            is_binary,
        })
    }

    /// Parse conflict hunks from worktree file text containing `<<<<<<< ... ======= ... >>>>>>>` markers.
    pub fn parse_conflict_hunks(content: &str) -> Vec<ConflictHunk> {
        let mut hunks = Vec::new();
        let mut in_conflict = false;
        let mut in_base = false;
        let mut in_their = false;

        let mut our_lines = Vec::new();
        let mut their_lines = Vec::new();
        let mut base_lines = Vec::new();

        let mut current_our_start = 1;
        let mut current_their_start = 1;
        let mut normal_line_count = 0;

        for line in content.lines() {
            if line.starts_with("<<<<<<<") {
                in_conflict = true;
                in_base = false;
                in_their = false;
                our_lines.clear();
                their_lines.clear();
                base_lines.clear();
                current_our_start = normal_line_count + 1;
                current_their_start = normal_line_count + 1;
            } else if in_conflict && line.starts_with("|||||||") {
                in_base = true;
                in_their = false;
            } else if in_conflict && line.starts_with("=======") {
                in_base = false;
                in_their = true;
            } else if in_conflict && line.starts_with(">>>>>>>") {
                hunks.push(ConflictHunk {
                    hunk_index: hunks.len(),
                    our_start_line: current_our_start,
                    our_lines: our_lines.clone(),
                    their_start_line: current_their_start,
                    their_lines: their_lines.clone(),
                    base_lines: base_lines.clone(),
                });
                normal_line_count += our_lines.len().max(their_lines.len());
                in_conflict = false;
                in_base = false;
                in_their = false;
            } else if in_conflict {
                if in_their {
                    their_lines.push(line.to_string());
                } else if in_base {
                    base_lines.push(line.to_string());
                } else {
                    our_lines.push(line.to_string());
                }
            } else {
                normal_line_count += 1;
            }
        }

        hunks
    }

    /// Resolve a conflict file by writing the user's chosen merged content and staging it in the index.
    pub fn resolve_conflict_file(
        repo_path: &Path,
        file_path: &str,
        resolved_content: &str,
    ) -> Result<()> {
        let repo = Repository::open(repo_path)?;
        let worktree_dir = repo.workdir().ok_or(CoreError::BareRepository)?;
        let full_path = worktree_dir.join(file_path);

        if let Some(parent) = full_path.parent() {
            fs::create_dir_all(parent)?;
        }
        fs::write(&full_path, resolved_content)?;

        let mut index = repo.index()?;
        index.add_path(Path::new(file_path))?;
        index.write()?;

        Ok(())
    }

    /// Resolve conflict by directly accepting Ours (Local version).
    pub fn accept_ours(repo_path: &Path, file_path: &str) -> Result<()> {
        let details = Self::get_conflict_details(repo_path, file_path)?;
        let our_content = details.our_content.ok_or_else(|| {
            CoreError::ConflictError(format!("文件 {} 没有本地分支 (Ours) 阶段内容", file_path))
        })?;
        Self::resolve_conflict_file(repo_path, file_path, &our_content)
    }

    /// Resolve conflict by directly accepting Theirs (Remote/Incoming version).
    pub fn accept_theirs(repo_path: &Path, file_path: &str) -> Result<()> {
        let details = Self::get_conflict_details(repo_path, file_path)?;
        let their_content = details.their_content.ok_or_else(|| {
            CoreError::ConflictError(format!("文件 {} 没有传入分支 (Theirs) 阶段内容", file_path))
        })?;
        Self::resolve_conflict_file(repo_path, file_path, &their_content)
    }

    /// Continue merge, rebase, or cherry-pick after all conflicts have been resolved.
    pub fn continue_merge_or_rebase(runner: &CliRunner, repo_path: &Path) -> Result<CliOutput> {
        let repo = Repository::open(repo_path)?;
        let index = repo.index()?;

        if index.has_conflicts() {
            return Err(CoreError::ConflictError(
                "仓库中仍有未解决的冲突文件，请全部解决并暂存后再继续".to_string(),
            ));
        }

        let state = repo.state();
        let cmd_args: &[&str] = match state {
            git2::RepositoryState::Merge => &["commit", "--no-edit"],
            git2::RepositoryState::Rebase
            | git2::RepositoryState::RebaseInteractive
            | git2::RepositoryState::RebaseMerge => &["rebase", "--continue"],
            git2::RepositoryState::CherryPick => &["cherry-pick", "--continue"],
            git2::RepositoryState::Revert => &["revert", "--continue"],
            _ => &["commit", "--no-edit"],
        };

        runner.run(repo_path, cmd_args, RunOptions::default())
    }
}
