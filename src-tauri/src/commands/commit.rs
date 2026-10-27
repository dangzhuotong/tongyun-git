use std::path::Path;
use tg_core::{CliRunner, CommitService};

#[tauri::command]
pub fn check_commit_identity(
    root_path: String,
) -> std::result::Result<Option<tg_core::GitIdentity>, String> {
    let clean_path = root_path.trim().trim_matches('"').trim_matches('\'').trim();
    let p = Path::new(clean_path);
    let runner = CliRunner::new("git");
    CommitService::check_identity(&runner, p).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_commit_identity(
    root_path: String,
    name: String,
    email: String,
    global: bool,
) -> std::result::Result<(), String> {
    crate::journal_cmd::run("set_commit_identity", &root_path, || {
        let clean_path = root_path.trim().trim_matches('"').trim_matches('\'').trim();
        let p = Path::new(clean_path);
        let runner = CliRunner::new("git");
        CommitService::set_identity(&runner, p, &name, &email, global).map_err(|e| e.to_string())
    })
}

#[tauri::command]
pub fn get_head_message(root_path: String) -> std::result::Result<Option<String>, String> {
    let p = Path::new(&root_path);
    CommitService::get_head_message(p).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn inspect_amend(root_path: String) -> std::result::Result<tg_core::AmendStatus, String> {
    let p = Path::new(&root_path);
    let runner = CliRunner::new("git");
    CommitService::inspect_amend(&runner, p).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn create_commit(
    root_path: String,
    message: String,
    amend: bool,
) -> std::result::Result<tg_core::CommitResult, String> {
    crate::journal_cmd::run("create_commit", &root_path, || {
        let p = Path::new(&root_path);
        let runner = CliRunner::new("git");
        CommitService::commit(&runner, p, &message, amend).map_err(|e| e.to_string())
    })
}

#[tauri::command]
pub fn get_external_commit_draft(root_path: String) -> std::result::Result<Option<String>, String> {
    let p = Path::new(&root_path);
    CommitService::get_external_draft(p).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn clear_external_commit_draft(root_path: String) -> std::result::Result<(), String> {
    let p = Path::new(&root_path);
    CommitService::clear_external_draft(p).map_err(|e| e.to_string())
}
