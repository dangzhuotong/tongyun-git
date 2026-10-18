mod common;

use std::fs;
use tg_core::{
    agent_display_name, evaluate_burst, evaluate_timestamp_burst, is_known_agent_process,
    match_agent_process, normalize_process_name, snapshot, AutoAgentConfig, AutoAgentManager,
    AutoAgentStateMachine, AutoSessionAction, AutoSessionState, AutoTrigger, BurstConfig,
    BurstDetector,
};

fn text(repo: &common::TestRepo, args: &[&str]) -> String {
    String::from_utf8(repo.git(args).stdout).unwrap()
}

/// 1. 进程名匹配测试
#[test]
fn test_agent_process_name_matching() {
    // Exact canonical names
    assert_eq!(match_agent_process("cursor"), Some("cursor"));
    assert_eq!(match_agent_process("tongyun-cli"), Some("tongyun-cli"));
    assert_eq!(match_agent_process("claude"), Some("claude"));
    assert_eq!(match_agent_process("codex"), Some("codex"));

    // Case insensitivity
    assert_eq!(match_agent_process("Cursor"), Some("cursor"));
    assert_eq!(match_agent_process("CURSOR"), Some("cursor"));
    assert_eq!(match_agent_process("Claude"), Some("claude"));
    assert_eq!(match_agent_process("CODEX"), Some("codex"));
    assert_eq!(match_agent_process("Tongyun-Cli"), Some("tongyun-cli"));

    // Windows .exe extension
    assert_eq!(match_agent_process("cursor.exe"), Some("cursor"));
    assert_eq!(match_agent_process("Cursor.EXE"), Some("cursor"));
    assert_eq!(match_agent_process("tongyun-cli.exe"), Some("tongyun-cli"));
    assert_eq!(match_agent_process("claude.exe"), Some("claude"));
    assert_eq!(match_agent_process("codex.exe"), Some("codex"));

    // Full Windows paths
    assert_eq!(
        match_agent_process(r"C:\Users\User\AppData\Local\Programs\cursor\Cursor.exe"),
        Some("cursor")
    );
    assert_eq!(
        match_agent_process(r"C:\Program Files\tongyun-cli\tongyun-cli.exe"),
        Some("tongyun-cli")
    );

    // Full Unix / macOS paths
    assert_eq!(
        match_agent_process("/Applications/Cursor.app/Contents/MacOS/Cursor"),
        Some("cursor")
    );
    assert_eq!(match_agent_process("/usr/local/bin/claude"), Some("claude"));
    assert_eq!(match_agent_process("/opt/codex/bin/codex"), Some("codex"));

    // Non-agent processes
    assert_eq!(match_agent_process("git"), None);
    assert_eq!(match_agent_process("git.exe"), None);
    assert_eq!(match_agent_process("node.exe"), None);
    assert_eq!(match_agent_process("code.exe"), None);
    assert_eq!(match_agent_process("bash"), None);
    assert_eq!(match_agent_process("cargo"), None);

    // Boolean helper
    assert!(is_known_agent_process("cursor"));
    assert!(is_known_agent_process("Claude.exe"));
    assert!(!is_known_agent_process("code.exe"));

    // Display names
    assert_eq!(agent_display_name("cursor"), "Cursor");
    assert_eq!(agent_display_name("tongyun-cli"), "tongyun-cli");
    assert_eq!(agent_display_name("claude"), "claude");
    assert_eq!(agent_display_name("codex"), "codex");
    assert_eq!(agent_display_name("unknown"), "unknown");

    // Normalization helper
    assert_eq!(normalize_process_name("  /bin/Cursor.EXE  "), "cursor");
}

/// 2. 突增判定测试
#[test]
fn test_sudden_burst_determination() {
    let mut detector = BurstDetector::new();
    let config = BurstConfig {
        window_secs: 5,
        threshold: 5,
    };

    // Initial state: no burst
    assert!(!detector.is_burst(1000, &config));
    assert_eq!(detector.recent_count(1000, config.window_secs), 0);

    // Record 4 changes within window (below threshold of 5)
    detector.record_changes(4, 2000);
    assert_eq!(detector.recent_count(2000, config.window_secs), 4);
    assert!(!detector.is_burst(2000, &config));

    // Record 5th change within window (meets threshold)
    detector.record_change(3000);
    assert_eq!(detector.recent_count(3000, config.window_secs), 5);
    assert!(detector.is_burst(3000, &config));

    // Exceed threshold
    detector.record_changes(3, 3500);
    assert!(detector.is_burst(3500, &config));
    assert_eq!(detector.recent_count(3500, config.window_secs), 8);

    // Sliding window expiration:
    // Recorded events are at 2000, 3000, 3500.
    // At t = 9000 (now_ms - 5000 = 4000 cutoff), all earlier events expire!
    assert_eq!(detector.recent_count(9000, config.window_secs), 0);
    assert!(!detector.is_burst(9000, &config));

    // Add 1 event at 9000: count is 1 < 5 -> no burst
    detector.record_change(9000);
    assert_eq!(detector.recent_count(9000, config.window_secs), 1);
    assert!(!detector.is_burst(9000, &config));

    // Configurable thresholds: custom window and threshold
    let custom_cfg = BurstConfig {
        window_secs: 2,
        threshold: 3,
    };
    detector.reset();
    detector.record_changes(3, 10000);
    assert!(detector.is_burst(10000, &custom_cfg));
    // At t = 13000 (13000 - 2000 = 11000 cutoff), t=10000 has expired
    assert!(!detector.is_burst(13000, &custom_cfg));

    // Pure evaluation functions
    assert!(evaluate_burst(5, 5));
    assert!(evaluate_burst(10, 5));
    assert!(!evaluate_burst(4, 5));

    let timestamps = vec![1000, 2000, 3000, 4000, 5000];
    assert!(evaluate_timestamp_burst(&timestamps, 5000, 5, 5));
    assert!(!evaluate_timestamp_burst(&timestamps, 8000, 2, 5));
}

