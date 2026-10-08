use serde::Serialize;
use std::path::Path;
use tauri::AppHandle;
use tg_core::{CliRunner, CoreError, FileDiff, FileStatus, Git2Backend, GitBackend, HeadInfo};

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

#[derive(Debug, Clone, Serialize)]
pub struct RepoInfo {
    pub root_path: String,
    pub name: String,
    pub head: HeadInfo,
}

#[derive(Debug, Clone, Serialize)]
pub struct RepoStatusResult {
    pub head: HeadInfo,
    pub files: Vec<FileStatus>,
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

#[tauri::command]
fn check_git(custom_path: Option<String>) -> GitCheckResult {
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
fn open_repository(path: String) -> std::result::Result<RepoInfo, String> {
    let p = Path::new(&path);
    let backend = Git2Backend::open(p).map_err(|e| match e {
        CoreError::NotARepository => "这个文件夹不是 Git 仓库".to_string(),
        CoreError::BareRepository => "不支持裸仓库".to_string(),
        other => other.to_string(),
    })?;

    let root_path = backend.repo_root().to_string_lossy().to_string();
    let name = backend
        .repo_root()
        .file_name()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|| root_path.clone());
    let head = backend.head().map_err(|e| e.to_string())?;

    Ok(RepoInfo {
        root_path,
        name,
        head,
    })
}

#[tauri::command]
fn get_repo_status(root_path: String) -> std::result::Result<RepoStatusResult, String> {
    let p = Path::new(&root_path);
    let backend = Git2Backend::open(p).map_err(|e| e.to_string())?;
    let head = backend.head().map_err(|e| e.to_string())?;
    let files = backend.status().map_err(|e| e.to_string())?;

    Ok(RepoStatusResult { head, files })
}

#[tauri::command]
fn get_file_diff(
    root_path: String,
    path: String,
    staged: bool,
) -> std::result::Result<FileDiff, String> {
    let p = Path::new(&root_path);
    let backend = Git2Backend::open(p).map_err(|e| e.to_string())?;
    let diff = backend
        .diff_file(&path, staged)
        .map_err(|e| e.to_string())?;
    Ok(diff)
}

#[tauri::command]
fn stage_files(root_path: String, paths: Vec<String>) -> std::result::Result<(), String> {
    let p = Path::new(&root_path);
    let backend = Git2Backend::open(p).map_err(|e| e.to_string())?;
    let path_slices: Vec<&str> = paths.iter().map(|s| s.as_str()).collect();
    backend
        .stage_files(&path_slices)
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn unstage_files(root_path: String, paths: Vec<String>) -> std::result::Result<(), String> {
    let p = Path::new(&root_path);
    let backend = Git2Backend::open(p).map_err(|e| e.to_string())?;
    let path_slices: Vec<&str> = paths.iter().map(|s| s.as_str()).collect();
    backend
        .unstage_files(&path_slices)
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn stage_lines(
    root_path: String,
    path: String,
    hunk_index: usize,
    selected_line_indices: Vec<usize>,
    reverse: bool,
    is_new_file: bool,
) -> std::result::Result<(), String> {
    let p = Path::new(&root_path);
    let backend = Git2Backend::open(p).map_err(|e| e.to_string())?;
    let diff = backend
        .diff_file(&path, reverse)
        .map_err(|e| e.to_string())?;
    let hunk = diff
        .hunks
        .get(hunk_index)
        .ok_or_else(|| "未找到对应的 Hunk".to_string())?;

    let patch =
        tg_core::build_selected_patch(&path, hunk, &selected_line_indices, reverse, is_new_file)
            .map_err(|e| e.to_string())?;

    tg_core::apply_patch_to_index(p, &patch).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn inspect_discard(
    root_path: String,
    paths: Vec<String>,
) -> std::result::Result<Vec<tg_core::DiscardCandidate>, String> {
    let p = Path::new(&root_path);
    let path_slices: Vec<&str> = paths.iter().map(|s| s.as_str()).collect();
    tg_core::DiscardService::inspect_candidates(p, &path_slices).map_err(|e| e.to_string())
}

#[tauri::command]
fn discard_files(
    root_path: String,
    paths: Vec<String>,
) -> std::result::Result<tg_core::DiscardResult, String> {
    let p = Path::new(&root_path);
    let path_slices: Vec<&str> = paths.iter().map(|s| s.as_str()).collect();
    tg_core::DiscardService::discard_files(p, &path_slices).map_err(|e| e.to_string())
}

#[tauri::command]
fn undo_discard(
    root_path: String,
    skip_conflict: bool,
) -> std::result::Result<tg_core::UndoDiscardResult, String> {
    let p = Path::new(&root_path);
    tg_core::DiscardService::undo_last_discard(p, skip_conflict).map_err(|e| e.to_string())
}

pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            app_info,
            check_git,
            open_repository,
            get_repo_status,
            get_file_diff,
            stage_files,
            unstage_files,
            stage_lines,
            inspect_discard,
            discard_files,
            undo_discard
        ])
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
