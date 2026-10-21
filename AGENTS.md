# tongyun-git · AI 开发规则

所有在本仓库工作的 agent 先读本文件。本文件只放每次开发都要知道的规则和入口，细节链接到各自唯一维护的文档。

## 项目与修改入口

- 用途：独立的桌面 Git 图形客户端，对标 IntelliJ IDEA 的 Git 面板，自带 AI。产品范围以 [docs/prd.md](docs/prd.md) 为准。
- 技术栈（已定）：Tauri 2 + Rust；Git 底层 `git2` + 系统 git 命令行（[决策 0001](docs/decisions/0001-git-backend.md)）；前端 React + TypeScript + Vite + Tailwind CSS 4。
- **当前状态：已有 MVP 与部分 v2 实现；外部 Agent JSON 入口和持久化审计见 docs/agent-safety.md。跨平台完整 GUI 验收尚未完成。**

| 要改什么 | 先读 |
| --- | --- |
| 需求、范围、验收条件 | [docs/prd.md](docs/prd.md)、[docs/user-flows.md](docs/user-flows.md) |
| 界面、样式、交互 | [docs/design/ui-direction.md](docs/design/ui-direction.md)、[docs/design/wireframes.md](docs/design/wireframes.md) |
| Git 操作的实现方式 | [docs/decisions/0001-git-backend.md](docs/decisions/0001-git-backend.md)、[docs/architecture.md](docs/architecture.md) |
| AI 提供方、key 存放 | [docs/decisions/0002-ai-providers-and-keys.md](docs/decisions/0002-ai-providers-and-keys.md)、PRD R-07 / R-13 |
| 测试 | [docs/testing/acceptance-tests.md](docs/testing/acceptance-tests.md) |
| 命令、CI、发版、许可证 | [docs/development.md](docs/development.md) |
| 排期 | [docs/plan.md](docs/plan.md) |
| 产品内 AI / 外部 Agent 边界 | [.agents/skills/tongyun-git/SKILL.md](.agents/skills/tongyun-git/SKILL.md) |

## 开发与验证

- 命令表只在 [docs/development.md](docs/development.md) 维护。以 package.json 和 CI 配置为准；交接时写实际运行过的命令和结果。
- 改动前读受影响模块的规则和实现，确定目标行为对应的需求编号（R-xx）和验收用例（AT-xx）。
- 按改动选验证：
  - Git 操作逻辑 → L1 Rust 集成测试，用 `crates/tg-core/tests/common/`（夹具生成）造的临时仓库和真实 git，从命令行（`git diff --cached`、`git log`）核对结果。
  - 界面交互 → L2 前端测试；涉及完整流程 → L3 端到端。
  - 打包、安装、钥匙串、文件监听 → 构建产物上的 L4 人工验收；源码测试通过不代表安装包可用。
  - 只改文档 → 检查链接、编号和各文档之间是否一致。
- 交接时写清：改了什么、实际跑了哪些检查和结果、哪些失败 / 跳过 / 未运行、下一步。

## 配套技能

执行对应工作前读取该技能的实际 `SKILL.md`，复用本仓库已有的需求、设计和授权，产出回到本仓库的验收标准核对。登记不等于已安装或已执行。

| 任务 | 技能（版本） | 可用状态 | 交给它 | 期望拿回 |
| --- | --- | --- | --- | --- |
| 改需求、加功能、定 v2 细节 | `tong-product-pro`（1.0.0） | available / not_checked | 用户目标、现有 PRD 条目 | 保留原 ID 的需求和验收条件 |
| 界面实现、改造、审查 | `tong-ui-design-pro`（1.1.0） | available / not_checked | 需求编号、ui-direction.md、线框图 | 实现与截图对照；注意它以 Web 为主，桌面相关规则以 ui-direction.md 第 9 节为准 |
| 测试设计、执行、缺陷复现 | `tong-test-pro`（1.0.0） | available / not_checked | 需求和 AT 用例、版本、平台 | 每个用例的实际结果与证据 |
| PR 代码审查 | `tong-code-review-pro`（1.0.0） | available / not_checked | PR 范围和比较基线 | 带定位的问题清单 |
| 维护本规则文件 | `tong-project-pro`（1.2.0） | available / not_checked | 本仓库现状 | 差异化更新，不整份重写 |
| 交给 Antigravity 写小块代码和测试 | `agy-worker`（未声明版本） | available / not_checked | task.md（目标、输入、完成标准、禁区） | diff 和测试结果，由审查方验收 |

- 不使用 `tong-git`（0.2）：它默认同时推 Gitee、GitHub、CNB，本仓库只推 GitHub。
- 本项目没有服务端和数据库，不需要 `tong-api-pro`、`tong-deploy-pro`、MySQL 类技能。
- 核对记录：2026-10-07 在 box 的 `/home/box/agent-data/workflows/<技能名>/SKILL.md` 读取过以上技能（这是 box 上的路径，别的机器要重新发现）。

