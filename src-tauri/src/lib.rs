use serde::Serialize;
use std::path::Path;
use tauri::{AppHandle, Manager};
use tg_core::{
    clear_operation_logs as tg_clear_operation_logs, get_operation_logs as tg_get_operation_logs,
    AbortResult, AiService, AiSettings, BranchItem, BranchService, CliRunner, CommitDetails,
    CommitService, CoreError, FetchResult, FileDiff, FileStatus, Git2Backend, GitBackend, HeadInfo,
    KeyringStore, LogQuery, LogResult, LogService, OperationLogEntry, PullResult, PullStrategy,
    PushInspection, PushResult, RemoteService, RunOptions, SecretFilter, SwitchBranchResult,
    SystemKeyring, ValidationResult,
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
fn init_repository(path: String) -> std::result::Result<RepoInfo, String> {
    let p = Path::new(&path);
    if !p.exists() {
        return Err("指定的路径不存在".to_string());
    }
    Git2Backend::init(p).map_err(|e| e.to_string())?;
    open_repository(path)
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

#[derive(Debug, Clone, Serialize)]
pub struct AiKeyStatus {
    pub kie: bool,
    pub openai: bool,
    pub ollama: bool,
    pub keyring_available: bool,
}

#[tauri::command]
fn check_commit_identity(
    root_path: String,
) -> std::result::Result<Option<tg_core::GitIdentity>, String> {
    let p = Path::new(&root_path);
    let runner = CliRunner::new("git");
    CommitService::check_identity(&runner, p).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_head_message(root_path: String) -> std::result::Result<Option<String>, String> {
    let p = Path::new(&root_path);
    CommitService::get_head_message(p).map_err(|e| e.to_string())
}

#[tauri::command]
fn inspect_amend(root_path: String) -> std::result::Result<tg_core::AmendStatus, String> {
    let p = Path::new(&root_path);
    let runner = CliRunner::new("git");
    CommitService::inspect_amend(&runner, p).map_err(|e| e.to_string())
}

#[tauri::command]
fn create_commit(
    root_path: String,
    message: String,
    amend: bool,
) -> std::result::Result<tg_core::CommitResult, String> {
    let p = Path::new(&root_path);
    let runner = CliRunner::new("git");
    CommitService::commit(&runner, p, &message, amend).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_ai_key_status() -> std::result::Result<AiKeyStatus, String> {
    let keyring = SystemKeyring;
    let available = keyring.is_available();
    let kie = if available {
        keyring.get_key("kie").map(|k| k.is_some()).unwrap_or(false)
    } else {
        false
    };
    let openai = if available {
        keyring
            .get_key("openai")
            .map(|k| k.is_some())
            .unwrap_or(false)
    } else {
        false
    };
    let ollama = if available {
        keyring
            .get_key("ollama")
            .map(|k| k.is_some())
            .unwrap_or(false)
    } else {
        false
    };

    Ok(AiKeyStatus {
        kie,
        openai,
        ollama,
        keyring_available: available,
    })
}

#[tauri::command]
fn save_ai_key(provider: String, key: String) -> std::result::Result<(), String> {
    let keyring = SystemKeyring;
    if !keyring.is_available() {
        return Err("系统钥匙串不可用，无法安全存储 Key".to_string());
    }
    keyring.set_key(&provider, &key).map_err(|e| e.to_string())
}

#[tauri::command]
fn delete_ai_key(provider: String) -> std::result::Result<(), String> {
    let keyring = SystemKeyring;
    keyring.delete_key(&provider).map_err(|e| e.to_string())
}

#[tauri::command]
async fn test_ai_connection(settings: AiSettings) -> std::result::Result<String, String> {
    let keyring = SystemKeyring;
    AiService::test_connection(&settings, &keyring)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn fetch_ollama_models(base_url: Option<String>) -> std::result::Result<Vec<String>, String> {
    AiService::fetch_ollama_models(base_url.as_deref())
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn generate_ai_commit_message(
    root_path: String,
    settings: AiSettings,
) -> std::result::Result<String, String> {
    let p = Path::new(&root_path);
    let backend = Git2Backend::open(p).map_err(|e| e.to_string())?;

    // 1. Get current branch
    let head = backend.head().map_err(|e| e.to_string())?;
    let branch = head.branch.unwrap_or_else(|| "HEAD".to_string());

    // 2. Get recent commits for style reference
    let runner = CliRunner::new("git");
    let log_res = runner.run(p, &["log", "-n", "10", "--oneline"], RunOptions::default());
    let recent_commits: Vec<String> = match log_res {
        Ok(out) if out.exit_code == Some(0) => out.stdout.lines().map(|s| s.to_string()).collect(),
        _ => Vec::new(),
    };

    // 3. Collect staged diffs
    let status_files = backend.status().map_err(|e| e.to_string())?;
    let staged_files: Vec<_> = status_files
        .into_iter()
        .filter(|f| f.index.is_some())
        .collect();

    if staged_files.is_empty() {
        return Err("当前没有已暂存的改动，请先暂存文件".to_string());
    }

    let mut staged_diffs = Vec::new();
    for file in staged_files {
        if let Ok(diff) = backend.diff_file(&file.path, true) {
            staged_diffs.push(diff);
        }
    }

    // 4. Sanitize and filter sensitive contents
    let sanitized_diff = SecretFilter::build_sanitized_diff(
        &staged_diffs,
        &settings.custom_secret_patterns,
        settings.max_diff_chars,
    );

    // 5. Generate message via AI
    let keyring = SystemKeyring;
    AiService::generate_commit_message(
        &settings,
        &keyring,
        &branch,
        &recent_commits,
        &sanitized_diff,
    )
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
fn list_branches(root_path: String) -> std::result::Result<Vec<BranchItem>, String> {
    let runner = CliRunner::new("git");
    let service = BranchService::new(&runner);
    service
        .list_branches(Path::new(&root_path))
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn validate_branch_name(
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
fn create_branch(
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
fn switch_branch(
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

#[tauri::command]
fn get_commit_log(root_path: String, query: LogQuery) -> std::result::Result<LogResult, String> {
    LogService::get_log(Path::new(&root_path), query).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_commit_details(
    root_path: String,
    oid: String,
) -> std::result::Result<CommitDetails, String> {
    LogService::get_commit_details(Path::new(&root_path), &oid).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_commit_file_diff(
    root_path: String,
    oid: String,
    file_path: String,
) -> std::result::Result<FileDiff, String> {
    LogService::get_commit_file_diff(Path::new(&root_path), &oid, &file_path)
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn fetch_remote(
    root_path: String,
    remote: Option<String>,
    prune: bool,
) -> std::result::Result<FetchResult, String> {
    let runner = CliRunner::new("git");
    let service = RemoteService::new(&runner);
    service
        .fetch(Path::new(&root_path), remote.as_deref(), prune)
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn pull_remote(
    root_path: String,
    remote: Option<String>,
    branch: Option<String>,
    strategy: PullStrategy,
) -> std::result::Result<PullResult, String> {
    let runner = CliRunner::new("git");
    let service = RemoteService::new(&runner);
    service
        .pull(
            Path::new(&root_path),
            remote.as_deref(),
            branch.as_deref(),
            strategy,
        )
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn inspect_push(root_path: String) -> std::result::Result<PushInspection, String> {
    let runner = CliRunner::new("git");
    let service = RemoteService::new(&runner);
    service
        .inspect_push(Path::new(&root_path))
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn push_remote(
    root_path: String,
    remote: String,
    branch: String,
    set_upstream: bool,
) -> std::result::Result<PushResult, String> {
    let runner = CliRunner::new("git");
    let service = RemoteService::new(&runner);
    service
        .push(Path::new(&root_path), &remote, &branch, set_upstream)
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn abort_merge_or_rebase(root_path: String) -> std::result::Result<AbortResult, String> {
    let runner = CliRunner::new("git");
    let service = RemoteService::new(&runner);
    service
        .abort_action(Path::new(&root_path))
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn get_operation_logs() -> Vec<OperationLogEntry> {
    tg_get_operation_logs()
}

#[tauri::command]
fn clear_operation_logs() {
    tg_clear_operation_logs();
}

#[tauri::command]
async fn select_folder() -> Option<String> {
    let folder = rfd::AsyncFileDialog::new().pick_folder().await;
    folder.map(|f| f.path().to_string_lossy().to_string())
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
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
            undo_discard,
            check_commit_identity,
            get_head_message,
            inspect_amend,
            create_commit,
            get_ai_key_status,
            save_ai_key,
            delete_ai_key,
            test_ai_connection,
            fetch_ollama_models,
            generate_ai_commit_message,
            list_branches,
            validate_branch_name,
            create_branch,
            switch_branch,
            get_commit_log,
            get_commit_details,
            get_commit_file_diff,
            fetch_remote,
            pull_remote,
            inspect_push,
            push_remote,
            abort_merge_or_rebase,
            get_operation_logs,
            clear_operation_logs,
            select_folder,
            init_repository
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
