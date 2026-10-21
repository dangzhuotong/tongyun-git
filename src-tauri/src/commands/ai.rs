use serde::Serialize;
use std::path::Path;
use tg_core::{
    AiLogQueryResult, AiService, AiSettings, CliRunner, DiffReviewResult, Git2Backend, GitBackend,
    KeyringStore, RunOptions, SecretFilter, SystemKeyring,
};

#[derive(Debug, Clone, Serialize)]
pub struct AiKeyStatus {
    pub kie: bool,
    pub openai: bool,
    pub ollama: bool,
    pub keyring_available: bool,
}

fn open_ai_store() -> std::result::Result<SystemKeyring, String> {
    // The old keychain is imported once at startup. Calling it here would
    // prompt on every AI command after the user denies access, and the
    // failed import would reject the save. A missing marker is retried on
    // the next launch, not on this call.
    SystemKeyring::from_config().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_ai_key_status() -> std::result::Result<AiKeyStatus, String> {
    let keyring = open_ai_store()?;
    let available = keyring.is_available();
    let kie = if available {
        keyring.get_key("kie").map(|k| k.is_some()).unwrap_or(false)
    } else {
        false
    };
    let openai = if available {
        keyring
            .get_key("openai")
            .map(|k| k.is_some())
            .unwrap_or(false)
    } else {
        false
    };
    let ollama = if available {
        keyring
            .get_key("ollama")
            .map(|k| k.is_some())
            .unwrap_or(false)
    } else {
        false
    };

    Ok(AiKeyStatus {
        kie,
        openai,
        ollama,
        keyring_available: available,
    })
}

#[tauri::command]
pub fn save_ai_key(provider: String, key: String) -> std::result::Result<(), String> {
    crate::journal_cmd::run("save_ai_key", "application", || {
        let keyring = open_ai_store()?;
        if !keyring.is_available() {
            return Err("本机加密存储不可用，无法安全存储 Key".to_string());
        }
        keyring.set_key(&provider, &key).map_err(|e| e.to_string())
    })
}

#[tauri::command]
pub fn delete_ai_key(provider: String) -> std::result::Result<(), String> {
    crate::journal_cmd::run("delete_ai_key", "application", || {
        let keyring = open_ai_store()?;
        keyring.delete_key(&provider).map_err(|e| e.to_string())
    })
}

#[tauri::command]
pub async fn test_ai_connection(settings: AiSettings) -> std::result::Result<String, String> {
    crate::journal_cmd::run_async("test_ai_connection", "application", async move {
        let keyring = open_ai_store()?;
        AiService::test_connection(&settings, &keyring)
            .await
            .map_err(|e| e.to_string())
    })
    .await
}

#[tauri::command]
pub async fn fetch_ollama_models(
    base_url: Option<String>,
) -> std::result::Result<Vec<String>, String> {
    AiService::fetch_ollama_models(base_url.as_deref())
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn generate_ai_commit_message(
    root_path: String,
    settings: AiSettings,
) -> std::result::Result<String, String> {
    crate::journal_cmd::run_async("generate_ai_commit_message", &root_path, async {
        let p = Path::new(&root_path);
        let backend = Git2Backend::open(p).map_err(|e| e.to_string())?;

        // 1. Get current branch
        let head = backend.head().map_err(|e| e.to_string())?;
        let branch = head.branch.unwrap_or_else(|| "HEAD".to_string());

        // 2. Get recent commits for style reference
        let runner = CliRunner::new("git");
        let log_res = runner.run(p, &["log", "-n", "10", "--oneline"], RunOptions::default());
        let recent_commits: Vec<String> = match log_res {
            Ok(out) if out.exit_code == Some(0) => {
                out.stdout.lines().map(|s| s.to_string()).collect()
            }
            _ => Vec::new(),
        };

        // 3. Collect staged diffs
        let status_files = backend.status().map_err(|e| e.to_string())?;
        let staged_files: Vec<_> = status_files
            .into_iter()
            .filter(|f| f.index.is_some())
            .collect();

        if staged_files.is_empty() {
            return Err("当前没有已暂存的改动，请先暂存文件".to_string());
        }

        let mut staged_diffs = Vec::new();
        for file in staged_files {
            if let Ok(diff) = backend.diff_file(&file.path, true) {
                staged_diffs.push(diff);
            }
        }

        // 4. Sanitize and filter sensitive contents
        let sanitized_diff = SecretFilter::build_sanitized_diff(
            &staged_diffs,
            &settings.custom_secret_patterns,
            settings.max_diff_chars,
        );

        // 5. Generate message via AI
        let keyring = open_ai_store()?;
        AiService::generate_commit_message(
            &settings,
            &keyring,
            &branch,
            &recent_commits,
            &sanitized_diff,
        )
        .await
        .map_err(|e| e.to_string())
    })
    .await
}

#[tauri::command]
pub async fn review_staged_diff(
    root_path: String,
    settings: AiSettings,
) -> std::result::Result<DiffReviewResult, String> {
    crate::journal_cmd::run_async("review_staged_diff", &root_path, async {
        let clean_path = root_path.trim().trim_matches('"').trim_matches('\'').trim();
        let p = Path::new(clean_path);
        let backend = Git2Backend::open(p).map_err(|e| e.to_string())?;

        let status_files = backend.status().map_err(|e| e.to_string())?;
        let staged_files: Vec<_> = status_files
            .into_iter()
            .filter(|f| f.index.is_some())
            .collect();

        if staged_files.is_empty() {
            return Err("当前没有已暂存的改动，请先暂存文件后再进行审查".to_string());
        }

        let mut staged_diffs = Vec::new();
        for file in staged_files {
            if let Ok(diff) = backend.diff_file(&file.path, true) {
                staged_diffs.push(diff);
            }
        }

        let sanitized_diff = SecretFilter::build_sanitized_diff(
            &staged_diffs,
            &settings.custom_secret_patterns,
            settings.max_diff_chars,
        );

        let keyring = open_ai_store()?;
        AiService::review_diff(&settings, &keyring, &sanitized_diff)
            .await
            .map_err(|e| e.to_string())
    })
    .await
}

#[tauri::command]
pub async fn ai_search_log(
    root_path: String,
    query: String,
    settings: AiSettings,
) -> std::result::Result<AiLogQueryResult, String> {
    crate::journal_cmd::run_async("ai_search_log", &root_path, async {
        let clean_path = root_path.trim().trim_matches('"').trim_matches('\'').trim();
        let p = Path::new(clean_path);

        let runner = CliRunner::new("git");
        let log_res = runner.run(
            p,
            &[
                "log",
                "-n",
                "60",
                "--pretty=format:%h|%ad|%an|%s",
                "--date=short",
            ],
            RunOptions::default(),
        );

        let commits_summary = match log_res {
            Ok(out) if out.exit_code == Some(0) => out.stdout,
            _ => return Err("未能读取仓库历史提交记录".to_string()),
        };

        let keyring = open_ai_store()?;
        AiService::query_log(&settings, &keyring, &query, &commits_summary)
            .await
            .map_err(|e| e.to_string())
    })
    .await
}

#[cfg(test)]
mod tests {
    use super::{delete_ai_key, get_ai_key_status, save_ai_key};
    use std::fs;
    use std::path::PathBuf;
    use std::sync::atomic::{AtomicU64, Ordering};
    use std::time::{SystemTime, UNIX_EPOCH};
    use tg_core::ai::secret_store::{LegacySecretSource, SecretStoreError};
    use tg_core::{configure_secret_dir, SystemKeyring};

    struct Tmp(PathBuf);

    impl Tmp {
        fn new() -> Self {
            static N: AtomicU64 = AtomicU64::new(0);
            let n = N.fetch_add(1, Ordering::Relaxed);
            let nanos = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map(|d| d.as_nanos())
                .unwrap_or(0);
            let dir = std::env::temp_dir().join(format!("tg-ai-cmd-{nanos}-{n}"));
            let _ = fs::remove_dir_all(&dir);
            fs::create_dir_all(&dir).unwrap();
            Self(dir)
        }
    }

    impl Drop for Tmp {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    struct FailingRead;

    impl LegacySecretSource for FailingRead {
        fn read(&self, _: &str, _: &str) -> Result<Option<String>, SecretStoreError> {
            Err(SecretStoreError::legacy("user canceled"))
        }

        fn delete(&self, _: &str, _: &str) -> Result<(), SecretStoreError> {
            panic!("legacy delete must not run");
        }
    }

    #[test]
    fn save_delete_and_status_work_when_legacy_read_fails() {
        let _guard = crate::lock_desktop_state();
        let dir = Tmp::new();
        let secrets = dir.0.join("secrets");
        let audit = dir.0.join("audit");
        configure_secret_dir(&secrets).unwrap();
        tg_core::journal::configure(&audit).unwrap();

        let store = SystemKeyring::from_config().unwrap();
        assert!(store.migrate_with(&FailingRead).is_err());
        assert!(!secrets.join("secrets.migrated").exists());

        let before = get_ai_key_status().unwrap();
        assert!(before.keyring_available);
        assert!(!before.kie && !before.openai && !before.ollama);

        save_ai_key("kie".to_string(), "fresh-fixture".to_string()).unwrap();
        let saved = get_ai_key_status().unwrap();
        assert!(saved.kie);
        assert!(!saved.openai && !saved.ollama);

        delete_ai_key("kie".to_string()).unwrap();
        let cleared = get_ai_key_status().unwrap();
        assert!(!cleared.kie);

        // Commands must not finish the import. On Linux a command-path
        // migration would treat a missing Secret Service as "no legacy key"
        // and write this marker.
        assert!(!secrets.join("secrets.migrated").exists());
        assert!(store.migrate_with(&FailingRead).is_err());

        let vault = fs::read(secrets.join("secrets.vault")).unwrap_or_default();
        assert!(!vault
            .windows(b"fresh-fixture".len())
            .any(|window| window == b"fresh-fixture"));
    }
}
