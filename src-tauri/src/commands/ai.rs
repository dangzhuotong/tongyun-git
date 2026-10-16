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

#[tauri::command]
pub fn get_ai_key_status() -> std::result::Result<AiKeyStatus, String> {
    let keyring = SystemKeyring;
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
        let keyring = SystemKeyring;
        if !keyring.is_available() {
            return Err("系统钥匙串不可用，无法安全存储 Key".to_string());
        }
        keyring.set_key(&provider, &key).map_err(|e| e.to_string())
    })
}

#[tauri::command]
pub fn delete_ai_key(provider: String) -> std::result::Result<(), String> {
    crate::journal_cmd::run("delete_ai_key", "application", || {
        let keyring = SystemKeyring;
        keyring.delete_key(&provider).map_err(|e| e.to_string())
    })
}

#[tauri::command]
pub async fn test_ai_connection(settings: AiSettings) -> std::result::Result<String, String> {
    crate::journal_cmd::run_async("test_ai_connection", "application", async move {
        let keyring = SystemKeyring;
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
        let keyring = SystemKeyring;
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

        let keyring = SystemKeyring;
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

        let keyring = SystemKeyring;
        AiService::query_log(&settings, &keyring, &query, &commits_summary)
            .await
            .map_err(|e| e.to_string())
    })
    .await
}
