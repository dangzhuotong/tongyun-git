use std::path::Path;
use tg_core::{Git2Backend, GitBackend};

#[tauri::command]
pub fn get_bridge_info() -> crate::bridge::BridgeStatus {
    if let Some(bridge) = crate::bridge::get_bridge() {
        let port = *bridge.bound_port.lock().unwrap_or_else(|e| e.into_inner());
        let active_repo_opt = bridge.active_repo.read().ok().and_then(|r| r.clone());
        let summary = active_repo_opt.and_then(|root| {
            let p = Path::new(&root);
            let backend = Git2Backend::open(p).ok()?;
            let head = backend.head().ok()?;
            let files = backend.status().ok()?;

            let mut staged_count = 0;
            let mut unstaged_count = 0;
            let mut untracked_count = 0;
            let mut conflicts_count = 0;

            for f in files {
                if f.conflicted {
                    conflicts_count += 1;
                }
                if f.index.is_some() {
                    staged_count += 1;
                }
                if f.worktree.is_some() {
                    unstaged_count += 1;
                }
                if f.worktree == Some(tg_core::ChangeKind::Untracked) {
                    untracked_count += 1;
                }
            }

            let name = backend
                .repo_root()
                .file_name()
                .map(|s| s.to_string_lossy().to_string())
                .unwrap_or_else(|| root.clone());

            Some(crate::bridge::ActiveRepoSummary {
                root_path: root,
                name,
                branch: head.branch,
                head_oid: head.oid,
                staged_count,
                unstaged_count,
                untracked_count,
                conflicts_count,
            })
        });

        crate::bridge::BridgeStatus {
            online: true,
            port,
            version: "0.1.1".to_string(),
            active_repo: summary,
        }
    } else {
        crate::bridge::BridgeStatus {
            online: false,
            port: 0,
            version: "0.1.1".to_string(),
            active_repo: None,
        }
    }
}

#[tauri::command]
pub fn get_agent_intent() -> Option<crate::bridge::AgentIntent> {
    crate::bridge::get_bridge().and_then(|b| b.latest_intent.read().ok().and_then(|i| i.clone()))
}

#[tauri::command]
pub fn clear_agent_intent() {
    if let Some(bridge) = crate::bridge::get_bridge() {
        if let Ok(mut lock) = bridge.latest_intent.write() {
            *lock = None;
        }
    }
}
