mod common;

use std::fs;
use tg_core::{apply_patch_to_index, CoreError};

/// 用例 1: hunks 夹具中包含 3 个独立 hunk，仅暂存第 2 个 hunk (AT-05a)
#[test]
fn test_stage_second_hunk_of_three() {
    let repo = common::hunks();
    let file_path = repo.path().join("multi_hunk.txt");
    let bytes_before = fs::read(&file_path).expect("read worktree file before");

    // 手写只含第 2 个 hunk 的补丁
    let patch = [
        "diff --git a/multi_hunk.txt b/multi_hunk.txt",
        "--- a/multi_hunk.txt",
        "+++ b/multi_hunk.txt",
        "@@ -22,7 +22,7 @@",
        " line 22",
        " line 23",
        " line 24",
        "-line 25",
        "+line 25 MODIFIED",
        " line 26",
        " line 27",
        " line 28",
        "",
    ]
    .join("\n");

    apply_patch_to_index(repo.path(), &patch).expect("apply_patch_to_index should succeed");

    // 验证工作区文件字节完全不变
    let bytes_after = fs::read(&file_path).expect("read worktree file after");
    assert_eq!(
        bytes_before, bytes_after,
        "worktree file must remain untouched"
    );

    // 运行真实 git diff --cached
    let diff_cached = repo.git(&[
        "-c",
        "core.autocrlf=false",
        "diff",
        "--cached",
        "--no-color",
        "--no-ext-diff",
    ]);
    let actual_diff = String::from_utf8_lossy(&diff_cached.stdout);

    let expected_diff = [
        "diff --git a/multi_hunk.txt b/multi_hunk.txt",
        "index 9f02138..f4fe8f9 100644",
        "--- a/multi_hunk.txt",
        "+++ b/multi_hunk.txt",
        "@@ -22,7 +22,7 @@ line 21",
        " line 22",
        " line 23",
        " line 24",
        "-line 25",
        "+line 25 MODIFIED",
        " line 26",
        " line 27",
        " line 28",
        "",
    ]
    .join("\n");

    assert_eq!(
        actual_diff, expected_diff,
        "diff --cached must match verbatim"
    );
}

/// 用例 2: hunks 混合 hunk（2 删 3 增），只选第 1 行删除和第 2 行新增 (AT-05b)
/// 补丁把未选的删除行变成上下文行、丢弃未选的新增行，并重算 hunk 头
#[test]
fn test_stage_mixed_hunk_partial_lines() {
    let repo = common::hunks();
    let file_path = repo.path().join("mixed_hunk.txt");
    let bytes_before = fs::read(&file_path).expect("read worktree file before");

    // 手写只含第 1 行删除和第 2 行新增的补丁
    // 未选删除行 old line B 转为上下文行，未选新增行 new line 1 / 3 丢弃
    // 旧行数 6，新行数 6
    let patch = [
        "diff --git a/mixed_hunk.txt b/mixed_hunk.txt",
        "--- a/mixed_hunk.txt",
        "+++ b/mixed_hunk.txt",
        "@@ -1,6 +1,6 @@",
        " prefix 1",
        " prefix 2",
        "-old line A",
        "+new line 2",
        " old line B",
        " suffix 1",
        " suffix 2",
        "",
    ]
    .join("\n");

    apply_patch_to_index(repo.path(), &patch).expect("apply_patch_to_index should succeed");

    // 验证工作区文件字节完全不变
    let bytes_after = fs::read(&file_path).expect("read worktree file after");
    assert_eq!(
        bytes_before, bytes_after,
        "worktree file must remain untouched"
    );

    // 运行真实 git diff --cached
    let diff_cached = repo.git(&[
        "-c",
        "core.autocrlf=false",
        "diff",
        "--cached",
        "--no-color",
        "--no-ext-diff",
    ]);
    let actual_diff = String::from_utf8_lossy(&diff_cached.stdout);

    let expected_diff = [
        "diff --git a/mixed_hunk.txt b/mixed_hunk.txt",
        "index 5a1cdc0..d359f1a 100644",
        "--- a/mixed_hunk.txt",
        "+++ b/mixed_hunk.txt",
        "@@ -1,6 +1,6 @@",
        " prefix 1",
        " prefix 2",
        "-old line A",
        "+new line 2",
        " old line B",
        " suffix 1",
        " suffix 2",
        "",
    ]
    .join("\n");

    assert_eq!(
        actual_diff, expected_diff,
        "diff --cached must match verbatim"
    );
}

