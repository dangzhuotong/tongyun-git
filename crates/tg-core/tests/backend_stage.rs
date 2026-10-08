mod common;

use tg_core::{Git2Backend, GitBackend};

#[test]
fn test_stage_and_unstage_files_at_04() {
    let repo = common::basic();
    let backend = Git2Backend::open(repo.path()).expect("open repo");

    // Modify a.java and b.ts in worktree
    let java_path = repo.path().join("a.java");
    let ts_path = repo.path().join("b.ts");
    std::fs::write(&java_path, "public class A { /* modified */ }\n").expect("write a.java");
    std::fs::write(&ts_path, "export function add() { return 42; }\n").expect("write b.ts");

    // AT-04a: Stage both files
    backend
        .stage_files(&["a.java", "b.ts"])
        .expect("stage both files");

    // Check with real git command
    let diff_cached = repo.git(&["diff", "--cached", "--name-only"]);
    let staged_files: Vec<&str> = std::str::from_utf8(&diff_cached.stdout)
        .expect("utf8")
        .lines()
        .collect();
    assert_eq!(
        staged_files,
        vec!["a.java", "b.ts"],
        "both files should be in git diff --cached"
    );

    // AT-04b: Unstage one of them (b.ts)
    backend.unstage_files(&["b.ts"]).expect("unstage b.ts");

    let diff_cached_after = repo.git(&["diff", "--cached", "--name-only"]);
    let staged_after: Vec<&str> = std::str::from_utf8(&diff_cached_after.stdout)
        .expect("utf8")
        .lines()
        .collect();
    assert_eq!(
        staged_after,
        vec!["a.java"],
        "only a.java should remain staged"
    );
}

#[test]
fn test_stage_deleted_file() {
    let repo = common::basic();
    let backend = Git2Backend::open(repo.path()).expect("open repo");

    let java_path = repo.path().join("a.java");
    std::fs::remove_file(&java_path).expect("remove a.java");

    backend
        .stage_files(&["a.java"])
        .expect("stage deleted file");

    let diff_cached = repo.git(&["diff", "--cached", "--name-status"]);
    let output = String::from_utf8_lossy(&diff_cached.stdout);
    assert!(
        output.contains("D\ta.java"),
        "expected D\\ta.java, got: {}",
        output
    );
}
