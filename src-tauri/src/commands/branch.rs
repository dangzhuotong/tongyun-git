use std::path::Path;
use tg_core::{BranchItem, BranchService, CliRunner, SwitchBranchResult, ValidationResult};

#[tauri::command]
pub fn list_branches(root_path: String) -> std::result::Result<Vec<BranchItem>, String> {
    let runner = CliRunner::new("git");
    let service = BranchService::new(&runner);
    service
        .list_branches(Path::new(&root_path))
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn validate_branch_name(
    root_path: String,
    name: String,
) -> std::result::Result<ValidationResult, String> {
    let runner = CliRunner::new("git");
    let service = BranchService::new(&runner);
    service
        .validate_branch_name(Path::new(&root_path), &name)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn create_branch(
    root_path: String,
    name: String,
    start_point: Option<String>,
    checkout: bool,
) -> std::result::Result<(), String> {
    let runner = CliRunner::new("git");
    let service = BranchService::new(&runner);
    service
        .create_branch(
            Path::new(&root_path),
            &name,
            start_point.as_deref(),
            checkout,
        )
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn switch_branch(
    root_path: String,
    target_name: String,
    is_remote: bool,
) -> std::result::Result<SwitchBranchResult, String> {
    let runner = CliRunner::new("git");
    let service = BranchService::new(&runner);
    service
        .switch_branch(Path::new(&root_path), &target_name, is_remote)
        .map_err(|e| e.to_string())
}
