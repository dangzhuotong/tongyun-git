#![allow(dead_code)]

use std::path::{Path, PathBuf};
use std::process::{Command, Output};
use tempfile::TempDir;

pub struct TestRepo {
    pub dir: TempDir,
    pub path: PathBuf,
}

impl TestRepo {
    pub fn path(&self) -> &Path {
        &self.path
    }

    pub fn git(&self, args: &[&str]) -> Output {
        git_cmd(&self.path, self.dir.path(), args)
    }

    pub fn head_commit_id(&self) -> String {
        let out = self.git(&["rev-parse", "HEAD"]);
        String::from_utf8_lossy(&out.stdout).trim().to_string()
    }
}

pub struct RemoteFixture {
    pub dir: TempDir,
    pub bare_path: PathBuf,
    pub main_path: PathBuf,
    pub other_path: PathBuf,
}

pub fn git_cmd(cwd: &Path, home: &Path, args: &[&str]) -> Output {
    let null_device = if cfg!(windows) { "NUL" } else { "/dev/null" };
    let output = Command::new("git")
        .current_dir(cwd)
        .env("HOME", home)
        .env("GIT_CONFIG_NOSYSTEM", "1")
        .env("GIT_CONFIG_GLOBAL", null_device)
        .arg("-c")
        .arg("user.name=Test Runner")
        .arg("-c")
        .arg("user.email=test@example.com")
        .arg("-c")
        .arg("init.defaultBranch=main")
        .arg("-c")
        .arg("core.autocrlf=false")
        .args(args)
        .output()
        .unwrap_or_else(|e| panic!("failed to execute git command in {:?}: {}", cwd, e));

    if !output.status.success() {
        panic!(
            "git {:?} in {:?} failed: status={:?}\nstdout: {}\nstderr: {}",
            args,
            cwd,
            output.status,
            String::from_utf8_lossy(&output.stdout),
            String::from_utf8_lossy(&output.stderr)
        );
    }
    output
}

fn init_local_repo(repo_dir: &Path, home: &Path) {
    git_cmd(repo_dir, home, &["init"]);
    git_cmd(repo_dir, home, &["config", "user.name", "Test Runner"]);
    git_cmd(
        repo_dir,
        home,
        &["config", "user.email", "test@example.com"],
    );
    git_cmd(repo_dir, home, &["config", "core.autocrlf", "false"]);
}

/// basic: 3 commits with README.md, a.java, b.ts
pub fn basic() -> TestRepo {
    let dir = tempfile::tempdir().expect("tempdir");
    let home = dir.path();
    let repo_dir = dir.path().join("repo");
    std::fs::create_dir_all(&repo_dir).expect("create_dir");

    init_local_repo(&repo_dir, home);

    // Commit 1: README.md
    std::fs::write(
        repo_dir.join("README.md"),
        "# Test Project\n\nWelcome to test project.\n",
    )
    .expect("write README.md");
    git_cmd(&repo_dir, home, &["add", "README.md"]);
    git_cmd(&repo_dir, home, &["commit", "-m", "commit 1: README"]);

    // Commit 2: a.java
    std::fs::write(
        repo_dir.join("a.java"),
        "public class A {\n    public static void main(String[] args) {\n        System.out.println(\"Hello\");\n    }\n}\n",
    )
    .expect("write a.java");
    git_cmd(&repo_dir, home, &["add", "a.java"]);
    git_cmd(&repo_dir, home, &["commit", "-m", "commit 2: a.java"]);

    // Commit 3: b.ts
    std::fs::write(
        repo_dir.join("b.ts"),
        "export function add(a: number, b: number): number {\n    return a + b;\n}\n",
    )
    .expect("write b.ts");
    git_cmd(&repo_dir, home, &["add", "b.ts"]);
    git_cmd(&repo_dir, home, &["commit", "-m", "commit 3: b.ts"]);

    TestRepo {
        dir,
        path: repo_dir,
    }
}

/// unborn: freshly initialized repository with no commits
pub fn unborn() -> TestRepo {
    let dir = tempfile::tempdir().expect("tempdir");
    let home = dir.path();
    let repo_dir = dir.path().join("repo");
    std::fs::create_dir_all(&repo_dir).expect("create_dir");

    init_local_repo(&repo_dir, home);

    TestRepo {
        dir,
        path: repo_dir,
    }
}

