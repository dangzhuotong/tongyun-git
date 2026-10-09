mod common;

use std::fs;
use tg_core::{CliRunner, CommitService, Git2Backend, GitBackend, LogService, TagService};

#[test]
fn test_tag_lifecycle() {
    let repo = common::basic();
    let runner = CliRunner::new("git");

    // 1. Initial repo has no tags
    let tags = TagService::list_tags(repo.path()).unwrap();
    assert_eq!(tags.len(), 0);

    // 2. Create a lightweight tag
    let tag1 = TagService::create_tag(&runner, repo.path(), "v0.1.0", None, None).unwrap();
    assert_eq!(tag1.name, "v0.1.0");
    assert!(!tag1.is_annotated);
    assert!(tag1.message.is_none());

    // 3. Create an annotated tag with message
    let tag2 = TagService::create_tag(
        &runner,
        repo.path(),
        "v0.2.0",
        None,
        Some("Release version 0.2.0 with new features"),
    )
    .unwrap();
    assert_eq!(tag2.name, "v0.2.0");
    assert!(tag2.is_annotated);
    assert_eq!(
        tag2.message.as_deref(),
        Some("Release version 0.2.0 with new features")
    );

    // 4. List tags and verify both exist
    let all = TagService::list_tags(repo.path()).unwrap();
    assert_eq!(all.len(), 2);
    let names: Vec<&str> = all.iter().map(|t| t.name.as_str()).collect();
    assert!(names.contains(&"v0.1.0"));
    assert!(names.contains(&"v0.2.0"));

    // 5. Delete lightweight tag
    TagService::delete_tag(&runner, repo.path(), "v0.1.0").unwrap();
    let remaining = TagService::list_tags(repo.path()).unwrap();
    assert_eq!(remaining.len(), 1);
    assert_eq!(remaining[0].name, "v0.2.0");

    // 6. Delete annotated tag
    TagService::delete_tag(&runner, repo.path(), "v0.2.0").unwrap();
    let empty = TagService::list_tags(repo.path()).unwrap();
    assert_eq!(empty.len(), 0);
}

#[test]
fn test_file_history_and_commit_actions() {
    let repo = common::basic();
    let runner = CliRunner::new("git");
    let file_path = repo.path().join("README.md");

    // Check file history for README.md
    let history = LogService::get_file_history(&runner, repo.path(), "README.md", 50).unwrap();
    assert!(!history.is_empty());
    let initial_oid = history[0].oid.clone();

    // Make a second commit modifying README.md
    fs::write(&file_path, "README second line\n").unwrap();
    let backend = Git2Backend::open(repo.path()).unwrap();
    backend.stage_files(&["README.md"]).unwrap();
    let commit_res = CommitService::commit(
        &runner,
        repo.path(),
        "docs: update readme with second line",
        false,
    )
    .unwrap();
    assert_ne!(commit_res.oid, initial_oid);

    // Check updated file history has 2 commits
    let updated_history =
        LogService::get_file_history(&runner, repo.path(), "README.md", 50).unwrap();
    assert_eq!(updated_history.len(), 2);
    assert_eq!(updated_history[0].oid, commit_res.oid);
    assert_eq!(updated_history[1].oid, initial_oid);

    // Test checkout commit (detached HEAD)
    CommitService::checkout_commit(&runner, repo.path(), &initial_oid).unwrap();

    // Verify HEAD points to initial_oid
    let repo_git = git2::Repository::open(repo.path()).unwrap();
    let head = repo_git.head().unwrap();
    assert_eq!(head.target().unwrap().to_string(), initial_oid);

    // Test reset_to_commit (soft reset) - first switch back to master/main
    let _ = runner.run(
        repo.path(),
        &["checkout", "-"],
        tg_core::RunOptions::default(),
    );

    // Prohibit hard reset error
    let hard_err = CommitService::reset_to_commit(&runner, repo.path(), &initial_oid, "hard");
    assert!(hard_err.is_err());

    // Soft reset should succeed
    CommitService::reset_to_commit(&runner, repo.path(), &initial_oid, "soft").unwrap();
}
