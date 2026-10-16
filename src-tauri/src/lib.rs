mod bridge;
mod commands;
mod journal_cmd;
mod workspace;

pub use commands::{AiKeyStatus, AppInfo, GitCheckResult, RepoInfo, RepoStatusResult};
use tauri::Manager;

pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            bridge::start_bridge_server(app.handle().clone());
            tg_core::journal::configure(&app.path().app_data_dir()?.join("audit"))?;
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
