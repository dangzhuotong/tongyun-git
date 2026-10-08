mod common;

use std::fs;
use tg_core::{
    clear_operation_logs, get_operation_logs, CliRunner, Git2Backend, GitBackend, PullStrategy,
    RemoteService, RepoState,
};

#[test]
fn test_fetch_remote() {
    let fix = common::remote();
    let runner = CliRunner::new("git");
    let home = fix.dir.path();
    let remote_service = RemoteService::new(&runner);

    // 1. Commit in 'other' and push to bare
    fs::write(fix.other_path.join("file_other.txt"), "other content\n").unwrap();
    common::git_cmd(&fix.other_path, home, &["add", "file_other.txt"]);
    common::git_cmd(
        &fix.other_path,
        home,
        &["commit", "-m", "commit from other"],
    );
    common::git_cmd(&fix.other_path, home, &["push", "origin", "main"]);

    // 2. Fetch in 'main'
    let fetch_res = remote_service
        .fetch(&fix.main_path, Some("origin"), false)
        .expect("fetch should succeed");
    assert!(fetch_res.success);

    // 3. Verify origin/main has the new commit
    let out = common::git_cmd(
        &fix.main_path,
        home,
        &["log", "-1", "--format=%s", "origin/main"],
    );
    let summary = String::from_utf8_lossy(&out.stdout).trim().to_string();
    assert_eq!(summary, "commit from other");
}

#[test]
fn test_pull_fast_forward() {
    let fix = common::remote();
    let runner = CliRunner::new("git");
    let home = fix.dir.path();
    let remote_service = RemoteService::new(&runner);

    // Commit in 'other' and push
    fs::write(fix.other_path.join("ff.txt"), "ff content\n").unwrap();
    common::git_cmd(&fix.other_path, home, &["add", "ff.txt"]);
    common::git_cmd(
        &fix.other_path,
        home,
        &["commit", "-m", "fast forward commit"],
    );
    common::git_cmd(&fix.other_path, home, &["push", "origin", "main"]);

    // Pull with FastForwardOnly in 'main'
    let pull_res = remote_service
        .pull(&fix.main_path, None, None, PullStrategy::FastForwardOnly)
        .expect("pull should succeed");
    assert!(pull_res.success);
    assert!(!pull_res.has_conflict);

    let main_head = common::git_cmd(&fix.main_path, home, &["rev-parse", "HEAD"]);
    let other_head = common::git_cmd(&fix.other_path, home, &["rev-parse", "HEAD"]);
    assert_eq!(main_head.stdout, other_head.stdout);
}

#[test]
fn test_pull_conflict_and_abort() {
    let fix = common::remote();
    let runner = CliRunner::new("git");
    let home = fix.dir.path();
    let backend = Git2Backend::open(&fix.main_path).unwrap();
    let remote_service = RemoteService::new(&runner);

    // 1. Commit in 'other' modifying init.txt
    fs::write(fix.other_path.join("init.txt"), "conflict from other\n").unwrap();
    common::git_cmd(&fix.other_path, home, &["add", "init.txt"]);
    common::git_cmd(
        &fix.other_path,
        home,
        &["commit", "-m", "modify init in other"],
    );
    common::git_cmd(&fix.other_path, home, &["push", "origin", "main"]);

    // 2. Commit in 'main' modifying init.txt differently
    fs::write(fix.main_path.join("init.txt"), "conflict from main\n").unwrap();
    common::git_cmd(&fix.main_path, home, &["add", "init.txt"]);
    common::git_cmd(
        &fix.main_path,
        home,
        &["commit", "-m", "modify init in main"],
    );

    // 3. Pull in 'main' using Merge
    let pull_res = remote_service
        .pull(&fix.main_path, None, None, PullStrategy::Merge)
        .expect("pull call itself returns Result");
    assert!(!pull_res.success);
    assert!(pull_res.has_conflict);
    assert!(
        pull_res.conflicting_files.contains(&"init.txt".to_string()),
        "conflicting files should contain init.txt: {:?}",
        pull_res.conflicting_files
    );

    // Verify backend head reports Merge state
    let head_info = backend.head().unwrap();
    assert_eq!(head_info.repo_state, RepoState::Merge);

    // 4. Abort merge action (R-11, R-17)
    let abort_res = remote_service
        .abort_action(&fix.main_path)
        .expect("abort should succeed");
    assert!(abort_res.success);
    assert_eq!(abort_res.action, "merge");

    // Verify repo returns to Clean state
    let clean_head = backend.head().unwrap();
    assert_eq!(clean_head.repo_state, RepoState::Clean);
}

