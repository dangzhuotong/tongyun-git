mod common;
use serde_json::Value;
use std::{fs, process::Command};
fn run(repo: &common::TestRepo, args: &[&str]) -> (bool, Value) {
    let output = Command::new(env!("CARGO_BIN_EXE_tongyun-git-agent"))
        .arg("--repo")
        .arg(repo.path())
        .arg("--audit-dir")
        .arg(repo.dir.path().join("audit"))
        .args(["--task", "fixture-task", "--actor", "agent:fixture"])
        .args(args)
        .env("HOME", repo.dir.path())
        .env(
            "GIT_CONFIG_GLOBAL",
            if cfg!(windows) { "NUL" } else { "/dev/null" },
        )
        .env("GIT_CONFIG_NOSYSTEM", "1")
        .output()
        .unwrap();
    (
        output.status.success(),
        serde_json::from_slice(&output.stdout).expect("JSON output"),
    )
}
#[test]
fn cli_confirms_exact_index_then_commits_through_core_and_preserves_history() {
    let repo = common::basic();
    let original = repo.head_commit_id();
    assert!(run(&repo, &["capabilities"]).0);
    fs::write(repo.path().join("fixture.txt"), "fixture").unwrap();
    repo.git(&["add", "fixture.txt"]);
    let (ok, status) = run(&repo, &["status"]);
    assert!(ok);
    let old = status["data"]["fingerprint"].as_str().unwrap();
    let message = repo.dir.path().join("message.txt");
    fs::write(&message, "feat: fixture commit").unwrap();
    let m = message.to_str().unwrap();
    assert!(!run(&repo, &["commit", "--message-file", m, "--confirm", old]).0);
    assert_eq!(repo.head_commit_id(), original);
    fs::write(repo.path().join("fixture.txt"), "changed").unwrap();
    let (ok, diff) = run(&repo, &["diff", "--path", "fixture.txt"]);
    assert!(ok);
    assert!(diff.to_string().contains("changed"));
    repo.git(&["add", "fixture.txt"]);
    let (_, stale) = run(
        &repo,
        &[
            "commit",
            "--allow-write",
            "--confirm",
            old,
            "--message-file",
            m,
        ],
    );
    assert_eq!(stale["error"], "STALE_CONFIRMATION");
    assert_eq!(repo.head_commit_id(), original);
    let (_, status) = run(&repo, &["status"]);
    let fingerprint = status["data"]["fingerprint"].as_str().unwrap();
    let (ok, commit) = run(
        &repo,
        &[
            "commit",
            "--allow-write",
            "--confirm",
            fingerprint,
            "--message-file",
            m,
        ],
    );
    assert!(ok, "{commit}");
    assert_ne!(repo.head_commit_id(), original);
    assert!(
        !run(
            &repo,
            &[
                "commit",
                "--allow-write",
                "--confirm",
                fingerprint,
                "--message-file",
                m
            ]
        )
        .0
    );
    let (_, history) = run(&repo, &["history"]);
    let events = history["data"].as_array().unwrap();
    assert!(events.len() > 6);
    assert!(events
        .iter()
        .all(|e| e["taskId"] == "fixture-task" && e["actor"] == "agent:fixture"));
    assert!(!history.to_string().contains("feat: fixture commit"));
    assert!(events.iter().all(|event| event["outcome"] != "completed"));
    assert!(events.iter().any(|event| {
        event["action"] == "commit"
            && event["phase"] == "finished"
            && event["outcome"] == "succeeded"
    }));
    assert!(events.iter().any(|event| {
        event["action"] == "status"
            && event["phase"] == "finished"
            && event["outcome"] == "succeeded"
    }));
    assert!(events
        .iter()
        .any(|event| { event["phase"] == "finished" && event["outcome"] == "failed_or_unknown" }));
}
#[test]
fn successful_status_records_succeeded_not_completed() {
    let repo = common::basic();
    let (ok, _) = run(&repo, &["status"]);
    assert!(ok);
    let (_, history) = run(&repo, &["history"]);
    let events = history["data"].as_array().unwrap();
    assert!(events.iter().any(|event| {
        event["action"] == "status"
            && event["phase"] == "finished"
            && event["outcome"] == "succeeded"
    }));
    assert!(events.iter().all(|event| event["outcome"] != "completed"));
}
#[test]
fn unavailable_audit_rejects_before_commit() {
    let repo = common::basic();
    let original = repo.head_commit_id();
    fs::write(repo.dir.path().join("audit"), "not a directory").unwrap();
    assert!(
        !run(
            &repo,
            &[
                "commit",
                "--allow-write",
                "--confirm",
                "invalid",
                "--message-file",
                "unused"
            ]
        )
        .0
    );
    assert_eq!(repo.head_commit_id(), original);
}
#[cfg(unix)]
#[test]
fn hooks_reject_commit_without_moving_head() {
    let repo = common::hooks();
    let original = repo.head_commit_id();
    fs::write(repo.path().join("fixture.txt"), "fixture").unwrap();
    repo.git(&["add", "fixture.txt"]);
    let (_, status) = run(&repo, &["status"]);
    let fingerprint = status["data"]["fingerprint"].as_str().unwrap();
    let message = repo.dir.path().join("message");
    fs::write(&message, "fixture").unwrap();
    assert!(
        !run(
            &repo,
            &[
                "commit",
                "--allow-write",
                "--confirm",
                fingerprint,
                "--message-file",
                message.to_str().unwrap()
            ]
        )
        .0
    );
    assert_eq!(repo.head_commit_id(), original);
}
