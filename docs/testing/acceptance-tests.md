# 验收测试清单

状态：已有代码及 L1/L2 自动测试。旧表保留原执行状态，新证据记录在 runs 目录；排期中的完成声明不替代验收。每个用例对应 [PRD](../prd.md) 的需求编号；PRD 改了验收条件，这里同步改，编号不变。

结果只能填 `passed` / `failed` / `blocked` / `skipped` / `not_run`。「命令退出 0 但用例全被跳过」记为 `skipped`，不算通过。

## 1. 测试分层

| 层 | 测什么 | 工具（计划） | 运行环境 |
| --- | --- | --- | --- |
| L1 Rust 集成 | `GitBackend`、`CliRunner`、AI 请求组装、密钥存取的真实行为。用临时目录里的真实仓库和真实 git，不 mock git | `cargo test`，夹具由 `tests/fixtures/` 的脚本生成 | CI 三平台 |
| L2 前端单元 | 行选择到补丁请求的映射、过滤、快捷键分发、文案 | Vitest + Testing Library，Tauri `invoke` 用测试替身 | CI（ubuntu） |
| L3 端到端 | 打包后的应用里走完整用户流程 | tauri-driver（WebDriver）+ WebdriverIO。tauri-driver 只支持 Windows 和 Linux，macOS 用 L4 手测补 | CI（ubuntu，Windows 只在发版前跑） |
| L4 人工验收 | 安装包在真实机器上的体验、钥匙串、文件监听、外观 | 本清单「人工」列 + 截图 | 阿橦的电脑（至少 Windows 或 macOS 之一）+ box 上的 Linux |

