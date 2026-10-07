mod common;

use std::fs;
use tg_core::{ChangeKind, CoreError, Git2Backend, GitBackend};

#[test]
fn test_repo_open_and_roots() {
    let repo = common::basic();
    let root_canon = fs::canonicalize(repo.path()).expect("canonicalize root");

    // Open from repo root
    let backend = Git2Backend::open(repo.path()).expect("open repo root");
    assert_eq!(
        fs::canonicalize(backend.repo_root()).expect("canonicalize backend root"),
        root_canon
    );

    // Open from a subdirectory within repo
    let sub = repo.path().join("subdir").join("nested");
    fs::create_dir_all(&sub).expect("create nested subdir");
    let backend_sub = Git2Backend::open(&sub).expect("open subdir");
    assert_eq!(
        fs::canonicalize(backend_sub.repo_root()).expect("canonicalize backend sub root"),
        root_canon
    );

    // Open non-git directory -> NotARepository
    let non_git = tempfile::tempdir().expect("create non-git tempdir");
    let err_non_git = Git2Backend::open(non_git.path());
    assert!(
        matches!(err_non_git, Err(CoreError::NotARepository)),
        "expected NotARepository, got: {:?}",
        err_non_git
    );

    // Open bare repository -> BareRepository
    let bare_dir = tempfile::tempdir().expect("create bare tempdir");
    common::git_cmd(bare_dir.path(), bare_dir.path(), &["init", "--bare"]);
    let err_bare = Git2Backend::open(bare_dir.path());
    assert!(
        matches!(err_bare, Err(CoreError::BareRepository)),
        "expected BareRepository, got: {:?}",
        err_bare
    );
}

#[test]
fn test_status_worktree_and_staged() {
    let repo = common::basic();
    let backend = Git2Backend::open(repo.path()).expect("open repo");

    // Initially clean
    let initial_status = backend.status().expect("status on clean repo");
    assert!(
        initial_status.is_empty(),
        "clean repo should have empty status"
    );

    // 1. Untracked file
    fs::write(repo.path().join("new_file.txt"), "new file content\n").expect("write new_file");

    // 2. Modified file
    fs::write(repo.path().join("README.md"), "# Modified README\n").expect("modify README");

    // 3. Deleted file
    fs::remove_file(repo.path().join("a.java")).expect("remove a.java");

    let status_wt = backend.status().expect("status with worktree changes");
    assert_eq!(status_wt.len(), 3, "expected 3 status entries");

    let new_entry = status_wt
        .iter()
        .find(|s| s.path == "new_file.txt")
        .expect("new_file.txt status");
    assert_eq!(new_entry.worktree, Some(ChangeKind::Untracked));
    assert_eq!(new_entry.index, None);
    assert!(!new_entry.conflicted);

    let mod_entry = status_wt
        .iter()
        .find(|s| s.path == "README.md")
        .expect("README.md status");
    assert_eq!(mod_entry.worktree, Some(ChangeKind::Modified));
    assert_eq!(mod_entry.index, None);
    assert!(!mod_entry.conflicted);

    let del_entry = status_wt
        .iter()
        .find(|s| s.path == "a.java")
        .expect("a.java status");
    assert_eq!(del_entry.worktree, Some(ChangeKind::Deleted));
    assert_eq!(del_entry.index, None);
    assert!(!del_entry.conflicted);

    // Stage new_file.txt -> index: Added
    repo.git(&["add", "new_file.txt"]);
    let status_after_add = backend.status().expect("status after add new_file");
    let added_entry = status_after_add
        .iter()
        .find(|s| s.path == "new_file.txt")
        .expect("new_file.txt added");
    assert_eq!(added_entry.index, Some(ChangeKind::Added));
    assert_eq!(added_entry.worktree, None);

    // Stage README.md -> index: Modified
    repo.git(&["add", "README.md"]);
    let status_after_add_mod = backend.status().expect("status after add README");
    let staged_mod_entry = status_after_add_mod
        .iter()
        .find(|s| s.path == "README.md")
        .expect("README.md staged mod");
    assert_eq!(staged_mod_entry.index, Some(ChangeKind::Modified));
    assert_eq!(staged_mod_entry.worktree, None);
}

#[test]
fn test_status_rename() {
    let repo = common::rename();
    let backend = Git2Backend::open(repo.path()).expect("open rename repo");

    let statuses = backend.status().expect("status on rename repo");
    assert_eq!(statuses.len(), 1, "expected 1 rename status entry");

    let ren = &statuses[0];
    assert_eq!(ren.path, "b.txt");
    assert_eq!(ren.old_path.as_deref(), Some("a.txt"));
    assert_eq!(ren.index, Some(ChangeKind::Renamed));
    assert_eq!(ren.worktree, None);
    assert!(!ren.conflicted);
}

#[test]
fn test_head_unborn_and_detached() {
    // Unborn repository
    let unborn_repo = common::unborn();
    let backend_unborn = Git2Backend::open(unborn_repo.path()).expect("open unborn repo");
    let head_unborn = backend_unborn.head().expect("head of unborn repo");
    assert!(head_unborn.unborn, "unborn flag must be true");
    assert_eq!(head_unborn.oid, None, "unborn repo has no oid");
    assert_eq!(
        head_unborn.branch.as_deref(),
        Some("main"),
        "unborn default branch is main"
    );

    // Normal repo with commits
    let repo = common::basic();
    let backend = Git2Backend::open(repo.path()).expect("open basic repo");
    let head = backend.head().expect("head of basic repo");
    assert!(!head.unborn);
    assert!(head.oid.is_some());
    assert_eq!(head.branch.as_deref(), Some("main"));

    // Detached HEAD
    repo.git(&["checkout", "HEAD~1"]);
    let head_detached = backend.head().expect("detached head");
    assert!(!head_detached.unborn);
    let oid = head_detached.oid.expect("detached has oid");
    assert_eq!(
        head_detached.branch.as_deref(),
        Some(&oid[..7]),
        "detached head branch contains short hash"
    );
}
