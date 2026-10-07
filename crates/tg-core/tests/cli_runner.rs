mod common;

use std::fs;
use std::time::{Duration, Instant};
use tg_core::{version_at_least, CliRunner, CoreError, RunOptions, MIN_GIT_VERSION};

#[test]
fn test_version() {
    let runner = CliRunner::new("git");
    let ver = runner.version().expect("cli git version");
    assert!(
        version_at_least(&ver, MIN_GIT_VERSION),
        "git version {ver} must be at least {:?}",
        MIN_GIT_VERSION
    );
}

#[test]
fn test_hook_failure() {
    let repo = common::hooks();
    let runner = CliRunner::new("git");

    // Stage a new file
    fs::write(repo.path().join("changed.txt"), "hello hook failure\n").expect("write file");
    repo.git(&["add", "changed.txt"]);

    let head_before = repo.head_commit_id();

    // Create temp commit message file
    let msg_file = repo.path().join("msg.txt");
    fs::write(&msg_file, "attempted commit message\n").expect("write msg");

    let output = runner
        .run(
            repo.path(),
            &["commit", "-F", msg_file.to_str().expect("msg file path")],
            RunOptions::default(),
        )
        .expect("run commit with failing hook");

    assert_ne!(output.exit_code, Some(0));
    let combined_out = format!("{}\n{}", output.stdout, output.stderr);
    assert!(
        combined_out.contains("HOOK FAILED"),
        "expected 'HOOK FAILED' in output, got: {combined_out}"
    );

    let head_after = repo.head_commit_id();
    assert_eq!(
        head_before, head_after,
        "HEAD should not change after hook failure"
    );
}

#[test]
fn test_hook_msg() {
    let repo = common::hooks_msg();
    let runner = CliRunner::new("git");

    fs::write(repo.path().join("msg_file.txt"), "hello commit msg\n").expect("write file");
    repo.git(&["add", "msg_file.txt"]);

    let msg_file = repo.path().join("original_msg.txt");
    fs::write(&msg_file, "original message\n").expect("write msg");

    let output = runner
        .run(
            repo.path(),
            &["commit", "-F", msg_file.to_str().expect("msg file path")],
            RunOptions::default(),
        )
        .expect("run commit with commit-msg hook");

    assert_eq!(
        output.exit_code,
        Some(0),
        "commit should succeed: {:?}",
        output
    );

    let log_out = repo.git(&["log", "-1", "--format=%B"]);
    let commit_msg = String::from_utf8_lossy(&log_out.stdout);
    assert_eq!(commit_msg.trim(), "rewritten by hook");
}

#[test]
fn test_remote_push_and_pull() {
    let fixture = common::remote();
    let runner = CliRunner::new("git");

    // 1. In main repo, create a new commit and push
    fs::write(
        fixture.main_path.join("main_new.txt"),
        "commit from main repo\n",
    )
    .expect("write main_new.txt");
    common::git_cmd(
        &fixture.main_path,
        fixture.dir.path(),
        &["add", "main_new.txt"],
    );
    common::git_cmd(
        &fixture.main_path,
        fixture.dir.path(),
        &["commit", "-m", "commit from main repo"],
    );

    let main_head_out = common::git_cmd(
        &fixture.main_path,
        fixture.dir.path(),
        &["rev-parse", "HEAD"],
    );
    let main_head = String::from_utf8_lossy(&main_head_out.stdout)
        .trim()
        .to_string();

    let push_output = runner
        .run(&fixture.main_path, &["push"], RunOptions::default())
        .expect("push from main");
    assert_eq!(
        push_output.exit_code,
        Some(0),
        "push failed: {:?}",
        push_output
    );

    // Bare repo main branch equals local HEAD
    let bare_main_out = common::git_cmd(
        &fixture.bare_path,
        fixture.dir.path(),
        &["rev-parse", "main"],
    );
    let bare_main = String::from_utf8_lossy(&bare_main_out.stdout)
        .trim()
        .to_string();
    assert_eq!(bare_main, main_head);

    // 2. In other repo, pull first so it is up to date, then commit and push
    common::git_cmd(&fixture.other_path, fixture.dir.path(), &["pull"]);
    fs::write(
        fixture.other_path.join("other_new.txt"),
        "commit from other repo\n",
    )
    .expect("write other_new.txt");
    common::git_cmd(
        &fixture.other_path,
        fixture.dir.path(),
        &["add", "other_new.txt"],
    );
    common::git_cmd(
        &fixture.other_path,
        fixture.dir.path(),
        &["commit", "-m", "commit from other repo"],
    );
    common::git_cmd(&fixture.other_path, fixture.dir.path(), &["push"]);

    let other_head_out = common::git_cmd(
        &fixture.other_path,
        fixture.dir.path(),
        &["rev-parse", "HEAD"],
    );
    let other_head = String::from_utf8_lossy(&other_head_out.stdout)
        .trim()
        .to_string();

    // 3. In main repo, pull --no-rebase
    let pull_output = runner
        .run(
            &fixture.main_path,
            &["pull", "--no-rebase"],
            RunOptions::default(),
        )
        .expect("pull in main");
    assert_eq!(
        pull_output.exit_code,
        Some(0),
        "pull failed: {:?}",
        pull_output
    );

    let main_head_after_pull_out = common::git_cmd(
        &fixture.main_path,
        fixture.dir.path(),
        &["rev-parse", "HEAD"],
    );
    let main_head_after_pull = String::from_utf8_lossy(&main_head_after_pull_out.stdout)
        .trim()
        .to_string();
    assert_eq!(main_head_after_pull, other_head);
}

