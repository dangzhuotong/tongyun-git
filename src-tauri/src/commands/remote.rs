use std::path::Path;
use tg_core::{
    CliRunner, FetchResult, MultiPushItemResult, PullResult, PullStrategy, PushInspection,
    PushResult, RemoteDetail, RemoteService,
};

#[tauri::command]
pub fn fetch_remote(
    root_path: String,
    remote: Option<String>,
    prune: bool,
) -> std::result::Result<FetchResult, String> {
    crate::journal_cmd::run("fetch_remote", &root_path, || {
        let runner = CliRunner::new("git");
        let service = RemoteService::new(&runner);
        service
            .fetch(Path::new(&root_path), remote.as_deref(), prune)
            .map_err(|e| e.to_string())
    })
}

#[tauri::command]
pub fn pull_remote(
    root_path: String,
    remote: Option<String>,
    branch: Option<String>,
    strategy: PullStrategy,
) -> std::result::Result<PullResult, String> {
    crate::journal_cmd::run("pull_remote", &root_path, || {
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
    })
}

#[tauri::command]
pub fn inspect_push(root_path: String) -> std::result::Result<PushInspection, String> {
    let runner = CliRunner::new("git");
    let service = RemoteService::new(&runner);
    service
        .inspect_push(Path::new(&root_path))
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn push_remote(
    root_path: String,
    remote: String,
    branch: String,
    set_upstream: bool,
) -> std::result::Result<PushResult, String> {
    crate::journal_cmd::run("push_remote", &root_path, || {
        let runner = CliRunner::new("git");
        let service = RemoteService::new(&runner);
        service
            .push(Path::new(&root_path), &remote, &branch, set_upstream)
            .map_err(|e| e.to_string())
    })
}

#[tauri::command]
pub fn clone_repository(
    url: String,
    target_path: String,
) -> std::result::Result<super::repo::RepoInfo, String> {
    crate::journal_cmd::run("clone_repository", "application", || {
        let p = Path::new(&target_path);
        let runner = CliRunner::new("git");
        let service = RemoteService::new(&runner);
        let res = service.clone_repo(&url, p).map_err(|e| e.to_string())?;
        if !res.success {
            return Err(res.error_message.unwrap_or(res.output));
        }
        super::repo::open_repository(target_path)
    })
}

#[tauri::command]
pub fn list_remotes(root_path: String) -> std::result::Result<Vec<RemoteDetail>, String> {
    let p = Path::new(&root_path);
    let runner = CliRunner::new("git");
    let service = RemoteService::new(&runner);
    service.list_remotes(p).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn push_multiple_remotes(
    root_path: String,
    remotes: Vec<String>,
    branch: String,
    set_upstream: bool,
) -> std::result::Result<Vec<MultiPushItemResult>, String> {
    crate::journal_cmd::run("push_multiple_remotes", &root_path, || {
        let p = Path::new(&root_path);
        let runner = CliRunner::new("git");
        let service = RemoteService::new(&runner);
        service
            .push_multiple(p, &remotes, &branch, set_upstream)
            .map_err(|e| e.to_string())
    })
}
