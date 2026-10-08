mod common;

use tg_core::{Git2Backend, GitBackend};

#[test]
fn test_diff_hunks_and_lines() {
    let repo = common::hunks();
    let backend = Git2Backend::open(repo.path()).expect("open hunks repo");

    let diff = backend
        .diff_file("multi_hunk.txt", false)
        .expect("diff multi_hunk.txt");

    assert_eq!(diff.path, "multi_hunk.txt");
    assert!(!diff.staged);
    assert!(!diff.is_binary);
    assert_eq!(diff.hunks.len(), 3, "expected 3 hunks in multi_hunk.txt");

    // Check hunk lines
    for hunk in &diff.hunks {
        assert!(!hunk.lines.is_empty());
        let has_change = hunk
            .lines
            .iter()
            .any(|l| l.origin == '+' || l.origin == '-');
        assert!(has_change, "each hunk must contain additions or deletions");
    }

    // Check mixed_hunk.txt with both additions and deletions
    let diff_mixed = backend
        .diff_file("mixed_hunk.txt", false)
        .expect("diff mixed_hunk.txt");
    assert_eq!(diff_mixed.hunks.len(), 1);
    let hunk = &diff_mixed.hunks[0];
    let deletions = hunk.lines.iter().filter(|l| l.origin == '-').count();
    let additions = hunk.lines.iter().filter(|l| l.origin == '+').count();
    assert_eq!(deletions, 2, "expected 2 deletions");
    assert_eq!(additions, 3, "expected 3 additions");
}

#[test]
fn test_diff_crlf_change() {
    let repo = common::crlf();
    let backend = Git2Backend::open(repo.path()).expect("open crlf repo");

    let diff = backend
        .diff_file("lf_file.txt", false)
        .expect("diff lf_file.txt");

    assert_eq!(diff.path, "lf_file.txt");
    assert!(
        diff.is_crlf_change,
        "lf_file.txt should be recognized as crlf change"
    );
}

#[test]
fn test_diff_binary_file() {
    let repo = common::binary();
    let backend = Git2Backend::open(repo.path()).expect("open binary repo");

    let diff = backend.diff_file("test.png", false).expect("diff test.png");

    assert_eq!(diff.path, "test.png");
    assert!(diff.is_binary, "test.png must be marked as binary");
    assert!(
        diff.hunks.is_empty(),
        "binary diff should not produce hunks"
    );
    assert!(diff.old_size.is_some());
    assert!(diff.new_size.is_some());
    assert!(diff.new_size.unwrap() > diff.old_size.unwrap());
}

#[test]
fn test_diff_untracked_file() {
    let repo = common::basic();
    let backend = Git2Backend::open(repo.path()).expect("open repo");

    let new_file = repo.path().join("new_untracked.txt");
    std::fs::write(&new_file, "hello\nworld\n").expect("write new_untracked");

    let diff = backend
        .diff_file("new_untracked.txt", false)
        .expect("diff untracked file");

    assert_eq!(diff.path, "new_untracked.txt");
    assert!(!diff.is_binary);
    assert!(!diff.hunks.is_empty());
    let added_count = diff
        .hunks
        .iter()
        .flat_map(|h| &h.lines)
        .filter(|l| l.origin == '+')
        .count();
    assert_eq!(added_count, 2, "all lines should be additions");
}

#[test]
fn test_diff_staged_vs_unstaged() {
    let repo = common::basic();
    let backend = Git2Backend::open(repo.path()).expect("open repo");

    // Modify a.java in workdir
    let java_path = repo.path().join("a.java");
    std::fs::write(&java_path, "public class A { /* modified */ }\n").expect("write a.java");

    // Stage it
    repo.git(&["add", "a.java"]);

    // Further modify in workdir
    std::fs::write(
        &java_path,
        "public class A { /* modified */ /* extra workdir edit */ }\n",
    )
    .expect("second write a.java");

    // Staged diff
    let diff_staged = backend.diff_file("a.java", true).expect("diff staged");
    assert!(diff_staged.staged);
    assert!(!diff_staged.hunks.is_empty());

    // Unstaged diff
    let diff_unstaged = backend.diff_file("a.java", false).expect("diff unstaged");
    assert!(!diff_unstaged.staged);
    assert!(!diff_unstaged.hunks.is_empty());
}