#[test]
fn test_auth_failure_no_hang_and_redaction() {
    let repo = common::basic();
    let runner = CliRunner::new("git");

    // Connect to unconnectable port 127.0.0.1:9 with timeout 30s
    let start = Instant::now();
    let res = runner.run(
        repo.path(),
        &["fetch", "https://127.0.0.1:9/nothing.git"],
        RunOptions {
            timeout: Some(Duration::from_secs(30)),
            ..Default::default()
        },
    );
    let elapsed = start.elapsed();
    assert!(
        elapsed < Duration::from_secs(30),
        "fetch to 127.0.0.1:9 hung for too long: {:?}",
        elapsed
    );
    match res {
        Ok(out) => {
            assert_ne!(
                out.exit_code,
                Some(0),
                "fetch to a closed port should fail: {out:?}"
            );
        }
        Err(CoreError::Cli { .. } | CoreError::Timeout { .. }) => {}
        Err(other) => panic!("unexpected fetch error: {other:?}"),
    }

    // Credential redaction in command_line and stderr
    let secret = "super_secret_token_12345";
    let url = format!("https://user:{secret}@127.0.0.1:9/x.git");
    let out = runner.run(
        repo.path(),
        &["fetch", &url],
        RunOptions {
            timeout: Some(Duration::from_secs(30)),
            ..Default::default()
        },
    );
    match out {
        Ok(out) => {
            assert!(
                !out.command_line.contains(secret),
                "command_line contains unredacted secret: {}",
                out.command_line
            );
            assert!(
                !out.stdout.contains(secret),
                "stdout contains unredacted secret: {}",
                out.stdout
            );
            assert!(
                !out.stderr.contains(secret),
                "stderr contains unredacted secret: {}",
                out.stderr
            );
            assert!(
                out.command_line
                    .contains("https://user:***@127.0.0.1:9/x.git"),
                "command_line should have masked credentials: {}",
                out.command_line
            );
        }
        Err(CoreError::Timeout { command_line, .. }) => {
            assert!(
                !command_line.contains(secret),
                "timeout command_line contains unredacted secret: {command_line}"
            );
            assert!(
                command_line.contains("https://user:***@127.0.0.1:9/x.git"),
                "timeout command_line should have masked credentials: {command_line}"
            );
        }
        Err(other) => panic!("unexpected fetch error: {other:?}"),
    }
}

