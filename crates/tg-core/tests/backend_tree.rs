mod common;

use std::collections::HashSet;
use std::fs;
use tg_core::{Git2Backend, GitBackend, TreeFile};

#[test]
fn test_tree_files_comprehensive() {
    let repo = common::basic();

    // 1. Committed file in subdirectory
    let src_utils = repo.path().join("src").join("utils");
    fs::create_dir_all(&src_utils).expect("create src/utils");
    fs::write(src_utils.join("math.ts"), "export const pi = 3.14;\n").expect("write math.ts");
    repo.git(&["add", "src/utils/math.ts"]);

    // 2. Committed file that will be deleted in worktree (rm on disk, not git rm)
    fs::write(
        repo.path().join("deleted_in_wt.txt"),
        "will be deleted from worktree\n",
    )
    .expect("write deleted_in_wt.txt");
    repo.git(&["add", "deleted_in_wt.txt"]);

    // 3. Committed file that will be staged deleted (git rm)
    fs::write(
        repo.path().join("staged_deleted.txt"),
        "will be deleted via git rm\n",
    )
    .expect("write staged_deleted.txt");
    repo.git(&["add", "staged_deleted.txt"]);

    // 4. Committed file that will later be added to .gitignore
    fs::write(
        repo.path().join("tracked_then_ignored.txt"),
        "tracked first, ignored later\n",
    )
    .expect("write tracked_then_ignored.txt");
    repo.git(&["add", "tracked_then_ignored.txt"]);

    // Commit all these prepared files
    repo.git(&["commit", "-m", "commit prepared files for tree test"]);

    // 5. Create .gitignore
    let gitignore_content = "\
node_modules/
*.log
ignored_dir/
tracked_then_ignored.txt
";
    fs::write(repo.path().join(".gitignore"), gitignore_content).expect("write .gitignore");

    // 6. Delete file in worktree only (still in index)
    fs::remove_file(repo.path().join("deleted_in_wt.txt")).expect("delete in wt");

    // 7. Staged delete file (git rm, removed from index and disk)
    repo.git(&["rm", "staged_deleted.txt"]);

    // 8. Create ignored files and directories
    let node_modules_pkg = repo.path().join("node_modules").join("my-pkg");
    fs::create_dir_all(&node_modules_pkg).expect("create node_modules");
    fs::write(node_modules_pkg.join("index.js"), "module.exports = {};\n")
        .expect("write node_modules file");

    fs::write(repo.path().join("debug.log"), "debug log content\n").expect("write debug.log");

    let ignored_dir = repo.path().join("ignored_dir");
    fs::create_dir_all(&ignored_dir).expect("create ignored_dir");
    fs::write(ignored_dir.join("secret.key"), "secret-123\n").expect("write secret.key");

    // 9. Create untracked files (not ignored)
    fs::write(
        repo.path().join("untracked_root.txt"),
        "untracked root file\n",
    )
    .expect("write untracked_root.txt");

    let src_components = repo.path().join("src").join("components");
    fs::create_dir_all(&src_components).expect("create src/components");
    fs::write(
        src_components.join("Tree.tsx"),
        "export function Tree() {}\n",
    )
    .expect("write Tree.tsx");

    // Open backend and list files
    let backend = Git2Backend::open(repo.path()).expect("open repo backend");
    let files: Vec<TreeFile> = backend.list_repo_files().expect("list_repo_files");

    // Assertion 0: Verify list_repo_files via GitBackend trait returns identical results
    let backend_trait: &dyn GitBackend = &backend;
    let files_via_trait = backend_trait.list_repo_files().expect("list via trait");
    assert_eq!(
        files, files_via_trait,
        "trait call must match inherent method"
    );

    // Assertion 1: Ignored files and directories must NOT be in the result
    assert!(
        !files.iter().any(|f| f.path == "debug.log"),
        "debug.log should be ignored and excluded"
    );
    assert!(
        !files.iter().any(|f| f.path.starts_with("node_modules/")),
        "node_modules/ should be ignored and excluded"
    );
    assert!(
        !files.iter().any(|f| f.path.starts_with("ignored_dir/")),
        "ignored_dir/ should be ignored and excluded"
    );

    // Assertion 2: Worktree deleted file is in result with deleted_on_disk == true
    let wt_del = files
        .iter()
        .find(|f| f.path == "deleted_in_wt.txt")
        .expect("deleted_in_wt.txt must be in result");
    assert!(
        wt_del.deleted_on_disk,
        "deleted_in_wt.txt should have deleted_on_disk=true"
    );

    // Assertion 3: Staged deleted file (git rm) is in result with deleted_on_disk == true
    let staged_del = files
        .iter()
        .find(|f| f.path == "staged_deleted.txt")
        .expect("staged_deleted.txt must be in result");
    assert!(
        staged_del.deleted_on_disk,
        "staged_deleted.txt should have deleted_on_disk=true"
    );

    // Assertion 4: Untracked files (not ignored) are in result with deleted_on_disk == false
    let untracked_root = files
        .iter()
        .find(|f| f.path == "untracked_root.txt")
        .expect("untracked_root.txt must be in result");
    assert!(
        !untracked_root.deleted_on_disk,
        "untracked_root.txt should have deleted_on_disk=false"
    );

    let untracked_comp = files
        .iter()
        .find(|f| f.path == "src/components/Tree.tsx")
        .expect("src/components/Tree.tsx must be in result");
    assert!(
        !untracked_comp.deleted_on_disk,
        "src/components/Tree.tsx should have deleted_on_disk=false"
    );

    // Assertion 5: Tracked file later added to .gitignore is STILL in result (because it's in index)
    let tracked_then_ignored = files
        .iter()
        .find(|f| f.path == "tracked_then_ignored.txt")
        .expect("tracked_then_ignored.txt must be in result");
    assert!(
        !tracked_then_ignored.deleted_on_disk,
        "tracked_then_ignored.txt exists on disk, so deleted_on_disk=false"
    );

    // Assertion 6: Subdirectory tracked file is in result with forward slash
    let sub_math = files
        .iter()
        .find(|f| f.path == "src/utils/math.ts")
        .expect("src/utils/math.ts must be in result");
    assert!(!sub_math.deleted_on_disk);

    // Assertion 7: Regular tracked files exist
    assert!(files
        .iter()
        .any(|f| f.path == "README.md" && !f.deleted_on_disk));
    assert!(files
        .iter()
        .any(|f| f.path == "a.java" && !f.deleted_on_disk));
    assert!(files.iter().any(|f| f.path == "b.ts" && !f.deleted_on_disk));

    // Assertion 8: Paths are strictly sorted in ascending order and unique
    assert!(!files.is_empty(), "result must not be empty");
    for window in files.windows(2) {
        assert!(
            window[0].path < window[1].path,
            "paths must be strictly sorted and unique: {:?} vs {:?}",
            window[0].path,
            window[1].path
        );
    }

    // Assertion 9: Verify against real git CLI (git ls-files is a subset of tree files)
    let ls_output = repo.git(&["ls-files"]);
    let ls_stdout = String::from_utf8_lossy(&ls_output.stdout);
    let ls_files: Vec<&str> = ls_stdout
        .lines()
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .collect();
    assert!(!ls_files.is_empty(), "git ls-files must not be empty");

    let tree_path_set: HashSet<&str> = files.iter().map(|f| f.path.as_str()).collect();
    for git_file in &ls_files {
        assert!(
            tree_path_set.contains(git_file),
            "git ls-files item '{}' must be present in tree_files",
            git_file
        );
    }

    // Verify staged_deleted.txt is NOT in git ls-files (since git rm removed it from index),
    // but IS present in our tree_files result
    assert!(
        !ls_files.contains(&"staged_deleted.txt"),
        "staged_deleted.txt should NOT be in git ls-files"
    );
    assert!(
        tree_path_set.contains("staged_deleted.txt"),
        "staged_deleted.txt must be in tree_files"
    );
}