/// 用例 3: CRLF 文件做混合 hunk 部分暂存 (AT-05d)
/// 验证 index 中文件换行符仍为 CRLF，且 diff --cached 逐字一致
#[test]
fn test_stage_crlf_partial_lines() {
    let repo = common::crlf();
    let file_path = repo.path().join("crlf_mixed.txt");
    let initial_crlf =
        "prefix 1\r\nprefix 2\r\nold line A\r\nold line B\r\nsuffix 1\r\nsuffix 2\r\n";
    fs::write(&file_path, initial_crlf).expect("write initial crlf");
    repo.git(&["add", "crlf_mixed.txt"]);
    repo.git(&["commit", "-m", "add crlf_mixed.txt"]);

    // 工作区修改为 3 新增 2 删除 (全为 CRLF)
    let modified_crlf =
        "prefix 1\r\nprefix 2\r\nnew line 1\r\nnew line 2\r\nnew line 3\r\nsuffix 1\r\nsuffix 2\r\n";
    fs::write(&file_path, modified_crlf).expect("write modified crlf");

    let bytes_before = fs::read(&file_path).expect("read worktree file before");

    // 手写只暂存第 1 删第 2 增的 CRLF 补丁
    let patch = [
        "diff --git a/crlf_mixed.txt b/crlf_mixed.txt",
        "--- a/crlf_mixed.txt",
        "+++ b/crlf_mixed.txt",
        "@@ -1,6 +1,6 @@",
        " prefix 1\r",
        " prefix 2\r",
        "-old line A\r",
        "+new line 2\r",
        " old line B\r",
        " suffix 1\r",
        " suffix 2\r",
        "",
    ]
    .join("\n");

    apply_patch_to_index(repo.path(), &patch).expect("apply_patch_to_index on crlf");

    // 验证工作区文件字节完全不变
    let bytes_after = fs::read(&file_path).expect("read worktree file after");
    assert_eq!(
        bytes_before, bytes_after,
        "worktree file must remain untouched"
    );

    // 验证 git diff --cached 逐字一致
    let diff_cached = repo.git(&[
        "-c",
        "core.autocrlf=false",
        "diff",
        "--cached",
        "--no-color",
        "--no-ext-diff",
    ]);
    let actual_diff = String::from_utf8_lossy(&diff_cached.stdout);

    let expected_diff = [
        "diff --git a/crlf_mixed.txt b/crlf_mixed.txt",
        "index cef3813..e39164e 100644",
        "--- a/crlf_mixed.txt",
        "+++ b/crlf_mixed.txt",
        "@@ -1,6 +1,6 @@",
        " prefix 1\r",
        " prefix 2\r",
        "-old line A\r",
        "+new line 2\r",
        " old line B\r",
        " suffix 1\r",
        " suffix 2\r",
        "",
    ]
    .join("\n");

    assert_eq!(
        actual_diff, expected_diff,
        "crlf diff --cached must match verbatim"
    );

    // 断言 index 里的文件仍是 CRLF (git cat-file -p :crlf_mixed.txt 的字节含 \r\n)
    let cat_file = repo.git(&["cat-file", "-p", ":crlf_mixed.txt"]);
    let cat_bytes = cat_file.stdout;
    let expected_index_content =
        b"prefix 1\r\nprefix 2\r\nnew line 2\r\nold line B\r\nsuffix 1\r\nsuffix 2\r\n";
    assert_eq!(
        cat_bytes.as_slice(),
        expected_index_content,
        "index content must strictly preserve CRLF bytes"
    );
    assert!(
        cat_bytes.windows(2).any(|w| w == b"\r\n"),
        "index must contain \\r\\n"
    );
}

