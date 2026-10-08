mod common;

use tg_core::{
    apply_patch_to_index, build_selected_patch, DiscardService, Git2Backend, GitBackend,
};

#[test]
fn test_build_and_apply_selected_patch_at_05() {
    let repo = common::hunks();
    let backend = Git2Backend::open(repo.path()).expect("open repo");

    let diff = backend
        .diff_file("multi_hunk.txt", false)
        .expect("diff multi_hunk");
    assert_eq!(diff.hunks.len(), 3);

    // AT-05a: 只选第 2 个 hunk (hunk index 1)
    let patch = build_selected_patch(
        "multi_hunk.txt",
        &diff.hunks[1],
        &[], // 空数组代表全选该 hunk
        false,
        false,
    )
    .expect("build patch for hunk 2");

    apply_patch_to_index(repo.path(), &patch).expect("apply patch to index");

    // 运行真实 git diff --cached 校验
    let diff_cached = repo.git(&["diff", "--cached", "--no-color"]);
    let out = String::from_utf8_lossy(&diff_cached.stdout);
    assert!(out.contains("line 25 MODIFIED"));
    assert!(!out.contains("line 5 MODIFIED"));
    assert!(!out.contains("line 45 MODIFIED"));
}

#[test]
fn test_build_and_apply_untracked_file_partial_lines_at_05e() {
    let repo = common::basic();
    let new_path = repo.path().join("new_file.txt");
    let content =
        "line 1\nline 2\nline 3\nline 4\nline 5\nline 6\nline 7\nline 8\nline 9\nline 10\n";
    std::fs::write(&new_path, content).expect("write new_file");

    let backend = Git2Backend::open(repo.path()).expect("open repo");
    let diff = backend
        .diff_file("new_file.txt", false)
        .expect("diff new file");

    assert_eq!(diff.hunks.len(), 1);
    // 只选前 3 行 (index 0, 1, 2)
    let patch = build_selected_patch(
        "new_file.txt",
        &diff.hunks[0],
        &[0, 1, 2],
        false,
        true, // is_new_file
    )
    .expect("build patch");

    apply_patch_to_index(repo.path(), &patch).expect("apply patch");

    // 验证 index 中该文件只有 3 行
    let show = repo.git(&["show", ":new_file.txt"]);
    let index_content = String::from_utf8_lossy(&show.stdout);
    assert_eq!(index_content, "line 1\nline 2\nline 3\n");
}

#[test]
fn test_discard_and_undo_modified_files_at_17a_17d() {
    let repo = common::basic();
    let backend = Git2Backend::open(repo.path()).expect("open repo");

    let java_path = repo.path().join("a.java");
    let ts_path = repo.path().join("b.ts");
    let java_orig = std::fs::read_to_string(&java_path).expect("read a.java");

    // 1. 修改 a.java 并部分暂存
    std::fs::write(&java_path, "public class A { /* modified staged */ }\n").expect("write a.java");
    backend.stage_files(&["a.java"]).expect("stage a.java");
    std::fs::write(
        &java_path,
        "public class A { /* modified staged */ /* extra unstaged */ }\n",
    )
    .expect("write a.java second");

    // 2. 修改 b.ts
    std::fs::write(&ts_path, "export function add() { return 100; }\n").expect("write b.ts");

    // AT-17a: 丢弃这两个文件的改动
    let res = DiscardService::discard_files(repo.path(), &["a.java", "b.ts"])
        .expect("discard_files should succeed");
    assert_eq!(res.discarded_count, 2);
    assert!(res.snapshot_ref.is_some());

    // 验证文件内容等于 HEAD 版本，git status 为干净
    let java_current = std::fs::read_to_string(&java_path).expect("read a.java");
    assert_eq!(java_current, java_orig);

    let status_out = repo.git(&["status", "--porcelain"]);
    assert_eq!(String::from_utf8_lossy(&status_out.stdout).trim(), "");

    // AT-17d: 撤销丢弃
    let undo_res = DiscardService::undo_last_discard(repo.path(), false)
        .expect("undo_last_discard should succeed");
    assert_eq!(undo_res.restored_count, 2);

    // 验证工作区与暂存区恢复到丢弃前
    let java_restored = std::fs::read_to_string(&java_path).expect("read restored a.java");
    assert!(java_restored.contains("extra unstaged"));

    let diff_cached = repo.git(&["diff", "--cached", "--name-only"]);
    let staged_out = String::from_utf8_lossy(&diff_cached.stdout);
    assert!(staged_out.contains("a.java"));
}

#[test]
fn test_discard_untracked_and_new_staged_at_17c() {
    let repo = common::basic();
    let backend = Git2Backend::open(repo.path()).expect("open repo");

    let untracked_path = repo.path().join("untracked.txt");
    std::fs::write(&untracked_path, "untracked content\n").expect("write untracked");

    let new_staged_path = repo.path().join("new_staged.txt");
    std::fs::write(&new_staged_path, "new staged content\n").expect("write new_staged");
    backend
        .stage_files(&["new_staged.txt"])
        .expect("stage new file");

    let res = DiscardService::discard_files(repo.path(), &["untracked.txt", "new_staged.txt"])
        .expect("discard");
    assert_eq!(res.discarded_count, 2);

    // 两个文件在磁盘和 index 中均不存在
    assert!(!untracked_path.exists());
    assert!(!new_staged_path.exists());

    let ls_files = repo.git(&["ls-files", "new_staged.txt"]);
    assert_eq!(String::from_utf8_lossy(&ls_files.stdout).trim(), "");
}

#[test]
fn test_discard_prune_snapshots_limit_20_at_17i() {
    let repo = common::basic();
    let a_path = repo.path().join("a.java");

    // 连续丢弃 21 次
    for i in 0..21 {
        std::fs::write(&a_path, format!("mod {}\n", i)).expect("write mod");
        DiscardService::discard_files(repo.path(), &["a.java"]).expect("discard");
    }

    let repo_git = git2::Repository::open(repo.path()).expect("open");
    let count = repo_git
        .references_glob("refs/tongyun/discard/*")
        .expect("glob")
        .count();

    assert!(
        count <= 20,
        "snapshots count should be pruned to at most 20, got: {}",
        count
    );
}

#[test]
fn test_undo_discard_skip_modified_at_17e() {
    let repo = common::basic();
    let a_path = repo.path().join("a.java");

    std::fs::write(&a_path, "change 1\n").expect("write change 1");
    DiscardService::discard_files(repo.path(), &["a.java"]).expect("discard");

    // 丢弃后外部又改了该文件
    std::fs::write(&a_path, "external change 2\n").expect("write external");

    // 撤销时选跳过冲突文件
    let undo = DiscardService::undo_last_discard(repo.path(), true).expect("undo");
    assert!(undo.skipped_files.contains(&"a.java".to_string()));

    let content = std::fs::read_to_string(&a_path).expect("read");
    assert_eq!(content, "external change 2\n");
}