/// 3. 自动开/结束状态机测试
#[test]
fn test_auto_session_state_machine() {
    let mut config = AutoAgentConfig {
        enabled: true,
        burst_threshold: 5,
        burst_window_secs: 5,
        silence_timeout_secs: 60, // 1 minute timeout for test
    };

    // Subtest A: Disabled state machine ignores triggers
    config.enabled = false;
    let mut sm = AutoAgentStateMachine::new(config.clone());
    assert!(!sm.is_active());
    let action = sm.handle_process_check(&["cursor".into()], 1000);
    assert_eq!(action, AutoSessionAction::None);
    assert!(!sm.is_active());
    let action = sm.handle_file_changes(10, 1000);
    assert_eq!(action, AutoSessionAction::None);
    assert!(!sm.is_active());

    // Subtest B: Process-triggered auto session & exit finish
    config.enabled = true;
    let mut sm = AutoAgentStateMachine::new(config.clone());

    // Step 1: Detect cursor process -> starts session
    let action = sm.handle_process_check(&["cursor.exe".into()], 1000);
    assert_eq!(
        action,
        AutoSessionAction::StartSession {
            label: "自动 Agent 会话: Cursor".into(),
            trigger: AutoTrigger::Process {
                agent: "cursor".into()
            },
            agent: Some("cursor".into()),
        }
    );
    // Transition to active
    sm.set_active(
        "refs/tongyun/snapshots/test1".into(),
        "自动 Agent 会话: Cursor".into(),
        AutoTrigger::Process {
            agent: "cursor".into(),
        },
        1000,
        Some("cursor".into()),
    );
    assert!(sm.is_active());

    // Step 2: File changes while active update activity time, do not start duplicate session
    let action = sm.handle_file_changes(10, 2000);
    assert_eq!(action, AutoSessionAction::None);
    assert!(sm.is_active());

    // Step 3: Tick with process still running keeps session alive
    let action = sm.handle_tick(&["cursor.exe".into()], 5000);
    assert_eq!(action, AutoSessionAction::None);
    assert!(sm.is_active());

    // Step 4: Process exits -> finish session
    let action = sm.handle_tick(&["node.exe".into()], 10000);
    assert_eq!(
        action,
        AutoSessionAction::FinishSession {
            reference: "refs/tongyun/snapshots/test1".into(),
            reason: "Agent 进程 cursor 已退出".into(),
        }
    );
    assert!(!sm.is_active());
    assert_eq!(*sm.state(), AutoSessionState::Idle);

    // Subtest C: File burst-triggered auto session & silence timeout finish
    let mut sm = AutoAgentStateMachine::new(config.clone());

    // Step 1: 4 changes (below threshold 5) -> no start
    let action = sm.handle_file_changes(4, 1000);
    assert_eq!(action, AutoSessionAction::None);

    // Step 2: 5th change at t=2000 -> triggers burst StartSession
    let action = sm.handle_file_changes(1, 2000);
    match action {
        AutoSessionAction::StartSession { label, trigger, .. } => {
            assert!(label.contains("自动变更检测快照"));
            assert_eq!(trigger, AutoTrigger::Burst { change_count: 5 });
        }
        other => panic!("expected StartSession, got {:?}", other),
    }

    // Set active
    sm.set_active(
        "refs/tongyun/snapshots/test2".into(),
        "自动变更检测快照 (5 个文件)".into(),
        AutoTrigger::Burst { change_count: 5 },
        2000,
        None,
    );
    assert!(sm.is_active());

    // Step 3: Heartbeat before silence timeout (t=30000ms < 2000 + 60000 = 62000ms)
    let action = sm.handle_tick(&[], 30000);
    assert_eq!(action, AutoSessionAction::None);
    assert!(sm.is_active());

    // Step 4: Silence timeout exceeded (t=70000ms >= 62000ms)
    let action = sm.handle_tick(&[], 70000);
    match action {
        AutoSessionAction::FinishSession { reference, reason } => {
            assert_eq!(reference, "refs/tongyun/snapshots/test2");
            assert!(reason.contains("静默超时"));
        }
        other => panic!("expected FinishSession, got {:?}", other),
    }
    assert!(!sm.is_active());
}

