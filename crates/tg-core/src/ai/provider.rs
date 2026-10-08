use serde::{Deserialize, Serialize};
use serde_json::json;
use std::time::Duration;

use crate::ai::keyring_store::KeyringStore;
use crate::error::{CoreError, Result};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum AiProviderType {
    Kie,
    OpenAi,
    Ollama,
}

impl AiProviderType {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Kie => "kie",
            Self::OpenAi => "openai",
            Self::Ollama => "ollama",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiSettings {
    pub provider: AiProviderType,
    pub base_url: Option<String>,
    pub model: String,
    pub language: String, // "follow" | "zh" | "en"
    pub conventional: bool,
    pub timeout_seconds: u64,
    pub max_diff_chars: usize,
    pub custom_secret_patterns: Vec<String>,
    pub consented: bool,
}

impl Default for AiSettings {
    fn default() -> Self {
        Self {
            provider: AiProviderType::OpenAi,
            base_url: None,
            model: "deepseek-chat".to_string(),
            language: "zh".to_string(),
            conventional: true,
            timeout_seconds: 30,
            max_diff_chars: 20000,
            custom_secret_patterns: Vec::new(),
            consented: false,
        }
    }
}

pub struct AiService;

impl AiService {
    /// Calculate the effective endpoint URL for a given provider configuration
    pub fn compute_endpoint_url(
        provider: AiProviderType,
        base_url: Option<&str>,
        model: &str,
    ) -> String {
        match provider {
            AiProviderType::Kie => {
                let base = base_url
                    .unwrap_or("https://api.kie.ai")
                    .trim_end_matches('/');
                format!("{}/{}/v1/chat/completions", base, model)
            }
            AiProviderType::OpenAi => {
                let base = base_url
                    .unwrap_or("https://api.openai.com/v1")
                    .trim_end_matches('/');
                if base.ends_with("/chat/completions") {
                    base.to_string()
                } else {
                    format!("{}/chat/completions", base)
                }
            }
            AiProviderType::Ollama => {
                let base = base_url
                    .unwrap_or("http://localhost:11434")
                    .trim_end_matches('/');
                if base.ends_with("/chat/completions") {
                    base.to_string()
                } else if base.ends_with("/v1") {
                    format!("{}/chat/completions", base)
                } else {
                    format!("{}/v1/chat/completions", base)
                }
            }
        }
    }

    /// Fetch installed models from Ollama's /api/tags endpoint
    pub async fn fetch_ollama_models(base_url: Option<&str>) -> Result<Vec<String>> {
        let base = base_url
            .unwrap_or("http://localhost:11434")
            .trim_end_matches('/');
        let url = format!("{}/api/tags", base);

        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(5))
            .build()
            .map_err(|e| CoreError::AiError(e.to_string()))?;

        let res = client
            .get(&url)
            .send()
            .await
            .map_err(|e| CoreError::AiError(format!("无法连接到 Ollama: {}", e)))?;

        if !res.status().is_success() {
            return Err(CoreError::AiError(format!(
                "Ollama 返回错误状态码: {}",
                res.status()
            )));
        }

        let body: serde_json::Value = res
            .json()
            .await
            .map_err(|e| CoreError::AiError(format!("解析 Ollama 模型列表失败: {}", e)))?;

        let mut models = Vec::new();
        if let Some(list) = body.get("models").and_then(|m| m.as_array()) {
            for item in list {
                if let Some(name) = item.get("name").and_then(|n| n.as_str()) {
                    models.push(name.to_string());
                }
            }
        }

        Ok(models)
    }

    /// Test connection to the configured AI endpoint
    pub async fn test_connection(
        settings: &AiSettings,
        keyring: &dyn KeyringStore,
    ) -> Result<String> {
        let provider_name = settings.provider.as_str();
        let api_key = keyring.get_key(provider_name)?;

        // KIE and OpenAI must have an API key (PRD R-07 rule 3)
        if (settings.provider == AiProviderType::Kie || settings.provider == AiProviderType::OpenAi)
            && (api_key.is_none()
                || api_key
                    .as_ref()
                    .map(|s| s.trim().is_empty())
                    .unwrap_or(true))
        {
            return Err(CoreError::AiError(
                "未配置 API Key，请在设置中填写".to_string(),
            ));
        }

        let endpoint = Self::compute_endpoint_url(
            settings.provider,
            settings.base_url.as_deref(),
            &settings.model,
        );

        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(settings.timeout_seconds.clamp(5, 30)))
            .build()
            .map_err(|e| CoreError::AiError(e.to_string()))?;

        let mut req = client.post(&endpoint).json(&json!({
            "model": settings.model,
            "messages": [
                {"role": "user", "content": "ping"}
            ],
            "max_tokens": 5
        }));

        if let Some(ref key) = api_key {
            if !key.trim().is_empty() {
                req = req.header("Authorization", format!("Bearer {}", key.trim()));
            }
        }

        let res = req.send().await.map_err(|e| {
            if e.is_timeout() {
                CoreError::AiError("连接测试超时，请检查服务地址与网络".to_string())
            } else {
                CoreError::AiError(format!("网络请求失败: {}", e))
            }
        })?;

