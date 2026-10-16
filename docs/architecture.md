# 架构（提案）

状态：当前宿主命令集中在 `src-tauri/src/lib.rs`；补充工作流命令在 `src-tauri/src/workspace.rs`。下方原 M0/计划目录保留为历史背景，当前模块以源码为准。

## 进程与依赖方向

```
React 界面（src/）
   │  只通过 Tauri invoke / event 通信，拿不到 key，不直接执行命令
   ▼
Tauri 命令层（src-tauri/src/commands/）  参数校验、错误转成界面可读的结构
   ▼
应用服务（src-tauri/src/app/）  仓库会话、写操作串行锁、文件监听、设置
   ├──► GitBackend trait ──► Git2Backend（git2，本地读写）
   ├──► CliRunner        ──► 系统 git 子进程（commit、commit --amend、fetch、pull、push、abort）
   ├──► DiscardService   ──► 丢弃前快照（refs/tongyun/discard/*）+ 恢复 + 撤销
   ├──► AiClient         ──► chat completions，三种提供方：KIE / OpenAI 兼容 / Ollama（reqwest + rustls）
   └──► SecretStore      ──► 系统钥匙串（keyring crate），按提供方一个条目；不读环境变量
```

规则：

- 界面层不依赖 git2，只依赖命令层返回的数据结构，换底层（例如局部换 gix）不影响界面。
- `GitBackend`、`CliRunner`、`AiClient` 放在不依赖 Tauri 的 Rust 模块（计划为 workspace 里的 `crates/tg-core`），L1 测试直接调用，不需要起窗口。
- 所有 git 操作在后台线程或子进程执行；界面线程只收结果和进度事件。
- 同一仓库的写操作（暂存、提交、切换、推拉）经同一把锁串行执行；读操作可并发。

## 计划目录

```
tongyun-git/
├── src/                     React 前端
│   ├── features/changes/    改动列表、diff、暂存
│   ├── features/commit/     提交区、AI 生成
│   ├── features/log/        日志与树图
│   ├── features/branches/   分支弹窗
│   ├── features/settings/
│   ├── components/          共享组件（shadcn 源码在 components/ui/）
│   └── styles/theme.css     主题令牌唯一来源
├── src-tauri/               Tauri 宿主
│   ├── src/commands/
│   ├── src/app/
│   └── tauri.conf.json
├── crates/tg-core/          Git、CLI、AI、密钥的核心逻辑（无 Tauri 依赖）
├── tests/fixtures/          夹具仓库生成脚本
└── docs/
```

### M0 实际目录

```
tongyun-git/
├── .github/
│   └── workflows/
│       ├── ci.yml               # CI：PR 与 push main 自动化检查（Ubuntu，npm run check）
│       └── build.yml            # 手动触发多平台构建（Windows / macOS / Ubuntu）
├── crates/
│   └── tg-core/                 # 核心 Git / CLI / 打码逻辑（无 Tauri 依赖）
│       ├── Cargo.toml
│       ├── examples/
│       │   └── baseline.rs      # 性能基线测试程序（中位数 JSON）
│       ├── src/
│       │   ├── backend.rs       # GitBackend trait 与 Git2Backend 实现
│       │   ├── cli.rs           # CliRunner（带超时、进程组终止与凭据打码）
│       │   ├── error.rs         # CoreError 统一错误类型
│       │   ├── lib.rs           # 模块导出与版本信息
│       │   ├── patch.rs         # 按行暂存与补丁应用到 index spike
│       │   └── redact.rs        # URL 敏感凭据脱敏
│       └── tests/
│           ├── backend_status.rs # 后端与状态 L1 集成测试
│           ├── cli_runner.rs    # CLI 运行器 L1 集成测试
│           ├── common/mod.rs    # 测试夹具生成器（basic/unborn/hunks/crlf 等）
│           └── patch_index.rs   # 按行/按 hunk 暂存逐字一致集成测试
├── docs/                        # 需求、架构、设计、决策与开发文档
├── src/                         # 前端源码（React 19 + TypeScript + Tailwind 4）
│   ├── App.test.tsx             # 前端组件测试
│   ├── App.tsx                  # 根组件
│   ├── lib/host.ts              # Tauri 宿主检测与 IPC 包装
│   ├── main.tsx                 # 入口挂载
│   └── styles/theme.css         # 主题样式
├── src-tauri/                   # Tauri 2 桌面宿主
│   ├── Cargo.toml
│   ├── build.rs                 # Tauri 构建脚本
│   ├── capabilities/
│   │   └── default.json         # 权限与功能配置
│   ├── icons/                   # 应用图标
│   ├── src/
│   │   ├── lib.rs               # Tauri app_info 命令与插件注册
│   │   └── main.rs              # 宿主入口
│   └── tauri.conf.json          # Tauri 应用配置
├── Cargo.toml                   # 根 Cargo workspace 清单
├── Cargo.lock
├── eslint.config.js             # ESLint 配置
├── index.html                   # 页面入口
├── package.json                 # 依赖与脚本
├── package-lock.json
├── tsconfig.json                # TypeScript 配置
├── tsconfig.node.json
└── vite.config.ts               # Vite 构建配置
```

