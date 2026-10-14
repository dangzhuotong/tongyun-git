mod common;

use std::fs;
use tg_core::{CliRunner, CommitService, Git2Backend, GitBackend, RunOptions};

#[test]
fn test_commit_identity_and_empty_repo() {
    let repo = common::basic();
    let runner = CliRunner::new("git");

    // Configure local identity
    repo.git(&["config", "user.name", "Tongyun Developer"]);
    repo.git(&["config", "user.email", "dev@tongyun.internal"]);

    let id = CommitService::check_identity(&runner, repo.path())
        .expect("check_identity should succeed")
        .expect("identity should be found");
    assert_eq!(id.name, "Tongyun Developer");
    assert_eq!(id.email, "dev@tongyun.internal");

    // Test inspect_amend on repo with commits
    let status = CommitService::inspect_amend(&runner, repo.path()).expect("inspect_amend");
    assert!(status.can_amend);
    assert!(status.head_message.is_some());

    // Test unborn repo has no amend
    let unborn_repo = common::unborn();
    let unborn_status =
        CommitService::inspect_amend(&runner, unborn_repo.path()).expect("inspect unborn");
    assert!(!unborn_status.can_amend);
    assert!(unborn_status.disabled_reason.is_some());
}

#[test]
fn test_create_commit_and_amend_at_06() {
    let repo = common::basic();
    let runner = CliRunner::new("git");
    let backend = Git2Backend::open(repo.path()).unwrap();

    // 1. Stage a new change
    let file_path = repo.path().join("hello.txt");
    fs::write(&file_path, "updated content\n").unwrap();
    backend.stage_files(&["hello.txt"]).unwrap();

    let old_head = repo.head_commit_id();

    // 2. Commit the staged change
    let commit_res = CommitService::commit(
        &runner,
        repo.path(),
        "feat: update hello.txt content\n\nDetailed body explanation",
        false,
    )
    .expect("commit should succeed");

    assert_eq!(commit_res.summary, "feat: update hello.txt content");
    let new_head = repo.head_commit_id();
    assert_ne!(old_head, new_head);

    // Verify git log output matches
    let log_out = repo.git(&["log", "-1", "--pretty=%B"]);
    let log_msg = String::from_utf8_lossy(&log_out.stdout);
    assert!(log_msg.contains("feat: update hello.txt content"));
    assert!(log_msg.contains("Detailed body explanation"));

    // 3. Amend the commit with new message and extra file change
    let extra_file = repo.path().join("extra.txt");
    fs::write(&extra_file, "extra\n").unwrap();
    backend.stage_files(&["extra.txt"]).unwrap();

    let amend_res = CommitService::commit(
        &runner,
        repo.path(),
        "feat: update hello and add extra (amended)",
        true,
    )
    .expect("amend should succeed");

    assert_eq!(
        amend_res.summary,
        "feat: update hello and add extra (amended)"
    );
    let amended_head = repo.head_commit_id();
    assert_ne!(new_head, amended_head);

    // Verify parent of amended commit is the same parent as new_head
    let parent_of_amended = repo.git(&["rev-parse", "HEAD^"]);
    let parent_id = String::from_utf8_lossy(&parent_of_amended.stdout)
        .trim()
        .to_string();
    assert_eq!(old_head, parent_id);
}

#[test]
fn test_amend_pushed_remote_warning_detection() {
    let fixture = common::remote();
    let runner = CliRunner::new("git");

    // fixture.main_path is already pushed to origin/main
    let pushed_branches = CommitService::check_head_pushed(&runner, &fixture.main_path)
        .expect("check_head_pushed should succeed");

    // It should detect origin/main
    assert!(
        !pushed_branches.is_empty(),
        "should detect that HEAD is pushed to origin/main"
    );
    assert!(pushed_branches.iter().any(|b| b.contains("origin/main")));

    let inspect = CommitService::inspect_amend(&runner, &fixture.main_path).expect("inspect_amend");
    assert!(inspect.can_amend);
    assert!(
        inspect.is_pushed,
        "must flag as pushed for remote warning dialog"
    );
    assert!(!inspect.pushed_remote_branches.is_empty());
}

#[test]
fn test_external_commit_draft_lifecycle() {
    let fixture = common::basic();
    let runner = CliRunner::new("git");

    // Initially, no external draft exists
    let draft = CommitService::get_external_draft(&fixture.path)
        .expect("get_external_draft should succeed");
    assert_eq!(draft, None);

    // Write external AI commit draft to .git/TONGYUN_COMMIT_MSG
    let dot_git = fixture.path.join(".git");
    let ai_file = dot_git.join("TONGYUN_COMMIT_MSG");
    std::fs::write(&ai_file, "feat(ui): 外部 AI 预拟提交信息\n\n详细说明").expect("write ai draft");

    // get_external_draft should read it
    let draft = CommitService::get_external_draft(&fixture.path)
        .expect("get_external_draft should succeed");
    assert_eq!(draft, Some("feat(ui): 外部 AI 预拟提交信息\n\n详细说明".to_string()));

    // When commit succeeds, .git/TONGYUN_COMMIT_MSG is automatically cleared
    let test_file = fixture.path.join("file1.txt");
    std::fs::write(&test_file, "updated content").expect("modify file");
    runner.run(&fixture.path, &["add", "file1.txt"], RunOptions::default()).expect("git add");

    let res = CommitService::commit(&runner, &fixture.path, &draft.unwrap(), false)
        .expect("commit should succeed");
    assert_eq!(res.summary, "feat(ui): 外部 AI 预拟提交信息");

    // External draft should now be cleared
    assert!(!ai_file.exists());
    let draft_after = CommitService::get_external_draft(&fixture.path)
        .expect("get_external_draft should succeed");
    assert_eq!(draft_after, None);
}
