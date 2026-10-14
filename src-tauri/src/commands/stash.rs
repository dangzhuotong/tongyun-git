use std::path::Path;
use tg_core::{CliRunner, StashApplyResult, StashItem, StashService};

#[tauri::command]
pub fn list_stashes(root_path: String) -> std::result::Result<Vec<StashItem>, String> {
    let clean_path = root_path.trim().trim_matches('"').trim_matches('\'').trim();
    let p = Path::new(clean_path);
    let runner = CliRunner::new("git");
    StashService::list_stashes(&runner, p).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn create_stash(
    root_path: String,
    message: Option<String>,
    include_untracked: bool,
) -> std::result::Result<(), String> {
    let clean_path = root_path.trim().trim_matches('"').trim_matches('\'').trim();
    let p = Path::new(clean_path);
    let runner = CliRunner::new("git");
    StashService::create_stash(&runner, p, message.as_deref(), include_untracked)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn apply_stash(
    root_path: String,
    index: usize,
    pop: bool,
) -> std::result::Result<StashApplyResult, String> {
    let clean_path = root_path.trim().trim_matches('"').trim_matches('\'').trim();
    let p = Path::new(clean_path);
    let runner = CliRunner::new("git");
    StashService::apply_stash(&runner, p, index, pop).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn drop_stash(root_path: String, index: usize) -> std::result::Result<(), String> {
    let clean_path = root_path.trim().trim_matches('"').trim_matches('\'').trim();
    let p = Path::new(clean_path);
    let runner = CliRunner::new("git");
    StashService::drop_stash(&runner, p, index).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn clear_stashes(root_path: String) -> std::result::Result<(), String> {
    let clean_path = root_path.trim().trim_matches('"').trim_matches('\'').trim();
    let p = Path::new(clean_path);
    let runner = CliRunner::new("git");
    StashService::clear_stashes(&runner, p).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn show_stash_diff(root_path: String, index: usize) -> std::result::Result<String, String> {
    let clean_path = root_path.trim().trim_matches('"').trim_matches('\'').trim();
    let p = Path::new(clean_path);
    let runner = CliRunner::new("git");
    StashService::show_stash_diff(&runner, p, index).map_err(|e| e.to_string())
}
