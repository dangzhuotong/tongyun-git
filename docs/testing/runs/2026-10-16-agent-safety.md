# Agent 外部入口与审计验收 · 2026-10-16

基线 82e4cd0，分支 codex/agent-safety-trace，macOS；仅临时夹具仓库，未向真实远程推送，未读取系统 AI 密钥。

- `npm run check`：类型、ESLint、165 个前端测试、rustfmt、Clippy、137 个 Rust 测试全部通过，无失败/忽略。
- `npm run build`：通过。
- 新 CLI 真实子进程测试：capabilities/status/diff/history；缺写入确认拒绝；修改 index 后旧指纹拒绝；正确指纹产生真实提交；重试旧指纹不产生新提交；真实 hook 拒绝时 HEAD 不动；审计路径不可用时不提交。
- 独立进程读取持久化事件，任务和 actor 保持；事件不包含提交信息正文。通用事件测试覆盖开始/结束独立落盘和中断仅留下 started。
- 前端新增回归：持久化 started 显示「进行中或待核查」，不显示虚假的退出码；任务与 actor 可见。该项是 React DOM 测试，未声称真实应用截图验收。
- 跨工具联调（Dev/scripts/cross-tool-smoke.py）：真实 Dev 启动临时服务、API Runner 请求成功、Git 真实提交、Dev 停止。共用 taskId 和隔离审计目录，8 项操作全部有 started/finished；服务已停止。

最初质量门禁发现新测试文件尚未 rustfmt，格式修正后完整门禁通过。没有重跑掩盖业务断言失败。

当前已实现入口及限制见 [Agent 安全与追溯](../../agent-safety.md)。未执行真实提供方/钥匙串、三平台安装包 GUI、全部桌面动作的外部写入接口或多外部进程同时变更的验收。代码位于修复分支，本轮未提交推送。