/// 4. 自动会话与手动会话共用撤回流程：按文件选择性撤回，撤回前再快照，可再撤回；HEAD/index 不动；含未跟踪文件，遵守 .gitignore 与大小上限
#[test]
fn test_restore_preserves_head_and_index_without_mutation() {
    let repo = common::basic();

    // Setup initial state:
    // User staged change on a.java
    fs::write(repo.path().join("a.java"), "user staged content\n").unwrap();
    repo.git(&["add", "a.java"]);
    // User unstaged change on a.java
    fs::write(repo.path().join("a.java"), "user working content\n").unwrap();
    // Setup .gitignore and ignored file
    fs::write(repo.path().join(".gitignore"), "ignored.log\n").unwrap();
    fs::write(repo.path().join("ignored.log"), "ignore me\n").unwrap();

    let before_head = repo.head_commit_id();
    let before_index = text(&repo, &["diff", "--cached", "--binary"]);

    // Initialize AutoAgentManager
    let mut manager = AutoAgentManager::new(AutoAgentConfig {
        enabled: true,
        burst_threshold: 5,
        burst_window_secs: 5,
        silence_timeout_secs: 300,
    });

    // 1. Auto start session via known process detection ("claude")
    let report = manager
        .check(repo.path(), 0, Some(&["claude".into()]), 1000)
        .unwrap();
    assert!(report.active);
    let session_ref = report.session_reference.expect("session reference");
    assert!(session_ref.starts_with("refs/tongyun/snapshots/"));

    // Check that ignored file was not captured
    let initial_snap = snapshot::load(repo.path(), &session_ref).unwrap();
    assert!(!initial_snap.files.contains_key("ignored.log"));

    // 2. Agent performs changes:
    // - Modifies existing tracked file b.ts
    fs::write(repo.path().join("b.ts"), "agent modified b\n").unwrap();
    // - Creates new untracked file
    fs::write(repo.path().join("agent_new.txt"), "agent created this\n").unwrap();
    // - Deletes tracked file README.md
    fs::remove_file(repo.path().join("README.md")).unwrap();
    // - Changes ignored file
    fs::write(repo.path().join("ignored.log"), "agent touched ignored\n").unwrap();

    // 3. Agent exits -> auto finish session
    let report = manager
        .check(repo.path(), 0, Some(&[]), 2000)
        .unwrap();
    assert!(!report.active);

    // 4. Preview changes via snapshot::changes
    let changes = snapshot::changes(repo.path(), &session_ref).unwrap();
    assert_eq!(changes.len(), 3); // b.ts, agent_new.txt, README.md

    // 5. Restore all changes
    let restore_result = snapshot::restore(repo.path(), &session_ref, &changes).unwrap();
    assert_eq!(restore_result.restored, 3);

    // 6. Verification:
    // - agent_new.txt deleted
    assert!(!repo.path().join("agent_new.txt").exists());
    // - README.md restored
    assert!(repo.path().join("README.md").exists());
    // - b.ts restored to original committed content
    assert!(fs::read_to_string(repo.path().join("b.ts"))
        .unwrap()
        .contains("export function add"));
    // - a.java user working content is preserved
    assert_eq!(
        fs::read_to_string(repo.path().join("a.java")).unwrap(),
        "user working content\n"
    );
    // - Ignored file was NOT deleted or overwritten by restore
    assert!(repo.path().join("ignored.log").exists());

    // CRITICAL: HEAD must be completely unchanged!
    assert_eq!(repo.head_commit_id(), before_head);

    // CRITICAL: Index must be completely unchanged!
    assert_eq!(
        text(&repo, &["diff", "--cached", "--binary"]),
        before_index
    );

    // 7. Test undo of the restore (can undo again)
    let undo_ref = restore_result.undo_ref;
    assert!(undo_ref.starts_with("refs/tongyun/snapshots/"));
    let undo_changes = snapshot::changes(repo.path(), &undo_ref).unwrap();
    let undo_restore = snapshot::restore(repo.path(), &undo_ref, &undo_changes).unwrap();
    assert_eq!(undo_restore.restored, 3);

    // Now agent changes are back
    assert!(repo.path().join("agent_new.txt").exists());
    assert!(!repo.path().join("README.md").exists());
    assert_eq!(
        fs::read_to_string(repo.path().join("b.ts")).unwrap(),
        "agent modified b\n"
    );

    // HEAD and Index STILL unchanged!
    assert_eq!(repo.head_commit_id(), before_head);
    assert_eq!(
        text(&repo, &["diff", "--cached", "--binary"]),
        before_index
    );
}
