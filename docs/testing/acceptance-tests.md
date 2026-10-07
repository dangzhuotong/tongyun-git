# 验收测试清单

状态：用例已设计，**全部未执行**（还没有代码）。每个用例对应 [PRD](../prd.md) 的需求编号；PRD 改了验收条件，这里同步改，编号不变。

结果只能填 `passed` / `failed` / `blocked` / `skipped` / `not_run`。「命令退出 0 但用例全被跳过」记为 `skipped`，不算通过。

## 1. 测试分层

| 层 | 测什么 | 工具（计划） | 运行环境 |
| --- | --- | --- | --- |
| L1 Rust 集成 | `GitBackend`、`CliRunner`、AI 请求组装、密钥存取的真实行为。用临时目录里的真实仓库和真实 git，不 mock git | `cargo test`，夹具由 `tests/fixtures/` 的脚本生成 | CI 三平台 |
| L2 前端单元 | 行选择到补丁请求的映射、过滤、快捷键分发、文案 | Vitest + Testing Library，Tauri `invoke` 用测试替身 | CI（ubuntu） |
| L3 端到端 | 打包后的应用里走完整用户流程 | tauri-driver（WebDriver）+ WebdriverIO。tauri-driver 只支持 Windows 和 Linux，macOS 用 L4 手测补 | CI（ubuntu，Windows 只在发版前跑） |
| L4 人工验收 | 安装包在真实机器上的体验、钥匙串、文件监听、外观 | 本清单「人工」列 + 截图 | 阿橦的电脑（至少 Windows 或 macOS 之一）+ box 上的 Linux |

外部服务边界：AI 接口在 L1–L3 一律用本地测试替身（一个本地 HTTP 服务，记录收到的请求体、可设置延迟和错误码）；真实 KIE 只在 L4 用阿橦自己配置的 key 跑 AT-07a，不在 CI 里调用。远程仓库用本机裸仓库（`file://`），不推真实 GitHub。

## 2. 夹具（M0 建立）

由脚本在临时目录生成，每个用例自己创建、结束后删除，不碰用户真实仓库：

| 夹具 | 内容 |
| --- | --- |
| `basic` | 3 个提交，含 `.java`、`.ts`、`.md` 文件 |
| `hunks` | 一个文件有 3 个分开的 hunk；一个 hunk 内有 2 行删除 3 行新增 |
| `crlf` | `core.autocrlf=false`，文件用 CRLF；另一个文件只改换行符 |
| `binary` | png 和一个 1.5 MB 的文本文件 |
| `rename` | `git mv` 产生的重命名 |
| `hooks` | 必定失败的 pre-commit；会改写信息的 commit-msg |
| `remote` | 本机裸仓库作为 origin，另一个克隆模拟「别人」推送 |
| `conflict` | 本地和 origin 改了同一行 |
| `graph-50k` | 用 `git fast-import` 生成 5 万提交、含分叉合并 |
| `longpath` | Windows 下总长度超过 260 字符的路径 |
| `secrets` | 已暂存的 `.env`、`id_rsa`、普通文件各一个（内容为假数据） |

## 3. 用例

