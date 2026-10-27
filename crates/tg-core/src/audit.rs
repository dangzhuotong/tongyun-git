//! Version 1 local operation journal. Metadata only; never request bodies or credentials.
use serde::{Deserialize, Serialize};
use std::{
    fs::{self, OpenOptions},
    io::Write,
    path::{Path, PathBuf},
    sync::atomic::{AtomicU64, Ordering},
    time::{SystemTime, UNIX_EPOCH},
};
static SEQUENCE: AtomicU64 = AtomicU64::new(0);

/// Finish token shared by the desktop journal and the agent CLI.
pub const OUTCOME_SUCCEEDED: &str = "succeeded";
pub const OUTCOME_FAILED_OR_UNKNOWN: &str = "failed_or_unknown";
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Event {
    pub schema_version: u8,
    pub operation_id: String,
    pub task_id: String,
    pub actor: String,
    pub tool: String,
    pub action: String,
    pub target: String,
    pub phase: String,
    pub timestamp_ms: u64,
    pub outcome: Option<String>,
}
pub fn private_dir(path: &Path) -> std::io::Result<()> {
    fs::create_dir_all(path)?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(path, fs::Permissions::from_mode(0o700))?;
    }
    Ok(())
}
pub fn private_write(path: &Path, bytes: &[u8]) -> std::io::Result<()> {
    let mut options = OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    let mut file = options.open(path)?;
    file.write_all(bytes)?;
    file.sync_all()?;
    Ok(())
}
fn now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}
pub struct Operation {
    dir: PathBuf,
    event: Event,
}
impl Operation {
    pub fn begin(
        dir: &Path,
        tool: &str,
        action: &str,
        target: &str,
        actor: &str,
        task: &str,
    ) -> std::io::Result<Self> {
        private_dir(dir)?;
        let event = Event {
            schema_version: 1,
            operation_id: format!(
                "{}-{}-{}",
                now(),
                std::process::id(),
                SEQUENCE.fetch_add(1, Ordering::Relaxed)
            ),
            task_id: task.chars().take(128).collect(),
            actor: actor.chars().take(128).collect(),
            tool: tool.into(),
            action: action.chars().take(128).collect(),
            target: target.chars().take(512).collect(),
            phase: "started".into(),
            timestamp_ms: now(),
            outcome: None,
        };
        let op = Self {
            dir: dir.into(),
            event,
        };
        op.persist()?;
        Ok(op)
    }
    pub fn id(&self) -> &str {
        &self.event.operation_id
    }
    fn persist(&self) -> std::io::Result<()> {
        let bytes = serde_json::to_vec(&self.event)?;
        private_write(
            &self.dir.join(format!(
                "{}-{}.json",
                self.event.operation_id, self.event.phase
            )),
            &bytes,
        )
    }
    pub fn finish(mut self, outcome: &str) -> std::io::Result<()> {
        self.event.phase = "finished".into();
        self.event.timestamp_ms = now();
        self.event.outcome = Some(outcome.into());
        self.persist()
    }
}
pub fn read(dir: &Path) -> std::io::Result<Vec<Event>> {
    if !dir.exists() {
        return Ok(vec![]);
    }
    let mut events = vec![];
    for entry in fs::read_dir(dir)? {
        let entry = entry?;
        let path = entry.path();
        if path.extension().is_some_and(|x| x == "json") && entry.file_type()?.is_file() {
            // One corrupt record must not hide the rest of the journal.
            let Ok(bytes) = fs::read(&path) else {
                continue;
            };
            if let Ok(event) = serde_json::from_slice::<Event>(&bytes) {
                events.push(event);
            }
        }
    }
    events.sort_by(|a: &Event, b| {
        a.timestamp_ms
            .cmp(&b.timestamp_ms)
            .then(a.operation_id.cmp(&b.operation_id))
            .then(b.phase.cmp(&a.phase))
    });
    Ok(events)
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn persists_separate_operations_and_interrupted_intent() {
        let temp = tempfile::tempdir().unwrap();
        let dir = temp.path().join("journal");
        let op =
            Operation::begin(&dir, "fixture", "send", "request-1", "agent:test", "task-1").unwrap();
        let id = op.id().to_string();
        op.finish(OUTCOME_SUCCEEDED).unwrap();
        let interrupted = Operation::begin(
            &dir,
            "fixture",
            "send",
            "request-2",
            "human:local",
            "task-2",
        )
        .unwrap();
        assert_ne!(id, interrupted.id());
        drop(interrupted);
        let events = read(&dir).unwrap();
        assert_eq!(events.len(), 3);
        assert_eq!(events.iter().filter(|e| e.operation_id == id).count(), 2);
        assert!(events
            .iter()
            .any(|e| e.phase == "finished" && e.outcome.as_deref() == Some(OUTCOME_SUCCEEDED)));
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            assert_eq!(
                fs::metadata(&dir).unwrap().permissions().mode() & 0o777,
                0o700
            );
        }
    }
    #[test]
    fn skips_corrupt_json_and_keeps_valid_events() {
        let temp = tempfile::tempdir().unwrap();
        let dir = temp.path().join("journal");
        let op = Operation::begin(&dir, "fixture", "status", "repo", "agent:cli", "task").unwrap();
        op.finish(OUTCOME_SUCCEEDED).unwrap();
        fs::write(dir.join("broken.json"), b"{not-json").unwrap();
        fs::write(dir.join("empty.json"), b"").unwrap();
        let events = read(&dir).unwrap();
        assert!(events.len() >= 2);
        assert!(events
            .iter()
            .any(|e| e.phase == "finished" && e.outcome.as_deref() == Some(OUTCOME_SUCCEEDED)));
        assert!(events.iter().all(|e| e.schema_version == 1));
    }
    #[test]
    fn test_audit_constants_and_event_serde_camel_case() {
        assert_eq!(OUTCOME_SUCCEEDED, "succeeded");
        assert_eq!(OUTCOME_FAILED_OR_UNKNOWN, "failed_or_unknown");

        let event = Event {
            schema_version: 1,
            operation_id: "123-456-0".to_string(),
            task_id: "task-001".to_string(),
            actor: "agent:claude".to_string(),
            tool: "git".to_string(),
            action: "commit".to_string(),
            target: "/path/to/repo".to_string(),
            phase: "started".to_string(),
            timestamp_ms: 1700000000000,
            outcome: None,
        };
        let json = serde_json::to_string(&event).expect("serialize event");
        assert!(json.contains("\"schemaVersion\":1"));
        assert!(json.contains("\"operationId\":\"123-456-0\""));
        assert!(json.contains("\"taskId\":\"task-001\""));
        assert!(json.contains("\"timestampMs\":1700000000000"));

        let de: Event = serde_json::from_str(&json).expect("deserialize event");
        assert_eq!(de.schema_version, event.schema_version);
        assert_eq!(de.operation_id, event.operation_id);
        assert_eq!(de.task_id, event.task_id);
        assert_eq!(de.actor, event.actor);
        assert_eq!(de.tool, event.tool);
        assert_eq!(de.action, event.action);
        assert_eq!(de.target, event.target);
        assert_eq!(de.phase, event.phase);
        assert_eq!(de.timestamp_ms, event.timestamp_ms);
        assert_eq!(de.outcome, event.outcome);
    }

    #[test]
    fn unavailable_journal_refuses_begin() {
        let temp = tempfile::tempdir().unwrap();
        let file = temp.path().join("file");
        fs::write(&file, b"fixture").unwrap();
        assert!(Operation::begin(&file, "fixture", "send", "request", "actor", "task").is_err());
    }
}
