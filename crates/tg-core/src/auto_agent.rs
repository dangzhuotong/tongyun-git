use crate::snapshot;
use crate::Result;
use serde::{Deserialize, Serialize};
use std::path::Path;

/// Known agent process identifiers.
pub const KNOWN_AGENT_PROCESSES: &[&str] = &["cursor", "tongyun-cli", "claude", "codex"];

/// Normalize process path or executable name to lowercase identifier without path or .exe.
pub fn normalize_process_name(raw: &str) -> String {
    let name = raw.trim();
    let file_name = name.rsplit(['/', '\\']).next().unwrap_or(name);
    let lower = file_name.to_ascii_lowercase();
    if let Some(stripped) = lower.strip_suffix(".exe") {
        stripped.to_string()
    } else {
        lower
    }
}

/// Matches a process path or name against known agent processes.
/// Returns Some(canonical_name) if matched, None otherwise.
pub fn match_agent_process(process_path_or_name: &str) -> Option<&'static str> {
    let normalized = normalize_process_name(process_path_or_name);
    for &agent in KNOWN_AGENT_PROCESSES {
        if normalized == agent {
            return Some(agent);
        }
    }
    None
}

/// Helper returning true if process name matches any known agent.
pub fn is_known_agent_process(process_path_or_name: &str) -> bool {
    match_agent_process(process_path_or_name).is_some()
}

/// Returns a user-friendly display name for an agent identifier.
pub fn agent_display_name(agent_id: &str) -> &str {
    match agent_id {
        "cursor" => "Cursor",
        "tongyun-cli" => "tongyun-cli",
        "claude" => "claude",
        "codex" => "codex",
        other => other,
    }
}

/// Burst detection configuration.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct BurstConfig {
    /// Window duration in seconds (e.g. 5 or 10 seconds).
    pub window_secs: u64,
    /// Minimum count of file changes within window to trigger a burst.
    pub threshold: usize,
}

impl Default for BurstConfig {
    fn default() -> Self {
        Self {
            window_secs: 5,
            threshold: 5,
        }
    }
}

/// In-memory tracker for sudden file change bursts.
#[derive(Debug, Clone, Default)]
pub struct BurstDetector {
    history: Vec<u64>,
}

impl BurstDetector {
    pub fn new() -> Self {
        Self { history: Vec::new() }
    }

    pub fn record_change(&mut self, timestamp_ms: u64) {
        self.history.push(timestamp_ms);
    }

    pub fn record_changes(&mut self, count: usize, timestamp_ms: u64) {
        for _ in 0..count {
            self.history.push(timestamp_ms);
        }
    }

    pub fn prune(&mut self, now_ms: u64, window_secs: u64) {
        let window_ms = window_secs.saturating_mul(1000);
        let cutoff = now_ms.saturating_sub(window_ms);
        self.history.retain(|&ts| ts >= cutoff && ts <= now_ms);
    }

    pub fn is_burst(&mut self, now_ms: u64, config: &BurstConfig) -> bool {
        self.prune(now_ms, config.window_secs);
        self.history.len() >= config.threshold
    }

    pub fn recent_count(&self, now_ms: u64, window_secs: u64) -> usize {
        let window_ms = window_secs.saturating_mul(1000);
        let cutoff = now_ms.saturating_sub(window_ms);
        self.history
            .iter()
            .filter(|&&ts| ts >= cutoff && ts <= now_ms)
            .count()
    }

    pub fn reset(&mut self) {
        self.history.clear();
    }
}

/// Pure evaluation of whether a change count meets the threshold.
pub fn evaluate_burst(count: usize, threshold: usize) -> bool {
    count >= threshold
}

/// Pure evaluation of change timestamps against sliding window and threshold.
pub fn evaluate_timestamp_burst(
    timestamps: &[u64],
    now_ms: u64,
    window_secs: u64,
    threshold: usize,
) -> bool {
    let window_ms = window_secs.saturating_mul(1000);
    let cutoff = now_ms.saturating_sub(window_ms);
    let count = timestamps
        .iter()
        .filter(|&&ts| ts >= cutoff && ts <= now_ms)
        .count();
    count >= threshold
}

/// Auto Agent configuration.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct AutoAgentConfig {
    pub enabled: bool,
    pub burst_threshold: usize,
    pub burst_window_secs: u64,
    pub silence_timeout_secs: u64,
}

impl Default for AutoAgentConfig {
    fn default() -> Self {
        Self {
            enabled: true,
            burst_threshold: 5,
            burst_window_secs: 5,
            silence_timeout_secs: 300, // 5 minutes
        }
    }
}

impl AutoAgentConfig {
    pub fn burst_config(&self) -> BurstConfig {
        BurstConfig {
            window_secs: self.burst_window_secs,
            threshold: self.burst_threshold,
        }
    }

    pub fn with_silence_minutes(mut self, minutes: u64) -> Self {
        self.silence_timeout_secs = minutes.saturating_mul(60);
        self
    }

    pub fn silence_minutes(&self) -> u64 {
        self.silence_timeout_secs / 60
    }
}

