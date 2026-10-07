# 决策 0001：Git 底层用 git2（libgit2），网络和提交走系统 git 命令行

状态：已实施（M0，2026-10-07）。验证结果见文末；三平台编译一项以手动 `build.yml` 的运行结果为准。

日期：2026-10-07

## 问题

tongyun-git 是 Tauri 2 + Rust 的桌面 Git 客户端。Rust 侧需要一个 Git 底层，候选是 gitoxide（`gix`）和 `git2`（libgit2 的 Rust 绑定）。MVP 要求：读状态和 diff、按文件和按行暂存、提交、切换和新建分支、提交树图、push 和 pull。v2 还要：合并冲突、交互式 rebase、stash、worktree、blame。

已知约束：

- 用户的仓库里普遍有 pre-commit、commit-msg 这类 hook（husky、lint-staged），提交时必须照常执行。
- 推送和拉取要沿用用户机器上已经配好的认证：Windows 的 Git Credential Manager、macOS 钥匙串、`~/.ssh/config`、ssh-agent、代理设置。应用自己不保存任何 Git 凭据。
- 要在 Windows、macOS（universal）、Linux（Ubuntu 22.04）三个平台出包，沿用 tongyun-planner 的 CI 矩阵。

## 两个库的现状（2026-10-07 查证）

| 维度 | gix 0.88.0（2026-09-25） | git2 0.21.0 / libgit2 1.9.x（2026-10-06） |
| --- | --- | --- |
| push | **不支持**。官方 README 和 crate-status 都把 push 标为未完成（send-pack 客户端、report-status 都没做） | 支持（HTTPS、SSH 走回调） |
| fetch / clone | 支持 | 支持 |
| 认证 | 有 `gix-credentials`，能调用 git 的 credential helper | 要自己写回调；SSH 依赖 libssh2，不读 `~/.ssh/config`，不认 ssh-agent 以外的很多配置；不直接集成 GCM |
| 状态、diff | 支持，status 性能好 | 支持，大仓库较慢（不支持 fsmonitor、untracked cache） |
| 写 index（暂存） | 能读写 `.git/index` | 支持，且有 `Repository::apply(diff, ApplyLocation::Index)`，可配合按 hunk 过滤的回调；按行暂存可先生成补丁再应用 |
| 提交 | 能写 commit 对象，**不执行 hook** | 能写 commit，**不执行 hook**，也不自动签名 |
| checkout / switch / reset | porcelain 未完成（crate-status 里未勾选） | 支持 |
| merge | blob、tree 级合并有，commit 级合并未完成 | 支持（merge、merge_analysis、冲突索引） |
| rebase | 未实现 | 有 `git_rebase` 系列 API，可逐条驱动 |
| stash | 未实现 | 支持 |
| worktree | 能 checkout 工作树，管理链接 worktree 的能力有限 | 支持 add / list / prune |
| blame | 有（plumbing 级） | 支持，但大文件慢 |
| 许可证 | MIT 或 Apache-2.0 | git2：MIT 或 Apache-2.0；libgit2：GPLv2 附链接例外，闭源或开源分发都可以 |
| 三平台构建 | 纯 Rust，最省事 | 需要编译 C 代码（`libgit2-sys` 自带源码）。关掉默认 feature 后不依赖 OpenSSL 和 libssh2，构建难度和 Tauri 本身差不多 |

两者都不执行 hook、都不完整复刻用户的认证环境。IntelliJ IDEA、Fork、GitHub Desktop 这类成熟客户端，写操作和网络操作基本都调用系统的 git 命令行，这也是它们 hook 和认证「天然就对」的原因。

## 决定

1. **进程内底层用 `git2`**，关闭默认 feature（不带 https、ssh），只做本地操作：读状态、算 diff、写 index（按文件、hunk、行暂存）、读提交历史画树图、读分支和引用、checkout 和新建分支。v2 的 stash、rebase 驱动、worktree 管理、blame 也先用它。
2. **以下操作调用系统 `git` 命令行**（经统一的 `CliRunner` 执行，记录命令和输出，展示在「操作日志」面板）：
   - `fetch`、`pull`、`push`：沿用用户的 credential helper、SSH 配置、代理和 pre-push hook。
   - `commit`：用 `git commit -F <临时文件>`，保证 pre-commit、commit-msg hook 和 commit 签名（gpg / ssh signing）照常生效。
   - 中止合并或 rebase：`git merge --abort`、`git rebase --abort`。