/// 用例 4: 未跟踪的 10 行新文件，只暂存第 1–3 行 (AT-05e)
/// 选用方案：直接构造 new file mode 100644 补丁应用到 index，无需额外的 git add -N
#[test]
fn test_stage_new_untracked_file_partial() {
    let repo = common::basic();
    let file_path = repo.path().join("new_file.txt");
    let mut lines = Vec::new();
    for i in 1..=10 {
        lines.push(format!("line {}\n", i));
    }
    let full_content = lines.concat();
    fs::write(&file_path, &full_content).expect("write new untracked file");

    let bytes_before = fs::read(&file_path).expect("read worktree file before");

    // 手写只含第 1–3 行的 new file mode 补丁
    let patch = [
        "diff --git a/new_file.txt b/new_file.txt",
        "new file mode 100644",
        "--- /dev/null",
        "+++ b/new_file.txt",
        "@@ -0,0 +1,3 @@",
        "+line 1",
        "+line 2",
        "+line 3",
        "",
    ]
    .join("\n");

    apply_patch_to_index(repo.path(), &patch).expect("apply_patch_to_index on new file");

    // 验证工作区文件字节完全不变（仍是全部 10 行）
    let bytes_after = fs::read(&file_path).expect("read worktree file after");
    assert_eq!(
        bytes_before, bytes_after,
        "worktree file must remain untouched (all 10 lines)"
    );

    // 验证 git diff --cached 逐字一致
    let diff_cached = repo.git(&[
        "-c",
        "core.autocrlf=false",
        "diff",
        "--cached",
        "--no-color",
        "--no-ext-diff",
    ]);
    let actual_diff = String::from_utf8_lossy(&diff_cached.stdout);

    let expected_diff = [
        "diff --git a/new_file.txt b/new_file.txt",
        "new file mode 100644",
        "index 0000000..a92d664",
        "--- /dev/null",
        "+++ b/new_file.txt",
        "@@ -0,0 +1,3 @@",
        "+line 1",
        "+line 2",
        "+line 3",
        "",
    ]
    .join("\n");

    assert_eq!(
        actual_diff, expected_diff,
        "new file diff --cached must match verbatim"
    );

    // 验证 index 中的文件内容确实仅为前 3 行
    let cat_file = repo.git(&["cat-file", "-p", ":new_file.txt"]);
    let cat_str = String::from_utf8_lossy(&cat_file.stdout);
    assert_eq!(cat_str, "line 1\nline 2\nline 3\n");
}

