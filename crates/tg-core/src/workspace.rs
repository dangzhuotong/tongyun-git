//! Additional everyday Git workflows. All process execution goes through CliRunner.
use crate::{CliRunner, CoreError, Git2Backend, GitBackend, Result, RunOptions, WorktreeService};
use git2::{BlameOptions, DiffOptions, Repository, RepositoryState};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::path::{Component, Path, PathBuf};

pub fn safe_path(root: &Path, path: &str) -> Result<PathBuf> {
    if path.is_empty() || path.contains(['\\', '\0', '\n', '\r', ':']) {
        return Err(CoreError::PathError(PathBuf::from(path)));
    }
    let relative = Path::new(path);
    if relative
        .components()
        .any(|c| !matches!(c, Component::Normal(_)))
        || relative
            .components()
            .any(|c| c.as_os_str().to_string_lossy().eq_ignore_ascii_case(".git"))
    {
        return Err(CoreError::PathError(relative.into()));
    }
    let mut full = root.to_path_buf();
    for c in relative.components() {
        full.push(c);
        match std::fs::symlink_metadata(&full) {
            Ok(m) if m.file_type().is_symlink() => return Err(CoreError::PathError(full)),
            Ok(_) => {}
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
            Err(e) => return Err(e.into()),
        }
    }
    Ok(full)
}

