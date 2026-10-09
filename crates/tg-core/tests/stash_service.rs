mod common;

use std::fs;
use tg_core::{CliRunner, StashService};

#[test]
fn test_stash_lifecycle() {
    let repo = common::basic();
    let runner = CliRunner::new("git");
    let file_path = repo.path().join("README.md");

    // 1. Initial stashes should be empty
    let list = StashService::list_stashes(&runner, repo.path()).unwrap();
    assert_eq!(list.len(), 0);

    // 2. Modify a tracked file
    fs::write(&file_path, "modified line for stash\n").unwrap();

    // 3. Create a stash with message
    StashService::create_stash(&runner, repo.path(), Some("my test stash message"), false).unwrap();

    // 4. Verify working tree is clean and stash list contains entry
    let content = fs::read_to_string(&file_path).unwrap();
    assert_ne!(content, "modified line for stash\n");

    let list = StashService::list_stashes(&runner, repo.path()).unwrap();
    assert_eq!(list.len(), 1);
    assert_eq!(list[0].index, 0);
    assert!(list[0].message.contains("my test stash message"));

    // 5. Check stash diff
    let diff = StashService::show_stash_diff(&runner, repo.path(), 0).unwrap();
    assert!(diff.contains("modified line for stash"));

    // 6. Apply stash without pop
    let apply_res = StashService::apply_stash(&runner, repo.path(), 0, false).unwrap();
    assert!(apply_res.success);
    assert!(!apply_res.has_conflict);

    let content_after = fs::read_to_string(&file_path).unwrap();
    assert_eq!(content_after, "modified line for stash\n");

    // Stash should still exist
    let list_still = StashService::list_stashes(&runner, repo.path()).unwrap();
    assert_eq!(list_still.len(), 1);

    // 7. Drop stash
    StashService::drop_stash(&runner, repo.path(), 0).unwrap();
    let list_after_drop = StashService::list_stashes(&runner, repo.path()).unwrap();
    assert_eq!(list_after_drop.len(), 0);
}

#[test]
fn test_stash_pop_and_clear() {
    let repo = common::basic();
    let runner = CliRunner::new("git");
    let new_file = repo.path().join("untracked_new.txt");

    // Create untracked file
    fs::write(&new_file, "untracked content\n").unwrap();

    // Stash with include_untracked = true
    StashService::create_stash(&runner, repo.path(), Some("stash with untracked"), true).unwrap();

    // Untracked file should be stashed away
    assert!(!new_file.exists());

    let list = StashService::list_stashes(&runner, repo.path()).unwrap();
    assert_eq!(list.len(), 1);

    // Pop stash
    let pop_res = StashService::apply_stash(&runner, repo.path(), 0, true).unwrap();
    assert!(pop_res.success);
    assert!(new_file.exists());

    // Stash should be removed after pop
    let list_after_pop = StashService::list_stashes(&runner, repo.path()).unwrap();
    assert_eq!(list_after_pop.len(), 0);

    // Create 2 stashes and test clear
    fs::write(&new_file, "change 1\n").unwrap();
    StashService::create_stash(&runner, repo.path(), Some("stash 1"), true).unwrap();

    fs::write(&new_file, "change 2\n").unwrap();
    StashService::create_stash(&runner, repo.path(), Some("stash 2"), true).unwrap();

    let list_two = StashService::list_stashes(&runner, repo.path()).unwrap();
    assert_eq!(list_two.len(), 2);

    StashService::clear_stashes(&runner, repo.path()).unwrap();
    let list_cleared = StashService::list_stashes(&runner, repo.path()).unwrap();
    assert_eq!(list_cleared.len(), 0);
}

#[test]
fn test_stash_empty_changes_error() {
    let repo = common::basic();
    let runner = CliRunner::new("git");

    // Clean workdir, should return friendly error
    let err = StashService::create_stash(&runner, repo.path(), None, false).unwrap_err();
    assert!(err.to_string().contains("没有需要贮藏的本地改动"));
}
