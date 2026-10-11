mod common;
use std::fs;
use tg_core::{snapshot, workspace, CliRunner, DiscardService, Git2Backend, GitBackend};

fn text(repo: &common::TestRepo, args: &[&str]) -> String {
    String::from_utf8(repo.git(args).stdout).unwrap()
}

#[test]
fn discard_restores_exact_index_deleted_paths_and_underscores() {
    let repo = common::basic();
    fs::create_dir_all(repo.path().join("nested")).unwrap();
    fs::write(repo.path().join("nested/a"), "nested before\n").unwrap();
    fs::write(repo.path().join("nested__a"), "flat before\n").unwrap();
    repo.git(&["add", "."]);
    repo.git(&["commit", "-m", "paths"]);
    fs::write(repo.path().join("nested/a"), "staged\n").unwrap();
    repo.git(&["add", "nested/a"]);
    fs::write(repo.path().join("nested/a"), "working\n").unwrap();
    fs::write(repo.path().join("nested__a"), "flat modified\n").unwrap();
    fs::remove_file(repo.path().join("a.java")).unwrap();
    let before = text(&repo, &["diff", "--cached", "--binary"]);
    DiscardService::discard_files(repo.path(), &["nested/a", "nested__a", "a.java"]).unwrap();
    assert!(text(&repo, &["status", "--porcelain"]).is_empty());
    DiscardService::undo_last_discard(repo.path(), true).unwrap();
    assert_eq!(before, text(&repo, &["diff", "--cached", "--binary"]));
    assert_eq!(
        fs::read(repo.path().join("nested/a")).unwrap(),
        b"working\n"
    );
    assert_eq!(
        fs::read(repo.path().join("nested__a")).unwrap(),
        b"flat modified\n"
    );
    assert!(!repo.path().join("a.java").exists());
}

#[test]
fn agent_session_restores_deletions_new_files_and_can_undo_without_index_change() {
    let repo = common::basic();
    fs::write(repo.path().join("a.java"), "user staged\n").unwrap();
    repo.git(&["add", "a.java"]);
    fs::write(repo.path().join("a.java"), "user working\n").unwrap();
    fs::write(repo.path().join(".gitignore"), "ignored.txt\n").unwrap();
    fs::write(repo.path().join("ignored.txt"), "not captured").unwrap();
    let before_index = text(&repo, &["diff", "--cached", "--binary"]);
    let before_head = repo.head_commit_id();
    let session = snapshot::capture(repo.path(), "session", "agent", None).unwrap();
    assert!(!session.files.contains_key("ignored.txt"));
    fs::write(repo.path().join("a.java"), "agent\n").unwrap();
    fs::remove_file(repo.path().join("b.ts")).unwrap();
    fs::write(repo.path().join("new.txt"), "agent new\n").unwrap();
    snapshot::finish(repo.path(), &session.reference).unwrap();
    let preview = snapshot::changes(repo.path(), &session.reference).unwrap();
    assert_eq!(preview.len(), 3);
    let result = snapshot::restore(repo.path(), &session.reference, &preview).unwrap();
    assert_eq!(result.restored, 3);
    assert!(!repo.path().join("new.txt").exists());
    assert!(repo.path().join("b.ts").exists());
    assert_eq!(
        fs::read(repo.path().join("a.java")).unwrap(),
        b"user working\n"
    );
    assert_eq!(before_index, text(&repo, &["diff", "--cached", "--binary"]));
    assert_eq!(before_head, repo.head_commit_id());
    let preview = snapshot::changes(repo.path(), &result.undo_ref).unwrap();
    snapshot::restore(repo.path(), &result.undo_ref, &preview).unwrap();
    assert_eq!(
        fs::read(repo.path().join("new.txt")).unwrap(),
        b"agent new\n"
    );
    assert!(!repo.path().join("b.ts").exists());
}

#[test]
fn agent_protects_later_edits_and_stale_preview() {
    let repo = common::basic();
    let session = snapshot::capture(repo.path(), "session", "agent", None).unwrap();
    fs::write(repo.path().join("a.java"), "agent\n").unwrap();
    assert!(!snapshot::changes(repo.path(), &session.reference).unwrap()[0].can_restore);
    snapshot::finish(repo.path(), &session.reference).unwrap();
    let preview = snapshot::changes(repo.path(), &session.reference).unwrap();
    fs::write(repo.path().join("a.java"), "user after session\n").unwrap();
    assert!(snapshot::restore(repo.path(), &session.reference, &preview).is_err());
    assert!(!snapshot::changes(repo.path(), &session.reference).unwrap()[0].can_restore);
    assert_eq!(
        fs::read(repo.path().join("a.java")).unwrap(),
        b"user after session\n"
    );
}