/// What caused the auto session to start.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum AutoTrigger {
    Process { agent: String },
    Burst { change_count: usize },
}

/// State of the auto agent session manager.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(tag = "state", rename_all = "snake_case")]
pub enum AutoSessionState {
    Idle,
    Active {
        reference: String,
        label: String,
        trigger: AutoTrigger,
        started_ms: u64,
        last_activity_ms: u64,
        detected_agent: Option<String>,
    },
}

/// Action to be performed by caller when state machine transitions.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub enum AutoSessionAction {
    StartSession {
        label: String,
        trigger: AutoTrigger,
        agent: Option<String>,
    },
    FinishSession {
        reference: String,
        reason: String,
    },
    None,
}

/// State machine for managing auto agent detection, starting, activity updates, and finishing.
#[derive(Debug, Clone)]
pub struct AutoAgentStateMachine {
    pub config: AutoAgentConfig,
    pub state: AutoSessionState,
    pub burst_detector: BurstDetector,
}

impl AutoAgentStateMachine {
    pub fn new(config: AutoAgentConfig) -> Self {
        Self {
            config,
            state: AutoSessionState::Idle,
            burst_detector: BurstDetector::new(),
        }
    }

    pub fn state(&self) -> &AutoSessionState {
        &self.state
    }

    pub fn is_active(&self) -> bool {
        matches!(self.state, AutoSessionState::Active { .. })
    }

    pub fn set_active(
        &mut self,
        reference: String,
        label: String,
        trigger: AutoTrigger,
        started_ms: u64,
        agent: Option<String>,
    ) {
        self.state = AutoSessionState::Active {
            reference,
            label,
            trigger,
            started_ms,
            last_activity_ms: started_ms,
            detected_agent: agent,
        };
    }

    pub fn set_idle(&mut self) {
        self.state = AutoSessionState::Idle;
        self.burst_detector.reset();
    }

    pub fn set_config(&mut self, config: AutoAgentConfig) {
        self.config = config;
    }

    /// Handle process list check (e.g. from process scan).
    pub fn handle_process_check(&mut self, processes: &[String], now_ms: u64) -> AutoSessionAction {
        if !self.config.enabled {
            if let AutoSessionState::Active { reference, .. } = &self.state {
                let ref_clone = reference.clone();
                self.set_idle();
                return AutoSessionAction::FinishSession {
                    reference: ref_clone,
                    reason: "自动检测已在设置中关闭".to_string(),
                };
            }
            return AutoSessionAction::None;
        }

        let matched_agent = processes.iter().find_map(|p| match_agent_process(p));

        match &mut self.state {
            AutoSessionState::Idle => {
                if let Some(agent) = matched_agent {
                    let display = agent_display_name(agent);
                    return AutoSessionAction::StartSession {
                        label: format!("自动 Agent 会话: {display}"),
                        trigger: AutoTrigger::Process {
                            agent: agent.to_string(),
                        },
                        agent: Some(agent.to_string()),
                    };
                }
                AutoSessionAction::None
            }
            AutoSessionState::Active {
                reference,
                detected_agent,
                last_activity_ms,
                ..
            } => {
                if let Some(agent) = detected_agent.clone() {
                    let still_running = processes
                        .iter()
                        .any(|p| match_agent_process(p) == Some(&agent));
                    if still_running {
                        *last_activity_ms = now_ms;
                        AutoSessionAction::None
                    } else {
                        let ref_clone = reference.clone();
                        self.set_idle();
                        AutoSessionAction::FinishSession {
                            reference: ref_clone,
                            reason: format!("Agent 进程 {agent} 已退出"),
                        }
                    }
                } else {
                    if let Some(agent) = matched_agent {
                        *detected_agent = Some(agent.to_string());
                        *last_activity_ms = now_ms;
                    }
                    AutoSessionAction::None
                }
            }
        }
    }

    /// Handle file change burst.
    pub fn handle_file_changes(&mut self, change_count: usize, now_ms: u64) -> AutoSessionAction {
        if !self.config.enabled {
            return AutoSessionAction::None;
        }

        match &mut self.state {
            AutoSessionState::Idle => {
                self.burst_detector.record_changes(change_count, now_ms);
                let burst_cfg = self.config.burst_config();
                if self.burst_detector.is_burst(now_ms, &burst_cfg) {
                    let total = self.burst_detector.recent_count(now_ms, burst_cfg.window_secs);
                    self.burst_detector.reset();
                    return AutoSessionAction::StartSession {
                        label: format!("自动变更检测快照 ({total} 个文件)"),
                        trigger: AutoTrigger::Burst {
                            change_count: total,
                        },
                        agent: None,
                    };
                }
                AutoSessionAction::None
            }
            AutoSessionState::Active {
                last_activity_ms, ..
            } => {
                *last_activity_ms = now_ms;
                AutoSessionAction::None
            }
        }
    }

