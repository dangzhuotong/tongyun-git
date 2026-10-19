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

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ReviewIssue {
    pub level: String, // "danger" | "warning" | "info"
    pub file: Option<String>,
    pub message: String,
    pub suggestion: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct DiffReviewResult {
    pub summary: String,
    pub issues: Vec<ReviewIssue>,
    pub passed: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct AiLogMatch {
    pub oid: String,
    pub reason: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct AiLogQueryResult {
    pub answer: String,
    pub matched_oids: Vec<AiLogMatch>,
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
            "max_tokens": 16
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

    /// Generic chat completion caller handling timeouts, authentication and errors
    pub async fn send_chat_completion(
        settings: &AiSettings,
        keyring: &dyn KeyringStore,
        system_prompt: &str,
        user_prompt: &str,
        temperature: f32,
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
            "temperature": temperature
        }));

        if let Some(ref key) = api_key {
            if !key.trim().is_empty() {
                req = req.header("Authorization", format!("Bearer {}", key.trim()));
            }
        }

        let res = req.send().await.map_err(|e| {
            if e.is_timeout() {
                CoreError::AiError("AI 请求超时，请检查网络或提供方状态".to_string())
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

        Ok(content.to_string())
    }

    /// Generate commit message from staged changes
    pub async fn generate_commit_message(
        settings: &AiSettings,
        keyring: &dyn KeyringStore,
        branch: &str,
        recent_commits: &[String],
        sanitized_diff: &str,
    ) -> Result<String> {
        let system_prompt = Self::build_system_prompt(settings);
        let user_prompt = Self::build_user_prompt(branch, recent_commits, sanitized_diff);
        let raw = Self::send_chat_completion(settings, keyring, &system_prompt, &user_prompt, 0.2)
            .await?;
        let cleaned = Self::clean_commit_message(&raw);
        Ok(cleaned)
    }

    /// Review staged diff for potential bugs, secrets, and code smells
    pub async fn review_diff(
        settings: &AiSettings,
        keyring: &dyn KeyringStore,
        sanitized_diff: &str,
    ) -> Result<DiffReviewResult> {
        if sanitized_diff.trim().is_empty() {
            return Ok(DiffReviewResult {
                summary: "暂存区没有可审查的代码改动。".to_string(),
                issues: vec![],
                passed: true,
            });
        }

        let system_prompt = "你是一名顶级资深代码审查专家（Senior Code Reviewer）。\n\
请对用户提供的 Git Staged Diff（暂存区待提交代码改动）进行严格审查。\n\
审查重点：\n\
1. 敏感信息泄露：硬编码密钥、密码、API Token、内部敏感 IP / 私钥等（level: \"danger\"）；\n\
2. 严重逻辑 Bug 与运行时隐患：明显的空指针、下标越界、死循环、资源泄露、未处理的错误等（level: \"danger\" 或 \"warning\"）；\n\
3. 代码异味与遗留调试代码：遗留的 console.log、print、println!、debugger、临时 TODO 等（level: \"warning\" 或 \"info\"）。\n\n\
你必须严格以合法的 JSON 格式返回结果（不要添加任何 Markdown 代码块外的解释文字，必须能被 JSON 解析器直接解析）：\n\
{\n\
  \"summary\": \"审查总体结论（1-2句话概述代码质量状况）\",\n\
  \"passed\": true 或 false（若存在任何 danger 级别问题，则为 false；若仅有建议或无问题则为 true）,\n\
  \"issues\": [\n\
    {\n\
      \"level\": \"danger\" 或 \"warning\" 或 \"info\",\n\
      \"file\": \"涉及的文件路径（若有，否则 null）\",\n\
      \"message\": \"具体发现的问题描述\",\n\
      \"suggestion\": \"具体的改进建议或修复参考（可选）\"\n\
    }\n\
  ]\n\
}\n\
若代码改动质量优秀且未发现明显缺陷，请返回：\n\
{\n\
  \"summary\": \"代码改动整洁规范，未检测到敏感信息或明显缺陷，可以安全提交。\",\n\
  \"passed\": true,\n\
  \"issues\": []\n\
}";

        let user_prompt = format!(
            "以下是本次提交暂存区的 Diff 代码改动：\n---\n{}\n---\n请审查并输出 JSON。",
            sanitized_diff
        );

        let raw =
            Self::send_chat_completion(settings, keyring, system_prompt, &user_prompt, 0.1).await?;
        Ok(Self::parse_review_response(&raw))
    }

    /// Parse AI review json response with fallback
    pub fn parse_review_response(raw: &str) -> DiffReviewResult {
        let trimmed = raw.trim();
        let json_str = if let (Some(first_brace), Some(last_brace)) =
            (trimmed.find('{'), trimmed.rfind('}'))
        {
            if first_brace <= last_brace {
                &trimmed[first_brace..=last_brace]
            } else {
                trimmed
            }
        } else {
            trimmed
        };

        if let Ok(res) = serde_json::from_str::<DiffReviewResult>(json_str) {
            return res;
        }

        let is_danger = trimmed.to_lowercase().contains("level: danger")
            || trimmed.to_lowercase().contains("\"danger\"")
            || trimmed.contains("存在安全隐患")
            || trimmed.contains("密码泄露");
        DiffReviewResult {
            summary: trimmed.to_string(),
            issues: vec![],
            passed: !is_danger,
        }
    }

    /// Search and analyze git history using natural language query
    pub async fn query_log(
        settings: &AiSettings,
        keyring: &dyn KeyringStore,
        query: &str,
        commits_summary: &str,
    ) -> Result<AiLogQueryResult> {
        if query.trim().is_empty() {
            return Ok(AiLogQueryResult {
                answer: "请输入您想查询的历史问题。".to_string(),
                matched_oids: vec![],
            });
        }

        let system_prompt = "你是一名 Git 提交历史分析助手。\n\
用户会用自然语言询问关于代码仓库历史提交的问题（例如“上次改支付是什么时候谁改的”、“找出所有关于重构侧边栏的提交”等）。\n\
你将收到用户的问题以及一份最近的 Git 提交列表摘要（格式：OID | 日期 | 作者 | 提交说明）。\n\n\
请根据提供的提交列表回答用户问题，并挑出最匹配的一个或多个提交 OID。\n\
你必须严格以 JSON 格式返回结果（必须能被 JSON 直接解析）：\n\
{\n\
  \"answer\": \"对用户问题的直接自然语言回答（包含是谁在何时改的，或者概括解答说明）\",\n\
  \"matched_oids\": [\n\
    {\n\
      \"oid\": \"匹配到的提交哈希（完整或短 SHA）\",\n\
      \"reason\": \"匹配此提交的原因简述\"\n\
    }\n\
  ]\n\
}\n\
若在列表中未找到相关提交，请在 answer 中礼貌说明未在最近历史中找到相关提交，matched_oids 返回空数组 []。";

        let user_prompt = format!(
            "用户问题：{}\n\n提交历史列表：\n{}\n\n请分析并以 JSON 格式输出结果。",
            query.trim(),
            commits_summary.trim()
        );

        let raw =
            Self::send_chat_completion(settings, keyring, system_prompt, &user_prompt, 0.1).await?;
        Ok(Self::parse_log_query_response(&raw))
    }

    /// Parse AI log query response with fallback
    pub fn parse_log_query_response(raw: &str) -> AiLogQueryResult {
        let trimmed = raw.trim();
        let json_str = if let (Some(first_brace), Some(last_brace)) =
            (trimmed.find('{'), trimmed.rfind('}'))
        {
            if first_brace <= last_brace {
                &trimmed[first_brace..=last_brace]
            } else {
                trimmed
            }
        } else {
            trimmed
        };

        if let Ok(res) = serde_json::from_str::<AiLogQueryResult>(json_str) {
            return res;
        }

        AiLogQueryResult {
            answer: trimmed.to_string(),
            matched_oids: vec![],
        }
    }

    /// Robustly clean AI generated commit messages:
    /// - Strips markdown code blocks (```...```) even when surrounded by preamble/postamble
    /// - Strips common AI preamble lines ("好的，为您生成的提交信息如下：", "Commit message:")
    /// - Strips outer quotes ("..." or '...')
    /// - Strips git commit -m wrapper
    pub fn clean_commit_message(raw: &str) -> String {
        let trimmed = raw.trim();
        if trimmed.is_empty() {
            return String::new();
        }

        // 1. Unwrap a fence only when it wraps the whole reply (optional preamble before it).
        // A fence inside an already-written commit body is an example, not a wrapper.
        if let Some(content) = unwrap_wrapping_fence(trimmed) {
            return Self::clean_commit_message(content);
        }

        // 2. Check for `git commit -m "..."` pattern
        if let Some(pos) = trimmed.find("git commit -m") {
            let rest = trimmed[pos + 13..].trim();
            if rest.len() >= 2
                && ((rest.starts_with('"') && rest.ends_with('"'))
                    || (rest.starts_with('\'') && rest.ends_with('\'')))
            {
                return Self::clean_commit_message(&rest[1..rest.len() - 1]);
            }
        }

        // 3. Line-by-line filtering of preamble and trailing commentary
        let lines: Vec<&str> = trimmed.lines().collect();
        let mut filtered_lines: Vec<&str> = Vec::new();

        let mut skipping_preamble = true;
        for line in lines {
            let l_trim = line.trim();
            if skipping_preamble {
                if l_trim.is_empty() || is_ai_preamble_line(l_trim) {
                    continue;
                }
                skipping_preamble = false;
            }

            let lower = l_trim.to_lowercase();
            if lower.starts_with("说明：")
                || lower.starts_with("说明:")
                || lower.starts_with("解释：")
                || lower.starts_with("解释:")
                || lower.starts_with("note:")
                || lower.starts_with("explanation:")
            {
                break;
            }
            filtered_lines.push(line);
        }

        let mut result = filtered_lines.join("\n").trim().to_string();

        // 4. Strip outer double or single quotes if wrapped
        if result.len() >= 2
            && ((result.starts_with('"') && result.ends_with('"'))
                || (result.starts_with('\'') && result.ends_with('\'')))
        {
            result = result[1..result.len() - 1].trim().to_string();
        }

        result
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

fn is_ai_preamble_line(line: &str) -> bool {
    let lower = line.trim().to_lowercase();
    const PREFIXES: &[&str] = &[
        "好的",
        "根据以上",
        "建议的提交信息",
        "提交信息如下",
        "生成的提交信息",
        "commit message:",
        "commit message：",
        "here is the commit message",
        "here's the commit message",
    ];
    // Match only a leading preamble. A subject that merely mentions
    // "commit message:" or "提交信息如下" is the commit text itself.
    PREFIXES.iter().any(|prefix| lower.starts_with(prefix))
}

/// Returns the inside of a fence when the text before it is empty or only AI preamble.
fn unwrap_wrapping_fence(trimmed: &str) -> Option<&str> {
    let start = trimmed.find("```")?;
    let end = trimmed.rfind("```")?;
    if start >= end {
        return None;
    }
    let before = &trimmed[..start];
    if !before
        .lines()
        .all(|line| line.trim().is_empty() || is_ai_preamble_line(line))
    {
        return None;
    }
    let inside = &trimmed[start + 3..end];
    Some(strip_fence_language(inside))
}

fn strip_fence_language(inside: &str) -> &str {
    if let Some(first_newline) = inside.find('\n') {
        let first_line = inside[..first_newline].trim();
        if first_line
            .chars()
            .all(|c| c.is_alphanumeric() || c == '_' || c == '-')
        {
            return &inside[first_newline + 1..];
        }
    }
    inside
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_clean_commit_message_variants() {
        // Plain text
        assert_eq!(
            AiService::clean_commit_message("feat: add something"),
            "feat: add something"
        );

        // Markdown code fence with language tag
        let markdown = "```git\nfeat(core): support multi-remote\n```";
        assert_eq!(
            AiService::clean_commit_message(markdown),
            "feat(core): support multi-remote"
        );

        // Code fence surrounded by conversational fluff
        let fluff =
            "好的，为你生成如下提交信息：\n```\nfix: correct branch switch\n```\n希望对你有帮助！";
        assert_eq!(
            AiService::clean_commit_message(fluff),
            "fix: correct branch switch"
        );

        // Wrapped in double quotes
        assert_eq!(
            AiService::clean_commit_message("\"feat: update icons\""),
            "feat: update icons"
        );

        // Wrapped in git commit -m
        assert_eq!(
            AiService::clean_commit_message("git commit -m \"refactor: improve ui\""),
            "refactor: improve ui"
        );

        // Leading preamble without backticks
        let preamble_only = "提交信息如下：\ndocs: update readme\n说明：更新了说明文档";
        assert_eq!(
            AiService::clean_commit_message(preamble_only),
            "docs: update readme"
        );
    }

    #[test]
    fn keeps_subject_that_mentions_commit_message_phrasing() {
        let raw = "docs: commit message: document the hook\n\n正文里写提交信息如下所示";
        let cleaned = AiService::clean_commit_message(raw);
        assert_eq!(
            cleaned, raw,
            "a real subject was treated as an AI preamble: {cleaned}"
        );
    }

    #[test]
    fn still_strips_a_leading_commit_message_preamble() {
        let raw = "commit message:\ndocs: update readme\n";
        assert_eq!(AiService::clean_commit_message(raw), "docs: update readme");
    }

    #[test]
    fn rust8_empty_and_whitespace_commit_message() {
        assert_eq!(AiService::clean_commit_message(""), "");
        assert_eq!(AiService::clean_commit_message("   \n\t  "), "");
    }

    #[test]
    fn rust8_single_quotes_and_commit_m_wrapper() {
        assert_eq!(
            AiService::clean_commit_message("'feat: quoted'"),
            "feat: quoted"
        );
        assert_eq!(
            AiService::clean_commit_message("git commit -m 'fix: hook'"),
            "fix: hook"
        );
        assert_eq!(
            AiService::clean_commit_message("git commit -m fix: bare"),
            "git commit -m fix: bare"
        );
    }

    #[test]
    fn rust8_strips_leading_preamble_and_trailing_explanation() {
        assert_eq!(
            AiService::clean_commit_message("好的，如下：\nfeat: ok"),
            "feat: ok"
        );
        assert_eq!(
            AiService::clean_commit_message("根据以上改动：\nfix: x"),
            "fix: x"
        );
        assert_eq!(
            AiService::clean_commit_message("commit message：\nfeat: zh colon"),
            "feat: zh colon"
        );
        assert_eq!(
            AiService::clean_commit_message("Here's the commit message\nfeat: title"),
            "feat: title"
        );
        assert_eq!(
            AiService::clean_commit_message("feat: add\n\nbody\n说明: 这是解释\nmore"),
            "feat: add\n\nbody"
        );
        assert_eq!(
            AiService::clean_commit_message("feat: add\nNote: hidden"),
            "feat: add"
        );
    }

    #[test]
    fn keeps_commit_body_when_it_contains_a_code_fence() {
        let raw = "feat: document parser\n\nExample:\n\n```\ncode sample\n```\n";
        let cleaned = AiService::clean_commit_message(raw);
        assert!(
            cleaned.contains("feat: document parser"),
            "title dropped: {cleaned}"
        );
        assert!(
            cleaned.contains("code sample"),
            "example dropped: {cleaned}"
        );
    }

    #[test]
    fn test_parse_review_response_json_and_fallback() {
        let json_input = r#"
```json
{
  "summary": "发现潜在安全漏洞与临时调试代码",
  "passed": false,
  "issues": [
    {
      "level": "danger",
      "file": "src/config.ts",
      "message": "硬编码的明文 API 密钥",
      "suggestion": "请移至环境变量或系统安全存储中"
    },
    {
      "level": "warning",
      "file": "src/utils.ts",
      "message": "遗留 console.log 调试语句",
      "suggestion": "提交前移除调试日志"
    }
  ]
}
```
"#;
        let parsed = AiService::parse_review_response(json_input);
        assert!(!parsed.passed);
        assert_eq!(parsed.issues.len(), 2);
        assert_eq!(parsed.issues[0].level, "danger");
        assert_eq!(parsed.issues[0].file.as_deref(), Some("src/config.ts"));

        // Fallback test
        let fallback_input = "代码质量良好，规范整洁，建议直接提交。";
        let parsed_fallback = AiService::parse_review_response(fallback_input);
        assert!(parsed_fallback.passed);
        assert_eq!(parsed_fallback.summary, fallback_input);
    }

    #[test]
    fn test_parse_log_query_response_json_and_fallback() {
        let json_input = r#"
{
  "answer": "支付重构是由张三在 2026-10-05 完成的提交。",
  "matched_oids": [
    {
      "oid": "abc1234",
      "reason": "feat(pay): refactor payment gateway"
    }
  ]
}
"#;
        let parsed = AiService::parse_log_query_response(json_input);
        assert_eq!(parsed.matched_oids.len(), 1);
        assert_eq!(parsed.matched_oids[0].oid, "abc1234");
        assert!(parsed.answer.contains("张三"));

        // Fallback test
        let fallback_input = "未找到与此相关的提交记录。";
        let parsed_fallback = AiService::parse_log_query_response(fallback_input);
        assert_eq!(parsed_fallback.answer, fallback_input);
        assert!(parsed_fallback.matched_oids.is_empty());
    }

    #[test]
    fn rust9_provider_type_as_str_matches_serde_names() {
        assert_eq!(AiProviderType::Kie.as_str(), "kie");
        assert_eq!(AiProviderType::OpenAi.as_str(), "openai");
        assert_eq!(AiProviderType::Ollama.as_str(), "ollama");
    }

    #[test]
    fn rust9_ai_settings_default_values_are_stable() {
        let settings = AiSettings::default();
        assert_eq!(settings.provider, AiProviderType::OpenAi);
        assert_eq!(settings.base_url, None);
        assert_eq!(settings.model, "deepseek-chat");
        assert_eq!(settings.language, "zh");
        assert!(settings.conventional);
        assert_eq!(settings.timeout_seconds, 30);
        assert_eq!(settings.max_diff_chars, 20000);
        assert!(settings.custom_secret_patterns.is_empty());
        assert!(!settings.consented);
    }

    #[test]
    fn rust9_compute_endpoint_url_kie_trims_slash_and_defaults_base() {
        assert_eq!(
            AiService::compute_endpoint_url(
                AiProviderType::Kie,
                Some("https://api.kie.ai/"),
                "gpt-x"
            ),
            "https://api.kie.ai/gpt-x/v1/chat/completions"
        );
        assert_eq!(
            AiService::compute_endpoint_url(AiProviderType::Kie, None, "model"),
            "https://api.kie.ai/model/v1/chat/completions"
        );
    }

    #[test]
    fn rust9_compute_endpoint_url_openai_keeps_full_path_and_defaults_base() {
        let full = "https://api.openai.com/v1/chat/completions";
        assert_eq!(
            AiService::compute_endpoint_url(AiProviderType::OpenAi, Some(full), "m"),
            full
        );
        assert_eq!(
            AiService::compute_endpoint_url(
                AiProviderType::OpenAi,
                Some("https://api.openai.com/v1/"),
                "m"
            ),
            "https://api.openai.com/v1/chat/completions"
        );
        assert_eq!(
            AiService::compute_endpoint_url(AiProviderType::OpenAi, None, "m"),
            full
        );
    }

    #[test]
    fn rust9_compute_endpoint_url_ollama_variants() {
        let full = "http://localhost:11434/v1/chat/completions";
        assert_eq!(
            AiService::compute_endpoint_url(AiProviderType::Ollama, Some(full), "m"),
            full
        );
        assert_eq!(
            AiService::compute_endpoint_url(
                AiProviderType::Ollama,
                Some("http://localhost:11434/v1"),
                "m"
            ),
            full
        );
        assert_eq!(
            AiService::compute_endpoint_url(
                AiProviderType::Ollama,
                Some("http://localhost:11434"),
                "m"
            ),
            full
        );
        assert_eq!(
            AiService::compute_endpoint_url(AiProviderType::Ollama, None, "m"),
            full
        );
    }

    #[test]
    fn rust9_build_system_prompt_language_and_conventional_flags() {
        let mut settings = AiSettings::default();

        let zh = AiService::build_system_prompt(&settings);
        assert!(zh.contains("请一律使用中文撰写提交标题与说明。"), "{zh}");
        assert!(zh.contains("Conventional Commits"), "{zh}");

        settings.language = "en".to_string();
        let en = AiService::build_system_prompt(&settings);
        assert!(
            en.contains("Please write the commit message in English."),
            "{en}"
        );

        settings.language = "follow".to_string();
        let follow = AiService::build_system_prompt(&settings);
        assert!(
            follow.contains("跟随仓库最近的提交历史语言风格"),
            "{follow}"
        );
        assert!(follow.contains("Conventional Commits"), "{follow}");

        settings.conventional = false;
        let plain = AiService::build_system_prompt(&settings);
        assert!(!plain.contains("Conventional Commits"), "{plain}");
        assert!(
            plain.contains("首行为单行概括，不超过 72 字符。"),
            "{plain}"
        );
    }

    #[test]
    fn rust9_build_user_prompt_without_recent_commits() {
        let prompt = AiService::build_user_prompt("main", &[], "DIFF-BODY");
        assert_eq!(prompt, "当前分支: main\n\n已暂存改动内容如下:\nDIFF-BODY");
    }

    #[test]
    fn rust9_build_user_prompt_lists_recent_commits_capped_at_ten() {
        let commits: Vec<String> = (0..12).map(|i| format!("commit {i}")).collect();
        let prompt = AiService::build_user_prompt("dev", &commits, "X");
        assert!(prompt.starts_with("当前分支: dev\n\n"), "{prompt}");
        assert!(prompt.contains("最近提交参考:\n"), "{prompt}");
        assert!(prompt.contains("- commit 0\n"), "{prompt}");
        assert!(prompt.contains("- commit 9\n"), "{prompt}");
        assert!(!prompt.contains("- commit 10\n"), "{prompt}");
        assert!(prompt.contains("已暂存改动内容如下:\nX"), "{prompt}");
    }

    #[test]
    fn rust9_is_ai_preamble_line_matches_only_leading_phrases() {
        assert!(is_ai_preamble_line("好的，以下是提交信息"));
        assert!(is_ai_preamble_line("  Commit message:  "));
        assert!(is_ai_preamble_line("提交信息如下："));
        assert!(is_ai_preamble_line("生成的提交信息如下"));
        assert!(is_ai_preamble_line("Here's the commit message"));
        assert!(!is_ai_preamble_line("feat: add parser"));
        assert!(!is_ai_preamble_line(
            "docs: note that commit message: is fine inside"
        ));
        assert!(!is_ai_preamble_line("正文里写提交信息如下所示"));
    }

    #[test]
    fn rust9_unwrap_wrapping_fence_requires_only_preamble_before() {
        assert_eq!(
            unwrap_wrapping_fence("```git\nfeat: x\n```"),
            Some("feat: x\n")
        );
        assert_eq!(
            unwrap_wrapping_fence("好的\n```\nfeat: y\n```"),
            Some("feat: y\n")
        );
        assert_eq!(unwrap_wrapping_fence("feat: x\n```\nbody\n```"), None);
        assert_eq!(unwrap_wrapping_fence("no fence here"), None);
        assert_eq!(unwrap_wrapping_fence("```only one fence"), None);
    }

    #[test]
    fn rust9_strip_fence_language_only_removes_language_tag() {
        assert_eq!(strip_fence_language("git\nfeat: x"), "feat: x");
        assert_eq!(strip_fence_language("rust\ncode"), "code");
        assert_eq!(strip_fence_language("\nbody"), "body");
        assert_eq!(strip_fence_language("feat: no newline"), "feat: no newline");
        assert_eq!(
            strip_fence_language("bad lang!\nfeat: x"),
            "bad lang!\nfeat: x"
        );
    }

    #[test]
    fn rust9_parse_review_response_fallback_marks_danger_keywords() {
        let dangerous = AiService::parse_review_response("检测到密码泄露风险，请修复。");
        assert!(!dangerous.passed);
        assert!(dangerous.issues.is_empty());
        assert_eq!(dangerous.summary, "检测到密码泄露风险，请修复。");

        let level = AiService::parse_review_response("LEVEL: danger found a secret");
        assert!(!level.passed);
    }

    #[test]
    fn rust9_parse_log_query_response_handles_missing_brace() {
        let raw = "{ \"answer\": unclosed";
        let parsed = AiService::parse_log_query_response(raw);
        assert_eq!(parsed.answer, raw);
        assert!(parsed.matched_oids.is_empty());
    }
}
