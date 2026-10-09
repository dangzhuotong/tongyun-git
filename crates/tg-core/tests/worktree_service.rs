use tg_core::{CliRunner, WorktreeService};

mod common;

#[test]
fn test_worktree_service_lifecycle() {
    let repo = common::basic();
    let runner = CliRunner::new("git");

    // Initially, there should be 1 main worktree
    let list = WorktreeService::list_worktrees(&runner, repo.path()).unwrap();
    assert_eq!(list.len(), 1);
    assert!(list[0].is_main);
    assert!(list[0].branch.is_some());

    // Add a new worktree
    let temp_parent = tempfile::tempdir().unwrap();
    let wt_path = temp_parent.path().join("wt-feature");
    let wt_str = wt_path.to_string_lossy().to_string();

    WorktreeService::add_worktree(&runner, repo.path(), &wt_str, Some("wt-branch"), true).unwrap();

    let list_after_add = WorktreeService::list_worktrees(&runner, repo.path()).unwrap();
    assert_eq!(list_after_add.len(), 2);
    assert!(list_after_add
        .iter()
        .any(|w| w.branch.as_deref() == Some("wt-branch")));

    // Test lock and unlock
    WorktreeService::lock_worktree(&runner, repo.path(), &wt_str, Some("working on feature"))
        .unwrap();
    let list_locked = WorktreeService::list_worktrees(&runner, repo.path()).unwrap();
    let locked_item = list_locked
        .iter()
        .find(|w| w.branch.as_deref() == Some("wt-branch"))
        .unwrap();
    assert!(locked_item.is_locked);
    assert_eq!(
        locked_item.lock_reason.as_deref(),
        Some("working on feature")
    );

    WorktreeService::unlock_worktree(&runner, repo.path(), &wt_str).unwrap();
    let list_unlocked = WorktreeService::list_worktrees(&runner, repo.path()).unwrap();
    let unlocked_item = list_unlocked
        .iter()
        .find(|w| w.branch.as_deref() == Some("wt-branch"))
        .unwrap();
    assert!(!unlocked_item.is_locked);

    // Test remove
    WorktreeService::remove_worktree(&runner, repo.path(), &wt_str, false).unwrap();
    let list_after_remove = WorktreeService::list_worktrees(&runner, repo.path()).unwrap();
    assert_eq!(list_after_remove.len(), 1);

    // Test prune
    WorktreeService::prune_worktrees(&runner, repo.path()).unwrap();
}
