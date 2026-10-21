mod bridge;
mod commands;
mod journal_cmd;
mod workspace;

pub use commands::{AiKeyStatus, AppInfo, GitCheckResult, RepoInfo, RepoStatusResult};
use tauri::Manager;

/// Record a failed startup import. The journal stores the error text and no
/// secret; `eprintln` is invisible in a packaged app. The marker stays
/// unwritten, so the next launch retries.
fn log_ai_key_migration_failure(detail: &str) {
    let _ = tg_core::journal::run(
        "migrate_ai_keys",
        detail,
        "desktop:local",
        "startup",
        || Err::<(), String>("migrate_ai_keys failed".to_string()),
    );
}

#[cfg(test)]
pub(crate) fn lock_desktop_state() -> std::sync::MutexGuard<'static, ()> {
    static LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());
    LOCK.lock().unwrap_or_else(|err| err.into_inner())
}

pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            bridge::start_bridge_server(app.handle().clone());
            let data_dir = app.path().app_data_dir()?;
            tg_core::configure_secret_dir(&data_dir.join("secrets"))?;
            tg_core::journal::configure(&data_dir.join("audit"))?;
            // Import existing keychain items once. A failure leaves the marker
            // unwritten so the next launch can retry. It does not block startup,
            // and later saves do not open the keychain.
            if let Ok(store) = tg_core::SystemKeyring::from_config() {
                if let Err(err) = store.migrate_from_os_keychain() {
                    log_ai_key_migration_failure(&err.to_string());
                }
            }
            Ok(())
        })
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            commands::operation_history,
            workspace::workspace_task,
            commands::app_info,
            commands::check_git,
            commands::open_repository,
            commands::get_repo_status,
            commands::list_repo_files,
            commands::get_file_diff,
            commands::stage_files,
            commands::unstage_files,
            commands::stage_lines,
            commands::inspect_discard,
            commands::discard_files,
            commands::undo_discard,
            commands::check_commit_identity,
            commands::set_commit_identity,
            commands::get_head_message,
            commands::inspect_amend,
            commands::create_commit,
            commands::get_external_commit_draft,
            commands::clear_external_commit_draft,
            commands::get_ai_key_status,
            commands::save_ai_key,
            commands::delete_ai_key,
            commands::test_ai_connection,
            commands::fetch_ollama_models,
            commands::generate_ai_commit_message,
            commands::review_staged_diff,
            commands::ai_search_log,
            commands::list_branches,
            commands::validate_branch_name,
            commands::create_branch,
            commands::switch_branch,
            commands::get_commit_log,
            commands::get_commit_details,
            commands::get_commit_file_diff,
            commands::fetch_remote,
            commands::pull_remote,
            commands::inspect_push,
            commands::push_remote,
            commands::abort_merge_or_rebase,
            commands::get_operation_logs,
            commands::clear_operation_logs,
            commands::select_folder,
            commands::init_repository,
            commands::clone_repository,
            commands::list_remotes,
            commands::push_multiple_remotes,
            commands::list_stashes,
            commands::create_stash,
            commands::apply_stash,
            commands::drop_stash,
            commands::clear_stashes,
            commands::show_stash_diff,
            commands::list_tags,
            commands::create_tag,
            commands::delete_tag,
            commands::push_tag,
            commands::push_all_tags,
            commands::delete_remote_tag,
            commands::get_file_history,
            commands::checkout_commit,
            commands::reset_to_commit,
            commands::list_conflicts,
            commands::get_conflict_details,
            commands::resolve_conflict_file,
            commands::accept_ours,
            commands::accept_theirs,
            commands::continue_merge_or_rebase,
            commands::get_rebase_commits,
            commands::execute_interactive_rebase,
            commands::list_worktrees,
            commands::add_worktree,
            commands::remove_worktree,
            commands::lock_worktree,
            commands::unlock_worktree,
            commands::prune_worktrees,
            commands::get_bridge_info,
            commands::get_agent_intent,
            commands::clear_agent_intent
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use std::fs;
    use std::path::PathBuf;
    use std::sync::atomic::{AtomicU64, Ordering};
    use std::time::{SystemTime, UNIX_EPOCH};

    struct Tmp(PathBuf);

    impl Tmp {
        fn new() -> Self {
            static N: AtomicU64 = AtomicU64::new(0);
            let n = N.fetch_add(1, Ordering::Relaxed);
            let nanos = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map(|d| d.as_nanos())
                .unwrap_or(0);
            let dir = std::env::temp_dir().join(format!("tg-journal-{nanos}-{n}"));
            let _ = fs::remove_dir_all(&dir);
            fs::create_dir_all(&dir).unwrap();
            Self(dir)
        }
    }

    impl Drop for Tmp {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    #[test]
    fn migration_failure_is_written_to_the_journal() {
        let _guard = super::lock_desktop_state();
        let dir = Tmp::new();
        tg_core::journal::configure(&dir.0).unwrap();
        super::log_ai_key_migration_failure("Platform secure storage failure: user canceled");
        let events = tg_core::journal::history().unwrap();
        assert!(events.iter().any(|event| {
            event.action == "migrate_ai_keys"
                && event.phase == "finished"
                && event.outcome.as_deref() == Some(tg_core::audit::OUTCOME_FAILED_OR_UNKNOWN)
                && event.target.contains("user canceled")
                && !event.target.contains("fixture-key")
        }));
    }
}