3. Rust 侧定义 `GitBackend` trait，界面层只依赖 trait，不直接依赖 git2，方便以后整体或局部换成 gix。
4. **gix 列为后续性能优化候选**：当大仓库的 status 或日志加载达不到目标时，先在只读路径（status、revwalk）上换 gix，写路径不动。gix 补齐 push 和 checkout 后再评估整体迁移。
5. 运行前提：用户机器装有 git。最低版本 2.30（M0 定，代码常量 `tg_core::MIN_GIT_VERSION`）；找不到 git 时在启动页提示安装，并允许在设置里手动指定路径。

一句话理由：**gix 现在还不能 push，也没有 checkout、rebase、stash；git2 功能齐、最成熟，再把 hook 和认证敏感的操作交给系统 git，这是行为最接近用户习惯、风险最小的组合。**

## 考虑过的方案

| 方案 | 结论 | 主要原因 |
| --- | --- | --- |
| 纯 gix | 否决 | push 不可用，checkout/reset/rebase/stash 缺 porcelain，MVP 都做不完 |
| 纯 git2（含网络和提交） | 否决 | 不执行 hook；认证要自己重写，SSH 配置和 GCM 很难对齐；还要带 OpenSSL / libssh2，三平台构建更麻烦 |
| 全部调用 git 命令行 | 部分采纳 | 行为最准，但读状态、diff、日志要频繁起进程和解析文本，按行暂存要拼补丁；只把它用在写和网络上 |
| git2 为主 + 写和网络走命令行（选定） | 采纳 | 见上 |
| gix 读 + git2 写 + 命令行网络 | 暂缓 | 两个库同时维护，MVP 阶段成本不划算；性能不达标时再引入 |

## 后果与验证

得到的：MVP 范围内的功能都有成熟实现；hook、签名、认证和用户命令行里的表现一致；不用 OpenSSL，三平台构建简单。

放弃的：要求用户装 git（面向开发者，可接受）；网络和提交操作要解析命令行输出（统一设 `LC_ALL=C`、`GIT_TERMINAL_PROMPT=0`，用 `--porcelain` 等稳定格式）；libgit2 在超大仓库上 status 偏慢。

M0 技术验证（可观察的验收条件，结果写回本文件）：

- [x] 带 `git2`（`default-features = false` + `vendored-libgit2`，git2 0.21.0 / libgit2 1.9.7）的空 Tauri 应用：Linux 本地 `tauri build` 出 deb 并能启动（box，Debian 13）；ubuntu CI 编译通过。Windows / macOS 由手动 `build.yml` 验证，结果记在 [M0 验证记录](../testing/runs/2026-10-07-m0.md)。
- [x] 按行暂存补丁逐字一致：`crates/tg-core/tests/patch_index.rs` 6 个用例（3 个 hunk 选 1 个、混合 hunk 选 1 删 1 增、CRLF、新文件部分暂存、末尾无换行、反向取消一行）全部通过；预期补丁在测试里手写。新文件直接用 `new file mode` 补丁应用到 index，不需要 `git add -N`。补丁本身由谁生成（M2 的行选择 → 补丁）还没做。
- [x] `git commit -F` 触发 pre-commit，失败时拿到退出码和 `HOOK FAILED` 输出、HEAD 不变；commit-msg 改写信息生效（`tests/cli_runner.rs`）。
- [x] `file://` 裸仓库 push、pull 跑通；指向不可连接地址的 fetch 在 30 秒内返回；带 `user:secret@` 的地址在命令行和输出里被打码。超时会杀掉整个进程组（Unix）。
- [x] 性能基线（box，release 构建，3 次取中位数，`cargo run --release -p tg-core --example baseline`）：
  - tauri-apps/tauri（1091 个文件，6299 个提交）：open 0.22 ms、首次 status 11.5 ms、走完 6299 个提交 89 ms。
  - git/git（4857 个文件，82443 个提交）：open 0.41 ms、首次 status 22.5 ms、前 1 万个提交 251 ms（冷缓存第一次 1157 ms）。`TOPOLOGICAL` 排序要先遍历整张图，M4 做树图分批加载时要考虑只用时间排序或增量拓扑。
  - 只是 box 上的数字，不代表 Windows / macOS；N-01 阈值仍待阿橦机器上测。

参考：

- gitoxide README 与 crate-status：https://github.com/GitoxideLabs/gitoxide
- gix 文档：https://docs.rs/gix/latest/gix/
- git2 文档：https://docs.rs/git2/latest/git2/
