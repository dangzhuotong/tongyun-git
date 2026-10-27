# tongyun-git

一个独立的桌面 Git 图形客户端，对标 IntelliJ IDEA 自带的 Git 面板，目标是更顺手，并且自带 AI。

技术栈：Tauri 2 + Rust（git2 + 系统 git）+ React 19 + TypeScript + Vite + Tailwind CSS 4。

> 当前状态：**MVP 核心阶段（M0–M6）已全部实现**，全量单元测试与集成测试通过，支持绿色单文件直接运行。

## 核心特性

- **多模式打开仓库**：支持直接输入路径、通过系统原生文件选择器挑选目录，或直接从文件管理器把文件夹拖进窗口；遇到未初始化的文件夹支持一键 `git init`。
- **改动列表与 Diff 预览**：支持工作区与暂存区双栏展示、文件级/行级 diff 视图、虚拟滚动与多种改动类型标识。
- **精细化暂存与丢弃保护**：支持文件级暂存、hunk 级暂存以及**按行暂存**；丢弃改动提供二次确认与 10 秒撤销快照保护（R-17）。
- **提交与 AI 辅助**：支持规范首行提交、Amend 修正已提交内容；集成三种 AI 供应商（KIE / OpenAI 兼容接口 / 本机 Ollama）一键生成 Conventional Commits 提交信息；AI Key 只存在本机加密文件里，不写入系统钥匙串，界面不回显明文。
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

# 打包生产环境单文件客户端（不签名、不生成更新包）
npx tauri build --no-bundle -- --config src-tauri/tauri.unsigned.json
```

## 检查更新

日常更新用桌面 App 里的 **检查更新**（设置 → 常规，以及关于窗口），或等启动大约 3 秒后的提示。已经是最新会提示「已是最新版本」。

新版本来自 tag `vX.Y.Z`，并且和 `package.json`、`src-tauri/tauri.conf.json`、`src-tauri/Cargo.toml` 的版本一致。GitHub Actions 会发布 Release，并带上更新器用的 `latest.json`。合进 main 不会自动发版。步骤见 [docs/development.md](docs/development.md)。

安装包没有 Apple 签名和公证，所以 macOS 首次打开会提示无法验证开发者。三种解决办法：

1. 系统设置 → 隐私与安全性 → 往下找到提示，点「仍要打开」；
2. 在「应用程序」里右键点 App，选「打开」，再确认一次；
3. 终端执行：`xattr -dr com.apple.quarantine /Applications/tongyun-git.app`

已经装上的 App 用「检查更新」换的是 minisign 签过的包，不受这次隔离提示影响。`0.1.0` 是第一个带更新器的版本。

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

2026-10-16：R-19 外部 Agent 入口与 R-15 持久化审计见 [Agent 安全与追溯](docs/agent-safety.md)。