#[test]
fn shelf_partial_return_preserves_staging_and_rejects_overwrite() {
    let repo = common::basic();
    fs::write(repo.path().join("a.java"), "staged\n").unwrap();
    repo.git(&["add", "a.java"]);
    fs::write(repo.path().join("a.java"), "working\n").unwrap();
    fs::write(repo.path().join("new.txt"), "new\n").unwrap();
    let before = text(&repo, &["diff", "--cached", "--binary"]);
    let shelf =
        snapshot::shelve(repo.path(), "shelf", &["a.java".into(), "new.txt".into()]).unwrap();
    assert_eq!(fs::read(repo.path().join("a.java")).unwrap(), b"staged\n");
    assert!(!repo.path().join("new.txt").exists());
    let preview = snapshot::changes(repo.path(), &shelf.reference).unwrap();
    snapshot::restore(repo.path(), &shelf.reference, &preview[..1]).unwrap();
    assert!(!snapshot::changes(repo.path(), &shelf.reference)
        .unwrap()
        .is_empty());
    assert_eq!(before, text(&repo, &["diff", "--cached", "--binary"]));
    fs::write(repo.path().join("new.txt"), "user\n").unwrap();
    let changes = snapshot::changes(repo.path(), &shelf.reference).unwrap();
    assert!(
        !changes
            .iter()
            .find(|c| c.path == "new.txt")
            .unwrap()
            .can_restore
    );
}

#[test]
fn snapshots_keep_blobs_alive_and_refuse_other_worktree_or_head() {
    let repo = common::basic();
    let s = snapshot::capture(repo.path(), "gc", "agent", None).unwrap();
    fs::write(repo.path().join("a.java"), "changed\n").unwrap();
    snapshot::finish(repo.path(), &s.reference).unwrap();
    repo.git(&["gc", "--prune=now"]);
    assert_eq!(
        snapshot::changes(repo.path(), &s.reference).unwrap().len(),
        1
    );
    repo.git(&["add", "a.java"]);
    repo.git(&["commit", "-m", "head moved"]);
    assert!(!snapshot::changes(repo.path(), &s.reference).unwrap()[0].can_restore);
    let wt = repo.dir.path().join("other");
    repo.git(&["worktree", "add", "-b", "other", wt.to_str().unwrap()]);
    assert!(snapshot::load(&wt, &s.reference).is_err());
}

#[test]
fn line_discard_preserves_bytes_and_index_and_refuses_stale_diff() {
    let repo = common::basic();
    fs::write(repo.path().join("bytes.txt"), b"one\r\ntwo\r\nthree").unwrap();
    repo.git(&["add", "bytes.txt"]);
    repo.git(&["commit", "-m", "bytes"]);
    fs::write(repo.path().join("bytes.txt"), b"one\r\nTWO\r\nthree").unwrap();
    let backend = Git2Backend::open(repo.path()).unwrap();
    let diff = backend.diff_file("bytes.txt", false).unwrap();
    let selected: Vec<usize> = diff.hunks[0]
        .lines
        .iter()
        .enumerate()
        .filter(|(_, l)| matches!(l.origin, '+' | '-'))
        .map(|(i, _)| i)
        .collect();
    let before_index = text(&repo, &["diff", "--cached", "--binary"]);
    let s = snapshot::discard_lines(repo.path(), &diff, 0, &selected).unwrap();
    assert_eq!(
        fs::read(repo.path().join("bytes.txt")).unwrap(),
        b"one\r\ntwo\r\nthree"
    );
    assert_eq!(before_index, text(&repo, &["diff", "--cached", "--binary"]));
    let preview = snapshot::changes(repo.path(), &s.reference).unwrap();
    snapshot::restore(repo.path(), &s.reference, &preview).unwrap();
    assert_eq!(
        fs::read(repo.path().join("bytes.txt")).unwrap(),
        b"one\r\nTWO\r\nthree"
    );
    fs::write(repo.path().join("bytes.txt"), "external\n").unwrap();
    assert!(snapshot::discard_lines(repo.path(), &diff, 0, &selected).is_err());
}