#[test]
fn test_tree_files_unborn_repo() {
    let repo = common::unborn();
    let backend = Git2Backend::open(repo.path()).expect("open unborn repo");

    // 1. Fresh empty unborn repo does not error and returns empty list
    let files = backend
        .list_repo_files()
        .expect("list_repo_files on unborn empty repo");
    assert!(
        files.is_empty(),
        "unborn empty repo should return empty vec"
    );

    // 2. Untracked file in unborn repo
    fs::write(repo.path().join("initial.md"), "# Initial\n").expect("write initial.md");
    let files_with_untracked = backend
        .list_repo_files()
        .expect("list_repo_files with untracked");
    assert_eq!(files_with_untracked.len(), 1);
    assert_eq!(files_with_untracked[0].path, "initial.md");
    assert!(!files_with_untracked[0].deleted_on_disk);

    // 3. Staged file in unborn repo (in index, before any commit)
    repo.git(&["add", "initial.md"]);
    let files_staged = backend.list_repo_files().expect("list_repo_files staged");
    assert_eq!(files_staged.len(), 1);
    assert_eq!(files_staged[0].path, "initial.md");
    assert!(!files_staged[0].deleted_on_disk);

    // 4. Staged file in unborn repo deleted on disk
    fs::remove_file(repo.path().join("initial.md")).expect("remove initial.md");
    let files_deleted_wt = backend
        .list_repo_files()
        .expect("list_repo_files staged deleted");
    assert_eq!(files_deleted_wt.len(), 1);
    assert_eq!(files_deleted_wt[0].path, "initial.md");
    assert!(files_deleted_wt[0].deleted_on_disk);
}

