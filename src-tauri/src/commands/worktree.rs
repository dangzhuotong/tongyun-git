use std::path::Path;
use tg_core::{CliRunner, WorktreeItem, WorktreeService};

#[tauri::command]
pub fn list_worktrees(root_path: String) -> std::result::Result<Vec<WorktreeItem>, String> {
    let clean_path = root_path.trim().trim_matches('"').trim_matches('\'').trim();
    let p = Path::new(clean_path);
    let runner = CliRunner::new("git");
    WorktreeService::list_worktrees(&runner, p).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn add_worktree(
    root_path: String,
    worktree_path: String,
    branch: Option<String>,
    create_branch: bool,
) -> std::result::Result<(), String> {
    let clean_path = root_path.trim().trim_matches('"').trim_matches('\'').trim();
    let p = Path::new(clean_path);
    let runner = CliRunner::new("git");
    WorktreeService::add_worktree(&runner, p, &worktree_path, branch.as_deref(), create_branch)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn remove_worktree(
    root_path: String,
    worktree_path: String,
    force: bool,
) -> std::result::Result<(), String> {
    let clean_path = root_path.trim().trim_matches('"').trim_matches('\'').trim();
    let p = Path::new(clean_path);
    let runner = CliRunner::new("git");
    WorktreeService::remove_worktree(&runner, p, &worktree_path, force).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn lock_worktree(
    root_path: String,
    worktree_path: String,
    reason: Option<String>,
) -> std::result::Result<(), String> {
    let clean_path = root_path.trim().trim_matches('"').trim_matches('\'').trim();
    let p = Path::new(clean_path);
    let runner = CliRunner::new("git");
    WorktreeService::lock_worktree(&runner, p, &worktree_path, reason.as_deref())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn unlock_worktree(
    root_path: String,
    worktree_path: String,
) -> std::result::Result<(), String> {
    let clean_path = root_path.trim().trim_matches('"').trim_matches('\'').trim();
    let p = Path::new(clean_path);
    let runner = CliRunner::new("git");
    WorktreeService::unlock_worktree(&runner, p, &worktree_path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn prune_worktrees(root_path: String) -> std::result::Result<(), String> {
    let clean_path = root_path.trim().trim_matches('"').trim_matches('\'').trim();
    let p = Path::new(clean_path);
    let runner = CliRunner::new("git");
    WorktreeService::prune_worktrees(&runner, p).map_err(|e| e.to_string())
}