pub fn run_checked(runner: &CliRunner, root: &Path, args: &[&str]) -> Result<String> {
    let out = runner.run(root, args, RunOptions::default())?;
    if out.exit_code != Some(0) {
        return Err(CoreError::Cli {
            exit_code: out.exit_code,
            stderr: out.stderr,
        });
    }
    Ok(format!("{}{}", out.stdout, out.stderr))
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum HistoryAction {
    CherryPick,
    Revert,
    Merge,
    Continue,
    Abort,
}

pub fn history_action(
    runner: &CliRunner,
    root: &Path,
    action: HistoryAction,
    target: &str,
) -> Result<String> {
    let repo = Repository::open(root)?;
    if matches!(action, HistoryAction::Continue | HistoryAction::Abort) {
        let command = match repo.state() {
            RepositoryState::CherryPick | RepositoryState::CherryPickSequence => "cherry-pick",
            RepositoryState::Revert | RepositoryState::RevertSequence => "revert",
            RepositoryState::Merge => "merge",
            RepositoryState::Rebase
            | RepositoryState::RebaseInteractive
            | RepositoryState::RebaseMerge => "rebase",
            _ => return Err(CoreError::CommitError("没有可继续或中止的操作".into())),
        };
        if matches!(action, HistoryAction::Continue) && repo.index()?.has_conflicts() {
            return Err(CoreError::CommitError("请先解决冲突并暂存".into()));
        }
        return run_checked(
            runner,
            root,
            &[
                command,
                if matches!(action, HistoryAction::Abort) {
                    "--abort"
                } else {
                    "--continue"
                },
            ],
        );
    }
    if repo.state() != RepositoryState::Clean || !Git2Backend::open(root)?.status()?.is_empty() {
        return Err(CoreError::CommitError(
            "请先提交或贮藏改动，并结束进行中的 Git 操作".into(),
        ));
    }
    if !repo.head()?.is_branch() {
        return Err(CoreError::CommitError("请先切换到本地分支".into()));
    }
    // Resolve to an OID: user text can never become a command option.
    let commit = repo.revparse_single(target)?.peel_to_commit()?;
    if !matches!(action, HistoryAction::Merge) && commit.parent_count() > 1 {
        return Err(CoreError::CommitError(
            "合并提交需要选择主线，请在终端操作".into(),
        ));
    }
    let oid = commit.id().to_string();
    let args = match action {
        HistoryAction::CherryPick => vec!["cherry-pick", &oid],
        HistoryAction::Revert => vec!["revert", "--no-edit", &oid],
        HistoryAction::Merge => vec!["merge", "--no-edit", &oid],
        _ => unreachable!(),
    };
    run_checked(runner, root, &args)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Comparison {
    pub from: String,
    pub to: String,
    pub patch: String,
    pub files: usize,
    pub additions: usize,
    pub deletions: usize,
}

pub fn compare(root: &Path, from: &str, to: &str) -> Result<Comparison> {
    let repo = Repository::open(root)?;
    let a = repo.revparse_single(from)?.peel_to_tree()?;
    let b = repo.revparse_single(to)?.peel_to_tree()?;
    let diff = repo.diff_tree_to_tree(
        Some(&a),
        Some(&b),
        Some(DiffOptions::new().context_lines(3)),
    )?;
    let stats = diff.stats()?;
    let mut patch = Vec::new();
    diff.print(git2::DiffFormat::Patch, |_, _, line| {
        if patch.len() >= 2 * 1024 * 1024 {
            return false;
        }
        if matches!(line.origin(), '+' | '-' | ' ') {
            patch.push(line.origin() as u8);
        }
        patch.extend_from_slice(line.content());
        true
    })?;
    Ok(Comparison {
        from: from.into(),
        to: to.into(),
        patch: String::from_utf8_lossy(&patch).into(),
        files: stats.files_changed(),
        additions: stats.insertions(),
        deletions: stats.deletions(),
    })
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BlameLine {
    pub line: usize,
    pub oid: String,
    pub author: String,
    pub content: String,
}

pub fn blame(root: &Path, path: &str, start: usize, count: usize) -> Result<Vec<BlameLine>> {
    safe_path(root, path)?;
    let repo = Repository::open(root)?;
    let tree = repo.head()?.peel_to_tree()?;
    let blob = repo.find_blob(tree.get_path(Path::new(path))?.id())?;
    if blob.is_binary() {
        return Err(CoreError::LogError("二进制文件不支持 blame".into()));
    }
    let text = std::str::from_utf8(blob.content())
        .map_err(|_| CoreError::LogError("文件不是 UTF-8".into()))?;
    let start = start.max(1);
    if count == 0 || start > text.lines().count() {
        return Ok(Vec::new());
    }
    let end = (start + count.min(500) - 1).min(text.lines().count());
    let result = repo.blame_file(
        Path::new(path),
        Some(BlameOptions::new().min_line(start).max_line(end)),
    )?;
    Ok(text
        .lines()
        .enumerate()
        .skip(start - 1)
        .take(end - start + 1)
        .filter_map(|(i, content)| {
            result.get_line(i + 1).map(|h| BlameLine {
                line: i + 1,
                oid: h.final_commit_id().to_string(),
                author: h
                    .final_signature()
                    .map(|s| s.name().unwrap_or("未知").to_string())
                    .unwrap_or_else(|| "未知".into()),
                content: content.into(),
            })
        })
        .collect())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorktreeOverview {
    pub path: String,
    pub branch: Option<String>,
    pub changed: Vec<String>,
    pub ahead: Option<usize>,
    pub behind: Option<usize>,
    pub error: Option<String>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkspaceOverview {
    pub worktrees: Vec<WorktreeOverview>,
    pub overlaps: BTreeMap<String, Vec<String>>,
    pub hunk_overlaps: Vec<String>,
}

fn changed_ranges(root: &str, base: git2::Oid, path: &str) -> Result<Vec<(u32, u32)>> {
    let repo = Repository::open(root)?;
    let tree = repo.find_commit(base)?.tree()?;
    let mut opts = DiffOptions::new();
    opts.pathspec(path)
        .context_lines(0)
        .include_untracked(true)
        .show_untracked_content(true);
    let diff = repo.diff_tree_to_workdir_with_index(Some(&tree), Some(&mut opts))?;
    let ranges = std::cell::RefCell::new(Vec::new());
    diff.foreach(
        &mut |_, _| true,
        None,
        Some(&mut |_, hunk| {
            let start = hunk.old_start();
            ranges
                .borrow_mut()
                .push((start, start + hunk.old_lines().max(1) - 1));
            true
        }),
        None,
    )?;
    Ok(ranges.into_inner())
}

pub fn overview(runner: &CliRunner, root: &Path) -> Result<WorkspaceOverview> {
    let mut worktrees = Vec::new();
    let mut touched: BTreeMap<String, Vec<String>> = BTreeMap::new();
    for wt in WorktreeService::list_worktrees(runner, root)? {
        let mut row = WorktreeOverview {
            path: wt.path.clone(),
            branch: wt.branch,
            changed: vec![],
            ahead: None,
            behind: None,
            error: None,
        };
        match Git2Backend::open(Path::new(&wt.path)).and_then(|b| b.status()) {
            Ok(files) => {
                for f in files {
                    touched
                        .entry(f.path.clone())
                        .or_default()
                        .push(wt.path.clone());
                    row.changed.push(f.path);
                }
                if let Ok(repo) = Repository::open(&wt.path) {
                    if let Ok(head) = repo.head() {
                        if let Ok(name) = head.shorthand() {
                            if let Ok(branch) = repo.find_branch(name, git2::BranchType::Local) {
                                if let Ok(upstream) = branch.upstream() {
                                    if let (Some(a), Some(b)) =
                                        (head.target(), upstream.get().target())
                                    {
                                        if let Ok((ahead, behind)) = repo.graph_ahead_behind(a, b) {
                                            row.ahead = Some(ahead);
                                            row.behind = Some(behind);
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
            Err(e) => row.error = Some(e.to_string()),
        }
        worktrees.push(row);
    }
    touched.retain(|_, paths| paths.len() > 1);
    let mut hunk_overlaps = Vec::new();
    for (file, paths) in &touched {
        let mut intersects = false;
        for (i, a) in paths.iter().enumerate() {
            for b in paths.iter().skip(i + 1) {
                // Compare both worktrees against the same ancestor's line coordinates.
                let pair = (|| -> Result<bool> {
                    let repo = Repository::open(root)?;
                    let a_head = Repository::open(a)?.head()?.peel_to_commit()?.id();
                    let b_head = Repository::open(b)?.head()?.peel_to_commit()?.id();
                    let base = repo.merge_base(a_head, b_head)?;
                    let left = changed_ranges(a, base, file)?;
                    let right = changed_ranges(b, base, file)?;
                    Ok(left
                        .iter()
                        .any(|(s, e)| right.iter().any(|(t, u)| s <= u && t <= e)))
                })();
                if pair.unwrap_or(false) {
                    intersects = true;
                }
            }
        }
        if intersects {
            hunk_overlaps.push(file.clone());
        }
    }
    Ok(WorkspaceOverview {
        worktrees,
        overlaps: touched,
        hunk_overlaps,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_safe_path_empty_rejected() {
        let temp = tempfile::tempdir().unwrap();
        assert!(safe_path(temp.path(), "").is_err());
    }

    #[test]
    fn test_safe_path_forbidden_characters() {
        let temp = tempfile::tempdir().unwrap();
        assert!(safe_path(temp.path(), "a\\b.txt").is_err());
        assert!(safe_path(temp.path(), "a\0b.txt").is_err());
        assert!(safe_path(temp.path(), "a\nb.txt").is_err());
        assert!(safe_path(temp.path(), "a\rb.txt").is_err());
        assert!(safe_path(temp.path(), "C:file.txt").is_err());
    }

    #[test]
    fn test_safe_path_directory_traversal() {
        let temp = tempfile::tempdir().unwrap();
        assert!(safe_path(temp.path(), "../file.txt").is_err());
        assert!(safe_path(temp.path(), "foo/../../file.txt").is_err());
        assert!(safe_path(temp.path(), "./file.txt").is_err());
        assert!(safe_path(temp.path(), "/file.txt").is_err());
    }

    #[test]
    fn test_safe_path_dot_git_case_insensitive() {
        let temp = tempfile::tempdir().unwrap();
        assert!(safe_path(temp.path(), ".git").is_err());
        assert!(safe_path(temp.path(), ".GIT").is_err());
        assert!(safe_path(temp.path(), ".Git").is_err());
        assert!(safe_path(temp.path(), "dir/.git/config").is_err());
        assert!(safe_path(temp.path(), "dir/.GIT/config").is_err());
    }

    #[test]
    fn test_safe_path_valid_nested_file() {
        let temp = tempfile::tempdir().unwrap();
        let target = temp.path().join("src").join("main.rs");
        let result = safe_path(temp.path(), "src/main.rs").expect("valid relative path");
        assert_eq!(result, target);
    }

    #[test]
    fn test_history_action_serde_roundtrip() {
        let actions = vec![
            (HistoryAction::CherryPick, "\"cherry_pick\""),
            (HistoryAction::Revert, "\"revert\""),
            (HistoryAction::Merge, "\"merge\""),
            (HistoryAction::Continue, "\"continue\""),
            (HistoryAction::Abort, "\"abort\""),
        ];

        for (action, expected_json) in actions {
            let json = serde_json::to_string(&action).unwrap();
            assert_eq!(json, expected_json);
            let parsed: HistoryAction = serde_json::from_str(&json).unwrap();
            assert_eq!(
                serde_json::to_string(&parsed).unwrap(),
                serde_json::to_string(&action).unwrap()
            );
        }
    }

    #[test]
    fn test_workspace_overview_serde_roundtrip() {
        let overview = WorkspaceOverview {
            worktrees: vec![WorktreeOverview {
                path: "wt1".to_string(),
                branch: Some("feat".to_string()),
                changed: vec!["file.txt".to_string()],
                ahead: Some(1),
                behind: Some(2),
                error: None,
            }],
            overlaps: BTreeMap::new(),
            hunk_overlaps: vec!["file.txt".to_string()],
        };
        let json = serde_json::to_string(&overview).unwrap();
        let parsed: WorkspaceOverview = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed.worktrees.len(), 1);
        assert_eq!(parsed.worktrees[0].path, "wt1");
        assert_eq!(parsed.hunk_overlaps, vec!["file.txt"]);
    }
}
