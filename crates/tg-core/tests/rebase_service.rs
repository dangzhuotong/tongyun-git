use std::fs;
use tg_core::{CliRunner, RebaseAction, RebasePlan, RebaseService};

mod common;

#[test]
fn test_rebase_service_reword_and_fixup() {
    let repo = common::basic();
    let runner = CliRunner::new("git");

    // Commit 1: base commit (from common::basic)
    let base_oid = repo.head_commit_id();

    // Commit 2
    let file2 = repo.path().join("file2.txt");
    fs::write(&file2, "content 2\n").unwrap();
    repo.git(&["add", "file2.txt"]);
    repo.git(&["commit", "-m", "feature commit 2"]);
    let c2_oid = repo.head_commit_id();

    // Commit 3
    let file3 = repo.path().join("file3.txt");
    fs::write(&file3, "content 3\n").unwrap();
    repo.git(&["add", "file3.txt"]);
    repo.git(&["commit", "-m", "feature commit 3"]);
    let c3_oid = repo.head_commit_id();

    // Test get_rebase_commits
    let items = RebaseService::get_rebase_commits(repo.path(), &base_oid).unwrap();
    assert_eq!(items.len(), 2);
    assert_eq!(items[0].oid, c2_oid);
    assert_eq!(items[0].summary, "feature commit 2");
    assert_eq!(items[1].oid, c3_oid);
    assert_eq!(items[1].summary, "feature commit 3");

    // Build plan: Reword commit 2, and Fixup commit 3 into commit 2!
    let mut plan_items = items.clone();
    plan_items[0].action = RebaseAction::Reword;
    plan_items[0].new_message = Some("reworded feature commit 2 and 3".to_string());
    plan_items[1].action = RebaseAction::Fixup;

    let plan = RebasePlan {
        base_oid: base_oid.clone(),
        items: plan_items,
    };

    let result = RebaseService::execute_interactive_rebase(&runner, repo.path(), &plan).unwrap();
    assert!(result.success);
    assert!(!result.has_conflict);

    // Verify commit history after rebase
    let new_head_oid = repo.head_commit_id();
    assert_ne!(new_head_oid, c3_oid);

    let items_after = RebaseService::get_rebase_commits(repo.path(), &base_oid).unwrap();
    assert_eq!(items_after.len(), 1);
    assert_eq!(items_after[0].summary, "reworded feature commit 2 and 3");

    // Both files should exist in working tree
    assert!(repo.path().join("file2.txt").exists());
    assert!(repo.path().join("file3.txt").exists());
}

#[test]
fn test_rebase_service_drop_commit() {
    let repo = common::basic();
    let runner = CliRunner::new("git");

    let base_oid = repo.head_commit_id();

    let file_keep = repo.path().join("keep.txt");
    fs::write(&file_keep, "keep\n").unwrap();
    repo.git(&["add", "keep.txt"]);
    repo.git(&["commit", "-m", "commit keep"]);

    let file_drop = repo.path().join("drop.txt");
    fs::write(&file_drop, "drop\n").unwrap();
    repo.git(&["add", "drop.txt"]);
    repo.git(&["commit", "-m", "commit drop"]);

    let items = RebaseService::get_rebase_commits(repo.path(), &base_oid).unwrap();
    assert_eq!(items.len(), 2);

    let mut plan_items = items;
    plan_items[0].action = RebaseAction::Pick;
    plan_items[1].action = RebaseAction::Drop;

    let plan = RebasePlan {
        base_oid: base_oid.clone(),
        items: plan_items,
    };

    let result = RebaseService::execute_interactive_rebase(&runner, repo.path(), &plan).unwrap();
    assert!(result.success);
    assert!(!result.has_conflict);

    // Verify drop.txt no longer exists in repository
    assert!(repo.path().join("keep.txt").exists());
    assert!(!repo.path().join("drop.txt").exists());

    let items_after = RebaseService::get_rebase_commits(repo.path(), &base_oid).unwrap();
    assert_eq!(items_after.len(), 1);
    assert_eq!(items_after[0].summary, "commit keep");
}