    /// Periodic heartbeat / tick to check silence timeout or process exits.
    pub fn handle_tick(&mut self, running_processes: &[String], now_ms: u64) -> AutoSessionAction {
        if !self.config.enabled {
            if let AutoSessionState::Active { reference, .. } = &self.state {
                let ref_clone = reference.clone();
                self.set_idle();
                return AutoSessionAction::FinishSession {
                    reference: ref_clone,
                    reason: "自动检测已在设置中关闭".to_string(),
                };
            }
            return AutoSessionAction::None;
        }

        let proc_action = self.handle_process_check(running_processes, now_ms);
        if proc_action != AutoSessionAction::None {
            return proc_action;
        }

        if let AutoSessionState::Active {
            reference,
            last_activity_ms,
            ..
        } = &self.state
        {
            let timeout_ms = self.config.silence_timeout_secs.saturating_mul(1000);
            if now_ms.saturating_sub(*last_activity_ms) >= timeout_ms {
                let ref_clone = reference.clone();
                let mins = self.config.silence_minutes();
                self.set_idle();
                return AutoSessionAction::FinishSession {
                    reference: ref_clone,
                    reason: format!("会话静默超时 (超过 {mins} 分钟)，自动结束"),
                };
            }
        }

        AutoSessionAction::None
    }
}

/// Detect running agent processes on the local OS.
pub fn find_running_agent_processes() -> Vec<String> {
    let mut detected = Vec::new();

    #[cfg(windows)]
    {
        use std::process::Command;
        if let Ok(output) = Command::new("tasklist")
            .args(["/FO", "CSV", "/NH"])
            .output()
        {
            if output.status.success() {
                let text = String::from_utf8_lossy(&output.stdout);
                for line in text.lines() {
                    let line = line.trim();
                    if line.starts_with('"') {
                        if let Some(first_quote_end) = line[1..].find('"') {
                            let name = &line[1..=first_quote_end];
                            if let Some(agent) = match_agent_process(name) {
                                if !detected.contains(&agent.to_string()) {
                                    detected.push(agent.to_string());
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    #[cfg(target_os = "linux")]
    {
        if let Ok(entries) = std::fs::read_dir("/proc") {
            for entry in entries.flatten() {
                let file_name = entry.file_name();
                if file_name
                    .to_string_lossy()
                    .chars()
                    .all(|c| c.is_ascii_digit())
                {
                    let comm_path = entry.path().join("comm");
                    if let Ok(comm) = std::fs::read_to_string(comm_path) {
                        let name = comm.trim();
                        if let Some(agent) = match_agent_process(name) {
                            if !detected.contains(&agent.to_string()) {
                                detected.push(agent.to_string());
                            }
                        }
                    }
                }
            }
        }
    }

    #[cfg(target_os = "macos")]
    {
        use std::process::Command;
        if let Ok(output) = Command::new("ps")
            .args(["-A", "-o", "comm="])
            .output()
        {
            if output.status.success() {
                let text = String::from_utf8_lossy(&output.stdout);
                for line in text.lines() {
                    let name = line.trim();
                    if let Some(agent) = match_agent_process(name) {
                        if !detected.contains(&agent.to_string()) {
                            detected.push(agent.to_string());
                        }
                    }
                }
            }
        }
    }

    detected
}

/// Report returned from an auto-check tick.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AutoCheckReport {
    pub active: bool,
    pub session_reference: Option<String>,
    pub session_label: Option<String>,
    pub action_taken: Option<String>,
}

/// High-level manager coordinating state machine and workspace snapshot operations.
#[derive(Debug)]
pub struct AutoAgentManager {
    pub sm: AutoAgentStateMachine,
}

impl AutoAgentManager {
    pub fn new(config: AutoAgentConfig) -> Self {
        Self {
            sm: AutoAgentStateMachine::new(config),
        }
    }

    pub fn check(
        &mut self,
        root: &Path,
        change_count: usize,
        running_processes: Option<&[String]>,
        now_ms: u64,
    ) -> Result<AutoCheckReport> {
        let os_procs;
        let procs = match running_processes {
            Some(p) => p,
            None => {
                os_procs = find_running_agent_processes();
                &os_procs
            }
        };

        let mut action = if change_count > 0 {
            self.sm.handle_file_changes(change_count, now_ms)
        } else {
            AutoSessionAction::None
        };

        if action == AutoSessionAction::None {
            action = self.sm.handle_tick(procs, now_ms);
        }

        let mut action_taken = None;

        match action {
            AutoSessionAction::StartSession {
                label,
                trigger,
                agent,
            } => {
                let snap = snapshot::capture(root, &label, "agent", None)?;
                let reference = snap.reference.clone();
                self.sm
                    .set_active(reference.clone(), label.clone(), trigger, now_ms, agent);
                action_taken = Some(format!("已自动开启会话快照: {label}"));
            }
            AutoSessionAction::FinishSession { reference, reason } => {
                let _ = snapshot::finish(root, &reference);
                action_taken = Some(format!("已自动结束会话: {reason}"));
            }
            AutoSessionAction::None => {}
        }

        let (active, session_reference, session_label) = match self.sm.state() {
            AutoSessionState::Active {
                reference, label, ..
            } => (true, Some(reference.clone()), Some(label.clone())),
            AutoSessionState::Idle => (false, None, None),
        };

        Ok(AutoCheckReport {
            active,
            session_reference,
            session_label,
            action_taken,
        })
    }
}
