use serde::Deserialize;
use serde_json::Value;
use std::collections::HashMap;
use std::path::Path;
use std::sync::Mutex;
use std::time::Instant;
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
    AutoCheck {
        config: Option<tg_core::AutoAgentConfig>,
    },
}

static AUTO_AGENT_MANAGERS: Mutex<
    Option<std::collections::HashMap<String, tg_core::AutoAgentManager>>,
> = Mutex::new(None);

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
        let audit_target = root_path.clone();
        tg_core::journal::run(
            "workspace_task",
            &audit_target,
            "desktop:local",
            "desktop-session",
            || {
                if let WorkspaceRequest::AutoCheck { config } = &request {
                    return run_auto_check(Path::new(&root_path), config.clone());
                }
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
                    WorkspaceRequest::Compare { from, to } => {
                        value(workspace::compare(root, &from, &to))
                    }
                    WorkspaceRequest::Blame { path, start, count } => {
                        value(workspace::blame(root, &path, start, count))
                    }
                    WorkspaceRequest::History { action, target } => {
                        value(workspace::history_action(&runner, root, action, &target))
                    }
                    WorkspaceRequest::Snapshots => value(snapshot::list(root)),
                    WorkspaceRequest::Capture { label } => capture_manual_session(root, &label),
                    WorkspaceRequest::Finish { reference } => finish_session(root, &reference),
                    WorkspaceRequest::Changes { reference } => {
                        value(snapshot::changes(root, &reference))
                    }
                    WorkspaceRequest::Restore { reference, changes } => {
                        value(snapshot::restore(root, &reference, &changes))
                    }
                    WorkspaceRequest::Delete { reference } => delete_session(root, &reference),
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
                    WorkspaceRequest::AutoCheck { .. } => {
                        Err("自动检查不应持有工作区全局锁".into())
                    }
                }
            },
        )
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

fn repo_key(root: &Path) -> String {
    root.to_string_lossy().to_string()
}

fn manager_map() -> Result<
    std::sync::MutexGuard<'static, Option<HashMap<String, tg_core::AutoAgentManager>>>,
    String,
> {
    AUTO_AGENT_MANAGERS.lock().map_err(|err| err.to_string())
}

fn delete_baseline_refs(dropped: &[(String, String)]) {
    for (path, reference) in dropped {
        // The manager entry is already gone. A missing ref should not fail the check.
        let _ = snapshot::delete(Path::new(path), reference);
    }
}

enum AutoCheckDecision {
    Publish {
        report: tg_core::AutoCheckReport,
        retired: Vec<String>,
    },
    Discard(tg_core::AutoCheckReport),
    Fail(String),
}

fn run_auto_check(root: &Path, config: Option<tg_core::AutoAgentConfig>) -> Result<Value, String> {
    let now_ms = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64;
    let key = repo_key(root);

    let prepared = {
        let mut guard = manager_map()?;
        let map = guard.get_or_insert_with(HashMap::new);
        let dropped = tg_core::prune_idle_managers(map, Instant::now(), tg_core::MANAGER_IDLE_TTL);
        let manager = map
            .entry(key.clone())
            .or_insert_with(|| tg_core::AutoAgentManager::new(config.clone().unwrap_or_default()));
        if let Some(cfg) = config {
            manager.apply_config(cfg);
        }
        if manager.begin_check().is_none() {
            let report = manager.report_snapshot();
            drop(guard);
            delete_baseline_refs(&dropped);
            return value(Ok(report));
        }
        let generation = manager.generation;
        let working = manager.clone();
        let scan = working.sm.config.enabled;
        (generation, working, scan, dropped)
    };
    let (generation, mut working, scan, dropped) = prepared;
    delete_baseline_refs(&dropped);

    let procs = if scan {
        tg_core::cached_running_agent_processes()
    } else {
        Vec::new()
    };
    // Process scan and snapshot IO stay outside AUTO_AGENT_MANAGERS.
    let outcome = working.check_detached(root, Some(&procs), now_ms);

    let decision = {
        let mut guard = manager_map()?;
        let map = guard.get_or_insert_with(HashMap::new);
        let manager = map
            .entry(key)
            .or_insert_with(|| tg_core::AutoAgentManager::new(tg_core::AutoAgentConfig::default()));
        match outcome {
            Ok(report) => {
                if manager.generation == generation {
                    // Drop create/rewrite bookkeeping before installing the state,
                    // so a later rollback cannot delete this check's baseline.
                    let retired = working.take_retired_refs();
                    let committed = manager.commit_inflight(generation, working.clone());
                    if committed {
                        AutoCheckDecision::Publish { report, retired }
                    } else {
                        manager.abort_inflight(generation);
                        AutoCheckDecision::Discard(manager.report_snapshot())
                    }
                } else {
                    manager.abort_inflight(generation);
                    AutoCheckDecision::Discard(manager.report_snapshot())
                }
            }
            Err(err) => {
                let stale = manager.generation != generation;
                let current = manager.report_snapshot();
                manager.abort_inflight(generation);
                if stale {
                    AutoCheckDecision::Discard(current)
                } else {
                    AutoCheckDecision::Fail(err.to_string())
                }
            }
        }
    };

    match decision {
        AutoCheckDecision::Publish { report, retired } => {
            for reference in retired {
                let _ = snapshot::delete(root, &reference);
            }
            value(Ok(report))
        }
        AutoCheckDecision::Discard(report) => {
            working.rollback_side_effects(root);
            value(Ok(report))
        }
        AutoCheckDecision::Fail(err) => {
            working.rollback_side_effects(root);
            Err(err)
        }
    }
}