#[test]
fn compare_blame_cherry_pick_revert_and_merge_use_real_history() {
    let repo = common::basic();
    let runner = CliRunner::new("git");
    let base = repo.head_commit_id();
    repo.git(&["checkout", "-b", "feature"]);
    fs::write(repo.path().join("new.txt"), "feature\n").unwrap();
    repo.git(&["add", "new.txt"]);
    repo.git(&["commit", "-m", "feature"]);
    let oid = repo.head_commit_id();
    repo.git(&["checkout", "main"]);
    let comparison = workspace::compare(repo.path(), &base, &oid).unwrap();
    assert_eq!(comparison.files, 1);
    assert!(comparison.patch.contains("+feature"));
    workspace::history_action(
        &runner,
        repo.path(),
        workspace::HistoryAction::CherryPick,
        &oid,
    )
    .unwrap();
    assert_eq!(fs::read(repo.path().join("new.txt")).unwrap(), b"feature\n");
    let blame = workspace::blame(repo.path(), "new.txt", 1, 200).unwrap();
    assert_eq!(blame[0].line, 1);
    assert_eq!(blame[0].content, "feature");
    assert!(!blame[0].author.is_empty());
    let picked = repo.head_commit_id();
    workspace::history_action(
        &runner,
        repo.path(),
        workspace::HistoryAction::Revert,
        &picked,
    )
    .unwrap();
    assert!(!repo.path().join("new.txt").exists());
    repo.git(&["checkout", "feature"]);
    fs::write(repo.path().join("merge.txt"), "merge\n").unwrap();
    repo.git(&["add", "merge.txt"]);
    repo.git(&["commit", "-m", "merge"]);
    repo.git(&["checkout", "main"]);
    workspace::history_action(
        &runner,
        repo.path(),
        workspace::HistoryAction::Merge,
        "feature",
    )
    .unwrap();
    assert!(repo.path().join("merge.txt").exists());
    fs::write(repo.path().join("b.ts"), "dirty\n").unwrap();
    assert!(workspace::history_action(
        &runner,
        repo.path(),
        workspace::HistoryAction::Revert,
        &picked
    )
    .is_err());
}

#[test]
fn worktree_overview_reports_overlap_and_missing_paths() {
    let repo = common::basic();
    let runner = CliRunner::new("git");
    let wt = repo.dir.path().join("other");
    repo.git(&["worktree", "add", "-b", "other", wt.to_str().unwrap()]);
    fs::write(repo.path().join("b.ts"), "main\n").unwrap();
    fs::write(wt.join("b.ts"), "other\n").unwrap();
    let view = workspace::overview(&runner, repo.path()).unwrap();
    assert_eq!(view.worktrees.len(), 2);
    assert_eq!(view.overlaps["b.ts"].len(), 2);
    assert!(view.hunk_overlaps.contains(&"b.ts".to_string()));
    fs::remove_dir_all(wt).unwrap();
    assert!(workspace::overview(&runner, repo.path())
        .unwrap()
        .worktrees
        .iter()
        .any(|w| w.error.is_some()));
}

#[test]
fn snapshots_reject_traversal_metadata_and_symlinks() {
    let repo = common::basic();
    for path in [
        "../outside",
        ".git/config",
        "a/../../outside",
        "/absolute",
        "C:/outside",
    ] {
        assert!(snapshot::capture(repo.path(), "bad", "shelf", Some(&[path.into()])).is_err());
    }
    #[cfg(unix)]
    {
        std::os::unix::fs::symlink(repo.dir.path(), repo.path().join("link")).unwrap();
        assert!(
            snapshot::capture(repo.path(), "bad", "shelf", Some(&["link/file".into()])).is_err()
        );
    }
}

