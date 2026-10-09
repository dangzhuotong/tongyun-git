use serde::{Deserialize, Serialize};
use std::path::Path;

use crate::cli::{CliRunner, RunOptions};
use crate::error::{CoreError, Result};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct StashItem {
    pub index: usize,
    pub name: String,
    pub branch: String,
    pub message: String,
    pub date: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct StashApplyResult {
    pub success: bool,
    pub has_conflict: bool,
    pub message: Option<String>,
}

pub struct StashService;

impl StashService {
    /// List all stashes in the repository.
    pub fn list_stashes(runner: &CliRunner, repo_root: &Path) -> Result<Vec<StashItem>> {
        let args = ["stash", "list", "--pretty=format:%gd|%cr|%gs"];
        let out = runner.run(repo_root, &args, RunOptions::default())?;

        if out.exit_code != Some(0) {
            return Err(CoreError::Cli {
                exit_code: out.exit_code,
                stderr: out.stderr,
            });
        }

        let mut stashes = Vec::new();
        for line in out.stdout.lines() {
            let line = line.trim();
            if line.is_empty() {
                continue;
            }

            let parts: Vec<&str> = line.splitn(3, '|').collect();
            if parts.is_empty() {
                continue;
            }

            let name = parts[0].trim().to_string(); // e.g. stash@{0}
            let index = name
                .strip_prefix("stash@{")
                .and_then(|s| s.strip_suffix('}'))
                .and_then(|s| s.parse::<usize>().ok())
                .unwrap_or(stashes.len());

            let date = if parts.len() > 1 {
                Some(parts[1].trim().to_string())
            } else {
                None
            };

            let subject = if parts.len() > 2 { parts[2].trim() } else { "" };

            // Parse branch and message from subject
            // Common formats: "WIP on main: 1234abc some message" or "On main: some message"
            let (branch, message) = Self::parse_subject(subject);

            stashes.push(StashItem {
                index,
                name,
                branch,
                message,
                date,
            });
        }

        Ok(stashes)
    }

    /// Create a new stash of current working tree changes.
    pub fn create_stash(
        runner: &CliRunner,
        repo_root: &Path,
        message: Option<&str>,
        include_untracked: bool,
    ) -> Result<()> {
        let mut args = vec!["stash", "push"];

        let msg_clean;
        if let Some(msg) = message {
            let trimmed = msg.trim();
            if !trimmed.is_empty() {
                msg_clean = trimmed.to_string();
                args.push("-m");
                args.push(&msg_clean);
            }
        }

        if include_untracked {
            args.push("-u");
        }

        let out = runner.run(repo_root, &args, RunOptions::default())?;
        if out.exit_code != Some(0) {
            return Err(CoreError::Cli {
                exit_code: out.exit_code,
                stderr: out.stderr,
            });
        }

        let combined = format!("{}\n{}", out.stdout, out.stderr);
        if combined.contains("No local changes to save") {
            return Err(CoreError::CommitError("没有需要贮藏的本地改动".to_string()));
        }

        Ok(())
    }

    /// Apply or pop a stash by index.
    pub fn apply_stash(
        runner: &CliRunner,
        repo_root: &Path,
        index: usize,
        pop: bool,
    ) -> Result<StashApplyResult> {
        let stash_ref = format!("stash@{{{}}}", index);
        let action = if pop { "pop" } else { "apply" };
        let args = ["stash", action, &stash_ref];

        let out = runner.run(repo_root, &args, RunOptions::default())?;

        let combined = format!("{}\n{}", out.stdout, out.stderr);
        let has_conflict = combined.contains("CONFLICT") || combined.contains("conflict");

        if out.exit_code == Some(0) {
            Ok(StashApplyResult {
                success: true,
                has_conflict: false,
                message: if out.stdout.trim().is_empty() {
                    None
                } else {
                    Some(out.stdout.trim().to_string())
                },
            })
        } else if has_conflict {
            Ok(StashApplyResult {
                success: false,
                has_conflict: true,
                message: Some("恢复贮藏时产生冲突，已将冲突标记写入工作区，请手动解决".to_string()),
            })
        } else {
            Err(CoreError::Cli {
                exit_code: out.exit_code,
                stderr: out.stderr,
            })
        }
    }

    /// Drop a single stash by index.
    pub fn drop_stash(runner: &CliRunner, repo_root: &Path, index: usize) -> Result<()> {
        let stash_ref = format!("stash@{{{}}}", index);
        let args = ["stash", "drop", &stash_ref];

        let out = runner.run(repo_root, &args, RunOptions::default())?;
        if out.exit_code != Some(0) {
            return Err(CoreError::Cli {
                exit_code: out.exit_code,
                stderr: out.stderr,
            });
        }

        Ok(())
    }

    /// Clear all stashes in repository.
    pub fn clear_stashes(runner: &CliRunner, repo_root: &Path) -> Result<()> {
        let args = ["stash", "clear"];
        let out = runner.run(repo_root, &args, RunOptions::default())?;

        if out.exit_code != Some(0) {
            return Err(CoreError::Cli {
                exit_code: out.exit_code,
                stderr: out.stderr,
            });
        }

        Ok(())
    }

    /// Show diff for a stash entry.
    pub fn show_stash_diff(runner: &CliRunner, repo_root: &Path, index: usize) -> Result<String> {
        let stash_ref = format!("stash@{{{}}}", index);
        let args = ["stash", "show", "-p", &stash_ref];

        let out = runner.run(repo_root, &args, RunOptions::default())?;
        if out.exit_code != Some(0) {
            return Err(CoreError::Cli {
                exit_code: out.exit_code,
                stderr: out.stderr,
            });
        }

        Ok(out.stdout)
    }

    fn parse_subject(subject: &str) -> (String, String) {
        if let Some(rest) = subject.strip_prefix("WIP on ") {
            if let Some((b, msg)) = rest.split_once(':') {
                return (b.trim().to_string(), msg.trim().to_string());
            }
            return (rest.trim().to_string(), String::new());
        }

        if let Some(rest) = subject.strip_prefix("On ") {
            if let Some((b, msg)) = rest.split_once(':') {
                return (b.trim().to_string(), msg.trim().to_string());
            }
            return (rest.trim().to_string(), String::new());
        }

        (String::new(), subject.trim().to_string())
    }
}
