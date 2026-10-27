use std::path::Path;
use tg_core::{
    CliRunner, CommitDetails, CommitService, FileDiff, FileHistoryItem, LogQuery, LogResult,
    LogService,
};

#[tauri::command]
pub fn get_commit_log(
    root_path: String,
    query: LogQuery,
) -> std::result::Result<LogResult, String> {
    LogService::get_log(Path::new(&root_path), query).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_commit_details(
    root_path: String,
    oid: String,
) -> std::result::Result<CommitDetails, String> {
    LogService::get_commit_details(Path::new(&root_path), &oid).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_commit_file_diff(
    root_path: String,
    oid: String,
    file_path: String,
) -> std::result::Result<FileDiff, String> {
    LogService::get_commit_file_diff(Path::new(&root_path), &oid, &file_path)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_file_history(
    root_path: String,
    file_path: String,
    limit: Option<usize>,
) -> std::result::Result<Vec<FileHistoryItem>, String> {
    let clean_path = root_path.trim().trim_matches('"').trim_matches('\'').trim();
    let p = Path::new(clean_path);
    let runner = CliRunner::new("git");
    LogService::get_file_history(&runner, p, &file_path, limit.unwrap_or(50))
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn checkout_commit(root_path: String, oid: String) -> std::result::Result<(), String> {
    crate::journal_cmd::run("checkout_commit", &root_path, || {
        let clean_path = root_path.trim().trim_matches('"').trim_matches('\'').trim();
        let p = Path::new(clean_path);
        let runner = CliRunner::new("git");
        CommitService::checkout_commit(&runner, p, &oid).map_err(|e| e.to_string())
    })
}

#[tauri::command]
pub fn reset_to_commit(
    root_path: String,
    oid: String,
    mode: String,
) -> std::result::Result<(), String> {
    crate::journal_cmd::run("reset_to_commit", &root_path, || {
        let clean_path = root_path.trim().trim_matches('"').trim_matches('\'').trim();
        let p = Path::new(clean_path);
        let runner = CliRunner::new("git");
        CommitService::reset_to_commit(&runner, p, &oid, &mode).map_err(|e| e.to_string())
    })
}
