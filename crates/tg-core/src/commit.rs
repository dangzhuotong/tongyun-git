use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;

use crate::cli::{CliRunner, RunOptions};
use crate::error::{CoreError, Result};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitIdentity {
    pub name: String,
    pub email: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommitResult {
    pub oid: String,
    pub short_oid: String,
    pub summary: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AmendStatus {
    pub can_amend: bool,
    pub disabled_reason: Option<String>,
    pub head_message: Option<String>,
    pub is_pushed: bool,
    pub pushed_remote_branches: Vec<String>,
}

pub struct CommitService;

impl CommitService {
    /// Check whether git user.name and user.email are configured.
    pub fn check_identity(runner: &CliRunner, repo_root: &Path) -> Result<Option<GitIdentity>> {
        let name_res = runner.run(repo_root, &["config", "user.name"], RunOptions::default());
        let email_res = runner.run(repo_root, &["config", "user.email"], RunOptions::default());

        let name = match name_res {
            Ok(out) if out.exit_code == Some(0) => out.stdout.trim().to_string(),
            _ => String::new(),
        };

        let email = match email_res {
            Ok(out) if out.exit_code == Some(0) => out.stdout.trim().to_string(),
            _ => String::new(),
        };

        if name.is_empty() || email.is_empty() {
            Ok(None)
        } else {
            Ok(Some(GitIdentity { name, email }))
        }
    }

    /// Configure git user.name and user.email (locally or globally).
    pub fn set_identity(
        runner: &CliRunner,
        repo_root: &Path,
        name: &str,
        email: &str,
        global: bool,
    ) -> Result<()> {
        let name_args = if global {
            vec!["config", "--global", "user.name", name]
        } else {
            vec!["config", "user.name", name]
        };
        let email_args = if global {
            vec!["config", "--global", "user.email", email]
        } else {
            vec!["config", "user.email", email]
        };

        let res1 = runner.run(repo_root, &name_args, RunOptions::default())?;
        if res1.exit_code != Some(0) {
            return Err(CoreError::Cli {
                exit_code: res1.exit_code,
                stderr: format!("设置 user.name 失败: {}", res1.stderr),
            });
        }

        let res2 = runner.run(repo_root, &email_args, RunOptions::default())?;
        if res2.exit_code != Some(0) {
            return Err(CoreError::Cli {
                exit_code: res2.exit_code,
                stderr: format!("设置 user.email 失败: {}", res2.stderr),
            });
        }

        Ok(())
    }

    /// Read the full commit message of HEAD if HEAD exists.
    pub fn get_head_message(repo_root: &Path) -> Result<Option<String>> {
        let repo = match git2::Repository::open(repo_root) {
            Ok(r) => r,
            Err(_) => return Ok(None),
        };

        let head = match repo.head() {
            Ok(h) => h,
            Err(_) => return Ok(None),
        };

        let target_oid = match head.target() {
            Some(oid) => oid,
            None => return Ok(None),
        };

        let commit = repo.find_commit(target_oid)?;
        let msg = match commit.message() {
            Ok(m) => m.to_string(),
            _ => String::new(),
        };
        Ok(Some(msg))
    }

    /// Check if merge or rebase is currently in progress.
    pub fn is_in_merge_or_rebase(repo_root: &Path) -> bool {
        let dot_git = repo_root.join(".git");
        dot_git.join("MERGE_HEAD").exists()
            || dot_git.join("rebase-apply").exists()
            || dot_git.join("rebase-merge").exists()
    }

    /// Check which remote branches contain HEAD (if any).
    pub fn check_head_pushed(runner: &CliRunner, repo_root: &Path) -> Result<Vec<String>> {
        let out = runner.run(
            repo_root,
            &["branch", "-r", "--contains", "HEAD"],
            RunOptions::default(),
        )?;
        if out.exit_code != Some(0) {
            return Ok(Vec::new());
        }

        let mut branches = Vec::new();
        for line in out.stdout.lines() {
            let trimmed = line.trim();
            // Ignore detached HEAD markers or arrow pointers like origin/HEAD -> origin/main
            if !trimmed.is_empty() && !trimmed.contains("->") && !trimmed.starts_with('(') {
                branches.push(trimmed.to_string());
            }
        }
        Ok(branches)
    }

    /// Inspect whether amend is available and its push warning status.
    pub fn inspect_amend(runner: &CliRunner, repo_root: &Path) -> Result<AmendStatus> {
        let head_msg = Self::get_head_message(repo_root)?;
        if head_msg.is_none() {
            return Ok(AmendStatus {
                can_amend: false,
                disabled_reason: Some("当前仓库没有历史提交，无法修改提交".to_string()),
                head_message: None,
                is_pushed: false,
                pushed_remote_branches: Vec::new(),
            });
        }

        if Self::is_in_merge_or_rebase(repo_root) {
            return Ok(AmendStatus {
                can_amend: false,
                disabled_reason: Some("正在进行合并或变基，无法修改上一次提交".to_string()),
                head_message: head_msg,
                is_pushed: false,
                pushed_remote_branches: Vec::new(),
            });
        }

        let pushed_branches = Self::check_head_pushed(runner, repo_root)?;
        let is_pushed = !pushed_branches.is_empty();

        Ok(AmendStatus {
            can_amend: true,
            disabled_reason: None,
            head_message: head_msg,
            is_pushed,
            pushed_remote_branches: pushed_branches,
        })
    }

    /// Execute git commit (normal or amend) via CliRunner with a temporary message file.
    pub fn commit(
        runner: &CliRunner,
        repo_root: &Path,
        message: &str,
        amend: bool,
    ) -> Result<CommitResult> {
        let trimmed_msg = message.trim();
        if trimmed_msg.is_empty() {
            return Err(CoreError::CommitError("提交信息不能为空".to_string()));
        }

        // Write commit message to a temporary file to preserve exact characters & line breaks
        let temp_dir = tempfile::tempdir()?;
        let msg_file_path = temp_dir.path().join("COMMIT_EDITMSG");
        fs::write(&msg_file_path, message)?;

        let path_str = msg_file_path.to_string_lossy().to_string();
        let mut args = vec!["commit"];
        if amend {
            args.push("--amend");
        }
        args.push("-F");
        args.push(&path_str);

        let out = runner.run(repo_root, &args, RunOptions::default())?;
        if out.exit_code != Some(0) {
            let combined_err = format!("{}\n{}", out.stdout.trim(), out.stderr.trim())
                .trim()
                .to_string();
            return Err(CoreError::Cli {
                exit_code: out.exit_code,
                stderr: combined_err,
            });
        }

        // Fetch new HEAD info via git2
        let repo = git2::Repository::open(repo_root)?;
        let head = repo.head()?;
        let target_oid = head
            .target()
            .ok_or_else(|| CoreError::CommitError("无法获取提交后的 HEAD 标识".to_string()))?;
        let commit = repo.find_commit(target_oid)?;

        let oid_str = target_oid.to_string();
        let short_oid = oid_str.chars().take(7).collect();
        let summary = match commit.message() {
            Ok(m) => m.lines().next().unwrap_or("").to_string(),
            _ => String::new(),
        };

        let _ = Self::clear_external_draft(repo_root);

        Ok(CommitResult {
            oid: oid_str,
            short_oid,
            summary,
        })
    }

    /// Checkout a specific commit in detached HEAD mode.
    pub fn checkout_commit(runner: &CliRunner, repo_root: &Path, oid: &str) -> Result<()> {
        let trimmed_oid = oid.trim();
        if trimmed_oid.is_empty() {
            return Err(CoreError::CommitError("提交标识不能为空".to_string()));
        }

        let out = runner.run(repo_root, &["checkout", trimmed_oid], RunOptions::default())?;
        if out.exit_code != Some(0) {
            let combined_err = format!("{}\n{}", out.stdout.trim(), out.stderr.trim())
                .trim()
                .to_string();
            return Err(CoreError::Cli {
                exit_code: out.exit_code,
                stderr: combined_err,
            });
        }
        Ok(())
    }

    /// Reset current branch to a specific commit. Prohibits destructive "hard" reset (only "soft" or "mixed").
    pub fn reset_to_commit(
        runner: &CliRunner,
        repo_root: &Path,
        oid: &str,
        mode: &str,
    ) -> Result<()> {
        let trimmed_oid = oid.trim();
        if trimmed_oid.is_empty() {
            return Err(CoreError::ResetError("提交标识不能为空".to_string()));
        }

        let flag = match mode.to_lowercase().as_str() {
            "soft" => "--soft",
            "mixed" => "--mixed",
            "hard" => {
                return Err(CoreError::ResetError(
                    "安全保护策略：应用禁止执行破坏性的硬重置 (hard reset)。如需丢弃改动请使用带安全快照的丢弃功能。".to_string(),
                ));
            }
            _ => {
                return Err(CoreError::ResetError(
                    "不支持的重置模式，仅支持 'soft' 或 'mixed'".to_string(),
                ));
            }
        };

        let out = runner.run(
            repo_root,
            &["reset", flag, trimmed_oid],
            RunOptions::default(),
        )?;
        if out.exit_code != Some(0) {
            let combined_err = format!("{}\n{}", out.stdout.trim(), out.stderr.trim())
                .trim()
                .to_string();
            return Err(CoreError::Cli {
                exit_code: out.exit_code,
                stderr: combined_err,
            });
        }
        Ok(())
    }

    /// Read external commit draft (e.g. prepared by external AI agent via .git/TONGYUN_COMMIT_MSG, or .git/MERGE_MSG).
    pub fn get_external_draft(repo_root: &Path) -> Result<Option<String>> {
        let dot_git = if let Ok(repo) = git2::Repository::open(repo_root) {
            repo.path().to_path_buf()
        } else {
            repo_root.join(".git")
        };

        // 1. Check custom AI / Agent draft file (.git/TONGYUN_COMMIT_MSG)
        let ai_file = dot_git.join("TONGYUN_COMMIT_MSG");
        if ai_file.exists() {
            if let Ok(content) = fs::read_to_string(&ai_file) {
                let trimmed = content.trim();
                if !trimmed.is_empty() {
                    return Ok(Some(trimmed.to_string()));
                }
            }
        }

        // 2. Check Git standard merge message (.git/MERGE_MSG)
        let merge_file = dot_git.join("MERGE_MSG");
        if merge_file.exists() {
            if let Ok(content) = fs::read_to_string(&merge_file) {
                let trimmed = content.trim();
                if !trimmed.is_empty() {
                    return Ok(Some(trimmed.to_string()));
                }
            }
        }

        // 3. Check Git standard squash message (.git/SQUASH_MSG)
        let squash_file = dot_git.join("SQUASH_MSG");
        if squash_file.exists() {
            if let Ok(content) = fs::read_to_string(&squash_file) {
                let trimmed = content.trim();
                if !trimmed.is_empty() {
                    return Ok(Some(trimmed.to_string()));
                }
            }
        }

        Ok(None)
    }

    /// Clear external commit draft file (.git/TONGYUN_COMMIT_MSG) after commit or discard.
    pub fn clear_external_draft(repo_root: &Path) -> Result<()> {
        let dot_git = if let Ok(repo) = git2::Repository::open(repo_root) {
            repo.path().to_path_buf()
        } else {
            repo_root.join(".git")
        };
        let ai_file = dot_git.join("TONGYUN_COMMIT_MSG");
        if ai_file.exists() {
            let _ = fs::remove_file(ai_file);
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::cli::CliRunner;

    fn temp_git_dir() -> tempfile::TempDir {
        let dir = tempfile::tempdir().unwrap();
        fs::create_dir_all(dir.path().join(".git")).unwrap();
        dir
    }

    #[test]
    fn test_is_in_merge_or_rebase_clean_dir() {
        let dir = tempfile::tempdir().unwrap();
        assert!(!CommitService::is_in_merge_or_rebase(dir.path()));
    }

    #[test]
    fn test_is_in_merge_or_rebase_detects_markers() {
        for marker in ["MERGE_HEAD", "rebase-apply", "rebase-merge"] {
            let dir = temp_git_dir();
            fs::write(dir.path().join(".git").join(marker), "x").unwrap();
            assert!(
                CommitService::is_in_merge_or_rebase(dir.path()),
                "marker {marker} should be detected"
            );
        }
    }

    #[test]
    fn test_get_external_draft_none_when_no_files() {
        let dir = temp_git_dir();
        assert_eq!(CommitService::get_external_draft(dir.path()).unwrap(), None);
    }

    #[test]
    fn test_get_external_draft_trims_content() {
        let dir = temp_git_dir();
        fs::write(
            dir.path().join(".git").join("TONGYUN_COMMIT_MSG"),
            "  feat: trimmed draft  \n\n",
        )
        .unwrap();
        assert_eq!(
            CommitService::get_external_draft(dir.path()).unwrap(),
            Some("feat: trimmed draft".to_string())
        );
    }

    #[test]
    fn test_get_external_draft_priority_ai_then_merge_then_squash() {
        let dir = temp_git_dir();
        let dot_git = dir.path().join(".git");

        fs::write(dot_git.join("SQUASH_MSG"), "squash message").unwrap();
        assert_eq!(
            CommitService::get_external_draft(dir.path()).unwrap(),
            Some("squash message".to_string())
        );

        fs::write(dot_git.join("MERGE_MSG"), "merge message").unwrap();
        assert_eq!(
            CommitService::get_external_draft(dir.path()).unwrap(),
            Some("merge message".to_string())
        );

        fs::write(dot_git.join("TONGYUN_COMMIT_MSG"), "ai message").unwrap();
        assert_eq!(
            CommitService::get_external_draft(dir.path()).unwrap(),
            Some("ai message".to_string())
        );
    }

    #[test]
    fn test_get_external_draft_skips_blank_and_falls_through() {
        let dir = temp_git_dir();
        let dot_git = dir.path().join(".git");
        fs::write(dot_git.join("TONGYUN_COMMIT_MSG"), "   \n").unwrap();
        fs::write(dot_git.join("MERGE_MSG"), "from merge").unwrap();
        assert_eq!(
            CommitService::get_external_draft(dir.path()).unwrap(),
            Some("from merge".to_string())
        );
    }

    #[test]
    fn test_clear_external_draft_removes_file_and_is_idempotent() {
        let dir = temp_git_dir();
        let ai_file = dir.path().join(".git").join("TONGYUN_COMMIT_MSG");
        fs::write(&ai_file, "draft").unwrap();
        assert!(ai_file.exists());

        CommitService::clear_external_draft(dir.path()).unwrap();
        assert!(!ai_file.exists());

        // Second call on an already-cleared directory must still succeed.
        CommitService::clear_external_draft(dir.path()).unwrap();
        assert!(!ai_file.exists());
    }

    #[test]
    fn test_commit_rejects_blank_message() {
        let runner = CliRunner::new("git");
        let dir = tempfile::tempdir().unwrap();
        let err = CommitService::commit(&runner, dir.path(), "   \n\t ", false);
        assert!(matches!(err, Err(CoreError::CommitError(_))));
    }

    #[test]
    fn test_checkout_commit_rejects_blank_oid() {
        let runner = CliRunner::new("git");
        let dir = tempfile::tempdir().unwrap();
        let err = CommitService::checkout_commit(&runner, dir.path(), "  ");
        assert!(matches!(err, Err(CoreError::CommitError(_))));
    }

    #[test]
    fn test_reset_to_commit_rejects_empty_oid() {
        let runner = CliRunner::new("git");
        let dir = tempfile::tempdir().unwrap();
        let err = CommitService::reset_to_commit(&runner, dir.path(), "   ", "soft");
        assert!(matches!(err, Err(CoreError::ResetError(_))));
    }

    #[test]
    fn test_reset_to_commit_rejects_hard_and_unknown_modes() {
        let runner = CliRunner::new("git");
        let dir = tempfile::tempdir().unwrap();
        for mode in ["hard", "HARD", "unknown", ""] {
            let err = CommitService::reset_to_commit(&runner, dir.path(), "abc1234", mode);
            assert!(
                matches!(err, Err(CoreError::ResetError(_))),
                "mode {mode:?} should be rejected"
            );
        }
    }
}
