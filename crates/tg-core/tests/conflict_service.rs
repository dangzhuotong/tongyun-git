use std::fs;
use tg_core::{CliRunner, ConflictService, RunOptions};

mod common;

#[test]
fn test_conflict_service_lifecycle() {
    let repo = common::basic();
    let runner = CliRunner::new("git");

    let file_path = repo.path().join("conflict_file.txt");
    fs::write(&file_path, "line 1\nbase content\nline 3\n").unwrap();
    repo.git(&["add", "conflict_file.txt"]);
    repo.git(&["commit", "-m", "commit base"]);

    // Create branch "feature"
    repo.git(&["branch", "feature"]);

    // On master/main, modify conflict_file.txt
    fs::write(&file_path, "line 1\nlocal ours edit\nline 3\n").unwrap();
    repo.git(&["add", "conflict_file.txt"]);
    repo.git(&["commit", "-m", "commit on master"]);

    // Switch to feature and modify conflict_file.txt
    repo.git(&["checkout", "feature"]);
    fs::write(&file_path, "line 1\nremote theirs edit\nline 3\n").unwrap();
    repo.git(&["add", "conflict_file.txt"]);
    repo.git(&["commit", "-m", "commit on feature"]);

    // Switch back to master/main
    repo.git(&["checkout", "-"]);

    // Merge feature into master -> produces conflict!
    let merge_out = runner.run(repo.path(), &["merge", "feature"], RunOptions::default());
    assert!(merge_out.is_err() || merge_out.unwrap().exit_code != Some(0));

    // Verify ConflictService::list_conflicts
    let conflicts = ConflictService::list_conflicts(repo.path()).unwrap();
    assert_eq!(conflicts.len(), 1);
    assert_eq!(conflicts[0].path, "conflict_file.txt");
    assert!(conflicts[0].has_ancestor);
    assert!(conflicts[0].has_our);
    assert!(conflicts[0].has_their);

    // Verify ConflictService::get_conflict_details
    let details = ConflictService::get_conflict_details(repo.path(), "conflict_file.txt").unwrap();
    assert_eq!(details.path, "conflict_file.txt");
    assert!(details
        .base_content
        .as_ref()
        .unwrap()
        .contains("base content"));
    assert!(details
        .our_content
        .as_ref()
        .unwrap()
        .contains("local ours edit"));
    assert!(details
        .their_content
        .as_ref()
        .unwrap()
        .contains("remote theirs edit"));
    assert!(!details.hunks.is_empty());
    assert_eq!(details.hunks[0].our_lines, vec!["local ours edit"]);
    assert_eq!(details.hunks[0].their_lines, vec!["remote theirs edit"]);

    // Test resolve_conflict_file with custom merged content
    let resolved_content = "line 1\nlocal and remote merged cleanly!\nline 3\n";
    ConflictService::resolve_conflict_file(repo.path(), "conflict_file.txt", resolved_content)
        .unwrap();

    // Conflict should now be resolved in index!
    let conflicts_after = ConflictService::list_conflicts(repo.path()).unwrap();
    assert!(conflicts_after.is_empty());

    // File on disk matches resolved content
    let disk_content = fs::read_to_string(&file_path).unwrap();
    assert_eq!(disk_content, resolved_content);

    // Continue merge commit
    let continue_res = ConflictService::continue_merge_or_rebase(&runner, repo.path()).unwrap();
    assert_eq!(continue_res.exit_code, Some(0));

    // Repo state should now be Clean
    let git2_repo = git2::Repository::open(repo.path()).unwrap();
    assert_eq!(git2_repo.state(), git2::RepositoryState::Clean);
}

#[test]
fn test_conflict_accept_ours_and_theirs() {
    let repo = common::basic();
    let runner = CliRunner::new("git");

    let file_path = repo.path().join("file_a.txt");
    fs::write(&file_path, "base\n").unwrap();
    repo.git(&["add", "file_a.txt"]);
    repo.git(&["commit", "-m", "commit base"]);

    repo.git(&["branch", "feat"]);
    fs::write(&file_path, "ours version\n").unwrap();
    repo.git(&["add", "file_a.txt"]);
    repo.git(&["commit", "-m", "ours"]);

    repo.git(&["checkout", "feat"]);
    fs::write(&file_path, "theirs version\n").unwrap();
    repo.git(&["add", "file_a.txt"]);
    repo.git(&["commit", "-m", "theirs"]);

    repo.git(&["checkout", "-"]);
    let _ = runner.run(repo.path(), &["merge", "feat"], RunOptions::default());

    // Test accept_theirs
    ConflictService::accept_theirs(repo.path(), "file_a.txt").unwrap();
    let disk_content = fs::read_to_string(&file_path).unwrap();
    assert_eq!(disk_content, "theirs version\n");

    let conflicts = ConflictService::list_conflicts(repo.path()).unwrap();
    assert!(conflicts.is_empty());
}