## 关键数据流

- **改动列表**：`notify` 监听工作区和 `.git`（去抖 200ms）→ `Git2Backend::status()` → 发 `repo://status` 事件给界面。
- **按行暂存**：界面发送「文件路径 + diff 版本号 + 选中的行号集合」→ 服务端重新计算 diff，版本号不一致则拒绝（AT-05f）→ 生成只含所选行的补丁 → `Repository::apply(.., ApplyLocation::Index)`。
- **提交**：信息写临时文件 → `git commit -F <文件>`（`LC_ALL=C`、`GIT_TERMINAL_PROMPT=0`）→ 输出进操作日志 → 刷新状态和日志。
- **AI 生成**：服务端读取已暂存 diff → 按排除规则替换敏感文件内容 → 截断 → 组装提示词（提示词带版本号，便于以后比较效果）→ 按提供方拼请求地址（KIE：`https://api.kie.ai/<模型>/v1/chat/completions`；OpenAI 兼容：`<base>/chat/completions`；Ollama：`<地址>/v1/chat/completions`）→ `SecretStore` 取当前提供方的 key（Ollama 可为空）→ 流式请求 → 逐段发 `ai://delta` 事件 → 界面拼接。key 不出 Rust 层，设置命令只返回 `has_key: bool`。详见 [决策 0002](decisions/0002-ai-providers-and-keys.md)。
- **amend**：检查 HEAD 是否被任一远程跟踪分支包含（git2 `graph_descendant_of` 或 `git branch -r --contains`）→ 已推送则返回需要确认的状态，界面弹 S11 → 确认后 `git commit --amend -F <文件>` 走 `CliRunner`。
- **丢弃改动**：界面发送路径列表 → 服务端拿写锁 → 读取这些文件的工作区内容和 index 条目 → 写成 blob，组成树（`worktree/<路径>`、`index/<路径>` 两个子树，外加记录「丢弃前不存在」的清单）→ 建一个不挂在任何分支上的提交对象，更新 `refs/tongyun/discard/<毫秒时间戳>` → 再用 git2 checkout HEAD 版本到 index 和工作区、删除新增和未跟踪文件 → 超过 20 个快照时删除最旧的引用。撤销：比对当前文件和丢弃后的状态，不一致的文件交给界面让用户选（S10 下半部分），其余从快照写回 index 和工作区。
- **树图**：`revwalk` 分批（每批 500 条）→ Rust 计算每行的轨道和连线 → 界面虚拟列表只渲染可见行。

## 设置与本地数据

- 应用设置：Tauri 应用配置目录下的 JSON（主题、diff 视图、AI 的提供方 / 各提供方的地址和模型 / 超时 / 语言 / 排除规则、每个仓库的 pull 策略和提交草稿、最近仓库、窗口状态）。
- key：只在系统钥匙串（macOS Keychain、Windows Credential Manager、Linux Secret Service），服务名取应用标识（`tauri.conf.json` 的 `identifier`），账户名 `ai-key:<提供方>`。钥匙串不可用时不能保存 key，设置页说明原因；不退回明文文件，也不读环境变量。
- 应用名和标识只在 `src-tauri/tauri.conf.json` 维护（`productName`、`identifier`），Rust 和前端运行时从 Tauri 配置读取，不在代码里写死（PRD D4）。
- 应用不写用户的 git 配置，不在工作区放任何文件。MVP 唯一写进仓库 `.git` 的是丢弃快照 `refs/tongyun/discard/*`（最多 20 个）；v2 的 shelve 和 agent 快照届时放在 `.git/tongyun/` 和 `refs/tongyun/`。

## 2026-10-11 本地工作流

- `crates/tg-core/src/workspace.rs`：提交搬运/撤销/合并、版本比较、分页 blame、跨 worktree 状态与共同祖先行范围重叠计算。
- `crates/tg-core/src/snapshot.rs`：会话/搁置/按行丢弃的清单快照与条件恢复；格式与存放位置唯一维护于 [决策 0003](decisions/0003-workspace-snapshots.md)。
- `src-tauri/src/workspace.rs`：带标签枚举的 IPC 参数，后台线程执行，串行锁，系统 Git 统一经 CliRunner；外部应用用固定启动器参数调用。
- `src/features/workspace/WorkspaceTools.tsx`：总览、会话/搁置、提交/分支、blame 四个入口；复用现有主题变量。按行丢弃复用原确认框。
- 整文件丢弃也采用清单格式，恢复工作区和 index 的独立 blob；旧有损快照保留但不自动恢复。此前关键数据流中有损恢复描述不再适用。

2026-10-16：R-19 外部 Agent 入口与 R-15 持久化审计见 [Agent 安全与追溯](agent-safety.md)。
