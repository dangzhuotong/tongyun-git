---
name: tongyun-git
description: >-
  Explain how to use tongyun-git App AI (commit message, pre-commit review,
  natural-language log query) and what external agents can / cannot drive.
  Use when configuring AI in the App or assessing agent automation of git UI.
---

# tongyun-git · Agent / AI 使用说明（项目级）

本 skill **只放在本仓库** `.agents/skills/tongyun-git/`，不要拷进全局 skills。先读 [AGENTS.md](../../../AGENTS.md)、[docs/prd.md](../../../docs/prd.md)、[docs/decisions/0002-ai-providers-and-keys.md](../../../docs/decisions/0002-ai-providers-and-keys.md)。

## 结论先行

- **已有**：桌面 App 内 AI——生成 Conventional Commit、提交前审 diff、自然语言查 log；Key 只进 OS 钥匙串。
- **没有**：对外稳定 CLI（如 `tg ai commit --json`）、MCP、给外部 Agent 的 HTTP API。外部 Agent **不能**在无 GUI 的情况下直接调用这些 AI 能力。
- **本批不做** `tg ai commit --json`（成本高：需独立 CLI 入口、钥匙串、与 Tauri 命令对齐）。若以后要做，应复用 `tg-core` 的 `AiService`，输出 `--json`，且仍禁止读环境变量里的 key。

## 1. 人在 App 里怎么用

1. **设置 → AI**：选提供方（KIE / OpenAI 兼容 / Ollama），填 base URL（若需要）与模型；保存 key（只进钥匙串，前端拿不到明文）。
2. **测连接**：设置页「测试连接」。
3. **生成提交信息**：暂存改动后，在提交面板点「AI 生成」（或快捷键）。首次会弹授权说明发送范围与目标 URL。
4. **提交前审查**：提交面板「AI 审查」——查密钥泄露、明显缺陷、调试残留等。
5. **自然语言历史**：Log 视图输入框（如「上次改支付配置是谁」）→ AI 检索/归纳提交摘要。

关闭 AI 或未保存 key 时，相关按钮不可用或提示去设置。

## 2. 实现入口（给改代码的 Agent）

| 能力 | 核心 | UI / IPC |
| --- | --- | --- |
| 生成提交 | `AiService::generate_commit_message`（`crates/tg-core/src/ai/provider.rs`） | `CommitPanel`、Tauri `generate_commit_message` |
| 审 diff | `AiService::review_diff` | `AiReviewModal`、`review_diff` |
| 自然语言 log | `AiService::query_log` | `LogView`、`query_log` |
| Key | `keyring_store.rs`；账户名 `ai-key:<kie\|openai\|ollama>` | 设置页只暴露 `has_key` |

规则：不读任何环境变量中的 key；测试用内存钥匙串替身；不把 key 写入日志/设置文件/仓库。

## 3. 外部 Agent 能做什么

| 目标 | 现状 | 建议 |
| --- | --- | --- |
| 启停本机项目 | 用 **tongyun-dev** CLI/`--json` | 见 tongyun-dev 项目 skill |
| 在 tongyun-git 里自动写 commit message | **不能**无头操作 GUI AI | 人在 App 点；或另用自己的 LLM + `git commit`（不经本 App） |
| 查本仓开发规则 | 读本仓库 AGENTS / docs | 本 skill + AGENTS 表 |

## 4. 禁区

- 不把 AI key、token 写进仓、CI 明文、skill 正文。
- 不把「登记的开发用 tong-*-pro」当成已安装的本产品 skill。
- 不假装存在 `tg ai …` CLI，直到真正实现并写进 README。
