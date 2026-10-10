# tongyun-git

一个独立的桌面 Git 图形客户端，对标 IntelliJ IDEA 自带的 Git 面板，目标是更顺手，并且自带 AI。

技术栈：Tauri 2 + Rust（git2 + 系统 git）+ React 19 + TypeScript + Vite + Tailwind CSS 4。

> 当前状态：**MVP 核心阶段（M0–M6）已全部实现**，全量单元测试与集成测试通过，支持绿色单文件直接运行。

## 核心特性

- **多模式打开仓库**：支持直接输入路径、通过系统原生文件选择器挑选目录，或直接从文件管理器把文件夹拖进窗口；遇到未初始化的文件夹支持一键 `git init`。
- **改动列表与 Diff 预览**：支持工作区与暂存区双栏展示、文件级/行级 diff 视图、虚拟滚动与多种改动类型标识。
- **精细化暂存与丢弃保护**：支持文件级暂存、hunk 级暂存以及**按行暂存**；丢弃改动提供二次确认与 10 秒撤销快照保护（R-17）。
- **提交与 AI 辅助**：支持规范首行提交、Amend 修正已提交内容；集成三种 AI 供应商（KIE / OpenAI 兼容接口 / 本机 Ollama）一键生成 Conventional Commits 提交信息；AI Key 安全存放在操作系统系统钥匙串，无密钥泄露风险。
- **分支管理与拓扑树图**：快捷切换本地/远程分支、新建分支；全 Rust 驱动的提交拓扑树图与历史详情查看（支持 5 万+ 提交基线）。
- **推拉同步与安全操作日志**：Fetch、Pull（智能冲突检测与中止）、Push（预检拦截）；操作日志完整记录执行的命令与输出，自动打码 URL 敏感凭据（R-15）。
- **键盘优先与命令面板**：提供类似 IDE 的命令面板（Command Palette），全功能快捷键支持，以及单实例防重开自动唤起。

## 快捷键速查

| 快捷键 | 功能 |
| --- | --- |
| `Ctrl + Shift + P` | 打开命令面板 (Command Palette) |
| `Ctrl + Shift + \`` | 打开分支切换与管理弹窗 |
| `Ctrl + T` | 从远程拉取 (Pull) |
| `Ctrl + Shift + K` | 推送到远程 (Push) |
| `Alt + 0` | 切换到改动视图 (Changes) |
| `Alt + 9` | 切换到提交日志树图 (Log) |
| `Ctrl + Enter` | 在提交输入框中快捷提交 |
| `Space` | 在 Diff 视图中对选中行进行暂存 / 取消暂存 |

## 开发与验证

```bash
# 启动前端与 Tauri 桌面端开发环境
npm run tauri dev

# 运行全量自动化检查（TypeScript + ESLint + Vitest + Clippy + Cargo Test）
npm run check

# 打包生产环境单文件客户端
npx tauri build --no-bundle
```

## 文档

| 文档 | 内容 |
| --- | --- |
| [AGENTS.md](AGENTS.md) | AI 协作开发规则（改代码前先读） |
| [.agents/skills/tongyun-git/SKILL.md](.agents/skills/tongyun-git/SKILL.md) | App 内 AI 用法与外部 Agent 边界 |
| [docs/prd.md](docs/prd.md) | 产品需求、MVP 与 v2 范围、竞品、验收条件 |
| [docs/user-flows.md](docs/user-flows.md) | 用户流程 |
| [docs/design/ui-direction.md](docs/design/ui-direction.md) | 界面方向与设计规则 |
| [docs/design/wireframes.md](docs/design/wireframes.md) | 主要界面线框图 |
| [docs/testing/acceptance-tests.md](docs/testing/acceptance-tests.md) | 验收测试清单 |
| [docs/plan.md](docs/plan.md) | 里程碑与工期 |
| [docs/architecture.md](docs/architecture.md) | 架构设计 |
| [docs/development.md](docs/development.md) | 开发命令、CI、发版 |
| [docs/decisions/](docs/decisions/) | 决策记录 |
