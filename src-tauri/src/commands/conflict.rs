use std::path::Path;
use tg_core::{
    AbortResult, CliRunner, ConflictFileDetails, ConflictFileSummary, ConflictService,
    RemoteService,
};

#[tauri::command]
pub fn abort_merge_or_rebase(root_path: String) -> std::result::Result<AbortResult, String> {
    crate::journal_cmd::run("abort_merge_or_rebase", &root_path, || {
        let runner = CliRunner::new("git");
        let service = RemoteService::new(&runner);
        service
            .abort_action(Path::new(&root_path))
            .map_err(|e| e.to_string())
    })
}

#[tauri::command]
pub fn list_conflicts(root_path: String) -> std::result::Result<Vec<ConflictFileSummary>, String> {
    let clean_path = root_path.trim().trim_matches('"').trim_matches('\'').trim();
    let p = Path::new(clean_path);
    ConflictService::list_conflicts(p).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_conflict_details(
    root_path: String,
    file_path: String,
) -> std::result::Result<ConflictFileDetails, String> {
    let clean_path = root_path.trim().trim_matches('"').trim_matches('\'').trim();
    let p = Path::new(clean_path);
    ConflictService::get_conflict_details(p, &file_path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn resolve_conflict_file(
    root_path: String,
    file_path: String,
    resolved_content: String,
) -> std::result::Result<(), String> {
    crate::journal_cmd::run("resolve_conflict_file", &root_path, || {
        let clean_path = root_path.trim().trim_matches('"').trim_matches('\'').trim();
        let p = Path::new(clean_path);
        ConflictService::resolve_conflict_file(p, &file_path, &resolved_content)
            .map_err(|e| e.to_string())
    })
}

#[tauri::command]
pub fn accept_ours(root_path: String, file_path: String) -> std::result::Result<(), String> {
    crate::journal_cmd::run("accept_ours", &root_path, || {
        let clean_path = root_path.trim().trim_matches('"').trim_matches('\'').trim();
        let p = Path::new(clean_path);
        ConflictService::accept_ours(p, &file_path).map_err(|e| e.to_string())
    })
}

#[tauri::command]
pub fn accept_theirs(root_path: String, file_path: String) -> std::result::Result<(), String> {
    crate::journal_cmd::run("accept_theirs", &root_path, || {
        let clean_path = root_path.trim().trim_matches('"').trim_matches('\'').trim();
        let p = Path::new(clean_path);
        ConflictService::accept_theirs(p, &file_path).map_err(|e| e.to_string())
    })
}

#[tauri::command]
pub fn continue_merge_or_rebase(root_path: String) -> std::result::Result<(), String> {
    crate::journal_cmd::run("continue_merge_or_rebase", &root_path, || {
        let clean_path = root_path.trim().trim_matches('"').trim_matches('\'').trim();
        let p = Path::new(clean_path);
        let runner = CliRunner::new("git");
        let out =
            ConflictService::continue_merge_or_rebase(&runner, p).map_err(|e| e.to_string())?;
        if out.exit_code != Some(0) {
            let err = format!("{}\n{}", out.stdout, out.stderr).trim().to_string();
            return Err(err);
        }
        Ok(())
    })
}