## 修改约束

1. **密钥**：任何 key、token、密码不得进入仓库、日志、测试快照、设置文件或界面。应用不内置 key；AI key 由用户在设置里填写，只存本机加密文件、只在 Rust 侧使用，**不读取任何环境变量**（PRD D1、决策 0002、决策 0004）。日常保存不得调用系统钥匙串。测试和 CI 一律用本地 AI 测试替身和内存替身，不调用真实钥匙串。
2. **AI 发送范围**：只能在用户触发后发送，范围和排除规则见 PRD R-07。扩大发送内容属于需求变更，先改 PRD。
3. **不破坏用户数据**：MVP 不提供 reset --hard、clean、强制推送入口。丢弃改动只有 R-17 一个实现，必须二次确认并先写快照；amend 在 HEAD 已推送时先警告（PRD N-03）。测试只在临时目录的夹具仓库里执行写操作，不碰真实仓库，不推送真实远程。
4. **Git 调用**：本地读写走 `GitBackend`；commit（含 amend）、fetch、pull、push、abort 走 `CliRunner`（决策 0001）。新增调用系统 git 的地方必须经过 `CliRunner`，以便统一设置 `LC_ALL=C`、`GIT_TERMINAL_PROMPT=0`、记录操作日志和打码 URL 凭据。
5. **前后端接口**：改 Tauri 命令的参数或返回结构时，同步修改前端类型和调用方，并跑受影响的 L1、L2 测试。
6. **需求编号稳定**：行为变化时更新 PRD 原条目和对应 AT 用例，不新开重复编号。
7. **远程与发布**：只推 GitHub（`dangzhuotong/tongyun-git`，私有）。不接 CNB、不同步 Gitee。打标签发版按 [docs/development.md](docs/development.md)，只在明确要求时执行。
8. **许可证**：现在不加 LICENSE 文件，公开仓库时再定。
9. **依赖**：新增依赖要说明必要性并核对许可证；不为一个界面引入第二套组件库（以 ui-direction.md 第 8 节为准）。

## 提交与合并

- 有代码以后，所有改动走 PR：CI 绿、审查通过、按对应 AT 用例核对后再合并。只改文档可以直接提交到 main。
- 提交信息用 Conventional Commits 格式（`feat:`、`fix:`、`docs:`、`chore:` …），描述用中文或英文均可。
- 一个 PR 对应一个里程碑或一个独立问题，不夹带无关重构。

## 文档与决定

- 一个事实只在一个文件里维护，其他地方链接过去。
- 值得以后复核的决定（底层库、数据存放位置、对外格式、检查策略）写进 `docs/decisions/NNNN-标题.md`，格式参照 0001：问题、决定、考虑过的方案、后果与验证。提案实施后把状态改为「已实施」并补验证结果。
- 任务进度和临时记录不放进长期文档。

## 已知坑

- **不要用系统钥匙串存 AI key。** macOS 上未签名或更新后签名变了的包，`keyring` 的 `set_password` 会在每次保存时弹出登录钥匙串密码，「始终允许」留不住。key 只走 `crates/tg-core/src/ai/secret_store.rs`。旧钥匙串项只在启动时的 `migrate_from_os_keychain` 里读一次；命令路径（保存、清除、状态、AI 调用）不得再调用它。用户拒绝授权时标记写不上，下次启动再试，但当次保存必须仍然成功。`NoStorageAccess` 只在 Linux 上当成没有旧项；macOS 和 Windows 当错误，下次启动再试。迁移失败写入 journal，不要只用 `eprintln`。`secrets.migrated` 写上之后，启动也不再调用钥匙串。`lock_store` 不可重入，同一线程嵌套加锁会卡死。vault 目录的父目录不做符号链接检查。

## 代码审查规矩

1. **本地测试进 PR**：改代码必须在本地跑相关测试，把测试命令和输出贴进 PR 描述（或附件）。没跑过别声称通过。
2. **提 PR 前自查 diff**：提交前自己过一遍 diff，重点看正确性、兼容（旧接口/旧数据）、权限、生命周期（启停、清理、泄漏）。
3. **已知坑沉淀**：同类问题第二次出现，就写进本文件「已知坑」一节（没有就新建），避免反复踩。
4. **AI 改稿轮次上限**：AI 修改来回审超过 3 轮还没过，停下重想方案并上报（阿码/阿审），不要硬改硬怼。
5. **风险分级合入**：
   - **低风险**：文档、测试的小改动，CI 绿可直接合。
   - **功能改动**：要阿审审过再合。
   - **高风险（必须阿橦本人批）**：计费、密钥相关、CI/发布流程（`.github/workflows`、updater、签名）的改动。

不要把密钥、Token、密码写进本文件或仓库任何位置。
