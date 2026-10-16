use serde::Serialize;
use std::path::Path;
use tg_core::{CoreError, FileDiff, FileStatus, Git2Backend, GitBackend, HeadInfo, TreeFile};

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
pub fn open_repository(path: String) -> std::result::Result<RepoInfo, String> {
    let clean_path = path.trim().trim_matches('"').trim_matches('\'').trim();
    let p = Path::new(clean_path);
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

    crate::bridge::set_active_repo(&root_path);

    Ok(RepoInfo {
        root_path,
        name,
        head,
    })
}

#[tauri::command]
pub fn init_repository(path: String) -> std::result::Result<RepoInfo, String> {
    let audit_target = path.clone();
    crate::journal_cmd::run("init_repository", &audit_target, || {
        let p = Path::new(&path);
        if !p.exists() {
            return Err("指定的路径不存在".to_string());
        }
        Git2Backend::init(p).map_err(|e| e.to_string())?;
        open_repository(path)
    })
}

#[tauri::command]
pub fn get_repo_status(root_path: String) -> std::result::Result<RepoStatusResult, String> {
    let p = Path::new(&root_path);
    let backend = Git2Backend::open(p).map_err(|e| e.to_string())?;
    let head = backend.head().map_err(|e| e.to_string())?;
    let files = backend.status().map_err(|e| e.to_string())?;

    Ok(RepoStatusResult { head, files })
}

#[tauri::command]
pub fn list_repo_files(root_path: String) -> std::result::Result<Vec<TreeFile>, String> {
    let clean_path = root_path.trim().trim_matches('"').trim_matches('\'').trim();
    let p = Path::new(clean_path);
    let backend = Git2Backend::open(p).map_err(|e| e.to_string())?;
    let files = backend.list_repo_files().map_err(|e| e.to_string())?;
    Ok(files)
}

#[tauri::command]
pub fn get_file_diff(
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