/// hunks: one file (> 40 lines) with 3 separate hunks modified,
/// and one file with 2 lines deleted and 3 lines added in a single hunk
pub fn hunks() -> TestRepo {
    let dir = tempfile::tempdir().expect("tempdir");
    let home = dir.path();
    let repo_dir = dir.path().join("repo");
    std::fs::create_dir_all(&repo_dir).expect("create_dir");

    init_local_repo(&repo_dir, home);

    // File 1: 50 lines
    let mut initial_lines = Vec::new();
    for i in 1..=50 {
        initial_lines.push(format!("line {}\n", i));
    }
    let file1_initial = initial_lines.concat();
    std::fs::write(repo_dir.join("multi_hunk.txt"), &file1_initial).expect("write file1");

    // File 2: mixed hunk
    let file2_initial = "prefix 1\nprefix 2\nold line A\nold line B\nsuffix 1\nsuffix 2\n";
    std::fs::write(repo_dir.join("mixed_hunk.txt"), file2_initial).expect("write file2");

    git_cmd(
        &repo_dir,
        home,
        &["add", "multi_hunk.txt", "mixed_hunk.txt"],
    );
    git_cmd(
        &repo_dir,
        home,
        &["commit", "-m", "commit initial hunks files"],
    );

    // Modify file 1 in working directory (3 distinct hunks)
    let mut modified_lines = initial_lines.clone();
    modified_lines[4] = "line 5 MODIFIED\n".to_string(); // Hunk 1 (0-indexed 4)
    modified_lines[24] = "line 25 MODIFIED\n".to_string(); // Hunk 2 (0-indexed 24)
    modified_lines[44] = "line 45 MODIFIED\n".to_string(); // Hunk 3 (0-indexed 44)
    std::fs::write(repo_dir.join("multi_hunk.txt"), modified_lines.concat()).expect("modify file1");

    // Modify file 2 in working directory (2 lines deleted, 3 lines added)
    let file2_modified =
        "prefix 1\nprefix 2\nnew line 1\nnew line 2\nnew line 3\nsuffix 1\nsuffix 2\n";
    std::fs::write(repo_dir.join("mixed_hunk.txt"), file2_modified).expect("modify file2");

    TestRepo {
        dir,
        path: repo_dir,
    }
}

/// crlf: core.autocrlf=false, CRLF file; and another file with LF changed to CRLF
pub fn crlf() -> TestRepo {
    let dir = tempfile::tempdir().expect("tempdir");
    let home = dir.path();
    let repo_dir = dir.path().join("repo");
    std::fs::create_dir_all(&repo_dir).expect("create_dir");

    init_local_repo(&repo_dir, home);

    let file1_content = "line 1\r\nline 2\r\nline 3\r\n";
    std::fs::write(repo_dir.join("crlf_file.txt"), file1_content).expect("write crlf_file");

    let file2_content = "line A\nline B\nline C\n";
    std::fs::write(repo_dir.join("lf_file.txt"), file2_content).expect("write lf_file");

    git_cmd(&repo_dir, home, &["add", "crlf_file.txt", "lf_file.txt"]);
    git_cmd(
        &repo_dir,
        home,
        &["commit", "-m", "commit crlf and lf files"],
    );

    // Modify lf_file.txt: convert LF to CRLF
    let file2_crlf = "line A\r\nline B\r\nline C\r\n";
    std::fs::write(repo_dir.join("lf_file.txt"), file2_crlf).expect("write lf_file as crlf");

    TestRepo {
        dir,
        path: repo_dir,
    }
}

/// rename: a.txt committed, then git mv a.txt b.txt uncommitted (staged in index)
pub fn rename() -> TestRepo {
    let dir = tempfile::tempdir().expect("tempdir");
    let home = dir.path();
    let repo_dir = dir.path().join("repo");
    std::fs::create_dir_all(&repo_dir).expect("create_dir");

    init_local_repo(&repo_dir, home);

    std::fs::write(repo_dir.join("a.txt"), "rename test content\n").expect("write a.txt");
    git_cmd(&repo_dir, home, &["add", "a.txt"]);
    git_cmd(&repo_dir, home, &["commit", "-m", "add a.txt"]);

    // Staged rename
    git_cmd(&repo_dir, home, &["mv", "a.txt", "b.txt"]);

    TestRepo {
        dir,
        path: repo_dir,
    }
}

/// hooks: pre-commit hook that outputs HOOK FAILED and exits 1
pub fn hooks() -> TestRepo {
    let dir = tempfile::tempdir().expect("tempdir");
    let home = dir.path();
    let repo_dir = dir.path().join("repo");
    std::fs::create_dir_all(&repo_dir).expect("create_dir");

    init_local_repo(&repo_dir, home);

    std::fs::write(repo_dir.join("init.txt"), "init\n").expect("write init.txt");
    git_cmd(&repo_dir, home, &["add", "init.txt"]);
    git_cmd(&repo_dir, home, &["commit", "-m", "init"]);

    let hooks_dir = repo_dir.join(".git").join("hooks");
    std::fs::create_dir_all(&hooks_dir).expect("create hooks dir");

    let hook_path = hooks_dir.join("pre-commit");
    let script = "#!/bin/sh\necho \"HOOK FAILED\" >&2\nexit 1\n";
    std::fs::write(&hook_path, script).expect("write pre-commit hook");

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mut perms = std::fs::metadata(&hook_path)
            .expect("metadata")
            .permissions();
        perms.set_mode(0o755);
        std::fs::set_permissions(&hook_path, perms).expect("chmod pre-commit");
    }

    TestRepo {
        dir,
        path: repo_dir,
    }
}

