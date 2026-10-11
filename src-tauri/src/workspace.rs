use serde::Deserialize;
use serde_json::Value;
use std::path::Path;
use std::sync::Mutex;
use tg_core::{snapshot, workspace, CliRunner};

static WORKSPACE_LOCK: Mutex<()> = Mutex::new(());

#[derive(Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum WorkspaceRequest {
    Overview,
    Compare {
        from: String,
        to: String,
    },
    Blame {
        path: String,
        start: usize,
        count: usize,
    },
    History {
        action: workspace::HistoryAction,
        target: String,
    },
    Snapshots,
    Capture {
        label: String,
    },
    Finish {
        reference: String,
    },
    Changes {
        reference: String,
    },
    Restore {
        reference: String,
        changes: Vec<snapshot::SnapshotChange>,
    },
    Delete {
        reference: String,
    },
    Shelve {
        label: String,
        paths: Vec<String>,
    },
    DiscardLines {
        expected: tg_core::FileDiff,
        hunk_index: usize,
        selected: Vec<usize>,
    },
    Open {
        application: String,
    },
}

fn value<T: serde::Serialize>(result: tg_core::Result<T>) -> Result<Value, String> {
    serde_json::to_value(result.map_err(|e| e.to_string())?).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn workspace_task(
    root_path: String,
    git_path: Option<String>,
    request: WorkspaceRequest,
) -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = WORKSPACE_LOCK
            .lock()
            .map_err(|_| "工作区操作锁不可用".to_string())?;
        let backend =
            tg_core::Git2Backend::open(Path::new(&root_path)).map_err(|e| e.to_string())?;
        use tg_core::GitBackend;
        let root = backend.repo_root();
        let runner = CliRunner::new(
            git_path
                .filter(|p| !p.is_empty())
                .unwrap_or_else(|| "git".into()),
        );
        match request {
            WorkspaceRequest::Overview => value(workspace::overview(&runner, root)),
            WorkspaceRequest::Compare { from, to } => value(workspace::compare(root, &from, &to)),
            WorkspaceRequest::Blame { path, start, count } => {
                value(workspace::blame(root, &path, start, count))
            }
            WorkspaceRequest::History { action, target } => {
                value(workspace::history_action(&runner, root, action, &target))
            }
            WorkspaceRequest::Snapshots => value(snapshot::list(root)),
            WorkspaceRequest::Capture { label } => {
                value(snapshot::capture(root, &label, "agent", None))
            }
            WorkspaceRequest::Finish { reference } => value(snapshot::finish(root, &reference)),
            WorkspaceRequest::Changes { reference } => value(snapshot::changes(root, &reference)),
            WorkspaceRequest::Restore { reference, changes } => {
                value(snapshot::restore(root, &reference, &changes))
            }
            WorkspaceRequest::Delete { reference } => value(snapshot::delete(root, &reference)),
            WorkspaceRequest::Shelve { label, paths } => {
                value(snapshot::shelve(root, &label, &paths))
            }
            WorkspaceRequest::DiscardLines {
                expected,
                hunk_index,
                selected,
            } => value(snapshot::discard_lines(
                root, &expected, hunk_index, &selected,
            )),
            WorkspaceRequest::Open { application } => {
                open_external(root, &application)?;
                Ok(Value::Null)
            }
        }
    })
    .await
    .map_err(|e| e.to_string())?
}

fn open_external(root: &Path, app: &str) -> Result<(), String> {
    use std::process::Command;
    #[cfg(target_os = "macos")]
    let mut command = {
        let mut cmd = Command::new("open");
        match app {
            "idea" => {
                cmd.args(["-a", "IntelliJ IDEA"]);
            }
            "terminal" => {
                cmd.args(["-a", "Terminal"]);
            }
            "folder" => {}
            _ => return Err("未知应用".into()),
        }
        cmd
    };
    #[cfg(target_os = "windows")]
    let mut command = match app {
        "idea" => Command::new("idea64.exe"),
        "terminal" => {
            let mut cmd = Command::new("wt.exe");
            cmd.arg("-d");
            cmd
        }
        "folder" => Command::new("explorer.exe"),
        _ => return Err("未知应用".into()),
    };
    #[cfg(target_os = "linux")]
    let mut command = match app {
        "idea" => Command::new("idea"),
        "terminal" => {
            let mut cmd = Command::new("x-terminal-emulator");
            cmd.arg("--working-directory");
            cmd
        }
        "folder" => Command::new("xdg-open"),
        _ => return Err("未知应用".into()),
    };
    command
        .arg(root)
        .spawn()
        .map_err(|e| format!("无法打开应用，请确认已安装并配置启动器：{e}"))?;
    Ok(())
}