外部服务边界：AI 接口在 L1–L3 一律用本地测试替身（一个本地 HTTP 服务，记录收到的请求地址、请求头和请求体，可设置延迟和错误码，并能模拟 KIE、OpenAI 兼容、Ollama 三种路径，含 Ollama 的 `/api/tags`）；真实提供方只在 L4 用阿橦自己在设置里填的 key 跑 AT-07a，不在 CI 里调用。L1 里钥匙串用内存替身，真实钥匙串只在 L4（AT-13a）验。远程仓库用本机裸仓库（`file://`），不推真实 GitHub。

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
| `amend` | `remote` 基础上，HEAD 已推送到 origin；另有一个本地未推送提交的分支；一个没有任何提交的空仓库 |
| `discard` | 一个部分暂存的已修改文件、一个已修改文件、一个已暂存的新文件、一个未跟踪文件、一个 60 MB 的未跟踪文件（测试时生成，不进仓库） |

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
| AT-06f | R-06 amend | `amend` 未推送分支，再暂存一个文件 | 勾选「修改上一次提交」，改信息后执行 | 信息框先出现 HEAD 原信息；`git rev-list --count HEAD` 不变；`git log -1 --format=%B` 是新信息；`git show --name-only HEAD` 含该文件；`HEAD^` 不变 | L1+L3 | not_run |
| AT-06g | R-06 amend | 同上，无已暂存改动 | 勾选后只改信息并执行 | `git rev-parse HEAD^{tree}` 不变，只有信息变化 | L1 | not_run |
| AT-06h | R-06 amend | `amend` HEAD 已推送到 origin/main | 勾选并执行 | 出现已推送警告，默认焦点在「取消」，回车不确认；取消 → `git rev-parse HEAD` 不变；确认 → 修改成功，显示 ↑1 ↓1 | L1（检测已推送）+ L3（对话框） | not_run |
| AT-06i | R-06 amend | `amend` 空仓库（无提交） | 看提交区 | 勾选框不可用并显示原因 | L3 | not_run |
| AT-06j | R-06 amend | `hooks` 失败的 pre-commit | 勾选 amend 并执行 | 显示 hook 输出；`git rev-parse HEAD` 不变；信息框和暂存状态不变 | L1 | not_run |
| AT-06k | R-06 amend | 勾选后取消勾选 | 观察信息框 | 恢复为勾选前的草稿 | L2 | not_run |
| AT-07a | R-07 | 阿橦本机，在设置里填自己的 key（KIE 或其他 OpenAI 兼容服务至少一种；装了 Ollama 时再测一次） | AI 生成 | 30 秒内出现非空信息，可编辑并提交 | L4 | not_run |
| AT-07b | R-07 | `secrets`，测试替身接口 | AI 生成 | 替身收到的请求体里有 `.env`、`id_rsa` 文件名，没有其内容 | L1 | not_run |
| AT-07c | R-07 | 提供方为 KIE 或 OpenAI 兼容，钥匙串里没有 key | AI 生成 | 提示未配置；替身未收到任何请求 | L1+L3 | not_run |
| AT-07d | R-07 | 替身延迟 40 秒 | AI 生成 | 30 秒提示超时；信息框原内容保留 | L1+L3 | not_run |
| AT-07e | R-07 | 替身返回 401 / 500 | AI 生成 | 显示对应原因和设置入口 | L1 | not_run |
| AT-07f | R-07 | 首次使用 | AI 生成 | 出现发送确认（S9）；取消则替身未收到请求 | L3 | not_run |
| AT-07g | R-07、N-02 | 用过 AI 后 | 在仓库、应用配置目录、日志目录里搜索 key 明文 | 搜不到 | L1+L4 | not_run |
| AT-07h | R-07、D1 | 环境变量 `KIE_API_KEY=假值`，钥匙串里没有 key，提供方选 KIE | AI 生成 | 提示未配置；替身未收到任何请求（证明不读环境变量） | L1 | not_run |
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
| AT-13c | R-13、R-07 | 提供方 KIE，替身作为 KIE 地址，钥匙串替身里存假 key | AI 生成、测试连接 | 替身收到的路径是 `/<模型>/v1/chat/completions`，带 `Authorization: Bearer <假 key>`；测试连接显示成功 | L1 | not_run |
| AT-13d | R-13、R-07 | 提供方 OpenAI 兼容，base URL `http://127.0.0.1:<端口>/v1`，存假 key | AI 生成 | 替身收到 `/v1/chat/completions`，请求体 `model` 等于设置值，带 Bearer 头；设置页显示的最终请求地址与实际一致 | L1+L2 | not_run |
| AT-13e | R-13、R-07 | 提供方 Ollama，替身模拟 `/api/tags`（2 个模型）和 `/v1/chat/completions`，不填 key | 打开模型下拉，AI 生成 | 下拉出现 2 个模型；请求不带 `Authorization` 头；生成成功 | L1+L2 | not_run |
| AT-13f | R-13 | KIE 和 OpenAI 兼容各存一把不同的假 key | 来回切换提供方 | 两个钥匙串条目都在；切回后不用重填；「清除 key」只删当前提供方的条目 | L1 | not_run |
| AT-13g | R-13、N-02 | 钥匙串替身设为不可用（模拟 Linux 无 Secret Service） | 打开设置、尝试保存 key | key 输入框不可用并显示原因；应用配置目录里没有 key | L1+L2 | not_run |
| AT-13h | R-13、N-02 | 已保存 key | 前端读取设置 | 命令返回值只有「已保存」标记，没有 key 字符串 | L1+L2 | not_run |
| AT-13i | R-13 | 提供方 Ollama，地址 `http://192.168.1.10:11434` | 打开设置 | 显示「内容会明文经过网络」提示；改成 localhost 后提示消失 | L2 | not_run |
| AT-13j | R-13、R-07 | 替身返回 401 / 模型不存在 / 地址不通 | 测试连接 | 分别显示对应原因，不显示 key | L1+L2 | not_run |
| AT-13b | R-13 | — | 切深色主题并重启 | 立即生效且重启后保持 | L3 | not_run |
| AT-14a | R-14 | — | 调整左栏宽度并重启 | 宽度一致 | L3 | not_run |
| AT-15a | R-15 | `remote` | 推送 | 操作日志有 `git push` 条目，含退出码和输出 | L3 | not_run |
| AT-15b | R-15 | 远程 URL 含 `user:token@` | 获取 | 日志里显示 `user:***@` | L1 | not_run |
| AT-15c | R-15 | 推送进行中 | 观察提交按钮 | 不可用，结束后恢复 | L3 | not_run |
| AT-16a | R-16 | `hunks` + `remote` | 只用键盘走完 F1（打开仓库除外） | 每一步完成，最终远程有新提交 | L3+L4 | not_run |
| AT-17a | R-17 | `discard` | 选部分暂存文件和已修改文件，丢弃并确认 | 两个文件内容等于 `git show HEAD:<路径>`；`git status --porcelain` 不再列出 | L1+L3 | not_run |
| AT-17b | R-17 | `discard` | 打开确认框后点「取消」；再打开后按 Esc；再打开后按回车、空格 | 每次都没有执行：工作区文件哈希、`git diff --cached` 都不变；确认框默认焦点在「取消」 | L3 | not_run |
| AT-17c | R-17 | `discard` | 选未跟踪文件和已暂存的新文件，丢弃 | 确认框把两者列在「将删除」；确认后两个文件都不存在，`git ls-files` 里也没有新文件 | L1+L3 | not_run |
| AT-17d | R-17 | AT-17a、AT-17c 之后 | 点提示条「撤销」（另跑一次用命令面板「撤销上一次丢弃」） | 工作区文件哈希、`git diff --cached` 与丢弃前逐字一致；`git for-each-ref refs/tongyun/discard` 有快照 | L1+L3 | not_run |
| AT-17e | R-17 | 丢弃后命令行又改了其中一个文件 | 撤销 | 列出该文件让用户选；选「跳过」时它保持命令行改后的内容，其他文件正常恢复 | L1+L3 | not_run |
| AT-17f | R-17 | `conflict` 拉取后有冲突 | 对冲突文件丢弃 | 入口不可用并说明原因 | L3 | not_run |
| AT-17g | R-17 | `discard` 的 60 MB 未跟踪文件 | 丢弃 | 确认框标出「丢弃后无法恢复」；该文件没有进快照 | L1+L3 | not_run |
| AT-17h | R-17、N-03 | `discard` | 丢弃并确认 | `git rev-parse HEAD`、`git branch --show-current`、`git stash list`、用户 git 配置文件都不变；操作日志有一条记录（含快照引用名） | L1 | not_run |
| AT-17i | R-17 | 连续丢弃 21 次 | 查快照 | `refs/tongyun/discard` 下只保留最近 20 个 | L1 | not_run |
| AT-N3 | N-03 | 全部界面 | 逐个检查菜单和按钮 | 不存在 reset --hard、clean、强制推送入口；丢弃改动只有 R-17 一个入口（右键菜单、快捷键、命令面板都走同一个确认框）；amend 已推送时有警告 | L4 | not_run |
| AT-N4a | N-04 | `longpath`（Windows） | 打开、暂存、提交 | 正常完成 | L4（Windows） | not_run |
| AT-N4b | N-04 | Linux 安装包 | 外部修改文件 | 改动列表自动刷新 | L4（Linux） | not_run |

