use crate::cli::{CliRunner, RunOptions};
use crate::error::{CoreError, Result};
use git2::{Repository, RepositoryState};
use serde::{Deserialize, Serialize};
use std::path::Path;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum RebaseAction {
    Pick,
    Reword,
    Squash,
    Fixup,
    Drop,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RebaseItem {
    pub oid: String,
    pub short_oid: String,
    pub summary: String,
    pub author_name: String,
    pub action: RebaseAction,
    pub new_message: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RebasePlan {
    pub base_oid: String,
    pub items: Vec<RebaseItem>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RebaseResult {
    pub success: bool,
    pub has_conflict: bool,
    pub message: String,
}

pub struct RebaseService;

impl RebaseService {
    /// Retrieve commits between `base_oid` and HEAD, ordered chronologically (base+1 -> HEAD).
    pub fn get_rebase_commits(repo_path: &Path, base_oid: &str) -> Result<Vec<RebaseItem>> {
        let repo = Repository::open(repo_path)?;
        let base_obj = repo.revparse_single(base_oid)?;
        let base_id = base_obj.id();

        let head = repo.head()?.peel_to_commit()?;
        let head_id = head.id();

        if base_id == head_id {
            return Ok(Vec::new());
        }

        let mut revwalk = repo.revwalk()?;
        revwalk.push(head_id)?;
        revwalk.hide(base_id)?;

        let mut items = Vec::new();
        for oid_res in revwalk {
            let oid = oid_res?;
            let commit = repo.find_commit(oid)?;
            let full_oid = oid.to_string();
            let short_oid = if full_oid.len() >= 7 {
                full_oid[..7].to_string()
            } else {
                full_oid.clone()
            };
            let summary = commit
                .message()
                .unwrap_or("")
                .lines()
                .next()
                .unwrap_or("")
                .to_string();
            let author_name = commit.author().name().unwrap_or("").to_string();

            items.push(RebaseItem {
                oid: full_oid,
                short_oid,
                summary,
                author_name,
                action: RebaseAction::Pick,
                new_message: None,
            });
        }

        // Reverse so commits are in chronological order (oldest to newest)
        items.reverse();
        Ok(items)
    }

    /// Execute interactive rebase non-interactively using prepared todo and message files.
    pub fn execute_interactive_rebase(
        runner: &CliRunner,
        repo_path: &Path,
        plan: &RebasePlan,
    ) -> Result<RebaseResult> {
        if plan.items.is_empty() {
            return Err(CoreError::RebaseError(
                "变基计划中没有任何提交项，无需操作。".to_string(),
            ));
        }

        // Validate that first non-drop item is not squash or fixup
        let first_active = plan.items.iter().find(|i| i.action != RebaseAction::Drop);
        if let Some(first) = first_active {
            if first.action == RebaseAction::Squash || first.action == RebaseAction::Fixup {
                return Err(CoreError::RebaseError(
                    "第一个保留的提交不能为 squash 或 fixup 操作。".to_string(),
                ));
            }
        }

        let temp_dir = tempfile::tempdir()?;

        let mut todo_lines = Vec::new();
        for (idx, item) in plan.items.iter().enumerate() {
            match item.action {
                RebaseAction::Pick => {
                    todo_lines.push(format!("pick {} {}", item.short_oid, item.summary));
                }
                RebaseAction::Reword => {
                    todo_lines.push(format!("pick {} {}", item.short_oid, item.summary));
                    if let Some(ref new_msg) = item.new_message {
                        let msg_file = temp_dir.path().join(format!("msg_{}.txt", idx));
                        std::fs::write(&msg_file, new_msg)?;
                        let msg_file_str = msg_file.to_string_lossy().replace('\\', "/");
                        todo_lines.push(format!("exec git commit --amend -F \"{}\"", msg_file_str));
                    }
                }
                RebaseAction::Squash => {
                    todo_lines.push(format!("squash {} {}", item.short_oid, item.summary));
                    if let Some(ref new_msg) = item.new_message {
                        let msg_file = temp_dir.path().join(format!("msg_{}.txt", idx));
                        std::fs::write(&msg_file, new_msg)?;
                        let msg_file_str = msg_file.to_string_lossy().replace('\\', "/");
                        todo_lines.push(format!("exec git commit --amend -F \"{}\"", msg_file_str));
                    }
                }
                RebaseAction::Fixup => {
                    todo_lines.push(format!("fixup {} {}", item.short_oid, item.summary));
                }
                RebaseAction::Drop => {
                    todo_lines.push(format!("drop {} {}", item.short_oid, item.summary));
                }
            }
        }

        let todo_content = format!("{}\n", todo_lines.join("\n"));
        let todo_path = temp_dir.path().join("git-rebase-todo");
        std::fs::write(&todo_path, todo_content)?;

        #[cfg(windows)]
        let (editor_cmd, git_editor) = {
            let ps_script = temp_dir.path().join("editor.ps1");
            let script_content = format!(
                "[System.IO.File]::Copy('{}', $args[0], $true)\n",
                todo_path.to_string_lossy().replace('\'', "''")
            );
            std::fs::write(&ps_script, script_content)?;
            let editor_cmd = format!(
                "powershell -NoProfile -ExecutionPolicy Bypass -File \"{}\"",
                ps_script.to_string_lossy()
            );
            (editor_cmd, "cmd.exe /c exit 0".to_string())
        };

        #[cfg(not(windows))]
        let (editor_cmd, git_editor) = {
            let sh_script = temp_dir.path().join("editor.sh");
            let script_content =
                format!("#!/bin/sh\ncp \"{}\" \"$1\"\n", todo_path.to_string_lossy());
            std::fs::write(&sh_script, script_content)?;
            use std::os::unix::fs::PermissionsExt;
            let mut perms = std::fs::metadata(&sh_script)?.permissions();
            perms.set_mode(0o755);
            std::fs::set_permissions(&sh_script, perms)?;
            let editor_cmd = format!("sh \"{}\"", sh_script.to_string_lossy());
            (editor_cmd, "true".to_string())
        };

        let opts = RunOptions {
            extra_env: vec![
                ("GIT_SEQUENCE_EDITOR".to_string(), editor_cmd),
                ("GIT_EDITOR".to_string(), git_editor),
            ],
            ..Default::default()
        };

        let out = runner.run(repo_path, &["rebase", "-i", &plan.base_oid], opts)?;
        if out.exit_code == Some(0) {
            Ok(RebaseResult {
                success: true,
                has_conflict: false,
                message: "交互式变基已成功完成".to_string(),
            })
        } else {
            // Check if git paused in rebase due to conflict
            let repo = Repository::open(repo_path)?;
            let state = repo.state();
            let is_conflict = state == RepositoryState::Rebase
                || state == RepositoryState::RebaseInteractive
                || state == RepositoryState::RebaseMerge;

            if is_conflict {
                Ok(RebaseResult {
                    success: false,
                    has_conflict: true,
                    message: "变基产生冲突，已自动暂停。请使用冲突解决器处理后继续。".to_string(),
                })
            } else {
                let err_msg = if !out.stderr.trim().is_empty() {
                    out.stderr.trim().to_string()
                } else {
                    out.stdout.trim().to_string()
                };
                Err(CoreError::RebaseError(format!("变基执行失败: {}", err_msg)))
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_rebase_action_serde_is_lowercase() {
        let variants = [
            (RebaseAction::Pick, "\"pick\""),
            (RebaseAction::Reword, "\"reword\""),
            (RebaseAction::Squash, "\"squash\""),
            (RebaseAction::Fixup, "\"fixup\""),
            (RebaseAction::Drop, "\"drop\""),
        ];
        for (action, expected) in variants {
            let json = serde_json::to_string(&action).unwrap();
            assert_eq!(json, expected);
            let parsed: RebaseAction = serde_json::from_str(&json).unwrap();
            assert_eq!(parsed, action);
        }
    }

    #[test]
    fn test_rebase_plan_serde_roundtrip() {
        let plan = RebasePlan {
            base_oid: "a".repeat(40),
            items: vec![
                RebaseItem {
                    oid: "b".repeat(40),
                    short_oid: "bbbbbbb".to_string(),
                    summary: "feat: first".to_string(),
                    author_name: "Alice".to_string(),
                    action: RebaseAction::Reword,
                    new_message: Some("feat: reworded".to_string()),
                },
                RebaseItem {
                    oid: "c".repeat(40),
                    short_oid: "ccccccc".to_string(),
                    summary: "fix: second".to_string(),
                    author_name: "Bob".to_string(),
                    action: RebaseAction::Fixup,
                    new_message: None,
                },
            ],
        };

        let json = serde_json::to_string(&plan).unwrap();
        let parsed: RebasePlan = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed.base_oid, plan.base_oid);
        assert_eq!(parsed.items.len(), 2);
        assert_eq!(parsed.items[0].action, RebaseAction::Reword);
        assert_eq!(
            parsed.items[0].new_message.as_deref(),
            Some("feat: reworded")
        );
        assert_eq!(parsed.items[0].summary, "feat: first");
        assert_eq!(parsed.items[1].action, RebaseAction::Fixup);
        assert_eq!(parsed.items[1].new_message, None);
        assert_eq!(serde_json::to_string(&parsed).unwrap(), json);
    }
}