/// 用例 5: 原文件末行无换行符，修改末行并只暂存该行，补丁含 \ No newline at end of file
#[test]
fn test_stage_no_newline_at_eof() {
    let repo = common::basic();
    let file_path = repo.path().join("no_newline.txt");
    // 提交末行无换行符的文件
    let initial_content = "line 1\nline 2\nline 3";
    fs::write(&file_path, initial_content).expect("write no_newline file");
    repo.git(&["add", "no_newline.txt"]);
    repo.git(&["commit", "-m", "add no_newline.txt"]);

    // 工作区修改第 1 行与第 3 行，末行仍无换行符
    let modified_content = "line 1 MODIFIED\nline 2\nline 3 MODIFIED";
    fs::write(&file_path, modified_content).expect("modify no_newline file");

    let bytes_before = fs::read(&file_path).expect("read worktree file before");

    // 手写补丁：只暂存第 3 行的修改，包含两处 \ No newline at end of file
    let patch = [
        "diff --git a/no_newline.txt b/no_newline.txt",
        "--- a/no_newline.txt",
        "+++ b/no_newline.txt",
        "@@ -1,3 +1,3 @@",
        " line 1",
        " line 2",
        "-line 3",
        "\\ No newline at end of file",
        "+line 3 MODIFIED",
        "\\ No newline at end of file",
        "",
    ]
    .join("\n");

    apply_patch_to_index(repo.path(), &patch).expect("apply_patch_to_index on no_newline");

    // 验证工作区文件字节完全不变
    let bytes_after = fs::read(&file_path).expect("read worktree file after");
    assert_eq!(
        bytes_before, bytes_after,
        "worktree file must remain untouched"
    );

    // 验证 git diff --cached 逐字一致
    let diff_cached = repo.git(&[
        "-c",
        "core.autocrlf=false",
        "diff",
        "--cached",
        "--no-color",
        "--no-ext-diff",
    ]);
    let actual_diff = String::from_utf8_lossy(&diff_cached.stdout);

    let expected_diff = [
        "diff --git a/no_newline.txt b/no_newline.txt",
        "index 8cf2f17..6e9e79f 100644",
        "--- a/no_newline.txt",
        "+++ b/no_newline.txt",
        "@@ -1,3 +1,3 @@",
        " line 1",
        " line 2",
        "-line 3",
        "\\ No newline at end of file",
        "+line 3 MODIFIED",
        "\\ No newline at end of file",
        "",
    ]
    .join("\n");

    assert_eq!(
        actual_diff, expected_diff,
        "no_newline diff --cached must match verbatim"
    );

    // 验证 index 中的内容：第 1 行为原始 line 1，第 3 行为 line 3 MODIFIED，末尾无换行
    let cat_file = repo.git(&["cat-file", "-p", ":no_newline.txt"]);
    let cat_str = String::from_utf8_lossy(&cat_file.stdout);
    assert_eq!(cat_str, "line 1\nline 2\nline 3 MODIFIED");
}

/// 用例 6: 取消暂存反向一行（AT-05c 的 L1 雏形）
/// 先整文件暂存，再应用反向补丁（git diff --cached 视角的反转）到 index，撤回其中一行的暂存
#[test]
fn test_unstage_reverse_single_line() {
    let repo = common::basic();
    let file_path = repo.path().join("unstage_test.txt");
    let initial_content = "line 1\nline 2\nline 3\nline 4\nline 5\n";
    fs::write(&file_path, initial_content).expect("write initial unstage file");
    repo.git(&["add", "unstage_test.txt"]);
    repo.git(&["commit", "-m", "add unstage_test.txt"]);

    // 工作区修改第 2 行和第 4 行
    let modified_content = "line 1\nline 2 MODIFIED\nline 3\nline 4 MODIFIED\nline 5\n";
    fs::write(&file_path, modified_content).expect("modify unstage file");

    // 全文件暂存
    repo.git(&["add", "unstage_test.txt"]);

    let bytes_before = fs::read(&file_path).expect("read worktree file before");

    // 手写反向补丁：从 index 中撤回第 4 行的修改（将 line 4 MODIFIED 恢复为 line 4）
    let reverse_patch = [
        "diff --git a/unstage_test.txt b/unstage_test.txt",
        "--- a/unstage_test.txt",
        "+++ b/unstage_test.txt",
        "@@ -1,5 +1,5 @@",
        " line 1",
        " line 2 MODIFIED",
        " line 3",
        "-line 4 MODIFIED",
        "+line 4",
        " line 5",
        "",
    ]
    .join("\n");

    apply_patch_to_index(repo.path(), &reverse_patch).expect("apply reverse patch to index");

    // 验证工作区文件字节完全不变（仍保留第 2 行与第 4 行的修改）
    let bytes_after = fs::read(&file_path).expect("read worktree file after");
    assert_eq!(
        bytes_before, bytes_after,
        "worktree file must remain untouched"
    );

    // 验证 git diff --cached 逐字一致：仅剩第 2 行处于暂存状态
    let diff_cached = repo.git(&[
        "-c",
        "core.autocrlf=false",
        "diff",
        "--cached",
        "--no-color",
        "--no-ext-diff",
    ]);
    let actual_diff = String::from_utf8_lossy(&diff_cached.stdout);

    let expected_diff = [
        "diff --git a/unstage_test.txt b/unstage_test.txt",
        "index 94c99a3..b77342c 100644",
        "--- a/unstage_test.txt",
        "+++ b/unstage_test.txt",
        "@@ -1,5 +1,5 @@",
        " line 1",
        "-line 2",
        "+line 2 MODIFIED",
        " line 3",
        " line 4",
        " line 5",
        "",
    ]
    .join("\n");

    assert_eq!(
        actual_diff, expected_diff,
        "unstage diff --cached must match verbatim"
    );

    // 验证 index 中第 4 行已恢复，第 2 行保持修改
    let cat_file = repo.git(&["cat-file", "-p", ":unstage_test.txt"]);
    let cat_str = String::from_utf8_lossy(&cat_file.stdout);
    assert_eq!(cat_str, "line 1\nline 2 MODIFIED\nline 3\nline 4\nline 5\n");
}