| ID | 需求 | 前提 | 动作 | 期望（从外部核对） | 层 | 结果 |
| --- | --- | --- | --- | --- | --- | --- |
| AT-01a | R-01 | `basic` 的子目录 | 打开 | 标题显示仓库根目录名和分支名 | L3 | not_run |
| AT-01b | R-01 | 普通文件夹 | 打开 | 提示「不是 Git 仓库」；最近列表不新增 | L3 | not_run |
| AT-01c | R-01 | git 路径设成不存在的文件 | 启动 | 显示 git 不可用；打开按钮不可用 | L3 | not_run |
| AT-02a | R-02 | `basic` 已打开 | 命令行新建、修改、删除各一个文件 | 列表在刷新后出现三项，状态 U/M/D 正确 | L1+L3 | not_run |
| AT-02b | R-02 | 同上 | 命令行 `git add` 其中一个 | 该文件移到「已暂存」 | L3 | not_run |
| AT-02c | R-02 | `rename` | 打开 | 一项「a → b」重命名 | L1 | not_run |
| AT-02d | R-02 | `basic` | 命令行 `git commit` | 应用自动刷新，改动列表和日志更新 | L4 | not_run |
| AT-03a | R-03 | `hunks` | 选中文件 | 3 个 hunk、语法高亮、新旧行号 | L3 | not_run |
| AT-03b | R-03 | `crlf` 只改换行符的文件 | 选中 | 显示换行符变化提示 | L1+L3 | not_run |
| AT-03c | R-03 | `binary` 修改 png | 选中 | 显示二进制提示，界面不卡、无乱码 | L3 | not_run |
| AT-03d | R-03 | `binary` 1.5 MB 文本大改 | 选中 | 先显示摘要和「仍然加载」 | L3 | not_run |
| AT-04a | R-04 | `basic` 两个未暂存文件 | 多选后按空格 | `git diff --cached --name-only` 正好是这两个文件 | L1+L3 | not_run |
| AT-04b | R-04 | AT-04a 之后 | 取消其中一个 | 命令行核对只剩一个已暂存 | L1+L3 | not_run |
| AT-05a | R-05 | `hunks` | 只暂存第 2 个 hunk | `git diff --cached` 与预期补丁逐字一致；工作区文件哈希不变 | L1 | not_run |
| AT-05b | R-05 | `hunks` 混合 hunk | 只选第 1 行删除 + 第 2 行新增并暂存 | 同上，预期补丁由测试独立写出（不调用产品代码生成） | L1 | not_run |
| AT-05c | R-05 | AT-05b 之后 | 在已暂存 diff 里取消一行 | 该行回到未暂存，其他已暂存内容不变 | L1 | not_run |
| AT-05d | R-05 | `crlf` | 做 AT-05b 同样的操作 | 补丁一致；index 中该文件仍为 CRLF | L1 | not_run |
| AT-05e | R-05 | 未跟踪的新文件 10 行 | 只暂存第 1–3 行 | index 中该文件只有这 3 行 | L1 | not_run |
| AT-05f | R-05 | 选中行后，命令行改了同一文件 | 按空格 | 提示「文件已变化，请重新选择」，index 不变 | L1+L3 | not_run |
| AT-05g | R-05 | `binary` | 尝试按行选择 | 行选择不可用并说明原因 | L3 | not_run |
| AT-06a | R-06 | 已暂存一个文件 | 写信息，Ctrl/Cmd+Enter | `git log -1 --format=%B` 等于输入；改动列表更新 | L1+L3 | not_run |
| AT-06b | R-06 | `hooks` 失败的 pre-commit | 提交 | 显示 hook 输出；信息框不变；`git rev-parse HEAD` 不变 | L1+L3 | not_run |
| AT-06c | R-06 | `hooks` commit-msg 改写信息 | 提交 | 最终提交信息是 hook 改写后的内容 | L1 | not_run |
| AT-06d | R-06 | 写一半信息 | 退出再打开 | 草稿还在 | L3 | not_run |
| AT-06e | R-06 | 临时 HOME，无 user.name | 提交 | 显示配置提示和命令；没有生成提交；全局 git 配置未被改动 | L1 | not_run |
| AT-07a | R-07 | 真实 KIE key（阿橦本机） | AI 生成 | 30 秒内出现非空信息，可编辑并提交 | L4 | not_run |
| AT-07b | R-07 | `secrets`，测试替身接口 | AI 生成 | 替身收到的请求体里有 `.env`、`id_rsa` 文件名，没有其内容 | L1 | not_run |
| AT-07c | R-07 | 无 key（环境变量和钥匙串都没有） | AI 生成 | 提示未配置；替身未收到任何请求 | L1+L3 | not_run |
| AT-07d | R-07 | 替身延迟 40 秒 | AI 生成 | 30 秒提示超时；信息框原内容保留 | L1+L3 | not_run |
| AT-07e | R-07 | 替身返回 401 / 500 | AI 生成 | 显示对应原因和设置入口 | L1 | not_run |
| AT-07f | R-07 | 首次使用 | AI 生成 | 出现发送确认（S9）；取消则替身未收到请求 | L3 | not_run |
| AT-07g | R-07、N-02 | 用过 AI 后 | 在仓库、应用配置目录、日志目录里搜索 key 明文 | 搜不到 | L1+L4 | not_run |
| AT-08a | R-08 | `remote` 干净工作区 | 切到另一本地分支 | `git branch --show-current` 一致 | L1+L3 | not_run |
| AT-08b | R-08 | 本地无 `feature-x` | 选 `origin/feature-x` | 本地新建并跟踪 `origin/feature-x` | L1 | not_run |
| AT-08c | R-08 | 有会被覆盖的改动 | 切换 | 显示文件列表；分支不变；工作区文件哈希不变 | L1+L3 | not_run |
| AT-09a | R-09 | `basic` | 新建 `feature/login` | 分支存在且已切换 | L1 | not_run |
| AT-09b | R-09 | — | 输入 `bad..name` | 创建不可用，显示原因 | L2 | not_run |
| AT-09c | R-09 | 日志选中旧提交 | 从这里新建 | 新分支指向该提交 | L1+L3 | not_run |
| AT-10a | R-10 | `remote` 有一次分叉合并 | 打开日志 | 两条线汇合；合并提交有两个父 | L1（布局数据）+ L4（外观） | not_run |
| AT-10b | R-10 | `basic` | 按作者过滤 | 只显示该作者的提交 | L3 | not_run |
| AT-10c | R-10 | `basic` | 选提交再选文件 | 显示该提交该文件的 diff | L3 | not_run |
| AT-10d | R-10、N-01 | `graph-50k` | 打开日志并滚到底 | 能到底、界面不冻结；记录首屏耗时为基线 | L3+L4 | not_run |
| AT-11a | R-11 | 本地落后 2 个提交 | 拉取 | 本地 HEAD 等于 origin | L1+L3 | not_run |
| AT-11b | R-11 | `conflict` | 选「合并」拉取 | 冲突横幅和冲突分组出现 | L1+L3 | not_run |
| AT-11c | R-11 | AT-11b 之后 | 中止合并 | `git status` 干净，HEAD 回到拉取前 | L1+L3 | not_run |
| AT-11d | R-11 | 远程为需要认证、无凭据的 HTTPS 地址 | 拉取 | 30 秒内显示认证失败，应用可继续操作 | L1 | not_run |
| AT-11e | R-11 | 仓库未配置 pull 策略 | 首次拉取 | 出现「合并 / 变基」选择；用户 git 配置文件未被修改 | L3 | not_run |
| AT-11f | R-11 | 拉取进行中（替身远程故意慢） | 取消 | git 子进程被终止；应用提示 | L1 | not_run |
| AT-12a | R-12 | 领先 1 个提交 | 推送 | 裸仓库包含该提交；领先数归零 | L1+L3 | not_run |
| AT-12b | R-12 | 无上游的新分支 | 推送 | 远程出现同名分支；上游已设置 | L1 | not_run |
| AT-12c | R-12 | 「别人」先推了新提交 | 推送 | 被拒提示 + 拉取按钮；本地不变 | L1+L3 | not_run |
| AT-13a | R-13 | — | 设置里保存 key | 设置文件无 key；钥匙串有条目；AI 可用 | L4（三平台各一次） | not_run |
| AT-13b | R-13 | — | 切深色主题并重启 | 立即生效且重启后保持 | L3 | not_run |
| AT-14a | R-14 | — | 调整左栏宽度并重启 | 宽度一致 | L3 | not_run |
| AT-15a | R-15 | `remote` | 推送 | 操作日志有 `git push` 条目，含退出码和输出 | L3 | not_run |
| AT-15b | R-15 | 远程 URL 含 `user:token@` | 获取 | 日志里显示 `user:***@` | L1 | not_run |
| AT-15c | R-15 | 推送进行中 | 观察提交按钮 | 不可用，结束后恢复 | L3 | not_run |
| AT-16a | R-16 | `hunks` + `remote` | 只用键盘走完 F1（打开仓库除外） | 每一步完成，最终远程有新提交 | L3+L4 | not_run |
| AT-N3 | N-03 | 全部界面 | 逐个检查菜单和按钮 | 不存在 reset --hard、clean、强制推送、丢弃改动入口 | L4 | not_run |
| AT-N4a | N-04 | `longpath`（Windows） | 打开、暂存、提交 | 正常完成 | L4（Windows） | not_run |
| AT-N4b | N-04 | Linux 安装包 | 外部修改文件 | 改动列表自动刷新 | L4（Linux） | not_run |

## 4. 发版前必须通过

- L1 全部通过（三平台）。
- L3 在 ubuntu 上全部通过；Windows 至少跑 AT-01a、AT-05a 路径、AT-06a、AT-12a。
- L4：AT-07a、AT-13a（至少一个平台）、AT-16a、AT-N3、对应平台的 AT-N4。
- 未执行或被阻塞的项写进发版说明，不算通过。

## 5. 记录方式

每次执行在 `docs/testing/runs/<日期>-<版本或提交>.md`（待建立）记录：版本、平台、执行的用例和结果、失败的最小复现（期望 / 实际 / 证据路径）。偶发失败保留首次失败记录，不靠重跑抹掉。
