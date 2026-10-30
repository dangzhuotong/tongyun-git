# 维护态体检 · 2026-10-29

环境：本机 macOS（Apple Silicon，Node 22.22.2，Rust stable，npm 10.9.7）；分支 `feat/task-8961543836626830194-health-check`，基于 `main`（aefa3ff）。全程在独立工作副本 `repos/tongyun-git-task-8961543836626830194` 操作，不碰主检出目录；测试只写临时夹具仓库，不推送真实远程；AI 用本地替身，钥匙串单元测试用内存替身。

## 实际结果

| 检查 | 结果 |
| --- | --- |
| `npm ci` | 通过（干净目录安装，lockfile 可复现，`tinypool` 覆盖生效） |
| `npm run build` | 通过，生成 `dist/` |
| `npm run check` | 通过：typecheck、ESLint 零错误（8 个既有 warning）、345 个前端测试全过、rustfmt、Clippy 零警告、345 个 Rust 测试全过（220 单元 + 125 集成，1 个 doctest ignored） |
| `npx vitest run --pool=threads` | 通过，345/345（覆盖 `tinypool` 实际使用路径） |
| `npm audit` | critical 2 → 0，high 1 → 0，moderate 2（修复需跨 vitest 大版本，本次不升） |
| `npm run tauri build -- --no-bundle --config src-tauri/tauri.unsigned.json` | 通过，产出 `target/release/tongyun-git`（19.3 MiB） |
| CI（`main` 现状） | 修复前红：`error[E0596]: cannot borrow 'store' as mutable`（#33 引入）；修复后待 PR 流水线复核 |

## 修的问题

1. **CI 红灯（#33 引入）**：`crates/tg-core/src/ai/secret_store.rs` 的 `refuses_symlink_vault` 用例里 `let store = ...` 少了 `mut`，而用例内的 `store.set(...)` 需要 `&mut self`，导致 `tg-core` lib test 编译不过（`error[E0596]`），`npm run check` 走不到 Rust 测试。修法：恢复 `mut`，并按本文件已有的写法加 `#[allow(unused_mut)]`（非 unix 分支下该绑定不会被改写，保留 `mut` 会触发 unused_mut 警告）。
2. **README 打包命令跑不通**：README 写的是 `npx tauri build --no-bundle -- --config src-tauri/tauri.unsigned.json`。`--` 之后是透传给 cargo 的参数，`--config` 被 cargo 当成自己的 TOML 配置项，报 `failed to parse value from --config argument ... as a dotted key expression`。改成 `npm run tauri build -- --no-bundle --config src-tauri/tauri.unsigned.json`（`--config` 留在 `--` 之前交给 tauri）后可正常产出二进制。
3. **文档与仓库实际状态不符**：AGENTS.md 与 docs/development.md 都写「私有仓库」，实际 `gh api repos/dangzhuotong/tongyun-git` 返回 `private: false`，仓库已公开。已按实际情况改正措辞；LICENSE 选型仍未定，不在本次补。
4. **依赖安全告警**：`zod` 升到 4.6.7（`npm audit fix`，同一 major 内）；`tinypool` 用 `overrides` 钉到 2.2.0，清掉两条 critical（RCE 原型污染），不升 vitest。

## 依赖告警明细

| 包 | 修复前 | 修复后 | 处理 |
| --- | --- | --- | --- |
| `zod` | 4.6.5（high，GHSA-mrhx-c7xc-m3w5） | 4.6.7 | `npm audit fix`，同 major |
| `tinypool` | 1.1.1（critical ×2，GHSA-5gmw-xhrv-c9v3、GHSA-85c8-ppgw-ccpr） | 2.2.0（overrides） | 钉住修复版本，不升 vitest |
| `@vitest/mocker` | 3.2.7（moderate ×2，GHSA-82fw-gwwq-j7x9、GHSA-qxg6-89mg-rqv8） | 3.2.7（未改） | 修复需 vitest ≥ 4.1.11（跨大版本），本次只记录 |

`tinypool` 1.1.1 → 2.2.0 的兼容性核对：导出成员完全一致；`Tinypool` 类仅新增可选字段（`filename` 放宽接受 `URL`、新增可选 `serialization`）；`run(task, options?)` 签名不变；`Options` 只增不减。forks 与 threads 两种 pool 各 345 个用例全绿。

`@vitest/mocker` 不能单独覆盖到 4.1.12：mocker 4.x 的 `MockObjectOptions` 把 `spyOn` 改名为 `createMockInstance`，vitest 3 仍传 `spyOn`，无 factory 的 `vi.mock`（automock）会报 ``createMockInstance` is not defined``。本仓库 23 处 `vi.mock` 全带 factory，automock 路径没有覆盖，常规测试不会暴露该不兼容——已用临时用例复现确认后放弃该覆盖。

## 覆盖与边界

- L1 Rust 测试 345 项、L2 前端测试 345 项全过；threads pool 单独跑一遍也全过。
- 只改了 `crates/tg-core/src/ai/secret_store.rs` 的测试绑定、依赖版本、README/AGENTS/docs 措辞；未改接口契约、未动部署、未连线上库、未新增依赖。
- macOS 单平台验证，未跑 Windows/Linux 安装包与 L3 端到端（仓库尚未建立 L3）。
- 打包命令只验证到「产出 release 二进制」，未做安装包验收；仓库现有 CI 不跑 coverage，`npx vitest run --coverage` 因缺 `@vitest/coverage-v8` 无法运行，属既有状况，与本次改动无关。
- 剩下 2 个 moderate 告警需升级 vitest 到 4.x，属于跨大版本变更，需要单独评估后再做。

## 下一步

提交 PR 后由 CI 与审查核对；本次没有推送 main、没有发版、没有合并。