#[test]
fn test_reject_patch_that_escapes_the_worktree() {
    let repo = common::basic();
    let outside = repo
        .path()
        .parent()
        .expect("repo parent")
        .join("outside.txt");
    let _ = fs::remove_file(&outside);

    let patch = "\
diff --git a/../outside.txt b/../outside.txt
new file mode 100644
--- /dev/null
+++ b/../outside.txt
@@ -0,0 +1 @@
+pwned
";
    let err = apply_patch_to_index(repo.path(), patch).expect_err("escape must be rejected");
    assert!(
        matches!(err, CoreError::RejectedPatch(_)),
        "expected RejectedPatch, got {err:?}"
    );
    assert!(
        !outside.exists(),
        "patch wrote a file outside the repository"
    );
    assert!(!repo.path().join("outside.txt").exists());
}

#[test]
fn test_reject_binary_patch() {
    let repo = common::basic();
    let patch = "\
diff --git a/data.bin b/data.bin
new file mode 100644
--- /dev/null
+++ b/data.bin
GIT binary patch
literal 4
zcmV-b0
";
    let err = apply_patch_to_index(repo.path(), patch).expect_err("binary must be rejected");
    assert!(
        matches!(err, CoreError::RejectedPatch(_)),
        "expected RejectedPatch, got {err:?}"
    );
    let listed = repo.git(&["ls-files", "--", "data.bin"]);
    assert!(
        listed.stdout.is_empty(),
        "binary patch changed the index: {}",
        String::from_utf8_lossy(&listed.stdout)
    );
}

#[test]
fn test_rename_patch_updates_index_path() {
    let repo = common::basic();
    let patch = "\
diff --git a/a.java b/a_renamed.java
similarity index 100%
rename from a.java
rename to a_renamed.java
";
    apply_patch_to_index(repo.path(), patch).expect("apply rename patch");
    let files = repo.git(&["ls-files"]);
    let listed = String::from_utf8_lossy(&files.stdout);
    assert!(
        listed.lines().any(|line| line == "a_renamed.java"),
        "renamed path missing from index: {listed}"
    );
    assert!(
        !listed.lines().any(|line| line == "a.java"),
        "old path still in index: {listed}"
    );
    let cat = repo.git(&["cat-file", "-p", ":a_renamed.java"]);
    assert!(
        cat.stdout.starts_with(b"public class A"),
        "rename dropped blob contents"
    );
}

#[test]
fn test_reject_symlink_patch() {
    let repo = common::basic();
    let patch = "\
diff --git a/link b/link
new file mode 120000
--- /dev/null
+++ b/link
@@ -0,0 +1 @@
+/tmp/outside
";
    let err = apply_patch_to_index(repo.path(), patch).expect_err("symlink must be rejected");
    assert!(matches!(err, CoreError::RejectedPatch(_)), "{err:?}");
    assert!(!repo.path().join("link").exists());
}
