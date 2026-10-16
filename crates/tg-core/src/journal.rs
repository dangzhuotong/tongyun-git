//! Desktop and CLI share durable metadata; command output remains an ephemeral UI cache.
use crate::audit::{self, Operation};
use std::{
    path::{Path, PathBuf},
    sync::Mutex,
};
static DIRECTORY: Mutex<Option<PathBuf>> = Mutex::new(None);
pub fn configure(dir: &Path) -> std::io::Result<()> {
    audit::private_dir(dir)?;
    *DIRECTORY
        .lock()
        .map_err(|_| std::io::Error::other("journal poisoned"))? = Some(dir.into());
    Ok(())
}
pub fn history() -> std::io::Result<Vec<audit::Event>> {
    match DIRECTORY
        .lock()
        .map_err(|_| std::io::Error::other("journal poisoned"))?
        .as_ref()
    {
        Some(dir) => audit::read(dir),
        None => Ok(vec![]),
    }
}
pub fn begin(
    action: &str,
    target: &str,
    actor: &str,
    task: &str,
) -> std::io::Result<Option<Operation>> {
    match DIRECTORY
        .lock()
        .map_err(|_| std::io::Error::other("journal poisoned"))?
        .as_ref()
    {
        Some(dir) => Operation::begin(dir, "git", action, target, actor, task).map(Some),
        None => Ok(None),
    }
}
pub fn run<T>(
    action: &str,
    target: &str,
    actor: &str,
    task: &str,
    body: impl FnOnce() -> Result<T, String>,
) -> Result<T, String> {
    let op = begin(action, target, actor, task).map_err(|_| "AUDIT_UNAVAILABLE")?;
    let result = body();
    if let Some(op) = op {
        op.finish(if result.is_ok() {
            "succeeded"
        } else {
            "failed_or_unknown"
        })
        .map_err(|_| {
            "AUDIT_COMPLETION_FAILED: inspect started operation; do not retry automatically"
        })?;
    }
    result
}
pub async fn run_async<T, F: std::future::Future<Output = Result<T, String>>>(
    action: &str,
    target: &str,
    actor: &str,
    task: &str,
    body: F,
) -> Result<T, String> {
    let op = begin(action, target, actor, task).map_err(|_| "AUDIT_UNAVAILABLE")?;
    let result = body.await;
    if let Some(op) = op {
        op.finish(if result.is_ok() {
            "succeeded"
        } else {
            "failed_or_unknown"
        })
        .map_err(|_| {
            "AUDIT_COMPLETION_FAILED: inspect started operation; do not retry automatically"
        })?;
    }
    result
}

pub fn default_dir() -> std::io::Result<PathBuf> {
    let home = std::env::var_os(if cfg!(windows) { "USERPROFILE" } else { "HOME" })
        .map(PathBuf::from)
        .ok_or_else(|| std::io::Error::other("home unavailable"))?;
    let base = if cfg!(target_os = "macos") {
        home.join("Library/Application Support")
    } else if cfg!(windows) {
        std::env::var_os("APPDATA")
            .map(PathBuf::from)
            .ok_or_else(|| std::io::Error::other("APPDATA unavailable"))?
    } else {
        std::env::var_os("XDG_DATA_HOME")
            .map(PathBuf::from)
            .unwrap_or_else(|| home.join(".local/share"))
    };
    Ok(base.join("com.tongyun.git/audit"))
}
