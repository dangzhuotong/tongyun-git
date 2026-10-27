---
name: tongyun-git
description: >-
  Explain how to use tongyun-git App AI and external AI Agent Bridge / MCP protocol.
  Use when connecting external agents (Claude Code, Cursor, Antigravity) to Tongyun Git or assessing agent automation.
---

# tongyun-git · Agent / AI 协同与使用说明（项目级）

本 skill **只放在本仓库** `.agents/skills/tongyun-git/`，不要拷进全局 skills。先读 [AGENTS.md](../../../AGENTS.md)、[docs/prd.md](../../../docs/prd.md)、[docs/decisions/0002-ai-providers-and-keys.md](../../../docs/decisions/0002-ai-providers-and-keys.md)。

## 核心定位：AI Agent 做大脑与执行者，Tongyun Git 做环境与眼睛

本工具本质上是**给 AI 看、给多 Agent 协同服务、给人类终审**的 Git 基础设施：
- **AI 读**：外部 Agent 通过 Bridge 与 MCP 读取高信息密度 Context Pack、结构化 Diff 与工作区状态；
- **AI 写**：外部 Agent 将意图（Prompt/任务说明）、推荐的 Conventional Commit 信息与审查便签推送到桌面 UI；
- **安全网**：外部 Agent 执行前自动打快照（`snapshot`），一旦测试报错或改崩，一键 100% 确定性回滚（`rewind`）；
- **人终审**：人类在精雕细琢的桌面 UI 上监看动态、一键采纳提交并归档。
- **受控 Git CLI**：`tongyun-git-agent status / diff / history / commit`，JSON v1，复用核心服务；写入必须显式授权。契约见 [Agent 安全与追溯](../../../docs/agent-safety.md)。它不读取钥匙串，也不提供 `tg ai commit --json`。

---

## 1. 外部 Agent 调用方式

### 方式 A：MCP (Model Context Protocol) 标准服务器
任何支持 MCP 的 Agent（Claude Code, Cursor, Windsurf, Antigravity）直接在配置文件中挂载：
```json
{
  "mcpServers": {
    "tongyun-git": {
      "command": "python",
      "args": ["scripts/tongyun_mcp_server.py"]
    }
  }
}
```
**可用 MCP 工具**：
- `tg_get_repo_status`: 获取当前仓库与分支状态、未提交改动统计；
- `tg_get_context_pack`: 提取高信息密度、LLM 优化的上下文包（含改动汇总与裁剪 diff）；
- `tg_get_file_diff`: 获取指定文件结构化差异；
- `tg_push_agent_intent`: 将修改任务描述与提交信息推送到桌面 UI 供人类审查采纳；
- `tg_create_safety_snapshot`: 在尝试大改前创建安全快照；
- `tg_rewind_to_snapshot`: 遇到失败一键全盘秒级安全回滚；
- `tg_stage_files`: 暂存指定文件。

### 方式 B：Python CLI 脚本 (`scripts/tongyun_git_bridge.py`)
```bash
# 1. 检查状态
python scripts/tongyun_git_bridge.py status

# 2. 导出面向大模型的高密度上下文
python scripts/tongyun_git_bridge.py context-pack

# 3. 大改前打安全快照
python scripts/tongyun_git_bridge.py snapshot --label "重构鉴权模块"

# 4. 改崩了？一键全盘回滚
python scripts/tongyun_git_bridge.py rewind

# 5. 推送完成的提交意图到桌面 UI
python scripts/tongyun_git_bridge.py push-intent \
  --agent "Claude Code" \
  --task "重构鉴权模块并增加白名单" \
  --msg "feat(auth): 重构鉴权模块并支持白名单校验"
```

### 方式 C：本地 HTTP REST API（端口 4172）
```bash
# 获取 LLM 优化上下文包
curl http://127.0.0.1:4172/api/context-pack

# 推送 Agent 意图
curl -X POST http://127.0.0.1:4172/api/push-intent \
  -H "Content-Type: application/json" \
  -d '{"agent_name": "Claude Code", "task": "实现登录拦截器", "commit_message": "feat: login interceptor"}'
```

---

## 2. 人在 App 里怎么用

1. **设置 → AI**：选提供方（KIE / OpenAI 兼容 / Ollama），填 base URL 与模型；保存 key（只进本机加密文件，前端拿不到明文，保存时不写系统钥匙串）。
2. **测连接**：设置页「测试连接」。
3. **AI Bridge 状态指示**：状态栏右下角显示 `🟢 AI Bridge :4172`，实时监听外部 Agent 联动。
4. **Agent 意图便签**：当外部 Agent 推送了任务与推荐提交信息，提交区顶部出现淡抹茶色手帐便签，点击「采纳建议提交信息」一键填入。
5. **提交前审查**：提交面板「AI 审查」——查密钥泄露、明显缺陷、调试残留等。
6. **自然语言历史**：Log 视图输入框（如「上次改支付配置是谁」）→ AI 检索/归纳提交摘要。

---

## 3. 禁区

- 不把 AI key、token 写进仓、CI 明文、skill 正文。
- 不读取任何环境变量里的 key（必须在设置中由用户保存到本机加密文件）。
- 外部 Agent 操作前建议先触发 `snapshot` 建立安全备份点。
