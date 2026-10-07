# 架构（提案）

状态：**提案，代码尚未建立**。M0 落地后把本文件改成描述实际结构，未实施的部分继续标注。

## 进程与依赖方向

```
React 界面（src/）
   │  只通过 Tauri invoke / event 通信，拿不到 key，不直接执行命令
   ▼
Tauri 命令层（src-tauri/src/commands/）  参数校验、错误转成界面可读的结构
   ▼
应用服务（src-tauri/src/app/）  仓库会话、写操作串行锁、文件监听、设置
   ├──► GitBackend trait ──► Git2Backend（git2，本地读写）
   ├──► CliRunner        ──► 系统 git 子进程（commit、fetch、pull、push、abort）
   ├──► AiClient         ──► OpenAI 兼容 chat completions（reqwest + rustls）
   └──► SecretStore      ──► 系统钥匙串（keyring crate）/ 环境变量
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

## 关键数据流

- **改动列表**：`notify` 监听工作区和 `.git`（去抖 200ms）→ `Git2Backend::status()` → 发 `repo://status` 事件给界面。
- **按行暂存**：界面发送「文件路径 + diff 版本号 + 选中的行号集合」→ 服务端重新计算 diff，版本号不一致则拒绝（AT-05f）→ 生成只含所选行的补丁 → `Repository::apply(.., ApplyLocation::Index)`。
- **提交**：信息写临时文件 → `git commit -F <文件>`（`LC_ALL=C`、`GIT_TERMINAL_PROMPT=0`）→ 输出进操作日志 → 刷新状态和日志。
- **AI 生成**：服务端读取已暂存 diff → 按排除规则替换敏感文件内容 → 截断 → 组装提示词（提示词带版本号，便于以后比较效果）→ 流式请求 → 逐段发 `ai://delta` 事件 → 界面拼接。
- **树图**：`revwalk` 分批（每批 500 条）→ Rust 计算每行的轨道和连线 → 界面虚拟列表只渲染可见行。

## 设置与本地数据

- 应用设置：Tauri 应用配置目录下的 JSON（主题、diff 视图、AI 的 base URL / 模型 / 语言 / 排除规则、每个仓库的 pull 策略和提交草稿、最近仓库、窗口状态）。
- key：只在系统钥匙串（macOS Keychain、Windows Credential Manager、Linux Secret Service）。Linux 没有 Secret Service 时只能用环境变量，设置页说明原因。
- 应用不写用户的 git 配置，不在仓库里放任何文件（v2 的 shelve 和快照除外，届时放在 `.git/tongyun/` 和 `refs/tongyun/`，不进工作区）。
