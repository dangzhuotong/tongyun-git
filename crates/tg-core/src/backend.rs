use std::path::{Path, PathBuf};
use std::sync::Mutex;

use serde::{Deserialize, Serialize};

use crate::error::{CoreError, Result};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
pub enum RepoState {
    #[default]
    Clean,
    Merge,
    Rebase,
    CherryPick,
    Revert,
    Bisect,
    Other,
}

pub fn map_repo_state(state: git2::RepositoryState) -> RepoState {
    match state {
        git2::RepositoryState::Clean => RepoState::Clean,
        git2::RepositoryState::Merge => RepoState::Merge,
        git2::RepositoryState::Rebase
        | git2::RepositoryState::RebaseInteractive
        | git2::RepositoryState::RebaseMerge => RepoState::Rebase,
        git2::RepositoryState::CherryPick | git2::RepositoryState::CherryPickSequence => {
            RepoState::CherryPick
        }
        git2::RepositoryState::Revert | git2::RepositoryState::RevertSequence => RepoState::Revert,
        git2::RepositoryState::Bisect => RepoState::Bisect,
        _ => RepoState::Other,
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct HeadInfo {
    pub branch: Option<String>,
    pub oid: Option<String>,
    pub unborn: bool,
    #[serde(default)]
    pub repo_state: RepoState,
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

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct DiffLine {
    pub origin: char,
    pub old_lineno: Option<u32>,
    pub new_lineno: Option<u32>,
    pub content: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct DiffHunk {
    pub old_start: u32,
    pub old_lines: u32,
    pub new_start: u32,
    pub new_lines: u32,
    pub header: String,
    pub lines: Vec<DiffLine>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct FileDiff {
    pub path: String,
    pub old_path: Option<String>,
    pub staged: bool,
    pub is_binary: bool,
    pub old_size: Option<u64>,
    pub new_size: Option<u64>,
    pub is_crlf_change: bool,
    pub is_large: bool,
    pub hunks: Vec<DiffHunk>,
}

pub trait GitBackend: Send + Sync {
    fn repo_root(&self) -> &Path;
    fn head(&self) -> Result<HeadInfo>;
    fn status(&self) -> Result<Vec<FileStatus>>;
    fn diff_file(&self, path: &str, staged: bool) -> Result<FileDiff>;
    fn stage_files(&self, paths: &[&str]) -> Result<()>;
    fn unstage_files(&self, paths: &[&str]) -> Result<()>;
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
        let mut ceiling_dirs: Vec<PathBuf> = Vec::new();
        if let Some(val) = std::env::var_os("GIT_CEILING_DIRECTORIES") {
            ceiling_dirs.extend(std::env::split_paths(&val));
        }

        let home_opt = std::env::var_os("USERPROFILE")
            .or_else(|| std::env::var_os("HOME"))
            .map(PathBuf::from);

        if let Some(ref home) = home_opt {
            let canon_path = std::fs::canonicalize(path).unwrap_or_else(|_| path.to_path_buf());
            let canon_home = std::fs::canonicalize(home).unwrap_or_else(|_| home.clone());
            if canon_path != canon_home && canon_path.starts_with(&canon_home) {
                ceiling_dirs.push(canon_home);
            }
        }

        let repo = match git2::Repository::open_ext(
            path,
            git2::RepositoryOpenFlags::empty(),
            &ceiling_dirs,
        ) {
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

    pub fn init(path: &Path) -> Result<Self> {
        let repo = git2::Repository::init(path).map_err(CoreError::Git2)?;
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
        let repo_state = map_repo_state(repo.state());

        let head_info = match repo.head() {
            Ok(head_ref) => {
                let oid = head_ref.target().map(|o| o.to_string());
                if head_ref.is_branch() {
                    let branch = head_ref.shorthand().ok().map(|s| s.to_string());
                    Ok(HeadInfo {
                        branch,
                        oid,
                        unborn: false,
                        repo_state,
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
                        repo_state,
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
                    repo_state,
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

    fn diff_file(&self, path: &str, staged: bool) -> Result<FileDiff> {
        let repo = self.repo.lock().unwrap_or_else(|p| p.into_inner());
        let normalized_path = path.replace('\\', "/");

        let mut opts = git2::DiffOptions::new();
        opts.pathspec(&normalized_path);
        opts.include_untracked(true);
        opts.recurse_untracked_dirs(true);
        opts.show_untracked_content(true);

        let diff = if staged {
            let head_tree = match repo.head() {
                Ok(head_ref) => head_ref.peel_to_tree().ok(),
                Err(_) => None,
            };
            repo.diff_tree_to_index(head_tree.as_ref(), None, Some(&mut opts))?
        } else {
            repo.diff_index_to_workdir(None, Some(&mut opts))?
        };

        let mut old_path = None;
        let mut old_size = None;
        let mut new_size = None;
        let mut is_binary = false;

        if let Some(delta) = diff.deltas().next() {
            if delta.status() == git2::Delta::Renamed {
                if let Some(p) = delta.old_file().path() {
                    let old_p = p.to_string_lossy().to_string();
                    if old_p != normalized_path {
                        old_path = Some(old_p);
                    }
                }
            }
            is_binary = delta.flags().contains(git2::DiffFlags::BINARY);
            old_size = Some(delta.old_file().size());
            new_size = Some(delta.new_file().size());
        }

        // Check CRLF change
        let mut is_crlf_change = false;
        if !is_binary {
            let old_bytes_opt: Option<Vec<u8>> = if staged {
                repo.head()
                    .ok()
                    .and_then(|h| h.peel_to_tree().ok())
                    .and_then(|tree| {
                        let path_to_lookup = old_path.as_deref().unwrap_or(&normalized_path);
                        tree.get_path(Path::new(path_to_lookup)).ok()
                    })
                    .and_then(|entry| entry.to_object(&repo).ok())
                    .and_then(|obj| obj.as_blob().map(|b| b.content().to_vec()))
            } else {
                let path_to_lookup = old_path.as_deref().unwrap_or(&normalized_path);
                repo.index()
                    .ok()
                    .and_then(|idx| idx.get_path(Path::new(path_to_lookup), 0))
                    .and_then(|entry| repo.find_blob(entry.id).ok())
                    .map(|b| b.content().to_vec())
            };

            let new_bytes_opt: Option<Vec<u8>> = if staged {
                repo.index()
                    .ok()
                    .and_then(|idx| idx.get_path(Path::new(&normalized_path), 0))
                    .and_then(|entry| repo.find_blob(entry.id).ok())
                    .map(|b| b.content().to_vec())
            } else {
                let full_path = self.repo_root.join(&normalized_path);
                std::fs::read(&full_path).ok()
            };

            if let (Some(old_b), Some(new_b)) = (old_bytes_opt, new_bytes_opt) {
                if old_b != new_b {
                    let old_filtered: Vec<u8> = old_b.into_iter().filter(|&b| b != b'\r').collect();
                    let new_filtered: Vec<u8> = new_b.into_iter().filter(|&b| b != b'\r').collect();
                    if old_filtered == new_filtered {
                        is_crlf_change = true;
                    }
                }
            }
        }

        let hunks_cell = std::cell::RefCell::new(Vec::new());
        let is_binary_cell = std::cell::Cell::new(is_binary);
        let changed_lines_cell = std::cell::Cell::new(0);

        if !is_binary {
            diff.foreach(
                &mut |_delta, _progress| true,
                Some(&mut |_delta, _binary| {
                    is_binary_cell.set(true);
                    true
                }),
                Some(&mut |_delta, hunk| {
                    let header = String::from_utf8_lossy(hunk.header())
                        .trim_end()
                        .to_string();
                    hunks_cell.borrow_mut().push(DiffHunk {
                        old_start: hunk.old_start(),
                        old_lines: hunk.old_lines(),
                        new_start: hunk.new_start(),
                        new_lines: hunk.new_lines(),
                        header,
                        lines: Vec::new(),
                    });
                    true
                }),
                Some(&mut |_delta, _hunk, line| {
                    let origin = line.origin();
                    if origin == '+' || origin == '-' || origin == ' ' {
                        if origin == '+' || origin == '-' {
                            changed_lines_cell.set(changed_lines_cell.get() + 1);
                        }
                        if let Some(current_hunk) = hunks_cell.borrow_mut().last_mut() {
                            let content = String::from_utf8_lossy(line.content()).to_string();
                            current_hunk.lines.push(DiffLine {
                                origin,
                                old_lineno: line.old_lineno(),
                                new_lineno: line.new_lineno(),
                                content,
                            });
                        }
                    }
                    true
                }),
            )?;
        }

        let hunks = hunks_cell.into_inner();
        let is_binary = is_binary_cell.get();
        let total_changed_lines = changed_lines_cell.get();

        let max_size = old_size.unwrap_or(0).max(new_size.unwrap_or(0));
        let is_large = max_size > 1_000_000 || total_changed_lines > 5000;

        Ok(FileDiff {
            path: normalized_path,
            old_path,
            staged,
            is_binary,
            old_size,
            new_size,
            is_crlf_change,
            is_large,
            hunks: if is_binary { Vec::new() } else { hunks },
        })
    }

    fn stage_files(&self, paths: &[&str]) -> Result<()> {
        let repo = self.repo.lock().unwrap_or_else(|p| p.into_inner());
        let mut index = repo.index()?;

        for &path_str in paths {
            let normalized = path_str.replace('\\', "/");
            let p = Path::new(&normalized);
            let full_path = self.repo_root.join(p);

            if full_path.exists() {
                index.add_path(p)?;
            } else {
                index.remove_path(p)?;
            }
        }

        index.write()?;
        Ok(())
    }

    fn unstage_files(&self, paths: &[&str]) -> Result<()> {
        let repo = self.repo.lock().unwrap_or_else(|p| p.into_inner());

        let head_obj = match repo.head() {
            Ok(head_ref) => head_ref.peel(git2::ObjectType::Commit).ok(),
            Err(_) => None,
        };

        let normalized_paths: Vec<String> = paths.iter().map(|s| s.replace('\\', "/")).collect();

        repo.reset_default(head_obj.as_ref(), &normalized_paths)?;
        Ok(())
    }
}