#[test]
fn test_ai_key_env_is_not_passed_to_git() {
    let repo = common::basic();
    let runner = CliRunner::new("git");
    let secret = "kie-test-secret-not-real";

    let hooks_dir = repo.path().join(".git").join("hooks");
    fs::create_dir_all(&hooks_dir).expect("create hooks dir");
    let hook_path = hooks_dir.join("pre-commit");
    fs::write(
        &hook_path,
        "#!/bin/sh\nif [ -n \"$KIE_API_KEY\" ]; then echo \"LEAK $KIE_API_KEY\" >&2; exit 1; fi\necho no-key >&2\nexit 0\n",
    )
    .expect("write hook");
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mut perms = fs::metadata(&hook_path).expect("metadata").permissions();
        perms.set_mode(0o755);
        fs::set_permissions(&hook_path, perms).expect("chmod");
    }

    fs::write(repo.path().join("key_probe.txt"), "probe\n").expect("write probe");
    repo.git(&["add", "key_probe.txt"]);

    let output = runner
        .run(
            repo.path(),
            &["commit", "-m", "probe key env"],
            RunOptions {
                extra_env: vec![("KIE_API_KEY".to_string(), secret.to_string())],
                ..Default::default()
            },
        )
        .expect("commit with stripped key env");

    let combined = format!("{}\n{}", output.stdout, output.stderr);
    assert!(
        !combined.contains(secret),
        "git or a hook saw KIE_API_KEY: {combined}"
    );
    assert_eq!(output.exit_code, Some(0), "commit failed: {output:?}");
    assert!(combined.contains("no-key"), "hook did not run: {combined}");
}

#[test]
fn test_timeout_and_normal_execution() {
    let repo = common::basic();
    let runner = CliRunner::new("git");

    // Normal command that shouldn't timeout
    let normal_out = runner
        .run(
            repo.path(),
            &["-c", "core.pager=cat", "log", "-n", "1"],
            RunOptions::default(),
        )
        .expect("normal log execution");
    assert_eq!(normal_out.exit_code, Some(0));

    // Timeout test on Unix using sleep in hook
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;

        let hooks_dir = repo.path().join(".git").join("hooks");
        fs::create_dir_all(&hooks_dir).expect("create hooks dir");
        let hook_path = hooks_dir.join("pre-commit");
        // A background grandchild. Killing only git would leave it writing.
        fs::write(
            &hook_path,
            "#!/bin/sh\n( i=0; while [ \"$i\" -lt 20 ]; do echo \"$i\" >> .tg-heartbeat; i=$((i+1)); sleep 1; done ) &\necho $! > .tg-sleep-pid\nwait\n",
        )
        .expect("write sleeping hook");

        let mut perms = fs::metadata(&hook_path).expect("metadata").permissions();
        perms.set_mode(0o755);
        fs::set_permissions(&hook_path, perms).expect("chmod");

        fs::write(repo.path().join("sleep_test.txt"), "sleep\n").expect("write sleep_test");
        repo.git(&["add", "sleep_test.txt"]);

        let start = Instant::now();
        let timeout_res = runner.run(
            repo.path(),
            &["commit", "-m", "should timeout"],
            RunOptions {
                timeout: Some(Duration::from_secs(1)),
                ..Default::default()
            },
        );
        let elapsed = start.elapsed();

        assert!(
            elapsed < Duration::from_secs(3),
            "timed out command took too long to terminate: {:?}",
            elapsed
        );
        match timeout_res {
            Err(CoreError::Timeout {
                command_line,
                after_ms,
            }) => {
                assert_eq!(after_ms, 1000);
                assert!(command_line.contains("commit"));
            }
            other => panic!("expected CoreError::Timeout, got: {:?}", other),
        }

        struct KillSleep(std::path::PathBuf);
        impl Drop for KillSleep {
            fn drop(&mut self) {
                if let Ok(pid_text) = fs::read_to_string(&self.0) {
                    if let Ok(pid) = pid_text.trim().parse::<i32>() {
                        let _ = std::process::Command::new("kill")
                            .args(["-9", &pid.to_string()])
                            .stdout(std::process::Stdio::null())
                            .stderr(std::process::Stdio::null())
                            .status();
                    }
                }
            }
        }
        let _kill = KillSleep(repo.path().join(".tg-sleep-pid"));

        let heartbeat_path = repo.path().join(".tg-heartbeat");
        let before = fs::read_to_string(&heartbeat_path).unwrap_or_default();
        assert!(
            !before.is_empty(),
            "hook grandchild should have started writing before the timeout"
        );
        std::thread::sleep(Duration::from_secs(2));
        let after = fs::read_to_string(&heartbeat_path).unwrap_or_default();
        assert_eq!(
            before, after,
            "hook grandchild kept running after the git process group was killed"
        );
    }
}
