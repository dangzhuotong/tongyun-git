use std::path::{Path, PathBuf};
use std::sync::Mutex;

use serde::{Deserialize, Serialize};

use crate::error::{CoreError, Result};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct HeadInfo {
    pub branch: Option<String>,
    pub oid: Option<String>,
    pub unborn: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum ChangeKind {
    Added,
    Modified,
    Deleted,
    Renamed,
    TypeChange,
    Untracked,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct FileStatus {
    pub path: String,
    pub old_path: Option<String>,
    pub index: Option<ChangeKind>,
    pub worktree: Option<ChangeKind>,
    pub conflicted: bool,
}

pub trait GitBackend: Send + Sync {
    fn repo_root(&self) -> &Path;
    fn head(&self) -> Result<HeadInfo>;
    fn status(&self) -> Result<Vec<FileStatus>>;
}

pub struct Git2Backend {
    repo: Mutex<git2::Repository>,
    repo_root: PathBuf,
}

impl std::fmt::Debug for Git2Backend {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("Git2Backend")
            .field("repo_root", &self.repo_root)
            .finish()
    }
}

impl Git2Backend {
    pub fn open(path: &Path) -> Result<Self> {
        let repo = match git2::Repository::discover(path) {
            Ok(r) => r,
            Err(e) => {
                if e.code() == git2::ErrorCode::NotFound {
                    return Err(CoreError::NotARepository);
                }
                return Err(CoreError::Git2(e));
            }
        };

        if repo.is_bare() {
            return Err(CoreError::BareRepository);
        }

        let workdir = repo.workdir().ok_or(CoreError::BareRepository)?;
        let repo_root = std::fs::canonicalize(workdir).unwrap_or_else(|_| workdir.to_path_buf());

        Ok(Self {
            repo: Mutex::new(repo),
            repo_root,
        })
    }
}

impl GitBackend for Git2Backend {
    fn repo_root(&self) -> &Path {
        &self.repo_root
    }

    fn head(&self) -> Result<HeadInfo> {
        let repo = self.repo.lock().unwrap_or_else(|p| p.into_inner());

        let head_info = match repo.head() {
            Ok(head_ref) => {
                let oid = head_ref.target().map(|o| o.to_string());
                if head_ref.is_branch() {
                    let branch = head_ref.shorthand().ok().map(|s| s.to_string());
                    Ok(HeadInfo {
                        branch,
                        oid,
                        unborn: false,
                    })
                } else {
                    // Detached HEAD: branch field holds short commit hash
                    let short_oid = oid.as_ref().map(|id| {
                        if id.len() >= 7 {
                            id[..7].to_string()
                        } else {
                            id.clone()
                        }
                    });
                    Ok(HeadInfo {
                        branch: short_oid,
                        oid,
                        unborn: false,
                    })
                }
            }
            Err(e)
                if e.code() == git2::ErrorCode::UnbornBranch
                    || e.code() == git2::ErrorCode::NotFound =>
            {
                let branch = repo
                    .find_reference("HEAD")
                    .ok()
                    .and_then(|r| r.symbolic_target().ok().flatten().map(|s| s.to_string()))
                    .map(|full_ref| {
                        full_ref
                            .strip_prefix("refs/heads/")
                            .unwrap_or(&full_ref)
                            .to_string()
                    });

                Ok(HeadInfo {
                    branch,
                    oid: None,
                    unborn: true,
                })
            }
            Err(e) => Err(CoreError::Git2(e)),
        };

        head_info
    }

    fn status(&self) -> Result<Vec<FileStatus>> {
        let repo = self.repo.lock().unwrap_or_else(|p| p.into_inner());

        let mut opts = git2::StatusOptions::new();
        opts.include_untracked(true)
            .recurse_untracked_dirs(true)
            .renames_head_to_index(true)
            .renames_index_to_workdir(true);

        let statuses = repo.statuses(Some(&mut opts))?;
        let mut results = Vec::new();

        for entry in statuses.iter() {
            let status = entry.status();

            // libgit2 ORs INDEX_MODIFIED / WT_MODIFIED onto a rename whose blob changed.
            // Renamed has to win, or a renamed-and-edited file is reported as a plain edit
            // and the old path is dropped from the kind the UI keys off.
            let index = if status.contains(git2::Status::INDEX_NEW) {
                Some(ChangeKind::Added)
            } else if status.contains(git2::Status::INDEX_RENAMED) {
                Some(ChangeKind::Renamed)
            } else if status.contains(git2::Status::INDEX_DELETED) {
                Some(ChangeKind::Deleted)
            } else if status.contains(git2::Status::INDEX_TYPECHANGE) {
                Some(ChangeKind::TypeChange)
            } else if status.contains(git2::Status::INDEX_MODIFIED) {
                Some(ChangeKind::Modified)
            } else {
                None
            };

            let worktree = if status.contains(git2::Status::WT_NEW) {
                Some(ChangeKind::Untracked)
            } else if status.contains(git2::Status::WT_RENAMED) {
                Some(ChangeKind::Renamed)
            } else if status.contains(git2::Status::WT_DELETED) {
                Some(ChangeKind::Deleted)
            } else if status.contains(git2::Status::WT_TYPECHANGE) {
                Some(ChangeKind::TypeChange)
            } else if status.contains(git2::Status::WT_MODIFIED) {
                Some(ChangeKind::Modified)
            } else {
                None
            };

            let conflicted = status.contains(git2::Status::CONFLICTED);

            if index.is_none() && worktree.is_none() && !conflicted {
                continue;
            }

            let mut old_path = None;
            let mut new_path = None;
            if let Some(diff) = entry.head_to_index() {
                if diff.status() == git2::Delta::Renamed {
                    if let Some(p) = diff.old_file().path() {
                        old_path = Some(p.to_string_lossy().to_string());
                    }
                    if let Some(p) = diff.new_file().path() {
                        new_path = Some(p.to_string_lossy().to_string());
                    }
                }
            }
            if old_path.is_none() {
                if let Some(diff) = entry.index_to_workdir() {
                    if diff.status() == git2::Delta::Renamed {
                        if let Some(p) = diff.old_file().path() {
                            old_path = Some(p.to_string_lossy().to_string());
                        }
                        if let Some(p) = diff.new_file().path() {
                            new_path = Some(p.to_string_lossy().to_string());
                        }
                    }
                }
            }

            let path = new_path
                .or_else(|| entry.path().ok().map(|s| s.to_string()))
                .or_else(|| {
                    entry
                        .head_to_index()
                        .and_then(|d| d.new_file().path().map(|p| p.to_string_lossy().to_string()))
                })
                .or_else(|| {
                    entry
                        .index_to_workdir()
                        .and_then(|d| d.new_file().path().map(|p| p.to_string_lossy().to_string()))
                })
                .unwrap_or_default();

            results.push(FileStatus {
                path,
                old_path,
                index,
                worktree,
                conflicted,
            });
        }

        Ok(results)
    }
}
