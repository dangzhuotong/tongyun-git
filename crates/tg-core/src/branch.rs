use git2::{BranchType, Repository, RepositoryState};
use serde::{Deserialize, Serialize};
use std::path::Path;

use crate::cli::{CliRunner, RunOptions};
use crate::error::{CoreError, Result};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct BranchItem {
    pub name: String,
    pub is_remote: bool,
    pub is_head: bool,
    pub upstream: Option<String>,
    pub ahead: usize,
    pub behind: usize,
    pub target_oid: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ValidationResult {
    pub valid: bool,
    pub error_message: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct SwitchBranchResult {
    pub success: bool,
    pub current_branch: String,
    pub conflicting_files: Vec<String>,
    pub error_message: Option<String>,
}

pub struct BranchService<'a> {
    cli: &'a CliRunner,
}

impl<'a> BranchService<'a> {
    pub fn new(cli: &'a CliRunner) -> Self {
        Self { cli }
    }

    /// List all local and remote branches with upstream ahead/behind tracking (R-08).
    pub fn list_branches(&self, repo_path: &Path) -> Result<Vec<BranchItem>> {
        let repo = Repository::open(repo_path)?;
        let head_ref = repo.head().ok();
        let head_branch_name = head_ref
            .as_ref()
            .and_then(|r| {
                if r.is_branch() {
                    r.shorthand().ok()
                } else {
                    None
                }
            })
            .map(|s| s.to_string());

        let mut items = Vec::new();

        // 1. Local branches
        if let Ok(branches) = repo.branches(Some(BranchType::Local)) {
            for entry in branches.flatten() {
                let (branch, _) = entry;
                let name = match branch.name() {
                    Ok(Some(n)) => n.to_string(),
                    _ => continue,
                };
                let is_head = head_branch_name.as_deref() == Some(&name);
                let target_oid = branch
                    .get()
                    .target()
                    .map(|oid| oid.to_string())
                    .unwrap_or_default();

                let mut upstream_name = None;
                let mut ahead = 0;
                let mut behind = 0;

                if let Ok(upstream) = branch.upstream() {
                    if let Ok(Some(u_name)) = upstream.name() {
                        upstream_name = Some(u_name.to_string());
                    }
                    if let (Some(local_oid), Some(u_oid)) =
                        (branch.get().target(), upstream.get().target())
                    {
                        if let Ok((a, b)) = repo.graph_ahead_behind(local_oid, u_oid) {
                            ahead = a;
                            behind = b;
                        }
                    }
                }

                items.push(BranchItem {
                    name,
                    is_remote: false,
                    is_head,
                    upstream: upstream_name,
                    ahead,
                    behind,
                    target_oid,
                });
            }
        }

        // 2. Remote branches
        if let Ok(branches) = repo.branches(Some(BranchType::Remote)) {
            for entry in branches.flatten() {
                let (branch, _) = entry;
                let name = match branch.name() {
                    Ok(Some(n)) => n.to_string(),
                    _ => continue,
                };

                // Ignore remote HEAD pointers like origin/HEAD
                if name.ends_with("/HEAD") {
                    continue;
                }

                let target_oid = branch
                    .get()
                    .target()
                    .map(|oid| oid.to_string())
                    .unwrap_or_default();

                items.push(BranchItem {
                    name,
                    is_remote: true,
                    is_head: false,
                    upstream: None,
                    ahead: 0,
                    behind: 0,
                    target_oid,
                });
            }
        }

        // Sort: local branches first (HEAD at top), then alphabetically; then remote branches alphabetically
        items.sort_by(|a, b| {
            if a.is_remote != b.is_remote {
                return a.is_remote.cmp(&b.is_remote);
            }
            if a.is_head != b.is_head {
                return b.is_head.cmp(&a.is_head);
            }
            a.name.cmp(&b.name)
        });

        Ok(items)
    }

    /// Validate a branch name per `git check-ref-format --branch` and existence check (R-09).
    pub fn validate_branch_name(&self, repo_path: &Path, name: &str) -> Result<ValidationResult> {
        let trimmed = name.trim();
        if trimmed.is_empty() {
            return Ok(ValidationResult {
                valid: false,
                error_message: Some("分支名称不能为空".to_string()),
            });
        }

        // Check format via `git check-ref-format --branch <name>`
        let out = self.cli.run(
            repo_path,
            &["check-ref-format", "--branch", trimmed],
            RunOptions::default(),
        )?;

        if out.exit_code != Some(0) {
            let reason = if trimmed.contains("..") {
                "分支名称不能包含 '..'"
            } else if trimmed.contains(' ')
                || trimmed.contains('~')
                || trimmed.contains('^')
                || trimmed.contains(':')
            {
                "分支名称包含非法字符 (空格, ~, ^, : 等)"
            } else if trimmed.starts_with('/') || trimmed.ends_with('/') {
                "分支名称不能以 '/' 开头或结尾"
            } else if trimmed.starts_with('-') {
                "分支名称不能以 '-' 开头"
            } else {
                "分支名称格式不符合 Git 规范"
            };
            return Ok(ValidationResult {
                valid: false,
                error_message: Some(reason.to_string()),
            });
        }

        // Check if branch already exists
        let repo = Repository::open(repo_path)?;
        if repo.find_branch(trimmed, BranchType::Local).is_ok() {
            return Ok(ValidationResult {
                valid: false,
                error_message: Some(format!("本地已存在同名分支 '{}'", trimmed)),
            });
        }

        Ok(ValidationResult {
            valid: true,
            error_message: None,
        })
    }

    /// Create a new branch, optionally checking it out (R-09).
    pub fn create_branch(
        &self,
        repo_path: &Path,
        name: &str,
        start_point: Option<&str>,
        checkout: bool,
    ) -> Result<()> {
        let validation = self.validate_branch_name(repo_path, name)?;
        if !validation.valid {
            return Err(CoreError::InvalidBranchName(
                validation
                    .error_message
                    .unwrap_or_else(|| "非法分支名".to_string()),
            ));
        }

        let start = start_point.unwrap_or("HEAD");

        let args: Vec<&str> = if checkout {
            vec!["checkout", "-b", name, start]
        } else {
            vec!["branch", name, start]
        };

        let out = self.cli.run(repo_path, &args, RunOptions::default())?;
        if out.exit_code != Some(0) {
            return Err(CoreError::Cli {
                exit_code: out.exit_code,
                stderr: out.stderr,
            });
        }

        Ok(())
    }

    /// Switch to a local or remote branch (R-08).
    /// If target is a remote branch (e.g. `origin/feature-x`) and no local branch with that name exists,
    /// creates a tracking branch (AT-08b).
    /// If uncommitted changes would be overwritten, reports conflict files (AT-08c).
    pub fn switch_branch(
        &self,
        repo_path: &Path,
        target_name: &str,
        is_remote: bool,
    ) -> Result<SwitchBranchResult> {
        let repo = Repository::open(repo_path)?;

        let current_branch = repo
            .head()
            .ok()
            .as_ref()
            .and_then(|h| {
                if h.is_branch() {
                    h.shorthand().ok()
                } else {
                    None
                }
            })
            .map(|s| s.to_string())
            .unwrap_or_default();

        // 1. Check if merge / rebase is in progress
        let state = repo.state();
        if state != RepositoryState::Clean {
            return Ok(SwitchBranchResult {
                success: false,
                current_branch,
                conflicting_files: Vec::new(),
                error_message: Some(format!(
                    "仓库处于 {:?} 状态进行中，请先解决冲突或中止操作后再切换分支",
                    state
                )),
            });
        }

        // 2. Build checkout command
        let out = if is_remote {
            // Strip remote prefix (e.g. `origin/feature-login` -> `feature-login`)
            let local_name = target_name
                .split_once('/')
                .map(|(_, rest)| rest)
                .unwrap_or(target_name);

            // Check if local branch already exists
            if repo.find_branch(local_name, BranchType::Local).is_ok() {
                self.cli
                    .run(repo_path, &["checkout", local_name], RunOptions::default())?
            } else {
                // Create local tracking branch
                self.cli.run(
                    repo_path,
                    &["checkout", "-b", local_name, "--track", target_name],
                    RunOptions::default(),
                )?
            }
        } else {
            self.cli
                .run(repo_path, &["checkout", target_name], RunOptions::default())?
        };

        if out.exit_code == Some(0) {
            let updated_repo = Repository::open(repo_path)?;
            let new_current = updated_repo
                .head()
                .ok()
                .as_ref()
                .and_then(|h| {
                    if h.is_branch() {
                        h.shorthand().ok()
                    } else {
                        None
                    }
                })
                .map(|s| s.to_string())
                .unwrap_or_default();

            return Ok(SwitchBranchResult {
                success: true,
                current_branch: new_current,
                conflicting_files: Vec::new(),
                error_message: None,
            });
        }

        // 3. Parse checkout error for conflicting files (AT-08c)
        let stderr = &out.stderr;
        let conflicting_files = parse_checkout_conflicts(stderr);

        let error_msg = if !conflicting_files.is_empty() {
            format!(
                "切换被阻止：切换到 '{}' 会覆盖下列文件的未提交改动：{}。请先提交或丢弃这些改动。",
                target_name,
                conflicting_files.join(", ")
            )
        } else {
            stderr.trim().to_string()
        };

        Ok(SwitchBranchResult {
            success: false,
            current_branch,
            conflicting_files,
            error_message: Some(error_msg),
        })
    }
}

/// Parse git checkout conflict output to extract file paths:
/// ```text
/// error: Your local changes to the following files would be overwritten by checkout:
///     src/api/user.ts
///     src/db.ts
/// Please commit your changes or stash them before you switch branches.
/// Aborting
/// ```
fn parse_checkout_conflicts(stderr: &str) -> Vec<String> {
    let mut files = Vec::new();
    let mut in_conflict_section = false;

    for line in stderr.lines() {
        if line.contains("would be overwritten by checkout") {
            in_conflict_section = true;
            continue;
        }
        if in_conflict_section {
            if line.starts_with("Please commit") || line.starts_with("Aborting") {
                break;
            }
            let trimmed = line.trim();
            if !trimmed.is_empty() {
                files.push(trimmed.to_string());
            }
        }
    }

    files
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_checkout_conflicts() {
        let err = r#"error: Your local changes to the following files would be overwritten by checkout:
	src/api/user.ts
	src/db.ts
Please commit your changes or stash them before you switch branches.
Aborting
"#;
        let files = parse_checkout_conflicts(err);
        assert_eq!(files, vec!["src/api/user.ts", "src/db.ts"]);
    }

    #[test]
    fn test_parse_checkout_conflicts_no_marker_returns_empty() {
        assert!(parse_checkout_conflicts("").is_empty());
        assert!(parse_checkout_conflicts("fatal: not a git repository\n").is_empty());
        assert!(parse_checkout_conflicts(
            "error: Your local changes would be overwritten by merge:\n\ta.txt\n"
        )
        .is_empty());
    }

    #[test]
    fn test_parse_checkout_conflicts_skips_blank_lines_and_trims() {
        let err = "error: Your local changes to the following files would be overwritten by checkout:\n\n\t  spaced.txt  \nplain.txt\n\nPlease commit your changes or stash them before you switch branches.\nAborting\n";
        let files = parse_checkout_conflicts(err);
        assert_eq!(files, vec!["spaced.txt", "plain.txt"]);
    }

    #[test]
    fn test_parse_checkout_conflicts_stops_at_aborting() {
        let err = "error: Your local changes to the following files would be overwritten by checkout:\n\ta.txt\nAborting\n\tnot-a-file.txt\n";
        let files = parse_checkout_conflicts(err);
        assert_eq!(files, vec!["a.txt"]);
    }

    #[test]
    fn test_parse_checkout_conflicts_does_not_include_header() {
        let err = "error: Your local changes to the following files would be overwritten by checkout:\n\tone.txt\n";
        let files = parse_checkout_conflicts(err);
        assert_eq!(files, vec!["one.txt"]);
        assert!(!files.iter().any(|f| f.contains("error:")));
    }

    #[test]
    fn test_branch_result_structs_serde_roundtrip() {
        let item = BranchItem {
            name: "feature/x".to_string(),
            is_remote: false,
            is_head: true,
            upstream: Some("origin/feature/x".to_string()),
            ahead: 2,
            behind: 1,
            target_oid: "a".repeat(40),
        };
        let json = serde_json::to_string(&item).unwrap();
        assert_eq!(item, serde_json::from_str::<BranchItem>(&json).unwrap());

        let validation = ValidationResult {
            valid: false,
            error_message: Some("分支名称不能为空".to_string()),
        };
        let v_json = serde_json::to_string(&validation).unwrap();
        assert_eq!(
            validation,
            serde_json::from_str::<ValidationResult>(&v_json).unwrap()
        );

        let switch = SwitchBranchResult {
            success: false,
            current_branch: "main".to_string(),
            conflicting_files: vec!["src/db.ts".to_string()],
            error_message: None,
        };
        let s_json = serde_json::to_string(&switch).unwrap();
        assert_eq!(
            switch,
            serde_json::from_str::<SwitchBranchResult>(&s_json).unwrap()
        );
    }
}
