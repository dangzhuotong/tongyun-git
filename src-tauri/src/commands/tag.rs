use std::path::Path;
use tg_core::{CliRunner, TagItem, TagService};

#[tauri::command]
pub fn list_tags(root_path: String) -> std::result::Result<Vec<TagItem>, String> {
    let clean_path = root_path.trim().trim_matches('"').trim_matches('\'').trim();
    let p = Path::new(clean_path);
    TagService::list_tags(p).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn create_tag(
    root_path: String,
    name: String,
    target_oid: Option<String>,
    message: Option<String>,
) -> std::result::Result<TagItem, String> {
    let clean_path = root_path.trim().trim_matches('"').trim_matches('\'').trim();
    let p = Path::new(clean_path);
    let runner = CliRunner::new("git");
    TagService::create_tag(&runner, p, &name, target_oid.as_deref(), message.as_deref())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_tag(root_path: String, name: String) -> std::result::Result<(), String> {
    let clean_path = root_path.trim().trim_matches('"').trim_matches('\'').trim();
    let p = Path::new(clean_path);
    let runner = CliRunner::new("git");
    TagService::delete_tag(&runner, p, &name).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn push_tag(
    root_path: String,
    name: String,
    remote: Option<String>,
) -> std::result::Result<(), String> {
    let clean_path = root_path.trim().trim_matches('"').trim_matches('\'').trim();
    let p = Path::new(clean_path);
    let runner = CliRunner::new("git");
    TagService::push_tag(&runner, p, &name, remote.as_deref()).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn push_all_tags(root_path: String, remote: Option<String>) -> std::result::Result<(), String> {
    let clean_path = root_path.trim().trim_matches('"').trim_matches('\'').trim();
    let p = Path::new(clean_path);
    let runner = CliRunner::new("git");
    TagService::push_all_tags(&runner, p, remote.as_deref()).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_remote_tag(
    root_path: String,
    name: String,
    remote: Option<String>,
) -> std::result::Result<(), String> {
    let clean_path = root_path.trim().trim_matches('"').trim_matches('\'').trim();
    let p = Path::new(clean_path);
    let runner = CliRunner::new("git");
    TagService::delete_remote_tag(&runner, p, &name, remote.as_deref()).map_err(|e| e.to_string())
}
