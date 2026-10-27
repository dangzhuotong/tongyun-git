use crate::cli::{CliRunner, RunOptions};
use crate::error::{CoreError, Result};
use serde::{Deserialize, Serialize};
use std::path::Path;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct WorktreeItem {
    pub name: String,
    pub path: String,
    pub head_oid: Option<String>,
    pub branch: Option<String>,
    pub is_main: bool,
    pub is_locked: bool,
    pub lock_reason: Option<String>,
    pub is_bare: bool,
    pub is_detached: bool,
}

pub struct WorktreeService;

impl WorktreeService {
    pub fn parse_worktree_porcelain(output: &str) -> Vec<WorktreeItem> {
        let mut worktrees = Vec::new();
        let mut current_path: Option<String> = None;
        let mut current_head: Option<String> = None;
        let mut current_branch: Option<String> = None;
        let mut current_locked: Option<String> = None;
        let mut is_locked = false;
        let mut is_bare = false;
        let mut is_detached = false;

        let flush_entry = |worktrees: &mut Vec<WorktreeItem>,
                           path: &mut Option<String>,
                           head: &mut Option<String>,
                           branch: &mut Option<String>,
                           locked: &mut Option<String>,
                           is_locked: &mut bool,
                           is_bare: &mut bool,
                           is_detached: &mut bool| {
            if let Some(p) = path.take() {
                let name = Path::new(&p)
                    .file_name()
                    .map(|n| n.to_string_lossy().to_string())
                    .unwrap_or_else(|| p.clone());
                let is_main = worktrees.is_empty();
                worktrees.push(WorktreeItem {
                    name,
                    path: p,
                    head_oid: head.take(),
                    branch: branch.take(),
                    is_main,
                    is_locked: *is_locked,
                    lock_reason: locked.take(),
                    is_bare: *is_bare,
                    is_detached: *is_detached,
                });
                *is_locked = false;
                *is_bare = false;
                *is_detached = false;
            }
        };

        for line in output.lines() {
            let line = line.trim();
            if line.is_empty() {
                flush_entry(
                    &mut worktrees,
                    &mut current_path,
                    &mut current_head,
                    &mut current_branch,
                    &mut current_locked,
                    &mut is_locked,
                    &mut is_bare,
                    &mut is_detached,
                );
                continue;
            }

            if let Some(p) = line.strip_prefix("worktree ") {
                current_path = Some(p.trim().to_string());
            } else if let Some(h) = line.strip_prefix("HEAD ") {
                current_head = Some(h.trim().to_string());
            } else if let Some(b) = line.strip_prefix("branch ") {
                let b_str = b.trim();
                let clean_branch = b_str
                    .strip_prefix("refs/heads/")
                    .unwrap_or(b_str)
                    .to_string();
                current_branch = Some(clean_branch);
            } else if line == "bare" {
                is_bare = true;
            } else if line == "detached" {
                is_detached = true;
            } else if let Some(r) = line.strip_prefix("locked") {
                is_locked = true;
                let reason = r.trim();
                if !reason.is_empty() {
                    current_locked = Some(reason.to_string());
                }
            }
        }

        flush_entry(
            &mut worktrees,
            &mut current_path,
            &mut current_head,
            &mut current_branch,
            &mut current_locked,
            &mut is_locked,
            &mut is_bare,
            &mut is_detached,
        );

        worktrees
    }

    pub fn list_worktrees(runner: &CliRunner, repo_path: &Path) -> Result<Vec<WorktreeItem>> {
        let out = runner.run(
            repo_path,
            &["worktree", "list", "--porcelain"],
            RunOptions::default(),
        )?;
        if out.exit_code != Some(0) {
            return Err(CoreError::WorktreeError(out.stderr.trim().to_string()));
        }
        Ok(Self::parse_worktree_porcelain(&out.stdout))
    }

    pub fn add_worktree(
        runner: &CliRunner,
        repo_path: &Path,
        worktree_path: &str,
        branch: Option<&str>,
        create_branch: bool,
    ) -> Result<()> {
        let mut args = vec!["worktree", "add"];
        if create_branch {
            if let Some(b) = branch {
                args.push("-b");
                args.push(b);
                args.push(worktree_path);
            } else {
                return Err(CoreError::WorktreeError(
                    "创建新分支时必须指定分支名称".to_string(),
                ));
            }
        } else if let Some(b) = branch {
            args.push(worktree_path);
            args.push(b);
        } else {
            args.push("--detach");
            args.push(worktree_path);
        }

        let out = runner.run(repo_path, &args, RunOptions::default())?;
        if out.exit_code != Some(0) {
            let err = if !out.stderr.trim().is_empty() {
                out.stderr.trim()
            } else {
                out.stdout.trim()
            };
            return Err(CoreError::WorktreeError(err.to_string()));
        }
        Ok(())
    }