/// hooks_msg: commit-msg hook that rewrites commit message to "rewritten by hook"
pub fn hooks_msg() -> TestRepo {
    let dir = tempfile::tempdir().expect("tempdir");
    let home = dir.path();
    let repo_dir = dir.path().join("repo");
    std::fs::create_dir_all(&repo_dir).expect("create_dir");

    init_local_repo(&repo_dir, home);

    std::fs::write(repo_dir.join("init.txt"), "init\n").expect("write init.txt");
    git_cmd(&repo_dir, home, &["add", "init.txt"]);
    git_cmd(&repo_dir, home, &["commit", "-m", "init"]);

    let hooks_dir = repo_dir.join(".git").join("hooks");
    std::fs::create_dir_all(&hooks_dir).expect("create hooks dir");

    let hook_path = hooks_dir.join("commit-msg");
    let script = "#!/bin/sh\necho \"rewritten by hook\" > \"$1\"\nexit 0\n";
    std::fs::write(&hook_path, script).expect("write commit-msg hook");

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mut perms = std::fs::metadata(&hook_path)
            .expect("metadata")
            .permissions();
        perms.set_mode(0o755);
        std::fs::set_permissions(&hook_path, perms).expect("chmod commit-msg");
    }

    TestRepo {
        dir,
        path: repo_dir,
    }
}

/// remote: local bare repo as origin (file:// url), main repo pushed main,
/// and other repo cloned to simulate another user pushing
pub fn remote() -> RemoteFixture {
    let dir = tempfile::tempdir().expect("tempdir");
    let home = dir.path();

    let bare_path = dir.path().join("bare.git");
    let main_path = dir.path().join("main");
    let other_path = dir.path().join("other");

    // 1. Bare repo
    std::fs::create_dir_all(&bare_path).expect("create bare dir");
    git_cmd(&bare_path, home, &["init", "--bare"]);

    // 2. Main repo
    std::fs::create_dir_all(&main_path).expect("create main dir");
    init_local_repo(&main_path, home);

    std::fs::write(main_path.join("init.txt"), "initial main content\n").expect("write init");
    git_cmd(&main_path, home, &["add", "init.txt"]);
    git_cmd(&main_path, home, &["commit", "-m", "initial commit"]);

    let bare_url = format!("file://{}", bare_path.display());
    git_cmd(&main_path, home, &["remote", "add", "origin", &bare_url]);
    git_cmd(&main_path, home, &["push", "-u", "origin", "main"]);

    // 3. Other clone
    git_cmd(dir.path(), home, &["clone", &bare_url, "other"]);
    git_cmd(&other_path, home, &["config", "user.name", "Other Runner"]);
    git_cmd(
        &other_path,
        home,
        &["config", "user.email", "other@example.com"],
    );
    git_cmd(&other_path, home, &["config", "core.autocrlf", "false"]);

    RemoteFixture {
        dir,
        bare_path,
        main_path,
        other_path,
    }
}

/// binary: repository with committed binary file (png) and modified in worktree
pub fn binary() -> TestRepo {
    let dir = tempfile::tempdir().expect("tempdir");
    let home = dir.path();
    let repo_dir = dir.path().join("repo");
    std::fs::create_dir_all(&repo_dir).expect("create_dir");

    init_local_repo(&repo_dir, home);

    let bin_data = vec![
        0x89, b'P', b'N', b'G', b'\r', b'\n', 0x1a, b'\n', 0, 0, 0, 13,
    ];
    std::fs::write(repo_dir.join("test.png"), &bin_data).expect("write test.png");
    git_cmd(&repo_dir, home, &["add", "test.png"]);
    git_cmd(&repo_dir, home, &["commit", "-m", "commit test.png"]);

    let bin_data_modified = vec![
        0x89, b'P', b'N', b'G', b'\r', b'\n', 0x1a, b'\n', 0, 0, 0, 20, 1, 2, 3,
    ];
    std::fs::write(repo_dir.join("test.png"), &bin_data_modified).expect("modify test.png");

    TestRepo {
        dir,
        path: repo_dir,
    }
}
