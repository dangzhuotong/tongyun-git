use std::path::Path;

use serde::{Deserialize, Serialize};

use crate::cli::{CliRunner, RunOptions};
use crate::error::Result;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FetchResult {
    pub success: bool,
    pub output: String,
    pub error_message: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
pub enum PullStrategy {
    #[default]
    Merge,
    Rebase,
    FastForwardOnly,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PullResult {
    pub success: bool,
    pub has_conflict: bool,
    pub conflicting_files: Vec<String>,
    pub output: String,
    pub error_message: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PushCommit {
    pub oid: String,
    pub short_oid: String,
    pub summary: String,
    pub author_name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CloneResult {
    pub success: bool,
    pub output: String,
    pub error_message: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct RemoteDetail {
    pub name: String,
    pub url: Option<String>,
    pub push_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MultiPushItemResult {
    pub remote: String,
    pub success: bool,
    pub rejected: bool,
    pub output: String,
    pub error_message: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PushInspection {
    pub current_branch: String,
    pub upstream_branch: Option<String>,
    pub default_remote: String,
    pub default_target_branch: String,
    pub needs_upstream_setup: bool,
    pub ahead_count: usize,
    pub ahead_commits: Vec<PushCommit>,
    #[serde(default)]
    pub available_remotes: Vec<RemoteDetail>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PushResult {
    pub success: bool,
    pub rejected: bool,
    pub output: String,
    pub error_message: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AbortResult {
    pub success: bool,
    pub action: String,
    pub output: String,
    pub error_message: Option<String>,
}

pub struct RemoteService<'a> {
    runner: &'a CliRunner,
}

impl<'a> RemoteService<'a> {
    pub fn new(runner: &'a CliRunner) -> Self {
        Self { runner }
    }

    /// Fetch updates from remote(s) with prune option (R-11)
    pub fn fetch(
        &self,
        root_path: &Path,
        remote: Option<&str>,
        prune: bool,
    ) -> Result<FetchResult> {
        let mut args = vec!["fetch"];
        if prune {
            args.push("--prune");
        }
        if let Some(r) = remote {
            args.push(r);
        } else {
            args.push("--all");
        }

        let out = self.runner.run(root_path, &args, RunOptions::default())?;
        if out.exit_code == Some(0) {
            Ok(FetchResult {
                success: true,
                output: out.stdout,
                error_message: None,
            })
        } else {
            Ok(FetchResult {
                success: false,
                output: out.stdout,
                error_message: Some(out.stderr),
            })
        }
    }

    /// Pull updates from remote with selected merge strategy (R-11)
    pub fn pull(
        &self,
        root_path: &Path,
        remote: Option<&str>,
        branch: Option<&str>,
        strategy: PullStrategy,
    ) -> Result<PullResult> {
        let mut args = vec!["pull"];
        match strategy {
            PullStrategy::Merge => args.push("--no-rebase"),
            PullStrategy::Rebase => args.push("--rebase"),
            PullStrategy::FastForwardOnly => args.push("--ff-only"),
        }

        if let Some(r) = remote {
            args.push(r);
            if let Some(b) = branch {
                args.push(b);
            }
        }

        let out = self.runner.run(root_path, &args, RunOptions::default())?;

        if out.exit_code == Some(0) {
            Ok(PullResult {
                success: true,
                has_conflict: false,
                conflicting_files: Vec::new(),
                output: out.stdout,
                error_message: None,
            })
        } else {
            // Check if failure is due to merge/rebase conflict
            let repo = git2::Repository::open(root_path)?;
            let is_conflict_state = matches!(
                repo.state(),
                git2::RepositoryState::Merge
                    | git2::RepositoryState::Rebase
                    | git2::RepositoryState::RebaseInteractive
                    | git2::RepositoryState::RebaseMerge
            );

            let mut conflicting_files = Vec::new();
            if let Ok(statuses) = repo.statuses(None) {
                for entry in statuses.iter() {
                    if entry.status().contains(git2::Status::CONFLICTED) {
                        if let Ok(p) = entry.path() {
                            conflicting_files.push(p.to_string());
                        }
                    }
                }
            }

            if is_conflict_state || !conflicting_files.is_empty() {
                Ok(PullResult {
                    success: false,
                    has_conflict: true,
                    conflicting_files,
                    output: out.stdout,
                    error_message: Some("拉取合并产生冲突，请解决冲突或点击中止。".to_string()),
                })
            } else {
                Ok(PullResult {
                    success: false,
                    has_conflict: false,
                    conflicting_files: Vec::new(),
                    output: out.stdout,
                    error_message: Some(out.stderr),
                })
            }
        }
    }

    /// Inspect ahead commits and target remote before pushing (R-12)
    pub fn inspect_push(&self, root_path: &Path) -> Result<PushInspection> {
        let repo = git2::Repository::open(root_path)?;

        let head_ref = match repo.head() {
            Ok(h) => h,
            Err(_) => {
                return Ok(PushInspection {
                    current_branch: "HEAD".to_string(),
                    upstream_branch: None,
                    default_remote: "origin".to_string(),
                    default_target_branch: "main".to_string(),
                    needs_upstream_setup: true,
                    ahead_count: 0,
                    ahead_commits: Vec::new(),
                    available_remotes: self.list_remotes(root_path).unwrap_or_default(),
                });
            }
        };

        let current_branch = head_ref.shorthand().unwrap_or("HEAD").to_string();

        let mut remotes = Vec::new();
        if let Ok(r) = repo.remotes() {
            for name_opt in &r {
                if let Ok(Some(name)) = name_opt {
                    remotes.push(name.to_string());
                }
            }
        }

        let default_remote = remotes
            .first()
            .cloned()
            .unwrap_or_else(|| "origin".to_string());
        let default_target_branch = current_branch.clone();

        let local_branch = repo.find_branch(&current_branch, git2::BranchType::Local);
        let upstream_opt = local_branch.ok().and_then(|b| b.upstream().ok());

        let mut ahead_commits = Vec::new();

        let (upstream_branch, needs_upstream_setup) = if let Some(upstream) = upstream_opt {
            let upstream_name = upstream.name().ok().flatten().map(|s| s.to_string());
            if let (Some(head_oid), Some(upstream_oid)) =
                (head_ref.target(), upstream.get().target())
            {
                if let Ok(mut revwalk) = repo.revwalk() {
                    revwalk.set_sorting(git2::Sort::TIME).ok();
                    if revwalk.push(head_oid).is_ok() && revwalk.hide(upstream_oid).is_ok() {
                        for oid in revwalk.flatten() {
                            if let Ok(c) = repo.find_commit(oid) {
                                let full_oid = oid.to_string();
                                ahead_commits.push(PushCommit {
                                    short_oid: full_oid[..7.min(full_oid.len())].to_string(),
                                    oid: full_oid,
                                    summary: c
                                        .message()
                                        .unwrap_or("")
                                        .lines()
                                        .next()
                                        .unwrap_or("")
                                        .to_string(),
                                    author_name: c.author().name().unwrap_or("").to_string(),
                                });
                            }
                        }
                    }
                }
            }
            (upstream_name, false)
        } else {
            // No upstream tracked branch yet
            let remote_ref_name = format!("refs/remotes/{}/{}", default_remote, current_branch);
            if let (Some(head_oid), Ok(remote_ref)) =
                (head_ref.target(), repo.find_reference(&remote_ref_name))
            {
                if let (Some(remote_oid), Ok(mut revwalk)) = (remote_ref.target(), repo.revwalk()) {
                    revwalk.set_sorting(git2::Sort::TIME).ok();
                    if revwalk.push(head_oid).is_ok() && revwalk.hide(remote_oid).is_ok() {
                        for oid in revwalk.flatten() {
                            if let Ok(c) = repo.find_commit(oid) {
                                let full_oid = oid.to_string();
                                ahead_commits.push(PushCommit {
                                    short_oid: full_oid[..7.min(full_oid.len())].to_string(),
                                    oid: full_oid,
                                    summary: c
                                        .message()
                                        .unwrap_or("")
                                        .lines()
                                        .next()
                                        .unwrap_or("")
                                        .to_string(),
                                    author_name: c.author().name().unwrap_or("").to_string(),
                                });
                            }
                        }
                    }
                }
            } else if let Some(head_oid) = head_ref.target() {
                // All commits on branch are ahead
                if let Ok(mut revwalk) = repo.revwalk() {
                    revwalk.set_sorting(git2::Sort::TIME).ok();
                    if revwalk.push(head_oid).is_ok() {
                        for oid in revwalk.take(50).flatten() {
                            if let Ok(c) = repo.find_commit(oid) {
                                let full_oid = oid.to_string();
                                ahead_commits.push(PushCommit {
                                    short_oid: full_oid[..7.min(full_oid.len())].to_string(),
                                    oid: full_oid,
                                    summary: c
                                        .message()
                                        .unwrap_or("")
                                        .lines()
                                        .next()
                                        .unwrap_or("")
                                        .to_string(),
                                    author_name: c.author().name().unwrap_or("").to_string(),
                                });
                            }
                        }
                    }
                }
            }
            (None, true)
        };

        let available_remotes = self.list_remotes(root_path).unwrap_or_default();

        Ok(PushInspection {
            current_branch,
            upstream_branch,
            default_remote,
            default_target_branch,
            needs_upstream_setup,
            ahead_count: ahead_commits.len(),
            ahead_commits,
            available_remotes,
        })
    }

    /// Push current branch to remote (R-12)
    pub fn push(
        &self,
        root_path: &Path,
        remote: &str,
        branch: &str,
        set_upstream: bool,
    ) -> Result<PushResult> {
        let mut args = vec!["push"];
        if set_upstream {
            args.push("-u");
        }
        args.push(remote);
        args.push(branch);

        let out = self.runner.run(root_path, &args, RunOptions::default())?;

        if out.exit_code == Some(0) {
            Ok(PushResult {
                success: true,
                rejected: false,
                output: out.stdout,
                error_message: None,
            })
        } else {
            let is_rejected = out.stderr.contains("[rejected]")
                || out.stderr.contains("non-fast-forward")
                || out.stderr.contains("fetch first")
                || out.stderr.contains("Updates were rejected");

            if is_rejected {
                Ok(PushResult {
                    success: false,
                    rejected: true,
                    output: out.stdout,
                    error_message: Some("远程包含您本地没有的新提交，请先拉取更新。".to_string()),
                })
            } else {
                Ok(PushResult {
                    success: false,
                    rejected: false,
                    output: out.stdout,
                    error_message: Some(out.stderr),
                })
            }
        }
    }

    /// Abort an in-progress merge, rebase, cherry-pick, or revert (R-11, R-17)
    pub fn abort_action(&self, root_path: &Path) -> Result<AbortResult> {
        let repo = git2::Repository::open(root_path)?;

        let (action_name, git_cmd) = match repo.state() {
            git2::RepositoryState::Merge => ("merge", vec!["merge", "--abort"]),
            git2::RepositoryState::Rebase
            | git2::RepositoryState::RebaseInteractive
            | git2::RepositoryState::RebaseMerge => ("rebase", vec!["rebase", "--abort"]),
            git2::RepositoryState::CherryPick | git2::RepositoryState::CherryPickSequence => {
                ("cherry-pick", vec!["cherry-pick", "--abort"])
            }
            git2::RepositoryState::Revert | git2::RepositoryState::RevertSequence => {
                ("revert", vec!["revert", "--abort"])
            }
            git2::RepositoryState::Clean => {
                return Ok(AbortResult {
                    success: true,
                    action: "none".to_string(),
                    output: "没有正在进行的合并或变基操作".to_string(),
                    error_message: None,
                });
            }
            _ => ("action", vec!["merge", "--abort"]),
        };

        let out = self
            .runner
            .run(root_path, &git_cmd, RunOptions::default())?;

        if out.exit_code == Some(0) {
            Ok(AbortResult {
                success: true,
                action: action_name.to_string(),
                output: out.stdout,
                error_message: None,
            })
        } else {
            Ok(AbortResult {
                success: false,
                action: action_name.to_string(),
                output: out.stdout,
                error_message: Some(out.stderr),
            })
        }
    }

    /// List all remotes configured for the repository
    pub fn list_remotes(&self, root_path: &Path) -> Result<Vec<RemoteDetail>> {
        let repo = git2::Repository::open(root_path)?;
        let mut result = Vec::new();
        if let Ok(remotes) = repo.remotes() {
            for name_opt in remotes.iter() {
                if let Ok(Some(name)) = name_opt {
                    if let Ok(remote) = repo.find_remote(name) {
                        result.push(RemoteDetail {
                            name: name.to_string(),
                            url: remote.url().ok().map(|s| s.to_string()),
                            push_url: remote.pushurl().ok().flatten().map(|s| s.to_string()),
                        });
                    }
                }
            }
        }
        Ok(result)
    }

    /// Clone a repository from remote URL to target_path
    pub fn clone_repo(&self, url: &str, target_path: &Path) -> Result<CloneResult> {
        let parent = target_path.parent().unwrap_or_else(|| Path::new("."));
        if !parent.exists() {
            std::fs::create_dir_all(parent)?;
        }
        let target_str = target_path.to_string_lossy().to_string();
        let args = vec!["clone", url, &target_str];
        let out = self.runner.run(parent, &args, RunOptions::default())?;

        if out.exit_code == Some(0) {
            Ok(CloneResult {
                success: true,
                output: out.stdout,
                error_message: None,
            })
        } else {
            Ok(CloneResult {
                success: false,
                output: out.stdout,
                error_message: Some(if out.stderr.trim().is_empty() {
                    "克隆失败".to_string()
                } else {
                    out.stderr
                }),
            })
        }
    }

    /// Push branch to multiple remotes in sequence
    pub fn push_multiple(
        &self,
        root_path: &Path,
        remotes: &[String],
        branch: &str,
        set_upstream: bool,
    ) -> Result<Vec<MultiPushItemResult>> {
        let mut results = Vec::new();
        for r in remotes {
            let res = self.push(root_path, r, branch, set_upstream)?;
            results.push(MultiPushItemResult {
                remote: r.clone(),
                success: res.success,
                rejected: res.rejected,
                output: res.output,
                error_message: res.error_message,
            });
        }
        Ok(results)
    }
}