    pub fn remove_worktree(
        runner: &CliRunner,
        repo_path: &Path,
        worktree_path: &str,
        force: bool,
    ) -> Result<()> {
        let mut args = vec!["worktree", "remove"];
        if force {
            args.push("--force");
        }
        args.push(worktree_path);

        let out = runner.run(repo_path, &args, RunOptions::default())?;
        if out.exit_code != Some(0) {
            let err = if !out.stderr.trim().is_empty() {
                out.stderr.trim()
            } else {
                out.stdout.trim()
            };
            return Err(CoreError::WorktreeError(err.to_string()));
        }
        Ok(())
    }

    pub fn lock_worktree(
        runner: &CliRunner,
        repo_path: &Path,
        worktree_path: &str,
        reason: Option<&str>,
    ) -> Result<()> {
        let mut args = vec!["worktree", "lock"];
        if let Some(r) = reason {
            args.push("--reason");
            args.push(r);
        }
        args.push(worktree_path);

        let out = runner.run(repo_path, &args, RunOptions::default())?;
        if out.exit_code != Some(0) {
            let err = if !out.stderr.trim().is_empty() {
                out.stderr.trim()
            } else {
                out.stdout.trim()
            };
            return Err(CoreError::WorktreeError(err.to_string()));
        }
        Ok(())
    }

    pub fn unlock_worktree(
        runner: &CliRunner,
        repo_path: &Path,
        worktree_path: &str,
    ) -> Result<()> {
        let args = ["worktree", "unlock", worktree_path];
        let out = runner.run(repo_path, &args, RunOptions::default())?;
        if out.exit_code != Some(0) {
            let err = if !out.stderr.trim().is_empty() {
                out.stderr.trim()
            } else {
                out.stdout.trim()
            };
            return Err(CoreError::WorktreeError(err.to_string()));
        }
        Ok(())
    }

    pub fn prune_worktrees(runner: &CliRunner, repo_path: &Path) -> Result<()> {
        let args = ["worktree", "prune"];
        let out = runner.run(repo_path, &args, RunOptions::default())?;
        if out.exit_code != Some(0) {
            let err = if !out.stderr.trim().is_empty() {
                out.stderr.trim()
            } else {
                out.stdout.trim()
            };
            return Err(CoreError::WorktreeError(err.to_string()));
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_worktree_porcelain_empty_input() {
        assert!(WorktreeService::parse_worktree_porcelain("").is_empty());
        assert!(WorktreeService::parse_worktree_porcelain("\n\n   \n").is_empty());
    }

    #[test]
    fn test_parse_worktree_porcelain_single_main_worktree() {
        let output = "worktree /repo/main\nHEAD abc123\nbranch refs/heads/main\n";
        let items = WorktreeService::parse_worktree_porcelain(output);
        assert_eq!(items.len(), 1);
        assert_eq!(
            items[0],
            WorktreeItem {
                name: "main".to_string(),
                path: "/repo/main".to_string(),
                head_oid: Some("abc123".to_string()),
                branch: Some("main".to_string()),
                is_main: true,
                is_locked: false,
                lock_reason: None,
                is_bare: false,
                is_detached: false,
            }
        );
    }

    #[test]
    fn test_parse_worktree_porcelain_multiple_with_flags() {
        let output = "\
worktree /repo/one
HEAD 111
branch refs/heads/main

worktree /repo/two
HEAD 222
detached
locked because in use

worktree /repo/three
HEAD 333
bare
locked
";
        let items = WorktreeService::parse_worktree_porcelain(output);
        assert_eq!(items.len(), 3);

        assert_eq!(items[0].name, "one");
        assert!(items[0].is_main);
        assert_eq!(items[0].branch.as_deref(), Some("main"));
        assert!(!items[0].is_detached);

        assert_eq!(items[1].name, "two");
        assert!(!items[1].is_main);
        assert_eq!(items[1].head_oid.as_deref(), Some("222"));
        assert_eq!(items[1].branch, None);
        assert!(items[1].is_detached);
        assert!(items[1].is_locked);
        assert_eq!(items[1].lock_reason.as_deref(), Some("because in use"));
        assert!(!items[1].is_bare);

        assert_eq!(items[2].name, "three");
        assert!(!items[2].is_main);
        assert!(items[2].is_bare);
        assert!(items[2].is_locked);
        assert_eq!(items[2].lock_reason, None);
        assert!(!items[2].is_detached);
    }

    #[test]
    fn test_parse_worktree_porcelain_branch_prefix_only_heads_stripped() {
        let output = "\
worktree /repo/main
HEAD aaa
branch refs/remotes/origin/main
";
        let items = WorktreeService::parse_worktree_porcelain(output);
        assert_eq!(items[0].branch.as_deref(), Some("refs/remotes/origin/main"));
    }

    #[test]
    fn test_parse_worktree_porcelain_name_falls_back_to_full_path() {
        let output = "worktree /\nHEAD aaa\nbranch refs/heads/main\n";
        let items = WorktreeService::parse_worktree_porcelain(output);
        assert_eq!(items.len(), 1);
        assert_eq!(items[0].name, "/");
        assert_eq!(items[0].path, "/");
    }
}
