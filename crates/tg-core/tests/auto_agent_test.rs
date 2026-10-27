mod common;

use std::fs;
use tg_core::{
    agent_display_name, evaluate_burst, evaluate_timestamp_burst, is_ide_host_process,
    is_known_agent_process, match_agent_process, normalize_process_name, prune_idle_managers,
    snapshot, AutoAgentConfig, AutoAgentManager, AutoAgentStateMachine, AutoSessionAction,
    AutoSessionState, AutoTrigger, BurstConfig, BurstDetector, ProcessScanCache,
    BASELINE_MIN_INTERVAL_MS, MANAGER_IDLE_TTL,
};

fn text(repo: &common::TestRepo, args: &[&str]) -> String {
    String::from_utf8(repo.git(args).stdout).unwrap()
}

/// 1. 进程名匹配测试
#[test]
fn test_agent_process_name_matching() {
    // Exact canonical names. Cursor is an IDE host, not an agent signal.
    assert_eq!(match_agent_process("cursor"), None);
    assert!(is_ide_host_process("cursor"));
    assert!(is_ide_host_process("Cursor.EXE"));
    assert!(!is_ide_host_process("claude"));
    assert_eq!(match_agent_process("tongyun-cli"), Some("tongyun-cli"));
    assert_eq!(match_agent_process("claude"), Some("claude"));
    assert_eq!(match_agent_process("codex"), Some("codex"));

    // Case insensitivity
    assert_eq!(match_agent_process("Cursor"), None);
    assert!(is_ide_host_process("CURSOR"));
    assert_eq!(match_agent_process("Claude"), Some("claude"));
    assert_eq!(match_agent_process("CODEX"), Some("codex"));
    assert_eq!(match_agent_process("Tongyun-Cli"), Some("tongyun-cli"));

    // Windows .exe extension
    assert_eq!(match_agent_process("cursor.exe"), None);
    assert!(is_ide_host_process("Cursor.EXE"));
    assert_eq!(match_agent_process("tongyun-cli.exe"), Some("tongyun-cli"));
    assert_eq!(match_agent_process("claude.exe"), Some("claude"));
    assert_eq!(match_agent_process("codex.exe"), Some("codex"));

    // Full Windows paths
    assert_eq!(
        match_agent_process(r"C:\Users\User\AppData\Local\Programs\cursor\Cursor.exe"),
        None
    );
    assert!(is_ide_host_process(
        r"C:\Users\User\AppData\Local\Programs\cursor\Cursor.exe"
    ));
    assert_eq!(
        match_agent_process(r"C:\Program Files\tongyun-cli\tongyun-cli.exe"),
        Some("tongyun-cli")
    );

    // Full Unix / macOS paths
    assert_eq!(
        match_agent_process("/Applications/Cursor.app/Contents/MacOS/Cursor"),
        None
    );
    assert!(is_ide_host_process(
        "/Applications/Cursor.app/Contents/MacOS/Cursor"
    ));
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
    assert!(!is_known_agent_process("cursor"));
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

    // Step 1: Detect claude process -> starts session. Cursor must not.
    let action = sm.handle_process_check(&["cursor.exe".into()], 1000);
    assert_eq!(action, AutoSessionAction::None);
    let action = sm.handle_process_check(&["claude".into()], 1000);
    assert_eq!(
        action,
        AutoSessionAction::StartSession {
            label: "自动 Agent 会话: claude".into(),
            trigger: AutoTrigger::Process {
                agent: "claude".into()
            },
            agent: Some("claude".into()),
        }
    );
    // Transition to active
    sm.set_active(
        "refs/tongyun/snapshots/test1".into(),
        "自动 Agent 会话: claude".into(),
        AutoTrigger::Process {
            agent: "claude".into(),
        },
        1000,
        Some("claude".into()),
    );
    assert!(sm.is_active());

    // Step 2: File changes while active update activity time, do not start duplicate session
    let action = sm.handle_file_changes(10, 2000);
    assert_eq!(action, AutoSessionAction::None);
    assert!(sm.is_active());

    // Step 3: Tick with process still running keeps session alive (silence not reached)
    let action = sm.handle_tick(&["claude".into()], 5000);
    assert_eq!(action, AutoSessionAction::None);
    assert!(sm.is_active());

    // Step 4: Process exits -> finish session
    let action = sm.handle_tick(&["node.exe".into()], 10000);
    assert_eq!(
        action,
        AutoSessionAction::FinishSession {
            reference: "refs/tongyun/snapshots/test1".into(),
            reason: "Agent 进程 claude 已退出".into(),
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
        .check(repo.path(), Some(&["claude".into()]), 1000)
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
    let report = manager.check(repo.path(), Some(&[]), 2000).unwrap();
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
    assert_eq!(text(&repo, &["diff", "--cached", "--binary"]), before_index);

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
    assert_eq!(text(&repo, &["diff", "--cached", "--binary"]), before_index);
}

fn enabled_config() -> AutoAgentConfig {
    AutoAgentConfig {
        enabled: true,
        burst_threshold: 5,
        burst_window_secs: 5,
        silence_timeout_secs: 60,
    }
}

/// P1.1 已有脏文件是基线，不是突增；只有相对基线的新增/变化才计数。
#[test]
fn preexisting_dirty_files_do_not_start_auto_session() {
    let repo = common::basic();
    for i in 0..6 {
        fs::write(repo.path().join(format!("dirty{i}.txt")), "already\n").unwrap();
    }
    let mut manager = AutoAgentManager::new(enabled_config());
    // A stable dirty set is the baseline; it must never look like a burst.
    let report = manager.check(repo.path(), Some(&[]), 1_000).unwrap();
    assert!(
        !report.active,
        "existing dirty files must not open a session"
    );
    assert!(report.action_taken.is_none());

    let report = manager.check(repo.path(), Some(&[]), 2_000).unwrap();
    assert!(
        !report.active,
        "the same dirty set must not open a session on the next refresh"
    );

    for i in 0..5 {
        fs::write(repo.path().join(format!("burst{i}.txt")), "new\n").unwrap();
    }
    let report = manager.check(repo.path(), Some(&[]), 3_000).unwrap();
    assert!(
        report.active,
        "five new paths inside the window should start a session"
    );
}

/// P1.2 触发突增的那一批改动必须落在基线之后，结束后可以撤回。
#[test]
fn auto_session_can_rewind_the_burst_that_opened_it() {
    let repo = common::basic();
    let mut manager = AutoAgentManager::new(enabled_config());
    let report = manager.check(repo.path(), Some(&[]), 1_000).unwrap();
    assert!(
        !report.active,
        "watching a clean tree must only arm the baseline"
    );

    for i in 0..5 {
        fs::write(
            repo.path().join(format!("agent{i}.txt")),
            format!("agent {i}\n"),
        )
        .unwrap();
    }
    let report = manager.check(repo.path(), Some(&[]), 2_000).unwrap();
    assert!(report.active);
    let session_ref = report.session_reference.expect("session reference");
    let snap = snapshot::load(repo.path(), &session_ref).unwrap();
    for i in 0..5 {
        let path = format!("agent{i}.txt");
        assert!(
            snap.files.get(&path).cloned().flatten().is_none(),
            "{path} was written before capture and cannot be rewound"
        );
    }

    snapshot::finish(repo.path(), &session_ref).unwrap();
    let agent_changes: Vec<_> = snapshot::changes(repo.path(), &session_ref)
        .unwrap()
        .into_iter()
        .filter(|c| c.path.starts_with("agent"))
        .collect();
    assert_eq!(agent_changes.len(), 5);
    let restored = snapshot::restore(repo.path(), &session_ref, &agent_changes).unwrap();
    assert_eq!(restored.restored, 5);
    for i in 0..5 {
        assert!(
            !repo.path().join(format!("agent{i}.txt")).exists(),
            "agent{i}.txt should be removed by rewind"
        );
    }
}

/// P1.3 Cursor 是常驻 IDE，不能开会话，也不能靠进程心跳躲开静默超时。
#[test]
fn cursor_host_does_not_open_session_or_refresh_silence() {
    let mut sm = AutoAgentStateMachine::new(enabled_config());
    let action = sm.handle_process_check(&["cursor".into(), "Cursor.exe".into()], 1_000);
    assert_eq!(action, AutoSessionAction::None);
    assert!(!sm.is_active());

    let mut sm = AutoAgentStateMachine::new(enabled_config());
    let action = sm.handle_process_check(&["claude".into()], 1_000);
    assert!(matches!(action, AutoSessionAction::StartSession { .. }));
    sm.set_active(
        "refs/tongyun/snapshots/silence".into(),
        "自动 Agent 会话: claude".into(),
        AutoTrigger::Process {
            agent: "claude".into(),
        },
        1_000,
        Some("claude".into()),
    );
    let action = sm.handle_tick(&["claude".into()], 1_000 + 60_000);
    match action {
        AutoSessionAction::FinishSession { reason, .. } => {
            assert!(
                reason.contains("静默"),
                "process presence must not count as activity, got {reason}"
            );
        }
        other => {
            panic!("expected silence finish while the agent process still runs, got {other:?}")
        }
    }
}

/// P1.3 手动结束后，同一进程实例不能立刻重开；新的文件突增可以。
#[test]
fn manual_end_does_not_reopen_until_new_burst() {
    let repo = common::basic();
    let mut manager = AutoAgentManager::new(enabled_config());
    let report = manager
        .check(repo.path(), Some(&["claude".into()]), 1_000)
        .unwrap();
    assert!(report.active);
    let reference = report.session_reference.expect("session");
    snapshot::finish(repo.path(), &reference).unwrap();
    manager
        .note_manual_end(repo.path(), &["claude".into()])
        .unwrap();

    let report = manager
        .check(repo.path(), Some(&["claude".into()]), 2_000)
        .unwrap();
    assert!(
        !report.active,
        "manual end must suppress reopen while the same agent process is still running"
    );
    let report = manager
        .check(repo.path(), Some(&["claude".into()]), 8_000)
        .unwrap();
    assert!(!report.active);

    for i in 0..5 {
        fs::write(repo.path().join(format!("again{i}.txt")), "x\n").unwrap();
    }
    let report = manager
        .check(repo.path(), Some(&["claude".into()]), 9_000)
        .unwrap();
    assert!(
        report.active,
        "a new file burst may open a session after manual end"
    );
}

/// P2 关闭自动检测必须结束进行中的自动会话，并把快照收成可撤回状态。
#[test]
fn disabling_auto_detect_finishes_the_active_session() {
    let repo = common::basic();
    let mut manager = AutoAgentManager::new(enabled_config());
    let report = manager
        .check(repo.path(), Some(&["claude".into()]), 1_000)
        .unwrap();
    let reference = report.session_reference.expect("session");
    manager.sm.set_config(AutoAgentConfig {
        enabled: false,
        ..enabled_config()
    });
    let report = manager
        .check(repo.path(), Some(&["claude".into()]), 2_000)
        .unwrap();
    assert!(!report.active);
    let taken = report.action_taken.unwrap_or_default();
    assert!(
        taken.contains("关闭"),
        "expected disable to finish the session, got {taken}"
    );
    let snap = snapshot::load(repo.path(), &reference).unwrap();
    assert_eq!(snap.kind, "agent_finished");
}

/// P2 结束快照失败时不能假装成功，也不能把状态机提前置为 Idle。
#[test]
fn finish_failure_is_not_reported_as_success() {
    let repo = common::basic();
    let mut manager = AutoAgentManager::new(enabled_config());
    manager.sm.set_active(
        "refs/tongyun/snapshots/missing".into(),
        "label".into(),
        AutoTrigger::Process {
            agent: "claude".into(),
        },
        1_000,
        Some("claude".into()),
    );
    manager.sm.set_config(AutoAgentConfig {
        enabled: false,
        ..enabled_config()
    });
    let err = manager.check(repo.path(), Some(&[]), 2_000);
    assert!(err.is_err(), "finish failure must surface, got {err:?}");
    assert!(
        manager.sm.is_active(),
        "failed finish must keep the auto session active"
    );
}

/// P2 已有未结束的手动会话时不能再开自动会话。
#[test]
fn open_manual_session_blocks_auto_start() {
    let repo = common::basic();
    snapshot::capture(repo.path(), "manual", "agent", None).unwrap();
    let mut manager = AutoAgentManager::new(enabled_config());
    let report = manager
        .check(repo.path(), Some(&["claude".into()]), 1_000)
        .unwrap();
    assert!(
        !report.active,
        "auto session must not start while a manual session is open"
    );
    let kinds: Vec<_> = snapshot::list(repo.path())
        .unwrap()
        .into_iter()
        .map(|s| s.kind)
        .collect();
    assert_eq!(kinds.iter().filter(|k| *k == "agent").count(), 1);
}

/// P2 缺字段的设置 JSON 要补默认值，不能让反序列化失败后静默停用。
#[test]
fn partial_config_json_fills_defaults() {
    let cfg: AutoAgentConfig = serde_json::from_str(r#"{"enabled":false}"#).unwrap();
    assert!(!cfg.enabled);
    assert_eq!(cfg.burst_threshold, 5);
    assert_eq!(cfg.burst_window_secs, 5);
    assert_eq!(cfg.silence_timeout_secs, 300);
}

/// 未达阈值的编辑在窗口过期后并入滚动基线，之后的突增不能把它们一起撤回。
#[test]
fn subthreshold_edits_move_into_the_rolling_baseline() {
    let repo = common::basic();
    let mut manager = AutoAgentManager::new(enabled_config());
    manager.check(repo.path(), Some(&[]), 1_000).unwrap();
    for i in 0..4 {
        fs::write(repo.path().join(format!("slow{i}.txt")), "slow\n").unwrap();
    }
    let report = manager.check(repo.path(), Some(&[]), 2_000).unwrap();
    assert!(!report.active);
    // The rolling baseline refreshes at most every 30s, so wait past that.
    let report = manager.check(repo.path(), Some(&[]), 40_000).unwrap();
    assert!(!report.active);

    for i in 0..5 {
        fs::write(repo.path().join(format!("burst{i}.txt")), "burst\n").unwrap();
    }
    let report = manager.check(repo.path(), Some(&[]), 41_000).unwrap();
    assert!(report.active);
    let session_ref = report.session_reference.expect("session");
    let snap = snapshot::load(repo.path(), &session_ref).unwrap();
    for i in 0..4 {
        assert!(
            snap.files
                .get(&format!("slow{i}.txt"))
                .cloned()
                .flatten()
                .is_some(),
            "slow{i}.txt should already be in the baseline"
        );
    }
    for i in 0..5 {
        assert!(
            snap.files
                .get(&format!("burst{i}.txt"))
                .cloned()
                .flatten()
                .is_none(),
            "burst{i}.txt must stay rewoundable"
        );
    }
}

/// 手动结束把 generation 抬高后，进行中的自动检查不能把会话写回去。
#[test]
fn stale_generation_discards_inflight_session() {
    let repo = common::basic();
    let mut manager = AutoAgentManager::new(enabled_config());
    manager.check(repo.path(), Some(&[]), 1_000).unwrap();
    let generation = manager.begin_check().expect("check begins");
    let mut working = manager.clone();
    working.sm.set_active(
        "refs/tongyun/snapshots/inflight".into(),
        "inflight".into(),
        AutoTrigger::Burst { change_count: 5 },
        2_000,
        None,
    );
    manager
        .note_manual_end(repo.path(), &["claude".into()])
        .unwrap();
    assert!(
        !manager.commit_inflight(generation, working),
        "a manual end must win over the in-flight check"
    );
    assert!(!manager.sm.is_active());
}

#[test]
fn process_scan_cache_reuses_result_inside_ttl() {
    let mut cache = ProcessScanCache::new(std::time::Duration::from_secs(15));
    let start = std::time::Instant::now();
    let mut scans = 0u32;
    let first = cache.get_or_scan(start, || {
        scans += 1;
        vec!["claude".into()]
    });
    let second = cache.get_or_scan(start + std::time::Duration::from_secs(5), || {
        scans += 1;
        vec!["codex".into()]
    });
    assert_eq!(scans, 1);
    assert_eq!(first, second);
    let third = cache.get_or_scan(start + std::time::Duration::from_secs(16), || {
        scans += 1;
        vec!["codex".into()]
    });
    assert_eq!(scans, 2);
    assert_eq!(third, vec!["codex".to_string()]);
}

#[test]
fn prune_drops_stale_idle_managers_and_keeps_active_ones() {
    let repo = common::basic();
    let mut map = std::collections::HashMap::new();
    let mut idle = AutoAgentManager::new(enabled_config());
    idle.last_used = std::time::Instant::now() - std::time::Duration::from_secs(3600);
    map.insert(repo.path().to_string_lossy().to_string(), idle);

    let mut active = AutoAgentManager::new(enabled_config());
    active.sm.set_active(
        "refs/tongyun/snapshots/keep".into(),
        "keep".into(),
        AutoTrigger::Burst { change_count: 1 },
        1,
        None,
    );
    active.last_used = std::time::Instant::now() - std::time::Duration::from_secs(3600);
    map.insert("/definitely/missing/repo".into(), active);

    let mut gone = AutoAgentManager::new(enabled_config());
    gone.last_used = std::time::Instant::now();
    map.insert("/also/missing".into(), gone);

    let _dropped = prune_idle_managers(&mut map, std::time::Instant::now(), MANAGER_IDLE_TTL);
    assert!(map.contains_key("/definitely/missing/repo"));
    assert!(!map.contains_key("/also/missing"));
    assert!(!map.contains_key(&repo.path().to_string_lossy().to_string()));
}

/// 静默结束后，仍在运行的同一进程不能在下一次检查里把会话打开。
#[test]
fn silence_finish_does_not_reopen_for_the_same_process() {
    let repo = common::basic();
    let mut manager = AutoAgentManager::new(enabled_config());
    let report = manager
        .check(repo.path(), Some(&["claude".into()]), 1_000)
        .unwrap();
    assert!(report.active);
    let report = manager
        .check(repo.path(), Some(&["claude".into()]), 1_000 + 60_000)
        .unwrap();
    assert!(
        !report.active,
        "silence must finish even while claude stays up"
    );
    let taken = report.action_taken.unwrap_or_default();
    assert!(
        taken.contains("静默"),
        "expected silence finish, got {taken}"
    );
    let report = manager
        .check(repo.path(), Some(&["claude".into()]), 1_000 + 65_000)
        .unwrap();
    assert!(
        !report.active,
        "the same still-running process must not reopen after silence"
    );
}

/// 手动结束之后，必须先观察到进程退出，再次出现才算新实例。
#[test]
fn manual_end_allows_a_new_process_instance_after_exit() {
    let repo = common::basic();
    let mut manager = AutoAgentManager::new(enabled_config());
    let report = manager
        .check(repo.path(), Some(&["claude".into()]), 1_000)
        .unwrap();
    let reference = report.session_reference.expect("session");
    snapshot::finish(repo.path(), &reference).unwrap();
    manager
        .note_manual_end(repo.path(), &["claude".into()])
        .unwrap();

    let report = manager.check(repo.path(), Some(&[]), 2_000).unwrap();
    assert!(
        !report.active,
        "seeing the process leave must not open a session"
    );
    let report = manager
        .check(repo.path(), Some(&["claude".into()]), 3_000)
        .unwrap();
    assert!(
        report.active,
        "after the process has been seen to exit, a later start is a new instance"
    );
}

/// 快照已经结束时，管理器不能停在 Active 上每 5 秒再报一次失败。
#[test]
fn already_finished_snapshot_ends_the_manager() {
    let repo = common::basic();
    let mut manager = AutoAgentManager::new(enabled_config());
    let report = manager
        .check(repo.path(), Some(&["claude".into()]), 1_000)
        .unwrap();
    let reference = report.session_reference.expect("session");
    snapshot::finish(repo.path(), &reference).unwrap();
    manager.sm.set_config(AutoAgentConfig {
        enabled: false,
        ..enabled_config()
    });
    let report = manager
        .check(repo.path(), Some(&["claude".into()]), 2_000)
        .unwrap();
    assert!(!report.active);
    let taken = report.action_taken.unwrap_or_default();
    assert!(
        taken.contains("关闭"),
        "an already finished snapshot must still idle the manager, got {taken}"
    );
}

/// 手动开始占位会挡住正在起飞的自动检查；已有自动会话时拒绝。
#[test]
fn manual_start_hold_blocks_auto_check_and_rejects_active_session() {
    let mut manager = AutoAgentManager::new(enabled_config());
    let generation = manager
        .hold_for_manual_start()
        .expect("idle manager can hold");
    assert!(manager.begin_check().is_none());
    manager.release_user_mutation(generation);
    manager.sm.set_active(
        "refs/tongyun/snapshots/auto".into(),
        "auto".into(),
        AutoTrigger::Process {
            agent: "claude".into(),
        },
        1_000,
        Some("claude".into()),
    );
    assert!(manager.hold_for_manual_start().is_err());
}

/// 用户结束占位期间，自动检查不能并行开始。
#[test]
fn user_mutation_reservation_blocks_begin_check() {
    let mut manager = AutoAgentManager::new(enabled_config());
    let generation = manager.reserve_user_mutation();
    assert!(
        manager.begin_check().is_none(),
        "a reserved manager must not start another check"
    );
    manager.release_user_mutation(generation);
    assert!(manager.begin_check().is_some());
}

/// P2 上次进程崩溃/退出留下的隐藏基线 ref 要在第一次检查时清掉，
/// 但不能碰用户可见的会话快照。
#[test]
fn orphan_baselines_from_a_previous_process_are_reclaimed() {
    let repo = common::basic();
    let stale_a = snapshot::capture(repo.path(), "自动基线", "auto_baseline", None).unwrap();
    let stale_b = snapshot::capture(repo.path(), "自动基线", "auto_baseline", None).unwrap();
    snapshot::capture(repo.path(), "shelf", "shelf", None).unwrap();

    let mut manager = AutoAgentManager::new(enabled_config());
    manager.check(repo.path(), Some(&[]), 1_000).unwrap();

    let refs = snapshot::baseline_refs(repo.path()).unwrap();
    assert_eq!(refs.len(), 1, "only this manager's baseline should remain");
    assert!(!refs.contains(&stale_a.reference));
    assert!(!refs.contains(&stale_b.reference));
    assert!(
        snapshot::list(repo.path())
            .unwrap()
            .iter()
            .any(|snap| snap.kind == "shelf"),
        "visible snapshots must not be touched"
    );
}

/// P2 滚动基线最多每 30 秒刷新一次，慢速编辑不能每 5 秒拍一份。
#[test]
fn rolling_baseline_refresh_is_throttled_to_thirty_seconds() {
    let repo = common::basic();
    let mut manager = AutoAgentManager::new(enabled_config());
    manager.check(repo.path(), Some(&[]), 1_000).unwrap();
    let first = snapshot::baseline_refs(repo.path())
        .unwrap()
        .into_iter()
        .next()
        .expect("baseline");

    for i in 0..4 {
        fs::write(repo.path().join(format!("slow{i}.txt")), "slow\n").unwrap();
    }
    manager.check(repo.path(), Some(&[]), 2_000).unwrap();
    assert_eq!(
        snapshot::baseline_refs(repo.path()).unwrap(),
        vec![first.clone()],
        "a quiet tick inside 30s must reuse the existing baseline"
    );

    manager
        .check(repo.path(), Some(&[]), 1_000 + BASELINE_MIN_INTERVAL_MS)
        .unwrap();
    let refreshed = snapshot::baseline_refs(repo.path()).unwrap();
    assert_eq!(refreshed.len(), 1);
    assert_ne!(
        refreshed[0], first,
        "after 30s the baseline must be re-captured"
    );
}