## 4. 发版前必须通过

- L1 全部通过（三平台）。
- L3 在 ubuntu 上全部通过；Windows 至少跑 AT-01a、AT-05a 路径、AT-06a、AT-12a。
- L4：AT-07a、AT-13a（至少一个平台）、AT-16a、AT-N3、对应平台的 AT-N4。
- 丢弃改动（AT-17a–i）和 amend（AT-06f–j）的 L1 用例必须在三平台都通过，因为它们会改写用户的文件或提交。
- 未执行或被阻塞的项写进发版说明，不算通过。

## 5. 记录方式

每次执行在 `docs/testing/runs/<日期>-<版本或提交>.md`（待建立）记录：版本、平台、执行的用例和结果、失败的最小复现（期望 / 实际 / 证据路径）。偶发失败保留首次失败记录，不靠重跑抹掉。

## 6. 2026-10-11 工作流补充

结果见 [工作流验证记录](runs/2026-10-11-workflows.md)。L1/L2 通过不替代 Windows/Linux 安装包和 L3/L4 验收。

| ID | 需求 | 观察点 | 层 |
| --- | --- | --- | --- |
| AT-18a | R-18 | 真仓库比较分支、cherry-pick、revert、merge，核对文件与历史；脏工作区禁止开始 | L1 |
| AT-18b | R-18 | 取消不执行，确认后错误可见；冲突后解决继续/中止 | L1+L2+L3 |
| AT-18c | R-18 | 目标输入只解析为 OID；合并提交需要主线时拒绝 | L1 |
| AT-V207a | V2-07 | 开始/结束会话，恢复新增/删除/部分暂存文件，HEAD/index 不变，撤回可再撤回 | L1+L2+L3 |
| AT-V207b | V2-07 | 结束后手动编辑、过期预览、HEAD 移动、不同 worktree、越界路径均不能覆盖 | L1+L2 |
| AT-V207c | V2-07 | git gc 后仍可恢复；忽略文件排除；符号链接不可写出仓库 | L1 |
| AT-V203a | V2-03 | 按文件搁置未暂存改动、部分取回，index 不变；新手动改动拒绝覆盖 | L1+L2+L3 |
| AT-V204a | V2-04 | blame 行号/作者/内容正确；分批加载；点击正确提交详情 | L1+L2+L3 |
| AT-V208a | V2-08 | 多 worktree 同名文件重叠提示；无上游显示未知；失效路径独立报错 | L1+L2+L3 |
| AT-V209a | V2-09 | 按行丢弃保留 CRLF/末尾无换行和 index；过期 diff 拒绝；默认取消；备份可恢复 | L1+L2+L3 |
| AT-17j | R-17 | nested/a 与 nested__a 不碰撞；准确还原部分暂存区和丢弃前不存在的文件 | L1 |
| AT-01d | R-01 | 收藏重启仍在、优先切换；外部应用成功打开或明确报错 | L2+L4 |
