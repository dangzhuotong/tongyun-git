use std::path::Path;
use tg_core::{CliRunner, RebaseItem, RebasePlan, RebaseResult, RebaseService};

#[tauri::command]
pub fn get_rebase_commits(
    root_path: String,
    base_oid: String,
) -> std::result::Result<Vec<RebaseItem>, String> {
    let clean_path = root_path.trim().trim_matches('"').trim_matches('\'').trim();
    let p = Path::new(clean_path);
    RebaseService::get_rebase_commits(p, &base_oid).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn execute_interactive_rebase(
    root_path: String,
    plan: RebasePlan,
) -> std::result::Result<RebaseResult, String> {
    let clean_path = root_path.trim().trim_matches('"').trim_matches('\'').trim();
    let p = Path::new(clean_path);
    let runner = CliRunner::new("git");
    RebaseService::execute_interactive_rebase(&runner, p, &plan).map_err(|e| e.to_string())
}