#[test]
fn test_inspect_push_and_push() {
    let fix = common::remote();
    let runner = CliRunner::new("git");
    let home = fix.dir.path();
    let remote_service = RemoteService::new(&runner);

    // 1. Initially clean, 0 commits ahead
    let inspect_initial = remote_service.inspect_push(&fix.main_path).unwrap();
    assert_eq!(inspect_initial.ahead_count, 0);
    assert_eq!(inspect_initial.current_branch, "main");

    // 2. Add local commit in 'main'
    fs::write(fix.main_path.join("pushed_file.txt"), "to push\n").unwrap();
    common::git_cmd(&fix.main_path, home, &["add", "pushed_file.txt"]);
    common::git_cmd(
        &fix.main_path,
        home,
        &["commit", "-m", "commit ready to push"],
    );

    let inspect_after = remote_service.inspect_push(&fix.main_path).unwrap();
    assert_eq!(inspect_after.ahead_count, 1);
    assert_eq!(inspect_after.ahead_commits.len(), 1);
    assert_eq!(
        inspect_after.ahead_commits[0].summary,
        "commit ready to push"
    );

    // 3. Push commit
    let push_res = remote_service
        .push(&fix.main_path, "origin", "main", false)
        .expect("push should succeed");
    assert!(push_res.success);
    assert!(!push_res.rejected);

    // 4. Inspect again, should be 0 ahead
    let inspect_done = remote_service.inspect_push(&fix.main_path).unwrap();
    assert_eq!(inspect_done.ahead_count, 0);
}

#[test]
fn test_push_rejected_behind() {
    let fix = common::remote();
    let runner = CliRunner::new("git");
    let home = fix.dir.path();
    let remote_service = RemoteService::new(&runner);

    // 1. Advance remote via other
    fs::write(fix.other_path.join("remote_adv.txt"), "advance\n").unwrap();
    common::git_cmd(&fix.other_path, home, &["add", "remote_adv.txt"]);
    common::git_cmd(&fix.other_path, home, &["commit", "-m", "advance remote"]);
    common::git_cmd(&fix.other_path, home, &["push", "origin", "main"]);

    // 2. Local commit in main (without pulling remote first)
    fs::write(fix.main_path.join("local_adv.txt"), "local adv\n").unwrap();
    common::git_cmd(&fix.main_path, home, &["add", "local_adv.txt"]);
    common::git_cmd(
        &fix.main_path,
        home,
        &["commit", "-m", "local commit ahead"],
    );

    // 3. Attempt push without force
    let push_res = remote_service
        .push(&fix.main_path, "origin", "main", false)
        .expect("push call returns result");

    assert!(!push_res.success);
    assert!(push_res.rejected);
}

#[test]
fn test_operation_logs_recorded() {
    clear_operation_logs();

    let fix = common::remote();
    let runner = CliRunner::new("git");
    let remote_service = RemoteService::new(&runner);

    let _ = remote_service.fetch(&fix.main_path, Some("origin"), false);
    let logs = get_operation_logs();
    assert!(
        !logs.is_empty(),
        "operation logs should not be empty after fetch"
    );

    let fetch_log = logs.iter().find(|l| l.command_line.contains("fetch"));
    assert!(fetch_log.is_some(), "should record fetch command");
    let entry = fetch_log.unwrap();
    assert!(entry.timestamp_ms > 0);
    assert_eq!(entry.exit_code, Some(0));
}
