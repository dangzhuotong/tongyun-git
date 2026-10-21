use crate::snapshot;
use crate::{Git2Backend, GitBackend, Result};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet, HashMap};
use std::path::Path;
use std::sync::Mutex;
use std::time::{Duration, Instant};

/// Real agent CLIs. Cursor is intentionally absent: it is the editor the user
/// leaves open, so its process is not evidence that an agent run has started.
pub const KNOWN_AGENT_PROCESSES: &[&str] = &["tongyun-cli", "claude", "codex"];

/// IDE hosts that stay running while the user edits. Presence alone must not
/// start or keep an auto session alive.
pub const IDE_HOST_PROCESSES: &[&str] = &["cursor"];

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
    KNOWN_AGENT_PROCESSES
        .iter()
        .copied()
        .find(|&agent| normalized == agent)
}

/// Helper returning true if process name matches any known agent.
pub fn is_known_agent_process(process_path_or_name: &str) -> bool {
    match_agent_process(process_path_or_name).is_some()
}

/// Cursor and other long-lived IDE hosts. These are not an agent signal.
pub fn is_ide_host_process(process_path_or_name: &str) -> bool {
    let normalized = normalize_process_name(process_path_or_name);
    IDE_HOST_PROCESSES.contains(&normalized.as_str())
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
        Self {
            history: Vec::new(),
        }
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

fn default_enabled() -> bool {
    true
}
fn default_burst_threshold() -> usize {
    5
}
fn default_burst_window_secs() -> u64 {
    5
}
fn default_silence_timeout_secs() -> u64 {
    300
}

/// Auto Agent configuration.
/// Missing fields deserialize to the defaults so an older or hand-edited
/// settings blob cannot disable detection by failing to parse.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct AutoAgentConfig {
    #[serde(default = "default_enabled")]
    pub enabled: bool,
    #[serde(default = "default_burst_threshold")]
    pub burst_threshold: usize,
    #[serde(default = "default_burst_window_secs")]
    pub burst_window_secs: u64,
    #[serde(default = "default_silence_timeout_secs")]
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
    pub fn handle_process_check(
        &mut self,
        processes: &[String],
        _now_ms: u64,
    ) -> AutoSessionAction {
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
                ..
            } => {
                if let Some(agent) = detected_agent.clone() {
                    let still_running = processes
                        .iter()
                        .any(|p| match_agent_process(p) == Some(agent.as_str()));
                    if still_running {
                        // Process presence is not file activity. Silence is
                        // measured only from workspace changes.
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
                    let total = self
                        .burst_detector
                        .recent_count(now_ms, burst_cfg.window_secs);
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
                if change_count > 0 {
                    *last_activity_ms = now_ms;
                }
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
        if let Ok(output) = Command::new("ps").args(["-A", "-o", "comm="]).output() {
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
    /// Non-fatal problem (for example a rolling baseline that could not be refreshed).
    #[serde(default)]
    pub warning: Option<String>,
}

/// Worktree fingerprint: dirty/untracked path -> content key.
/// `None` means the path is missing (deleted).
pub type DirtyFingerprint = BTreeMap<String, Option<String>>;

/// Cached content key for one dirty path, keyed by file metadata so unchanged
/// files are not hashed again on every tick.
#[derive(Debug, Clone, PartialEq, Eq)]
struct FingerprintCacheEntry {
    mtime_ns: Option<i128>,
    len: Option<u64>,
    key: Option<String>,
}

fn metadata_stamp(meta: &std::fs::Metadata) -> (Option<i128>, u64) {
    let mtime_ns = meta
        .modified()
        .ok()
        .and_then(|time| time.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|delta| delta.as_nanos() as i128);
    (mtime_ns, meta.len())
}

/// How often a host-wide process scan may spawn `tasklist` / walk `/proc`.
pub const PROCESS_SCAN_TTL: Duration = Duration::from_secs(15);

/// Idle auto-session managers older than this are dropped.
pub const MANAGER_IDLE_TTL: Duration = Duration::from_secs(30 * 60);

/// Minimum spacing between rolling baseline refreshes. A quiet tick only
/// re-captures the baseline once this much time has elapsed, so slow editing
/// does not spawn a full snapshot every five seconds.
pub const BASELINE_MIN_INTERVAL_MS: u64 = 30_000;

/// High-level manager coordinating state machine and workspace snapshot operations.
#[derive(Debug, Clone)]
pub struct AutoAgentManager {
    pub sm: AutoAgentStateMachine,
    last_fp: Option<DirtyFingerprint>,
    baseline_fp: Option<DirtyFingerprint>,
    pending_ref: Option<String>,
    suppress_until_burst: bool,
    suppressed_processes: BTreeSet<String>,
    last_real_agents: Vec<String>,
    pub generation: u64,
    pub in_flight: bool,
    pub last_used: Instant,
    created_refs: Vec<String>,
    rewritten: Option<snapshot::Snapshot>,
    retire_refs: Vec<String>,
    fingerprint_cache: BTreeMap<String, FingerprintCacheEntry>,
    last_baseline_ms: u64,
    baselines_scanned: bool,
}

impl AutoAgentManager {
    pub fn new(config: AutoAgentConfig) -> Self {
        Self {
            sm: AutoAgentStateMachine::new(config),
            last_fp: None,
            baseline_fp: None,
            pending_ref: None,
            suppress_until_burst: false,
            suppressed_processes: BTreeSet::new(),
            last_real_agents: Vec::new(),
            generation: 0,
            in_flight: false,
            last_used: Instant::now(),
            created_refs: Vec::new(),
            rewritten: None,
            retire_refs: Vec::new(),
            fingerprint_cache: BTreeMap::new(),
            last_baseline_ms: 0,
            baselines_scanned: false,
        }
    }

    pub fn apply_config(&mut self, config: AutoAgentConfig) {
        let enabling = config.enabled && !self.sm.config.enabled;
        self.sm.set_config(config);
        if enabling {
            self.suppress_until_burst = false;
            self.suppressed_processes.clear();
        }
    }

    /// Begin a check. `None` means another check is already in flight.
    pub fn begin_check(&mut self) -> Option<u64> {
        if self.in_flight {
            return None;
        }
        self.in_flight = true;
        self.last_used = Instant::now();
        self.generation = self.generation.wrapping_add(1);
        Some(self.generation)
    }

    /// Install `working` only when no manual end or newer check invalidated `generation`.
    pub fn commit_inflight(&mut self, generation: u64, mut working: Self) -> bool {
        if self.generation != generation {
            self.in_flight = false;
            return false;
        }
        working.in_flight = false;
        working.generation = generation;
        *self = working;
        true
    }

    pub fn abort_inflight(&mut self, generation: u64) {
        if self.generation == generation {
            self.in_flight = false;
        }
    }

    pub fn report_snapshot(&self) -> AutoCheckReport {
        self.report(None, None)
    }

    /// User finished or deleted the auto session. Suppresses process restart
    /// until a new file burst, and arms a baseline at the current worktree
    /// so the next burst can still rewind its own first batch.
    /// The caller must already have finished the session snapshot.
    /// Same as [`note_manual_end`](Self::note_manual_end), using the agents
    /// observed on the previous check.
    pub fn note_manual_end_observed(&mut self, root: &Path) -> Result<()> {
        let running = self.last_real_agents.clone();
        self.note_manual_end(root, &running)
    }

    /// Stop an in-flight auto start and hold the manager until the manual
    /// snapshot is captured. Fails when an auto session is already active.
    pub fn hold_for_manual_start(&mut self) -> std::result::Result<u64, &'static str> {
        if self.sm.is_active() {
            return Err("已有进行中的自动会话，请先结束后再手动开始");
        }
        self.generation = self.generation.wrapping_add(1);
        self.in_flight = true;
        self.last_used = Instant::now();
        Ok(self.generation)
    }

    /// Block auto checks while the user finishes or deletes this session.
    /// The snapshot itself must be written after this returns, outside the lock.
    pub fn reserve_user_mutation(&mut self) -> u64 {
        self.generation = self.generation.wrapping_add(1);
        self.in_flight = true;
        self.last_used = Instant::now();
        self.generation
    }

    pub fn release_user_mutation(&mut self, generation: u64) {
        if self.generation == generation {
            self.in_flight = false;
        }
    }

    /// Idle and suppress using the agents seen on the previous check.
    pub fn mark_manual_end_observed(&mut self) -> u64 {
        let running = self.last_real_agents.clone();
        self.mark_manual_end(&running)
    }

    /// Idle and suppress. Leaves `in_flight` set so the caller can arm a
    /// baseline before the next auto check runs.
    pub fn mark_manual_end(&mut self, running_processes: &[String]) -> u64 {
        self.generation = self.generation.wrapping_add(1);
        self.suppress_until_burst = true;
        self.suppressed_processes = canonical_agents(running_processes).into_iter().collect();
        self.sm.set_idle();
        self.in_flight = true;
        self.last_used = Instant::now();
        self.generation
    }

    /// Capture the current worktree as the next rolling baseline. Snapshot IO
    /// stays with the caller so it can run outside the manager lock.
    pub fn arm_fresh_baseline(&mut self, root: &Path) -> Result<()> {
        self.arm_baseline(root)
    }

    /// Refs superseded by this check. Clearing the bookkeeping here means a
    /// later rollback will not delete a baseline that was already committed.
    pub fn take_retired_refs(&mut self) -> Vec<String> {
        self.created_refs.clear();
        self.rewritten = None;
        std::mem::take(&mut self.retire_refs)
    }

    pub fn note_manual_end(&mut self, root: &Path, running_processes: &[String]) -> Result<()> {
        self.mark_manual_end(running_processes);
        let armed = self.arm_baseline(root);
        match &armed {
            Ok(()) => self.commit_side_effects(root),
            Err(_) => self.rollback_side_effects(root),
        }
        self.in_flight = false;
        armed
    }

    /// Bump the generation so an in-flight auto start cannot commit over a
    /// manual or bridge session that was just created.
    pub fn invalidate_inflight(&mut self) {
        self.generation = self.generation.wrapping_add(1);
        self.in_flight = false;
    }

    /// The manager diffs the worktree against the previous observation, so a
    /// stable dirty tree cannot retrigger a burst.
    pub fn check(
        &mut self,
        root: &Path,
        running_processes: Option<&[String]>,
        now_ms: u64,
    ) -> Result<AutoCheckReport> {
        let result = self.check_detached(root, running_processes, now_ms);
        match &result {
            Ok(_) => self.commit_side_effects(root),
            Err(_) => self.rollback_side_effects(root),
        }
        result
    }

    /// Like [`check`](Self::check) but leaves snapshot creates/deletes uncommitted
    /// so the caller can roll them back when `generation` is stale.
    pub fn check_detached(
        &mut self,
        root: &Path,
        running_processes: Option<&[String]>,
        now_ms: u64,
    ) -> Result<AutoCheckReport> {
        self.last_used = Instant::now();
        if !self.baselines_scanned {
            self.baselines_scanned = true;
            // Refs left behind by an earlier process are invisible in the UI.
            // Drop any we are not tracking before we start our own baseline.
            let _ = self.cleanup_orphan_baselines(root);
        }
        let scanned;
        let procs: &[String] = match running_processes {
            Some(procs) => procs,
            None => {
                scanned = find_running_agent_processes();
                &scanned
            }
        };
        self.last_real_agents = canonical_agents(procs);
        self.suppressed_processes
            .retain(|agent| self.last_real_agents.iter().any(|running| running == agent));

        if !self.sm.config.enabled {
            return self.finish_if_disabled(root);
        }

        let fp = self.fingerprint(root)?;
        if self.sm.is_active() {
            return self.check_active(root, &fp, procs, now_ms);
        }
        if has_open_agent_session(root)? {
            self.observe_blocked(fp);
            return Ok(self.report(None, None));
        }
        self.check_idle(root, fp, procs, now_ms)
    }

    pub fn commit_side_effects(&mut self, root: &Path) {
        for reference in self.retire_refs.drain(..) {
            let _ = snapshot::delete(root, &reference);
        }
        self.created_refs.clear();
        self.rewritten = None;
    }

    pub fn rollback_side_effects(&mut self, root: &Path) {
        if let Some(previous) = self.rewritten.take() {
            if let Ok(repo) = git2::Repository::open(root) {
                let _ = snapshot::save(&repo, &previous);
            }
        }
        let created = std::mem::take(&mut self.created_refs);
        for reference in &created {
            let _ = snapshot::delete(root, reference);
            if self.pending_ref.as_ref() == Some(reference) {
                self.pending_ref = None;
                self.baseline_fp = None;
            }
        }
        self.retire_refs.clear();
    }

    fn finish_if_disabled(&mut self, root: &Path) -> Result<AutoCheckReport> {
        let saved = self.sm.clone();
        let action = self.sm.handle_tick(&[], 0);
        match action {
            AutoSessionAction::FinishSession { reference, reason } => {
                self.complete_finish(root, &reference, &reason, saved)
            }
            _ => Ok(self.report(None, None)),
        }
    }

    fn check_active(
        &mut self,
        root: &Path,
        fp: &DirtyFingerprint,
        procs: &[String],
        now_ms: u64,
    ) -> Result<AutoCheckReport> {
        let delta = self
            .last_fp
            .as_ref()
            .map(|prev| fingerprint_delta(prev, fp))
            .unwrap_or(0);
        self.last_fp = Some(fp.clone());
        if delta > 0 {
            let _ = self.sm.handle_file_changes(delta, now_ms);
        }
        let saved = self.sm.clone();
        let action = self.sm.handle_tick(procs, now_ms);
        match action {
            AutoSessionAction::FinishSession { reference, reason } => {
                self.complete_finish(root, &reference, &reason, saved)
            }
            _ => Ok(self.report(None, None)),
        }
    }

    fn check_idle(
        &mut self,
        root: &Path,
        fp: DirtyFingerprint,
        procs: &[String],
        now_ms: u64,
    ) -> Result<AutoCheckReport> {
        let mut delta = self
            .last_fp
            .as_ref()
            .map(|prev| fingerprint_delta(prev, &fp))
            .unwrap_or(0);
        if self.pending_ref.is_none() {
            // First sight of this worktree is the baseline, not a burst.
            self.capture_baseline(root, &fp, now_ms)?;
            delta = 0;
            self.sm.burst_detector.reset();
        }
        self.last_fp = Some(fp.clone());

        let saved = self.sm.clone();
        let mut action = AutoSessionAction::None;
        if delta > 0 {
            action = self.sm.handle_file_changes(delta, now_ms);
        }
        if matches!(action, AutoSessionAction::None) && self.process_start_allowed() {
            let process_action = self.sm.handle_process_check(procs, now_ms);
            if matches!(process_action, AutoSessionAction::StartSession { .. }) {
                action = process_action;
            }
        }

        if matches!(action, AutoSessionAction::None) {
            self.sm
                .burst_detector
                .prune(now_ms, self.sm.config.burst_window_secs);
            let quiet = self
                .sm
                .burst_detector
                .recent_count(now_ms, self.sm.config.burst_window_secs)
                == 0;
            if quiet && self.baseline_fp.as_ref() != Some(&fp) && self.baseline_refresh_due(now_ms)
            {
                if let Err(err) = self.capture_baseline(root, &fp, now_ms) {
                    if self.pending_ref.is_none() {
                        self.sm = saved;
                        return Err(err);
                    }
                    return Ok(self.report(None, Some(format!("滚动基线没有更新：{err}"))));
                }
            }
            return Ok(self.report(None, None));
        }

        match action {
            AutoSessionAction::StartSession {
                label,
                trigger,
                agent,
            } => {
                let snap = match self.promote_pending(root, &label) {
                    Ok(snap) => snap,
                    Err(err) => {
                        self.sm = saved;
                        return Err(err);
                    }
                };
                self.suppress_until_burst = false;
                self.suppressed_processes.clear();
                self.sm.set_active(
                    snap.reference.clone(),
                    label.clone(),
                    trigger,
                    now_ms,
                    agent,
                );
                Ok(self.report(Some(format!("已自动开启会话快照: {label}")), None))
            }
            AutoSessionAction::FinishSession { reference, reason } => {
                self.complete_finish(root, &reference, &reason, saved)
            }
            AutoSessionAction::None => Ok(self.report(None, None)),
        }
    }

    fn complete_finish(
        &mut self,
        root: &Path,
        reference: &str,
        reason: &str,
        saved: AutoAgentStateMachine,
    ) -> Result<AutoCheckReport> {
        if let Err(err) = snapshot::finish(root, reference) {
            let already_finished = snapshot::load(root, reference)
                .ok()
                .is_some_and(|snap| snap.kind == "agent_finished");
            if !already_finished {
                self.sm = saved;
                return Err(err);
            }
        }
        let silence_or_disable = reason.contains("静默") || reason.contains("关闭");
        if silence_or_disable {
            self.suppress_until_burst = true;
            self.suppressed_processes = self.last_real_agents.iter().cloned().collect();
        }
        let warning = match self.arm_baseline(root) {
            Ok(()) => None,
            Err(err) => Some(format!("会话已结束，但新的基线快照没有保存：{err}")),
        };
        Ok(self.report(Some(format!("已自动结束会话: {reason}")), warning))
    }

    fn process_start_allowed(&self) -> bool {
        if !self.suppress_until_burst {
            return true;
        }
        // The same still-running process instance stays suppressed.
        // After it exits, a later start is a new instance.
        self.suppressed_processes.is_empty()
    }

    fn observe_blocked(&mut self, fp: DirtyFingerprint) {
        self.last_fp = Some(fp);
        self.sm.burst_detector.reset();
        if let Some(old) = self.pending_ref.take() {
            self.retire_refs.push(old);
        }
        self.baseline_fp = None;
    }

    fn arm_baseline(&mut self, root: &Path) -> Result<()> {
        let fp = self.fingerprint(root)?;
        self.capture_baseline(root, &fp, wall_clock_ms())?;
        self.last_fp = Some(fp);
        Ok(())
    }

    fn fingerprint(&mut self, root: &Path) -> Result<DirtyFingerprint> {
        dirty_fingerprint(root, &mut self.fingerprint_cache)
    }

    fn baseline_refresh_due(&self, now_ms: u64) -> bool {
        now_ms.saturating_sub(self.last_baseline_ms) >= BASELINE_MIN_INTERVAL_MS
    }

    /// Reclaim `auto_baseline` refs that this process is not tracking. The
    /// manager keeps the rolling ref only in memory, so a crash or normal exit
    /// leaves the ref behind but hidden from [`snapshot::list`].
    pub fn cleanup_orphan_baselines(&mut self, root: &Path) -> Result<usize> {
        let keep = self.pending_ref.clone();
        let mut removed = 0;
        for reference in snapshot::baseline_refs(root)? {
            if Some(&reference) == keep.as_ref() {
                continue;
            }
            snapshot::delete(root, &reference)?;
            removed += 1;
        }
        Ok(removed)
    }

    fn capture_baseline(&mut self, root: &Path, fp: &DirtyFingerprint, now_ms: u64) -> Result<()> {
        let snap = snapshot::capture(root, "自动基线", "auto_baseline", None)?;
        if let Some(old) = self.pending_ref.replace(snap.reference.clone()) {
            self.retire_refs.push(old);
        }
        self.created_refs.push(snap.reference);
        self.baseline_fp = Some(fp.clone());
        self.last_baseline_ms = now_ms;
        Ok(())
    }

    fn promote_pending(&mut self, root: &Path, label: &str) -> Result<snapshot::Snapshot> {
        let Some(reference) = self.pending_ref.clone() else {
            let snap = snapshot::capture(root, label, "agent", None)?;
            self.created_refs.push(snap.reference.clone());
            return Ok(snap);
        };
        let previous = snapshot::load(root, &reference)?;
        let mut snap = previous.clone();
        snap.kind = "agent".into();
        snap.label = label.into();
        let repo = git2::Repository::open(root)?;
        snapshot::save(&repo, &snap)?;
        if self.rewritten.is_none() {
            self.rewritten = Some(previous);
        }
        self.pending_ref = None;
        self.baseline_fp = None;
        Ok(snap)
    }

    fn report(&self, action_taken: Option<String>, warning: Option<String>) -> AutoCheckReport {
        let (active, session_reference, session_label) = match self.sm.state() {
            AutoSessionState::Active {
                reference, label, ..
            } => (true, Some(reference.clone()), Some(label.clone())),
            AutoSessionState::Idle => (false, None, None),
        };
        AutoCheckReport {
            active,
            session_reference,
            session_label,
            action_taken,
            warning,
        }
    }
}

fn canonical_agents(processes: &[String]) -> Vec<String> {
    let mut agents = BTreeSet::new();
    for process in processes {
        if let Some(agent) = match_agent_process(process) {
            agents.insert(agent.to_string());
        }
    }
    agents.into_iter().collect()
}

fn wall_clock_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

fn dirty_fingerprint(
    root: &Path,
    cache: &mut BTreeMap<String, FingerprintCacheEntry>,
) -> Result<DirtyFingerprint> {
    let backend = Git2Backend::open(root)?;
    let repo = git2::Repository::open(root)?;
    let mut map = BTreeMap::new();
    let mut seen = BTreeSet::new();
    for file in backend.status()? {
        if repo
            .status_should_ignore(Path::new(&file.path))
            .unwrap_or(false)
        {
            continue;
        }
        let full = root.join(&file.path);
        if full.is_dir() {
            continue;
        }
        seen.insert(file.path.clone());
        let (mtime_ns, len) = match std::fs::metadata(&full) {
            Ok(meta) => metadata_stamp(&meta),
            Err(_) => (None, 0),
        };
        let cached = cache.get(&file.path);
        let key = match cached {
            Some(entry) if entry.mtime_ns == mtime_ns && entry.len == Some(len) => {
                entry.key.clone()
            }
            _ => {
                let key = match snapshot::read_version(&repo, root, &file.path) {
                    Ok(version) => {
                        version.map(|version| format!("{}:{}", version.oid, version.mode))
                    }
                    Err(_) => Some(format!("unreadable:{len}")),
                };
                cache.insert(
                    file.path.clone(),
                    FingerprintCacheEntry {
                        mtime_ns,
                        len: Some(len),
                        key: key.clone(),
                    },
                );
                key
            }
        };
        map.insert(file.path, key);
    }
    // Deleted / no-longer-dirty paths must not keep the cache growing.
    cache.retain(|path, _| seen.contains(path));
    Ok(map)
}

pub fn fingerprint_delta(prev: &DirtyFingerprint, next: &DirtyFingerprint) -> usize {
    let mut keys = BTreeSet::new();
    keys.extend(prev.keys().cloned());
    keys.extend(next.keys().cloned());
    keys.into_iter()
        .filter(|key| prev.get(key) != next.get(key))
        .count()
}

fn has_open_agent_session(root: &Path) -> Result<bool> {
    Ok(snapshot::list(root)?
        .iter()
        .any(|snap| snap.kind == "agent"))
}

/// Drop idle managers that are stale or point at a removed worktree.
/// Returns `(repo path, pending baseline ref)` pairs the caller should delete.
pub fn prune_idle_managers(
    map: &mut HashMap<String, AutoAgentManager>,
    now: Instant,
    max_idle: Duration,
) -> Vec<(String, String)> {
    let mut dropped = Vec::new();
    map.retain(|path, manager| {
        let keep = manager.sm.is_active()
            || manager.in_flight
            || (Path::new(path).exists()
                && now.saturating_duration_since(manager.last_used) < max_idle);
        if !keep {
            if let Some(reference) = &manager.pending_ref {
                dropped.push((path.clone(), reference.clone()));
            }
        }
        keep
    });
    dropped
}

/// Remembers the last process scan so several repos and the 5s timer share one.
#[derive(Debug, Clone)]
pub struct ProcessScanCache {
    scanned_at: Option<Instant>,
    procs: Vec<String>,
    ttl: Duration,
}

impl ProcessScanCache {
    pub const fn new(ttl: Duration) -> Self {
        Self {
            scanned_at: None,
            procs: Vec::new(),
            ttl,
        }
    }

    pub fn get_or_scan(&mut self, now: Instant, scan: impl FnOnce() -> Vec<String>) -> Vec<String> {
        if let Some(scanned_at) = self.scanned_at {
            if now.saturating_duration_since(scanned_at) < self.ttl {
                return self.procs.clone();
            }
        }
        let procs = scan();
        self.scanned_at = Some(now);
        self.procs = procs.clone();
        procs
    }
}

static PROCESS_CACHE: Mutex<ProcessScanCache> = Mutex::new(ProcessScanCache::new(PROCESS_SCAN_TTL));

/// Process scan shared across repos. At most once per [`PROCESS_SCAN_TTL`].
pub fn cached_running_agent_processes() -> Vec<String> {
    let now = Instant::now();
    let mut cache = PROCESS_CACHE.lock().unwrap_or_else(|err| err.into_inner());
    cache.get_or_scan(now, find_running_agent_processes)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn fingerprint_reuses_cached_key_while_metadata_is_unchanged() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        let _repo = git2::Repository::init(root).unwrap();
        fs::write(root.join("dirty.txt"), "one\n").unwrap();

        let mut cache = BTreeMap::new();
        let first = dirty_fingerprint(root, &mut cache).unwrap();
        assert!(first.contains_key("dirty.txt"));

        // If the metadata is unchanged the cached key must be reused instead of
        // hashing the file again.
        cache.get_mut("dirty.txt").unwrap().key = Some("cached-sentinel".into());
        let second = dirty_fingerprint(root, &mut cache).unwrap();
        assert_eq!(
            second.get("dirty.txt"),
            Some(&Some("cached-sentinel".into()))
        );
    }

    #[test]
    fn test_normalize_process_name() {
        assert_eq!(normalize_process_name("claude"), "claude");
        assert_eq!(normalize_process_name("Claude.EXE"), "claude");
        assert_eq!(
            normalize_process_name("C:\\Program Files\\Codex.exe"),
            "codex"
        );
        assert_eq!(
            normalize_process_name("/usr/local/bin/tongyun-cli"),
            "tongyun-cli"
        );
        assert_eq!(normalize_process_name("  cursor.exe  "), "cursor");
        assert_eq!(normalize_process_name(""), "");
    }

    #[test]
    fn test_match_agent_process_and_ide_host() {
        assert_eq!(match_agent_process("tongyun-cli"), Some("tongyun-cli"));
        assert_eq!(match_agent_process("C:\\bin\\claude.exe"), Some("claude"));
        assert_eq!(match_agent_process("/opt/codex"), Some("codex"));

        // Cursor is intentionally an IDE host, not a known agent
        assert_eq!(match_agent_process("cursor.exe"), None);
        assert_eq!(match_agent_process("unknown-agent"), None);

        assert!(is_known_agent_process("claude"));
        assert!(is_known_agent_process("tongyun-cli.exe"));
        assert!(!is_known_agent_process("cursor"));
        assert!(!is_known_agent_process("git"));

        assert!(is_ide_host_process("cursor"));
        assert!(is_ide_host_process("C:\\Users\\bin\\Cursor.exe"));
        assert!(!is_ide_host_process("claude"));
        assert!(!is_ide_host_process("tongyun-cli"));
    }

    #[test]
    fn test_agent_display_name() {
        assert_eq!(agent_display_name("cursor"), "Cursor");
        assert_eq!(agent_display_name("tongyun-cli"), "tongyun-cli");
        assert_eq!(agent_display_name("claude"), "claude");
        assert_eq!(agent_display_name("codex"), "codex");
        assert_eq!(agent_display_name("custom-tool"), "custom-tool");
    }

    #[test]
    fn test_burst_detector_and_evaluations() {
        assert!(evaluate_burst(5, 5));
        assert!(evaluate_burst(6, 5));
        assert!(!evaluate_burst(4, 5));

        let timestamps = vec![1000, 2000, 3000, 4000];
        // window: 2s (2000ms), cutoff = 4000 - 2000 = 2000; timestamps in window: 2000, 3000, 4000 (3 items)
        assert!(evaluate_timestamp_burst(&timestamps, 4000, 2, 3));
        assert!(!evaluate_timestamp_burst(&timestamps, 4000, 2, 4));

        let mut detector = BurstDetector::new();
        detector.record_change(1000);
        detector.record_changes(4, 2000);
        assert_eq!(detector.recent_count(2500, 2), 5);
        assert_eq!(detector.recent_count(5000, 2), 0);

        let cfg = BurstConfig {
            window_secs: 2,
            threshold: 5,
        };
        assert!(detector.is_burst(2500, &cfg));

        detector.reset();
        assert_eq!(detector.recent_count(2500, 2), 0);
        assert!(!detector.is_burst(2500, &cfg));
    }

    #[test]
    fn test_auto_agent_config_and_serde() {
        let default_cfg = AutoAgentConfig::default();
        assert!(default_cfg.enabled);
        assert_eq!(default_cfg.burst_threshold, 5);
        assert_eq!(default_cfg.burst_window_secs, 5);
        assert_eq!(default_cfg.silence_timeout_secs, 300);
        assert_eq!(default_cfg.silence_minutes(), 5);

        let modified = default_cfg.clone().with_silence_minutes(10);
        assert_eq!(modified.silence_timeout_secs, 600);
        assert_eq!(modified.silence_minutes(), 10);
        assert_eq!(
            modified.burst_config(),
            BurstConfig {
                window_secs: 5,
                threshold: 5,
            }
        );

        // Deserialization of empty JSON object defaults all fields
        let parsed: AutoAgentConfig = serde_json::from_str("{}").expect("parse default JSON");
        assert_eq!(parsed, default_cfg);

        let roundtrip_json = serde_json::to_string(&modified).expect("serialize config");
        let roundtrip_cfg: AutoAgentConfig =
            serde_json::from_str(&roundtrip_json).expect("deserialize config");
        assert_eq!(roundtrip_cfg, modified);
    }

    #[test]
    fn test_auto_agent_triggers_and_states_serde() {
        let trigger_proc = AutoTrigger::Process {
            agent: "claude".to_string(),
        };
        let json_proc = serde_json::to_string(&trigger_proc).expect("serialize proc trigger");
        assert_eq!(json_proc, "{\"type\":\"process\",\"agent\":\"claude\"}");
        assert_eq!(
            serde_json::from_str::<AutoTrigger>(&json_proc).unwrap(),
            trigger_proc
        );

        let trigger_burst = AutoTrigger::Burst { change_count: 8 };
        let json_burst = serde_json::to_string(&trigger_burst).expect("serialize burst trigger");
        assert_eq!(json_burst, "{\"type\":\"burst\",\"change_count\":8}");
        assert_eq!(
            serde_json::from_str::<AutoTrigger>(&json_burst).unwrap(),
            trigger_burst
        );

        let idle_state = AutoSessionState::Idle;
        let json_idle = serde_json::to_string(&idle_state).expect("serialize idle state");
        assert_eq!(json_idle, "{\"state\":\"idle\"}");
        assert_eq!(
            serde_json::from_str::<AutoSessionState>(&json_idle).unwrap(),
            idle_state
        );

        let active_state = AutoSessionState::Active {
            reference: "refs/tongyun/snapshots/agent-test".to_string(),
            label: "Auto Session".to_string(),
            trigger: trigger_proc.clone(),
            started_ms: 1000,
            last_activity_ms: 1000,
            detected_agent: Some("claude".to_string()),
        };
        let json_active = serde_json::to_string(&active_state).expect("serialize active state");
        let parsed_active: AutoSessionState =
            serde_json::from_str(&json_active).expect("deserialize active state");
        assert_eq!(parsed_active, active_state);

        let action = AutoSessionAction::StartSession {
            label: "test".to_string(),
            trigger: trigger_burst,
            agent: Some("codex".to_string()),
        };
        let json_action = serde_json::to_string(&action).expect("serialize action");
        let parsed_action: AutoSessionAction =
            serde_json::from_str(&json_action).expect("deserialize action");
        assert_eq!(parsed_action, action);
    }

    #[test]
    fn test_auto_agent_state_machine_process_flow() {
        let config = AutoAgentConfig::default();
        let mut sm = AutoAgentStateMachine::new(config);
        assert!(!sm.is_active());

        // Process check with IDE host Cursor does not start session
        let action = sm.handle_process_check(&["cursor.exe".to_string()], 1000);
        assert_eq!(action, AutoSessionAction::None);
        assert!(!sm.is_active());

        // Process check with claude triggers StartSession
        let action = sm.handle_process_check(&["claude".to_string()], 1000);
        match action {
            AutoSessionAction::StartSession {
                label,
                trigger,
                agent,
            } => {
                assert!(label.contains("claude"));
                assert_eq!(agent, Some("claude".to_string()));
                assert_eq!(
                    trigger,
                    AutoTrigger::Process {
                        agent: "claude".to_string()
                    }
                );
            }
            other => panic!("expected StartSession, got {other:?}"),
        }

        // Set state to active
        sm.set_active(
            "refs/tongyun/snapshots/snap-1".to_string(),
            "Session".to_string(),
            AutoTrigger::Process {
                agent: "claude".to_string(),
            },
            1000,
            Some("claude".to_string()),
        );
        assert!(sm.is_active());

        // Still running: action is None
        let action = sm.handle_process_check(&["claude".to_string()], 2000);
        assert_eq!(action, AutoSessionAction::None);
        assert!(sm.is_active());

        // Process exited: triggers FinishSession and resets to Idle
        let action = sm.handle_process_check(&[], 3000);
        match action {
            AutoSessionAction::FinishSession { reference, reason } => {
                assert_eq!(reference, "refs/tongyun/snapshots/snap-1");
                assert!(reason.contains("已退出"));
            }
            other => panic!("expected FinishSession, got {other:?}"),
        }
        assert!(!sm.is_active());
    }

    #[test]
    fn test_auto_agent_state_machine_burst_and_silence_tick() {
        let config = AutoAgentConfig {
            enabled: true,
            burst_threshold: 3,
            burst_window_secs: 5,
            silence_timeout_secs: 60,
        };
        let mut sm = AutoAgentStateMachine::new(config);

        // Changes below threshold do not start session
        assert_eq!(sm.handle_file_changes(2, 1000), AutoSessionAction::None);
        assert!(!sm.is_active());

        // Reaching threshold triggers StartSession
        let action = sm.handle_file_changes(1, 2000);
        match action {
            AutoSessionAction::StartSession { trigger, agent, .. } => {
                assert_eq!(agent, None);
                assert_eq!(trigger, AutoTrigger::Burst { change_count: 3 });
            }
            other => panic!("expected StartSession, got {other:?}"),
        }

        sm.set_active(
            "refs/tongyun/snapshots/snap-burst".to_string(),
            "Burst Session".to_string(),
            AutoTrigger::Burst { change_count: 3 },
            2000,
            None,
        );
        assert!(sm.is_active());

        // Tick before silence timeout (30s elapsed < 60s timeout)
        let action = sm.handle_tick(&[], 32000);
        assert_eq!(action, AutoSessionAction::None);

        // Subsequent changes refresh last_activity_ms
        assert_eq!(sm.handle_file_changes(1, 40000), AutoSessionAction::None);

        // Tick at 80s (40s after last activity < 60s)
        assert_eq!(sm.handle_tick(&[], 80000), AutoSessionAction::None);

        // Tick at 110s (70s after last activity >= 60s) triggers silence finish
        let action = sm.handle_tick(&[], 110000);
        match action {
            AutoSessionAction::FinishSession { reference, reason } => {
                assert_eq!(reference, "refs/tongyun/snapshots/snap-burst");
                assert!(reason.contains("静默超时"));
            }
            other => panic!("expected FinishSession, got {other:?}"),
        }
        assert!(!sm.is_active());
    }

    #[test]
    fn test_auto_agent_state_machine_disabled_config() {
        let config = AutoAgentConfig {
            enabled: false,
            ..Default::default()
        };
        let mut sm = AutoAgentStateMachine::new(config);

        assert_eq!(
            sm.handle_process_check(&["claude".to_string()], 1000),
            AutoSessionAction::None
        );
        assert_eq!(sm.handle_file_changes(10, 1000), AutoSessionAction::None);

        // If sm is active when disabled, tick immediately finishes it
        sm.set_active(
            "refs/tongyun/snapshots/active".to_string(),
            "Active".to_string(),
            AutoTrigger::Process {
                agent: "claude".to_string(),
            },
            1000,
            Some("claude".to_string()),
        );
        let action = sm.handle_tick(&["claude".to_string()], 2000);
        match action {
            AutoSessionAction::FinishSession { reference, reason } => {
                assert_eq!(reference, "refs/tongyun/snapshots/active");
                assert!(reason.contains("设置中关闭"));
            }
            other => panic!("expected FinishSession, got {other:?}"),
        }
        assert!(!sm.is_active());
    }

    #[test]
    fn test_fingerprint_delta() {
        let mut prev = DirtyFingerprint::new();
        let mut next = DirtyFingerprint::new();
        assert_eq!(fingerprint_delta(&prev, &next), 0);

        prev.insert("file1.txt".to_string(), Some("v1".to_string()));
        next.insert("file1.txt".to_string(), Some("v1".to_string()));
        assert_eq!(fingerprint_delta(&prev, &next), 0);

        // Modified file
        next.insert("file1.txt".to_string(), Some("v2".to_string()));
        assert_eq!(fingerprint_delta(&prev, &next), 1);

        // Added file
        next.insert("file2.txt".to_string(), Some("v1".to_string()));
        assert_eq!(fingerprint_delta(&prev, &next), 2);

        // Deleted file
        next.remove("file1.txt");
        assert_eq!(fingerprint_delta(&prev, &next), 2);
    }

    #[test]
    fn test_process_scan_cache_ttl() {
        let mut cache = ProcessScanCache::new(Duration::from_millis(500));
        let mut call_count = 0;
        let t0 = Instant::now();

        let r1 = cache.get_or_scan(t0, || {
            call_count += 1;
            vec!["claude".to_string()]
        });
        assert_eq!(r1, vec!["claude"]);
        assert_eq!(call_count, 1);

        // Within TTL (200ms < 500ms), returns cached result without calling scan
        let t1 = t0 + Duration::from_millis(200);
        let r2 = cache.get_or_scan(t1, || {
            call_count += 1;
            vec!["tongyun-cli".to_string()]
        });
        assert_eq!(r2, vec!["claude"]);
        assert_eq!(call_count, 1);

        // Past TTL (600ms >= 500ms), calls scan again
        let t2 = t0 + Duration::from_millis(600);
        let r3 = cache.get_or_scan(t2, || {
            call_count += 1;
            vec!["codex".to_string()]
        });
        assert_eq!(r3, vec!["codex"]);
        assert_eq!(call_count, 2);
    }

    #[test]
    fn fingerprint_rehashes_when_size_changes() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        let _repo = git2::Repository::init(root).unwrap();
        fs::write(root.join("dirty.txt"), "one\n").unwrap();

        let mut cache = BTreeMap::new();
        dirty_fingerprint(root, &mut cache).unwrap();
        cache.get_mut("dirty.txt").unwrap().key = Some("cached-sentinel".into());

        fs::write(root.join("dirty.txt"), "two-longer\n").unwrap();
        let changed = dirty_fingerprint(root, &mut cache).unwrap();
        assert_ne!(
            changed.get("dirty.txt"),
            Some(&Some("cached-sentinel".into()))
        );
    }
}