        let status = res.status();
        if status.is_success() {
            Ok("连接成功，模型响应正常".to_string())
        } else if status.as_u16() == 401 {
            Err(CoreError::AiError("API Key 无效或未授权 (401)".to_string()))
        } else if status.as_u16() == 404 {
            Err(CoreError::AiError(format!(
                "模型 '{}' 不存在或请求路径错误 (404)",
                settings.model
            )))
        } else {
            let err_body = res.text().await.unwrap_or_default();
            Err(CoreError::AiError(format!(
                "接口响应错误 (HTTP {}): {}",
                status, err_body
            )))
        }
    }

    /// Generate commit message from staged changes
    pub async fn generate_commit_message(
        settings: &AiSettings,
        keyring: &dyn KeyringStore,
        branch: &str,
        recent_commits: &[String],
        sanitized_diff: &str,
    ) -> Result<String> {
        let provider_name = settings.provider.as_str();
        let api_key = keyring.get_key(provider_name)?;

        if (settings.provider == AiProviderType::Kie || settings.provider == AiProviderType::OpenAi)
            && (api_key.is_none()
                || api_key
                    .as_ref()
                    .map(|s| s.trim().is_empty())
                    .unwrap_or(true))
        {
            return Err(CoreError::AiError(
                "未配置 API Key，请在设置中填写".to_string(),
            ));
        }

        let endpoint = Self::compute_endpoint_url(
            settings.provider,
            settings.base_url.as_deref(),
            &settings.model,
        );

        let system_prompt = Self::build_system_prompt(settings);
        let user_prompt = Self::build_user_prompt(branch, recent_commits, sanitized_diff);

        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(settings.timeout_seconds.clamp(10, 120)))
            .build()
            .map_err(|e| CoreError::AiError(e.to_string()))?;

        let mut req = client.post(&endpoint).json(&json!({
            "model": settings.model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            "temperature": 0.2
        }));

        if let Some(ref key) = api_key {
            if !key.trim().is_empty() {
                req = req.header("Authorization", format!("Bearer {}", key.trim()));
            }
        }

        let res = req.send().await.map_err(|e| {
            if e.is_timeout() {
                CoreError::AiError("AI 生成超时，请检查网络或提供方状态".to_string())
            } else {
                CoreError::AiError(format!("请求失败: {}", e))
            }
        })?;

        let status = res.status();
        if !status.is_success() {
            let err_text = res.text().await.unwrap_or_default();
            return Err(CoreError::AiError(format!(
                "接口返回错误 (HTTP {}): {}",
                status, err_text
            )));
        }

        let json_body: serde_json::Value = res
            .json()
            .await
            .map_err(|e| CoreError::AiError(format!("无法解析响应 JSON: {}", e)))?;

        let content = json_body
            .get("choices")
            .and_then(|c| c.get(0))
            .and_then(|choice| choice.get("message"))
            .and_then(|msg| msg.get("content"))
            .and_then(|txt| txt.as_str())
            .ok_or_else(|| CoreError::AiError("接口未返回有效文本内容".to_string()))?;

        // Clean markdown backticks wrapper if generated
        let cleaned = content.trim();
        let unquoted = if cleaned.starts_with("```") {
            let lines: Vec<&str> = cleaned.lines().collect();
            if lines.len() >= 2 && lines.last().map(|l| l.trim() == "```").unwrap_or(false) {
                lines[1..lines.len() - 1].join("\n")
            } else {
                cleaned.to_string()
            }
        } else {
            cleaned.to_string()
        };

        Ok(unquoted.trim().to_string())
    }

    fn build_system_prompt(settings: &AiSettings) -> String {
        let mut prompt = String::from(
            "你是一个专业的 Git 提交信息撰写助手。请根据提供的代码改动直接输出清晰、精炼的提交信息。\n\
            不要添加任何自我介绍、前缀说明或 Markdown 代码块包裹。\n",
        );

        match settings.language.as_str() {
            "zh" => prompt.push_str("请一律使用中文撰写提交标题与说明。\n"),
            "en" => prompt.push_str("Please write the commit message in English.\n"),
            _ => prompt.push_str("语言请尽量跟随仓库最近的提交历史语言风格（默认中文）。\n"),
        }

        if settings.conventional {
            prompt.push_str(
                "请严格遵循 Conventional Commits 格式，格式为：\n\
                <type>(<scope可选>): <描述>\n\n\
                [正文描述，可选]\n\
                常用 type: feat, fix, docs, style, refactor, perf, test, chore, build, ci。\n\
                首行标题不超过 72 个字符。\n",
            );
        } else {
            prompt
                .push_str("首行为单行概括，不超过 72 字符。如有需要，可空一行附加具体改动要点。\n");
        }

        prompt
    }

    fn build_user_prompt(branch: &str, recent_commits: &[String], sanitized_diff: &str) -> String {
        let mut prompt = format!("当前分支: {}\n\n", branch);

        if !recent_commits.is_empty() {
            prompt.push_str("最近提交参考:\n");
            for c in recent_commits.iter().take(10) {
                prompt.push_str(&format!("- {}\n", c));
            }
            prompt.push('\n');
        }

        prompt.push_str("已暂存改动内容如下:\n");
        prompt.push_str(sanitized_diff);

        prompt
    }
}
