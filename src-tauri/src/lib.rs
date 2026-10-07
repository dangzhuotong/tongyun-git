use serde::Serialize;
use tauri::AppHandle;

#[derive(Debug, Clone, Serialize)]
pub struct AppInfo {
    pub name: String,
    pub version: String,
    pub identifier: String,
    pub git_version: Option<String>,
    pub libgit2_version: String,
}

#[tauri::command]
fn app_info(app: AppHandle) -> AppInfo {
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

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![app_info])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
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