#[test]
fn checkout_baselines_respect_eol_and_refuse_external_filters() {
    let repo = common::basic();
    fs::write(
        repo.path().join(".gitattributes"),
        "eol.txt text eol=crlf\nfiltered.txt filter=custom\n",
    )
    .unwrap();
    fs::write(repo.path().join("eol.txt"), b"first\r\nsecond\r\n").unwrap();
    repo.git(&["add", ".gitattributes", "eol.txt"]);
    repo.git(&["commit", "-m", "eol"]);
    fs::write(repo.path().join("eol.txt"), b"first\r\nchanged\r\n").unwrap();
    let shelf = snapshot::shelve(repo.path(), "eol", &["eol.txt".into()]).unwrap();
    assert_eq!(
        fs::read(repo.path().join("eol.txt")).unwrap(),
        b"first\r\nsecond\r\n"
    );
    let preview = snapshot::changes(repo.path(), &shelf.reference).unwrap();
    snapshot::restore(repo.path(), &shelf.reference, &preview).unwrap();
    let diff = Git2Backend::open(repo.path())
        .unwrap()
        .diff_file("eol.txt", false)
        .unwrap();
    let selected: Vec<usize> = diff.hunks[0]
        .lines
        .iter()
        .enumerate()
        .filter(|(_, l)| matches!(l.origin, '+' | '-'))
        .map(|(i, _)| i)
        .collect();
    snapshot::discard_lines(repo.path(), &diff, 0, &selected).unwrap();
    assert_eq!(
        fs::read(repo.path().join("eol.txt")).unwrap(),
        b"first\r\nsecond\r\n"
    );
    fs::write(repo.path().join("eol.txt"), b"modified\r\n").unwrap();
    DiscardService::discard_files(repo.path(), &["eol.txt"]).unwrap();
    assert_eq!(
        fs::read(repo.path().join("eol.txt")).unwrap(),
        b"first\r\nsecond\r\n"
    );
    fs::write(repo.path().join("filtered.txt"), "before\n").unwrap();
    repo.git(&["add", "filtered.txt"]);
    fs::write(repo.path().join("filtered.txt"), "after\n").unwrap();
    assert!(snapshot::shelve(repo.path(), "filtered", &["filtered.txt".into()]).is_err());
    assert_eq!(
        fs::read(repo.path().join("filtered.txt")).unwrap(),
        b"after\n"
    );
}

#[test]
fn hunk_warning_distinguishes_disjoint_changes_against_shared_base() {
    let repo = common::basic();
    let original: String = (1..=30).map(|i| format!("line {i}\n")).collect();
    fs::write(repo.path().join("range.txt"), &original).unwrap();
    repo.git(&["add", "range.txt"]);
    repo.git(&["commit", "-m", "ranges"]);
    let wt = repo.dir.path().join("other");
    repo.git(&["worktree", "add", "-b", "other", wt.to_str().unwrap()]);
    fs::write(
        repo.path().join("range.txt"),
        original.replace("line 2\n", "changed 2\n"),
    )
    .unwrap();
    fs::write(
        wt.join("range.txt"),
        original.replace("line 25\n", "changed 25\n"),
    )
    .unwrap();
    let view = workspace::overview(&CliRunner::new("git"), repo.path()).unwrap();
    assert!(view.overlaps.contains_key("range.txt"));
    assert!(!view.hunk_overlaps.contains(&"range.txt".into()));
}

#[test]
fn conflict_cherry_pick_can_be_resolved_and_continued_or_aborted() {
    let repo = common::basic();
    let runner = CliRunner::new("git");
    repo.git(&["checkout", "-b", "feature"]);
    fs::write(repo.path().join("b.ts"), "feature\n").unwrap();
    repo.git(&["add", "b.ts"]);
    repo.git(&["commit", "-m", "feature"]);
    let feature = repo.head_commit_id();
    repo.git(&["checkout", "main"]);
    fs::write(repo.path().join("b.ts"), "main\n").unwrap();
    repo.git(&["add", "b.ts"]);
    repo.git(&["commit", "-m", "main"]);
    let before = repo.head_commit_id();
    assert!(workspace::history_action(
        &runner,
        repo.path(),
        workspace::HistoryAction::CherryPick,
        &feature
    )
    .is_err());
    assert!(workspace::history_action(
        &runner,
        repo.path(),
        workspace::HistoryAction::Continue,
        ""
    )
    .is_err());
    workspace::history_action(&runner, repo.path(), workspace::HistoryAction::Abort, "").unwrap();
    assert_eq!(before, repo.head_commit_id());
    assert!(workspace::history_action(
        &runner,
        repo.path(),
        workspace::HistoryAction::CherryPick,
        &feature
    )
    .is_err());
    fs::write(repo.path().join("b.ts"), "resolved\n").unwrap();
    repo.git(&["add", "b.ts"]);
    workspace::history_action(&runner, repo.path(), workspace::HistoryAction::Continue, "")
        .unwrap();
    assert_ne!(before, repo.head_commit_id());
    assert_eq!(fs::read(repo.path().join("b.ts")).unwrap(), b"resolved\n");
    assert!(workspace::history_action(
        &runner,
        repo.path(),
        workspace::HistoryAction::Merge,
        "--abort"
    )
    .is_err());
}
