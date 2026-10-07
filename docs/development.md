# 开发、CI 与发版（计划）

状态：**还没有代码，下面的命令和流水线都未建立**。M0 建立后把「状态」列改为实际结果，并删除「计划」字样。

## 技术栈（已定）

- 桌面宿主：Tauri 2 + Rust（stable）
- Git 底层：`git2`（关闭默认 feature）+ 系统 git 命令行，见 [决策 0001](decisions/0001-git-backend.md)
- 前端：React + TypeScript + Vite + Tailwind CSS 4，组件见 [界面方向](design/ui-direction.md#8-组件选型候选m0--m1-核实版本和许可证)
- 版本以 tongyun-planner 当前锁定的为起点（React 19、TypeScript 5.8、Vite 7、Tailwind 4、Node 20），M0 时核实最新稳定版再定。

## 计划命令

沿用 tongyun-planner 的脚本命名，便于在两个仓库间切换：

| 目的 | 命令（仓库根目录） | 前提 | 成功条件 | 状态 |
| --- | --- | --- | --- | --- |
| 全量检查 | `npm run check` | Node 20、Rust stable、系统 git | typecheck、lint、vitest、cargo test 全部通过 | 未建立 |
| 类型检查 | `npm run typecheck` | 依赖已装 | `tsc --noEmit` 零报错 | 未建立 |
| 前端测试 | `npm test` | 同上 | Vitest 全部通过，无全跳过 | 未建立 |
| Rust 测试 | `npm run test:rust`（`cargo test`） | 系统 git | L1 用例全部通过 | 未建立 |
| 代码规范 | `npm run lint` | 同上 | ESLint 零错误 | 未建立 |
| 本地运行 | `npm run tauri dev` | 平台依赖（Linux 需 webkit2gtk-4.1 等，同 planner） | 窗口启动 | 未建立 |
| 打包 | `npm run tauri build` | 同上 | 产出对应平台安装包 | 未建立 |
| 端到端 | `npm run e2e` | 已打包的应用、tauri-driver | L3 用例通过 | 未建立 |

## CI 计划

仓库是**私有**的，GitHub Free 账户私有仓库每月共 2000 分钟 Actions 额度，macOS 运行器按约 10 倍扣分钟（以 GitHub 账单页为准）。所以：

- `ci.yml`：PR 和推送到 main 时只在 ubuntu 上跑 `npm run check`。
- `build.yml`：手动触发（`workflow_dispatch`），三平台矩阵构建测试包并上传为构建产物，保留 7 天。里程碑结束时跑一次。
- `release.yml`：推 `v*` 标签时三平台构建并建 GitHub Release。从 tongyun-planner 的 `release.yml` 复制矩阵和 tauri-action 配置，**去掉 Gitee 镜像那一步**。
- 公开仓库后标准运行器免费，再把 ci.yml 扩成三平台。

## 自动更新与签名

- 私有仓库的 Release 下载需要认证，planner 那种 `releases/latest/download/latest.json` 的更新地址对私有仓库无效。**MVP 不接自动更新**，阿橦从构建产物或 Release 手动安装。
- 公开时再接 Tauri updater：为本应用单独生成一对签名密钥（不复用 planner 的），私钥放 GitHub Actions secrets（`TAURI_SIGNING_PRIVATE_KEY`、`TAURI_SIGNING_PRIVATE_KEY_PASSWORD`），公钥写进 `tauri.conf.json`。第一次公开发版前就要配好，否则重演 planner 1.0 → 1.1 不能自动升级、只能手动重装的问题。
- macOS 未做公证，沿用 planner 的说明（`xattr -cr /Applications/<应用名>.app`）；Windows 未做代码签名，SmartScreen 会提示。是否购买证书在公开时再定。
- Tauri identifier 暂定 `com.tongyun.git`（不以 `.app` 结尾，避免 macOS 的包名冲突警告），等仓库名定下来再改（PRD Q4）。

## 密钥和隐私

- 仓库里不出现任何 key、token、密码，也不放 `.env`（已在 `.gitignore`）。
- AI key 只从环境变量 `KIE_API_KEY` 或系统钥匙串读取；Rust 侧使用，不传给前端，不写日志。
- 测试和 CI 不调用真实 AI 接口，用本地测试替身。

## 许可证

当前不放 LICENSE（私有仓库）。**是否开源、用什么许可证，在决定公开仓库时再定。** 依赖的许可证需要在那时一并核对，目前已知：Tauri（MIT / Apache-2.0）、git2（MIT / Apache-2.0）、libgit2（GPLv2 附链接例外，静态链接后闭源或任意开源许可证分发都允许）。

## 暂不做

- 不接 CNB 同步和部署（桌面应用无需部署到服务器）。
- 不同步 Gitee。
