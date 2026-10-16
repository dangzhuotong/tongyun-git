use serde::Serialize;
use tauri::AppHandle;
use tg_core::{
    clear_operation_logs as tg_clear_operation_logs, get_operation_logs as tg_get_operation_logs,
    CliRunner,
};

#[derive(Debug, Clone, Serialize)]
pub struct AppInfo {
    pub name: String,
    pub version: String,
    pub identifier: String,
    pub git_version: Option<String>,
    pub libgit2_version: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct GitCheckResult {
    pub available: bool,
    pub version: Option<String>,
    pub error: Option<String>,
}

#[tauri::command]
pub fn app_info(app: AppHandle) -> AppInfo {
    let name = app
        .config()
        .product_name
        .clone()
        .unwrap_or_else(|| app.package_info().name.clone());
    let version = app.package_info().version.to_string();
    let identifier = app.config().identifier.clone();
    let git_version = tg_core::CliRunner::new("git").version().ok();
    let libgit2_version = tg_core::libgit2_version();

    AppInfo {
        name,
        version,
        identifier,
        git_version,
        libgit2_version,
    }
}

#[tauri::command]
pub fn check_git(custom_path: Option<String>) -> GitCheckResult {
    let git_cmd = custom_path.unwrap_or_else(|| "git".to_string());
    let runner = CliRunner::new(&git_cmd);
    match runner.version() {
        Ok(v) => GitCheckResult {
            available: true,
            version: Some(v),
            error: None,
        },
        Err(e) => GitCheckResult {
            available: false,
            version: None,
            error: Some(e.to_string()),
        },
    }
}

#[tauri::command]
pub fn get_operation_logs() -> Vec<serde_json::Value> {
    let mut entries = tg_get_operation_logs()
        .into_iter()
        .filter_map(|entry| serde_json::to_value(entry).ok())
        .collect::<Vec<_>>();
    // A corrupt audit file is skipped inside journal::history. If the directory
    // itself cannot be read, keep the in-memory CLI output instead of failing the panel.
    if let Ok(events) = tg_core::journal::history() {
        entries.extend(events.into_iter().rev().take(200).map(|event| {
            serde_json::json!({
                "id": format!("{}-{}", event.operation_id, event.phase),
                "operation_id": event.operation_id,
                "timestamp_ms": event.timestamp_ms,
                "command_line": event.action,
                "cwd": event.target,
                "duration_ms": 0,
                "exit_code": null,
                "audit_phase": event.phase,
                "audit_outcome": event.outcome,
                "actor": event.actor,
                "task_id": event.task_id,
            })
        }));
    }
    entries
        .sort_by_key(|entry| std::cmp::Reverse(entry["timestamp_ms"].as_u64().unwrap_or_default()));
    entries.truncate(200);
    entries
}

#[tauri::command]
pub fn operation_history() -> Result<Vec<tg_core::audit::Event>, String> {
    tg_core::journal::history().map_err(|_| "AUDIT_UNAVAILABLE".into())
}

#[tauri::command]
pub fn clear_operation_logs() {
    tg_clear_operation_logs();
}

#[tauri::command]
pub async fn select_folder() -> Option<String> {
    let folder = rfd::AsyncFileDialog::new().pick_folder().await;
    folder.map(|f| f.path().to_string_lossy().to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_app_info_struct() {
        let info = AppInfo {
            name: "test-app".to_string(),
            version: "0.0.0".to_string(),
            identifier: "test-identifier".to_string(),
            git_version: Some("2.47.3".to_string()),
            libgit2_version: "1.9.0".to_string(),
        };
        let json = serde_json::to_string(&info).expect("serialize should succeed");
        assert!(json.contains("\"git_version\":\"2.47.3\""));
        assert!(json.contains("\"libgit2_version\":\"1.9.0\""));
    }
}
