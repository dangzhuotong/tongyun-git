//! Small versioned external-agent entry point. Reuses GitBackend and CommitService.
use serde_json::{json, Value};
use std::{
    collections::HashMap,
    path::{Path, PathBuf},
};
use tg_core::{CliRunner, CommitService, Git2Backend, GitBackend};
fn fingerprint(root: &Path) -> Result<String, String> {
    let repo = git2::Repository::open(root).map_err(|_| "NOT_A_REPOSITORY")?;
    let index = repo.path().join("index");
    let mut bytes = if index.exists() {
        std::fs::read(index).map_err(|_| "INDEX_UNREADABLE")?
    } else {
        vec![]
    };
    bytes.extend_from_slice(
        repo.head()
            .ok()
            .and_then(|h| h.target())
            .map(|id| id.to_string())
            .unwrap_or_default()
            .as_bytes(),
    );
    git2::Oid::hash_object(git2::ObjectType::Blob, &bytes)
        .map(|id| id.to_string())
        .map_err(|_| "FINGERPRINT_FAILED".into())
}
fn main() {
    if let Err(error) = run() {
        println!("{}", json!({"schemaVersion":1,"ok":false,"error":error}));
        std::process::exit(1);
    }
}
fn run() -> Result<(), String> {
    let args: Vec<_> = std::env::args().skip(1).collect();
    let mut options = HashMap::new();
    let mut action = None;
    let mut i = 0;
    let mut allow_write = false;
    while i < args.len() {
        let arg = &args[i];
        if arg == "--json" {
            i += 1;
            continue;
        }
        if arg == "--allow-write" {
            allow_write = true;
            i += 1;
            continue;
        }
        if arg.starts_with("--") {
            if ![
                "--repo",
                "--audit-dir",
                "--task",
                "--actor",
                "--path",
                "--message-file",
                "--confirm",
            ]
            .contains(&arg.as_str())
                || i + 1 >= args.len()
                || options.insert(arg.clone(), args[i + 1].clone()).is_some()
            {
                return Err("INVALID_ARGUMENT".into());
            }
            i += 2;
        } else {
            if action.replace(arg.clone()).is_some() {
                return Err("INVALID_ARGUMENT".into());
            }
            i += 1;
        }
    }
    let action = action.ok_or("ACTION_REQUIRED")?;
    if action == "capabilities" {
        println!(
            "{}",
            json!({"schemaVersion":1,"ok":true,"tools":["status","diff","history","commit"],"commitRequires":["--allow-write","--confirm","--message-file"],"aiProvidersViaGuiOnly":true})
        );
        return Ok(());
    }
    if !["status", "diff", "history", "commit"].contains(&action.as_str()) {
        return Err("ACTION_REJECTED".into());
    }
    let root = PathBuf::from(options.get("--repo").ok_or("REPO_REQUIRED")?)
        .canonicalize()
        .map_err(|_| "NOT_A_REPOSITORY")?;
    let backend = Git2Backend::open(&root).map_err(|_| "NOT_A_REPOSITORY")?;
    let audit_dir = match options.get("--audit-dir") {
        Some(dir) => PathBuf::from(dir),
        None => tg_core::journal::default_dir().map_err(|_| "AUDIT_UNAVAILABLE")?,
    };
    tg_core::journal::configure(&audit_dir).map_err(|_| "AUDIT_UNAVAILABLE")?;
    let task = options
        .get("--task")
        .map(String::as_str)
        .unwrap_or("cli-session");
    let actor = options
        .get("--actor")
        .map(String::as_str)
        .unwrap_or("agent:cli");
    let operation = tg_core::audit::Operation::begin(
        &audit_dir,
        "git",
        &action,
        &root.to_string_lossy(),
        actor,
        task,
    )
    .map_err(|_| "AUDIT_UNAVAILABLE")?;
    let operation_id = operation.id().to_string();
    let result: Result<Value, String> = (|| {
        match action.as_str() {
            "status" => Ok(
                json!({"head":backend.head().map_err(|_|"STATUS_FAILED")?,"files":backend.status().map_err(|_|"STATUS_FAILED")?,"fingerprint":fingerprint(&root)?}),
            ),
            "diff" => serde_json::to_value(
                backend
                    .diff_file(options.get("--path").ok_or("PATH_REQUIRED")?, false)
                    .map_err(|_| "DIFF_FAILED")?,
            )
            .map_err(|_| "SERIALIZE_FAILED".into()),
            "history" => {
                serde_json::to_value(tg_core::journal::history().map_err(|_| "AUDIT_UNAVAILABLE")?)
                    .map_err(|_| "SERIALIZE_FAILED".into())
            }
            "commit" => {
                if !allow_write {
                    return Err("WRITE_CONFIRMATION_REQUIRED".into());
                }
                let repo = git2::Repository::open(&root).map_err(|_| "NOT_A_REPOSITORY")?;
                // Cooperating CLI processes serialize. External Git processes still require the normal Git index/ref locks.
                let lock_path = repo.commondir().join("tongyun-agent.lock");
                let _lock = Lock::acquire(lock_path)?;
                if options.get("--confirm").map(String::as_str)
                    != Some(fingerprint(&root)?.as_str())
                {
                    return Err("STALE_CONFIRMATION".into());
                }
                if repo.state() != git2::RepositoryState::Clean {
                    return Err("OPERATION_IN_PROGRESS".into());
                }
                let message = std::fs::read_to_string(
                    options.get("--message-file").ok_or("MESSAGE_REQUIRED")?,
                )
                .map_err(|_| "MESSAGE_UNREADABLE")?;
                if message.len() > 65536 {
                    return Err("MESSAGE_TOO_LARGE".into());
                }
                let commit = CommitService::commit(&CliRunner::new("git"), &root, &message, false)
                    .map_err(|_| "COMMIT_FAILED")?;
                Ok(
                    json!({"commit":commit,"recovery":"Use the Git workbench revert flow; remote pushes are not automatically undone."}),
                )
            }
            _ => unreachable!(),
        }
    })();
    operation
        .finish(if result.is_ok() {
            "completed"
        } else {
            "failed_or_unknown"
        })
        .map_err(|_| "AUDIT_COMPLETION_FAILED: inspect started operation before retry")?;
    match result {
        Ok(data) => {
            println!(
                "{}",
                json!({"schemaVersion":1,"ok":true,"operationId":operation_id,"taskId":task,"data":data})
            );
            Ok(())
        }
        Err(error) => {
            println!(
                "{}",
                json!({"schemaVersion":1,"ok":false,"operationId":operation_id,"taskId":task,"error":error})
            );
            std::process::exit(1);
        }
    }
}
struct Lock(PathBuf);
impl Lock {
    fn acquire(path: PathBuf) -> Result<Self, String> {
        std::fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&path)
            .map_err(|_| "AGENT_OPERATION_LOCKED")?;
        Ok(Self(path))
    }
}
impl Drop for Lock {
    fn drop(&mut self) {
        let _ = std::fs::remove_file(&self.0);
    }
}
