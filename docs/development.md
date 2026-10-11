# 开发、CI 与发版

状态：命令与 CI 已建立；当前功能验证见[工作流验证记录](testing/runs/2026-10-11-workflows.md)（以 package.json 和 .github/workflows 为准）。

## 技术栈（已定）

- 桌面宿主：Tauri 2 + Rust（stable）
- Git 底层：`git2`（关闭默认 feature）+ 系统 git 命令行，见 [决策 0001](decisions/0001-git-backend.md)
- 前端：React + TypeScript + Vite + Tailwind CSS 4，组件见 [界面方向](design/ui-direction.md#8-组件选型候选m0--m1-核实版本和许可证)
- 版本以 tongyun-planner 当前锁定的为起点（React 19、TypeScript 5.8、Vite 7、Tailwind 4、Node 20），M0 时核实最新稳定版再定。

## 命令

沿用 tongyun-planner 的脚本命名，便于在两个仓库间切换：

| 目的 | 命令（仓库根目录） | 前提 | 成功条件 | 状态 |
| --- | --- | --- | --- | --- |
| 全量检查 | `npm run check` | Node 20、Rust stable、系统 git（首次需先 `npm run build`） | typecheck、lint、vitest、lint:rust、test:rust 全部通过 | 已建立，2026-10-07 本地通过 |
| 类型检查 | `npm run typecheck` | 依赖已装 | `tsc --noEmit` 零报错 | 已建立，2026-10-07 本地通过 |
| 前端规范 | `npm run lint` | 依赖已装 | ESLint 零错误 | 已建立，2026-10-07 本地通过 |
| 前端测试 | `npm test` | 依赖已装 | Vitest 全部通过，无全跳过 | 已建立，2026-10-07 本地通过 |
| Rust 规范 | `npm run lint:rust` | Rust stable（含 clippy, rustfmt）、需存在 `dist/` | rustfmt 与 clippy 零警告零错误 | 已建立，2026-10-07 本地通过 |
| Rust 测试 | `npm run test:rust`（`cargo test --workspace`） | 系统 git | L1 用例全部通过 | 已建立，2026-10-07 本地通过 |
| 前端构建 | `npm run build` | 依赖已装 | 生成 `dist/` 产物 | 已建立，2026-10-07 本地通过 |
| 本地运行 | `npm run tauri dev` | 平台依赖（Linux 需 webkit2gtk-4.1 等，同 planner） | 窗口启动 | 已建立，2026-10-07 box（Debian 13 + Xvfb）窗口启动，见 [M0 验证记录](testing/runs/2026-10-07-m0.md) |
| 打包 | `npm run tauri build` | 同上 | 产出对应平台安装包 | 已建立，2026-10-07 box 出 deb（3.96 MiB）并能启动；Windows / macOS 走 `build.yml` |
| macOS 独立 QA 包 | `npm run tauri build -- --bundles app --config '{"identifier":"com.tongyun.git.qa","productName":"tongyun-git-qa"}'` | macOS 平台依赖 | 生成独立标识 `.app`，与日常应用设置隔离 | 本机验证见工作流记录；无签名公证 |
| 性能基线 | `cargo run --release -p tg-core --example baseline -- <仓库> [条数]` | 系统 git | 输出一行 JSON | 已建立，结果见决策 0001 |
| 端到端 | `npm run e2e` | 已打包的应用、tauri-driver | L3 用例通过 | 未建立（M6） |

> 注：`npm run check` 包含 Rust 检查（`lint:rust` 与 `test:rust`），Tauri 编译期会核验 `frontendDist`（即 `dist/` 目录）是否存在。全新检出或执行清理后，首次运行 `npm run check` 前需先运行 `npm run build` 生成一次 dist。

## CI

仓库是**私有**的，GitHub Free 账户私有仓库每月共 2000 分钟 Actions 额度，macOS 运行器按约 10 倍扣分钟（以 GitHub 账单页为准）。所以：

- `ci.yml`：PR 和推送到 main 时触发（配置了同一分支并发取消 `concurrency`），只在 `ubuntu-22.04` 单运行器执行。步骤包括检出仓库、安装 Linux 系统依赖、设置 Node 20（带 npm 缓存）、安装 Rust stable（带 clippy 与 rustfmt）、Rust cache（workspace 根目录）、检查系统 git 版本、`npm ci`、`npm run build`（生成 `dist/` 供 Tauri 编译期检查通过）以及 `npm run check`。
- `build.yml`：仅手动触发（`workflow_dispatch`，不监听 push/PR/tag）。在 Windows（x64）、macOS（universal 架构，`--target universal-apple-darwin`）、Linux（`ubuntu-22.04`，打包 AppImage 与 deb）三平台矩阵构建桌面端安装包。使用 `tauri-apps/tauri-action@v0`，不建 Release、不传任何签名密钥、不包含 updater json；构建产物通过 `actions/upload-artifact@v4` 上传（保留 7 天）。上传只包含安装包：Linux 的 AppImage 与 deb、Windows 的 msi 与 nsis、macOS universal 的 dmg 与 `.app`，不包含 AppImage 的解包目录。供里程碑验收和手动安装测试使用。
- `release.yml`：仍未建立（正式发版时再建立：推 `v*` 标签时三平台构建并建 GitHub Release，从 tongyun-planner 的 `release.yml` 复制矩阵与 tauri-action 配置，**去掉 Gitee 镜像步骤**并配置独立的更新签名公私钥）。
- 公开仓库后标准运行器免费，再把 ci.yml 扩成三平台。

## 自动更新与签名

- 私有仓库的 Release 下载需要认证，planner 那种 `releases/latest/download/latest.json` 的更新地址对私有仓库无效。**MVP 不接自动更新**，阿橦从构建产物或 Release 手动安装。
- 公开时再接 Tauri updater：为本应用单独生成一对签名密钥（不复用 planner 的），私钥放 GitHub Actions secrets（`TAURI_SIGNING_PRIVATE_KEY`、`TAURI_SIGNING_PRIVATE_KEY_PASSWORD`），公钥写进 `tauri.conf.json`。第一次公开发版前就要配好，否则重演 planner 1.0 → 1.1 不能自动升级、只能手动重装的问题。
- macOS 未做公证，沿用 planner 的说明（`xattr -cr /Applications/<应用名>.app`）；Windows 未做代码签名，SmartScreen 会提示。是否购买证书在公开时再定。
- Tauri identifier 暂定 `com.tongyun.git`（不以 `.app` 结尾，避免 macOS 的包名冲突警告），名字暂用 tongyun-git（PRD D4）。

## 应用名与标识

显示名和标识只在 `src-tauri/tauri.conf.json` 维护：`productName`（窗口标题、安装包名）、`identifier`（应用配置目录、钥匙串服务名）。Rust 用 `app.config()`、前端用 `@tauri-apps/api/app` 的 `getName()` 在运行时读取，代码里不写死。

以后改名的清单：

1. 改 `tauri.conf.json` 的 `productName`、`identifier`（必须）。
2. 改 identifier 会换一个应用配置目录和钥匙串服务名：用户要重新填 AI key，最近仓库等设置不会自动迁移。公开发版前改名没有这个问题。
3. 次要位置（不影响运行）：`package.json` 的 `name`、`src-tauri/Cargo.toml` 的 package 名、README 标题、GitHub 仓库名。

## 密钥和隐私

- 仓库里不出现任何 key、token、密码，也不放 `.env`（已在 `.gitignore`）。
- AI key 由用户在设置里填写，只存系统钥匙串；应用不内置 key，不读取任何环境变量（包括 `KIE_API_KEY`）。Rust 侧使用，不传给前端，不写日志（PRD D1、[决策 0002](decisions/0002-ai-providers-and-keys.md)）。
- 测试和 CI 不调用真实 AI 接口，用本地测试替身。

## 许可证

当前不放 LICENSE（私有仓库）。**是否开源、用什么许可证，在决定公开仓库时再定。** 依赖的许可证需要在那时一并核对，目前已知：Tauri（MIT / Apache-2.0）、git2（MIT / Apache-2.0）、libgit2（GPLv2 附链接例外，静态链接后闭源或任意开源许可证分发都允许）。

## 暂不做

- 不接 CNB 同步和部署（桌面应用无需部署到服务器）。
- 不同步 Gitee。