#[test]
fn test_tree_files_git_rm_cached() {
    let repo = common::basic();
    let backend = Git2Backend::open(repo.path()).expect("open repo");

    // Create and commit a file
    fs::write(repo.path().join("cached_test.txt"), "cached content\n").expect("write file");
    repo.git(&["add", "cached_test.txt"]);
    repo.git(&["commit", "-m", "commit cached_test.txt"]);

    // git rm --cached keeps file on disk but removes from index
    repo.git(&["rm", "--cached", "cached_test.txt"]);

    let files = backend.list_repo_files().expect("list_repo_files");
    let cached = files
        .iter()
        .find(|f| f.path == "cached_test.txt")
        .expect("cached_test.txt must be in list");

    // File still exists on disk, so deleted_on_disk should be false
    assert!(
        !cached.deleted_on_disk,
        "git rm --cached file still on disk should have deleted_on_disk=false"
    );
}

#[test]
fn test_tree_files_clean_repo_matches_ls_files() {
    let repo = common::basic();
    let backend = Git2Backend::open(repo.path()).expect("open repo");

    let files = backend.list_repo_files().expect("list_repo_files");
    assert_eq!(files.len(), 3);

    let ls_output = repo.git(&["ls-files"]);
    let ls_stdout = String::from_utf8_lossy(&ls_output.stdout);
    let mut ls_files: Vec<String> = ls_stdout
        .lines()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .collect();
    ls_files.sort();

    let tree_paths: Vec<String> = files.iter().map(|f| f.path.clone()).collect();
    assert_eq!(
        tree_paths, ls_files,
        "on a clean repo, list_repo_files should match git ls-files exactly"
    );

    for f in &files {
        assert!(
            !f.deleted_on_disk,
            "clean repo files must have deleted_on_disk=false"
        );
    }
}

#[test]
fn test_tree_files_read_only_and_idempotent() {
    let repo = common::basic();
    let backend = Git2Backend::open(repo.path()).expect("open repo");

    // Get git status before
    let status_before = repo.git(&["status", "--porcelain"]);

    let run1 = backend.list_repo_files().expect("first run");
    let run2 = backend.list_repo_files().expect("second run");
    assert_eq!(run1, run2, "list_repo_files must be idempotent");

    // Verify git status is unchanged
    let status_after = repo.git(&["status", "--porcelain"]);
    assert_eq!(
        status_before.stdout, status_after.stdout,
        "list_repo_files must not modify repository status"
    );
}

#[test]
fn test_tree_files_nested_untracked_and_ignored() {
    let repo = common::basic();
    let backend = Git2Backend::open(repo.path()).expect("open repo");

    // Add .gitignore
    fs::write(
        repo.path().join(".gitignore"),
        "target/\n*.tmp\ndeep/ignored/\n",
    )
    .expect("write .gitignore");

    // Deep nested untracked
    let deep_dir = repo.path().join("deep").join("nested").join("pkg");
    fs::create_dir_all(&deep_dir).expect("create deep dir");
    fs::write(deep_dir.join("app.rs"), "fn main() {}\n").expect("write app.rs");

    // Deep nested ignored
    let deep_ignored = repo.path().join("deep").join("ignored");
    fs::create_dir_all(&deep_ignored).expect("create deep ignored");
    fs::write(deep_ignored.join("secret.tmp"), "temp data\n").expect("write secret.tmp");

    // Root ignored
    let target_dir = repo.path().join("target");
    fs::create_dir_all(&target_dir).expect("create target dir");
    fs::write(target_dir.join("build.log"), "build output\n").expect("write build.log");

    let files = backend.list_repo_files().expect("list_repo_files");

    // Verify deep untracked file is present with forward slashes
    assert!(
        files
            .iter()
            .any(|f| f.path == "deep/nested/pkg/app.rs" && !f.deleted_on_disk),
        "deep untracked file must be present"
    );

    // Verify ignored files are not present
    assert!(
        !files
            .iter()
            .any(|f| f.path.starts_with("deep/ignored/") || f.path.starts_with("target/")),
        "ignored directories must not be present"
    );
}
