use std::env;
use std::io::{Read, Write};
use std::net::TcpListener;
use std::thread;

use tg_core::{
    AiProviderType, AiService, AiSettings, DiffHunk, DiffLine, FileDiff, KeyringStore,
    MemoryKeyring, SecretFilter,
};

#[test]
fn test_keyring_and_env_isolation_at_07c_07h_13f_13g() {
    let keyring = MemoryKeyring::new();

    // 1. AT-13f: Store different keys for KIE and OpenAI
    keyring.set_key("kie", "kie-secret-key-123").unwrap();
    keyring.set_key("openai", "openai-secret-key-456").unwrap();

    assert_eq!(
        keyring.get_key("kie").unwrap(),
        Some("kie-secret-key-123".to_string())
    );
    assert_eq!(
        keyring.get_key("openai").unwrap(),
        Some("openai-secret-key-456".to_string())
    );
    assert_eq!(keyring.get_key("ollama").unwrap(), None);

    // Delete KIE key should not affect OpenAI key
    keyring.delete_key("kie").unwrap();
    assert_eq!(keyring.get_key("kie").unwrap(), None);
    assert_eq!(
        keyring.get_key("openai").unwrap(),
        Some("openai-secret-key-456".to_string())
    );

    // 2. AT-07h: Even if KIE_API_KEY environment variable is set, tg-core DOES NOT read it
    env::set_var("KIE_API_KEY", "env-injected-dummy-key");
    assert_eq!(
        keyring.get_key("kie").unwrap(),
        None,
        "Must not read from environment variables"
    );

    // 3. AT-13g: When keyring is unavailable, operations return error and fail closed
    keyring.set_available(false);
    assert!(
        keyring.get_key("openai").is_err(),
        "Should error when keyring is unavailable"
    );
    assert!(keyring.set_key("openai", "val").is_err());
}

#[test]
fn test_secret_filter_masking_at_07b() {
    // 1. Check default secret detection
    assert!(SecretFilter::is_secret(".env", &[]));
    assert!(SecretFilter::is_secret(".env.production", &[]));
    assert!(SecretFilter::is_secret("config/id_rsa", &[]));
    assert!(SecretFilter::is_secret("certs/server.pem", &[]));
    assert!(SecretFilter::is_secret("api_secret.json", &[]));
    assert!(!SecretFilter::is_secret("src/main.rs", &[]));
    assert!(!SecretFilter::is_secret("README.md", &[]));

    // Custom pattern
    assert!(SecretFilter::is_secret(
        "credentials.xml",
        &["*.xml".to_string()]
    ));

    // 2. Filter diff of secret files
    let secret_diff = FileDiff {
        path: ".env".to_string(),
        old_path: None,
        staged: true,
        is_binary: false,
        old_size: Some(10),
        new_size: Some(20),
        is_crlf_change: false,
        is_large: false,
        hunks: vec![DiffHunk {
            old_start: 1,
            old_lines: 1,
            new_start: 1,
            new_lines: 1,
            header: "@@ -1 +1 @@".to_string(),
            lines: vec![DiffLine {
                origin: '+',
                old_lineno: None,
                new_lineno: Some(1),
                content: "SECRET_PASSWORD=super_secret_1234\n".to_string(),
            }],
        }],
    };

    let normal_diff = FileDiff {
        path: "src/main.rs".to_string(),
        old_path: None,
        staged: true,
        is_binary: false,
        old_size: Some(10),
        new_size: Some(20),
        is_crlf_change: false,
        is_large: false,
        hunks: vec![DiffHunk {
            old_start: 1,
            old_lines: 1,
            new_start: 1,
            new_lines: 1,
            header: "@@ -1 +1 @@".to_string(),
            lines: vec![DiffLine {
                origin: '+',
                old_lineno: None,
                new_lineno: Some(1),
                content: "fn main() {}\n".to_string(),
            }],
        }],
    };

    let combined_prompt =
        SecretFilter::build_sanitized_diff(&[secret_diff, normal_diff], &[], 20000);

    // .env should be mentioned, but its content MUST be excluded
    assert!(combined_prompt.contains(".env"));
    assert!(combined_prompt.contains("[敏感文件：内容已排除]"));
    assert!(
        !combined_prompt.contains("super_secret_1234"),
        "Secret content must NOT leak into prompt!"
    );

    // Normal file diff should be preserved
    assert!(combined_prompt.contains("fn main() {}"));
}

#[test]
fn test_provider_url_computation_at_13c_13d_13e() {
    // 1. KIE: model in path
    let kie_url = AiService::compute_endpoint_url(
        AiProviderType::Kie,
        Some("https://api.kie.ai"),
        "claude-3-5-sonnet",
    );
    assert_eq!(
        kie_url,
        "https://api.kie.ai/claude-3-5-sonnet/v1/chat/completions"
    );

    // 2. OpenAI: standard suffix
    let openai_url = AiService::compute_endpoint_url(
        AiProviderType::OpenAi,
        Some("https://api.deepseek.com/v1"),
        "deepseek-chat",
    );
    assert_eq!(openai_url, "https://api.deepseek.com/v1/chat/completions");

    // 3. Ollama: default local endpoint
    let ollama_url = AiService::compute_endpoint_url(
        AiProviderType::Ollama,
        Some("http://localhost:11434"),
        "llama3:8b",
    );
    assert_eq!(ollama_url, "http://localhost:11434/v1/chat/completions");
}

#[tokio::test]
async fn test_ai_connection_and_generation_mock_server() {
    // Spin up a mock HTTP server on local port
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let port = listener.local_addr().unwrap().port();
    let base_url = format!("http://127.0.0.1:{}", port);

    thread::spawn(move || {
        for mut stream in listener.incoming().flatten() {
            let mut buf = [0u8; 4096];
            let _ = stream.read(&mut buf);

            let body = serde_json::json!({
                "choices": [{
                    "message": {
                        "role": "assistant",
                        "content": "feat(core): implement git commit and ai integration"
                    }
                }]
            })
            .to_string();

            let response = format!(
                "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                body.len(),
                body
            );
            let _ = stream.write_all(response.as_bytes());
        }
    });

    let keyring = MemoryKeyring::new();
    keyring.set_key("openai", "test-key-mock").unwrap();

    let settings = AiSettings {
        provider: AiProviderType::OpenAi,
        base_url: Some(base_url),
        model: "gpt-4o-mini".to_string(),
        language: "zh".to_string(),
        conventional: true,
        timeout_seconds: 5,
        max_diff_chars: 20000,
        custom_secret_patterns: Vec::new(),
        consented: true,
    };

    // Test connection
    let test_res = AiService::test_connection(&settings, &keyring).await;
    assert!(test_res.is_ok(), "Test connection to mock should succeed");

    // Generate commit message
    let gen_res = AiService::generate_commit_message(
        &settings,
        &keyring,
        "main",
        &["init commit".to_string()],
        "diff sample",
    )
    .await;

    assert!(gen_res.is_ok());
    let message = gen_res.unwrap();
    assert_eq!(
        message,
        "feat(core): implement git commit and ai integration"
    );
}