fn auto_session_matches(manager: &tg_core::AutoAgentManager, reference: &str) -> bool {
    matches!(
        &manager.sm.state,
        tg_core::AutoSessionState::Active {
            reference: active, ..
        } if active == reference
    )
}

fn capture_manual_session(root: &Path, label: &str) -> Result<Value, String> {
    let snap = start_manual_session(root, label)?;
    serde_json::to_value(snap).map_err(|err| err.to_string())
}

/// Manual and bridge starts share one gate: an active auto session, an open
/// agent snapshot, or an in-flight auto check cannot create a second baseline.
pub(crate) fn start_manual_session(root: &Path, label: &str) -> Result<snapshot::Snapshot, String> {
    let key = repo_key(root);
    let generation = {
        let mut guard = manager_map()?;
        let map = guard.get_or_insert_with(HashMap::new);
        let manager = map
            .entry(key)
            .or_insert_with(|| tg_core::AutoAgentManager::new(tg_core::AutoAgentConfig::default()));
        manager.hold_for_manual_start().map_err(str::to_string)?
    };
    let outcome = (|| {
        if snapshot::list(root)
            .map_err(|err| err.to_string())?
            .iter()
            .any(|snap| snap.kind == "agent")
        {
            return Err("已有未结束的会话，请先结束后再开始新会话".into());
        }
        snapshot::capture(root, label, "agent", None).map_err(|err| err.to_string())
    })();
    release_auto_reservation(root, Some(generation));
    outcome
}

fn reserve_auto_session(root: &Path, reference: &str) -> Result<Option<u64>, String> {
    let key = repo_key(root);
    let mut guard = manager_map()?;
    let Some(manager) = guard.as_mut().and_then(|map| map.get_mut(&key)) else {
        return Ok(None);
    };
    if !auto_session_matches(manager, reference) {
        return Ok(None);
    }
    Ok(Some(manager.reserve_user_mutation()))
}

fn release_auto_reservation(root: &Path, reserved: Option<u64>) {
    let Some(generation) = reserved else {
        return;
    };
    let key = repo_key(root);
    if let Ok(mut guard) = manager_map() {
        if let Some(manager) = guard.as_mut().and_then(|map| map.get_mut(&key)) {
            manager.release_user_mutation(generation);
        }
    }
}

/// Mark the auto session idle and arm the next baseline outside the manager lock.
fn settle_manual_end(root: &Path, reference: &str, reserved: u64) {
    let key = repo_key(root);
    let mut working = {
        let mut guard = match manager_map() {
            Ok(guard) => guard,
            Err(_) => return,
        };
        let Some(manager) = guard.as_mut().and_then(|map| map.get_mut(&key)) else {
            return;
        };
        if manager.generation != reserved {
            if auto_session_matches(manager, reference) {
                manager.mark_manual_end_observed();
                manager.in_flight = false;
            }
            return;
        }
        manager.mark_manual_end_observed();
        manager.clone()
    };
    let armed = working.arm_fresh_baseline(root);
    let retired = {
        let mut guard = match manager_map() {
            Ok(guard) => guard,
            Err(_) => {
                working.rollback_side_effects(root);
                return;
            }
        };
        let Some(manager) = guard.as_mut().and_then(|map| map.get_mut(&key)) else {
            drop(guard);
            working.rollback_side_effects(root);
            return;
        };
        if armed.is_ok() && manager.generation == working.generation {
            let retired = working.take_retired_refs();
            working.in_flight = false;
            let committed = manager.commit_inflight(working.generation, working.clone());
            if committed {
                retired
            } else {
                Vec::new()
            }
        } else {
            if manager.generation == working.generation {
                manager.in_flight = false;
            }
            drop(guard);
            working.rollback_side_effects(root);
            return;
        }
    };
    for reference in retired {
        let _ = snapshot::delete(root, &reference);
    }
}

fn finish_session(root: &Path, reference: &str) -> Result<Value, String> {
    let reserved = reserve_auto_session(root, reference)?;
    let finished = match snapshot::finish(root, reference) {
        Ok(snap) => snap,
        Err(err) => match snapshot::load(root, reference) {
            Ok(snap) if snap.kind == "agent_finished" => snap,
            _ => {
                release_auto_reservation(root, reserved);
                return Err(err.to_string());
            }
        },
    };
    if let Some(generation) = reserved {
        settle_manual_end(root, reference, generation);
    }
    serde_json::to_value(finished).map_err(|err| err.to_string())
}

fn delete_session(root: &Path, reference: &str) -> Result<Value, String> {
    let reserved = reserve_auto_session(root, reference)?;
    if let Err(err) = snapshot::delete(root, reference) {
        release_auto_reservation(root, reserved);
        return Err(err.to_string());
    }
    if let Some(generation) = reserved {
        settle_manual_end(root, reference, generation);
    }
    Ok(Value::Null)
}
