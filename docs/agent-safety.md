# 外部 Agent 入口与持久化审计

## R-19 外部调用与操作关联（2026-10-16）

复用现有 `GitBackend`、`CommitService`、`CliRunner`，新增 `tongyun-git-agent` 二进制。固定 JSON v1 输出，不依赖 GUI 自动点击。

```sh
cargo build -p tg-core --bin tongyun-git-agent
./target/debug/tongyun-git-agent capabilities --json
./target/debug/tongyun-git-agent status --repo ./demo-repo --task task-demo --actor agent:demo
./target/debug/tongyun-git-agent diff --repo ./demo-repo --path demo.txt --task task-demo
./target/debug/tongyun-git-agent history --repo ./demo-repo
```

路径均为调用格式示例，不指向业务仓库。支持 `status / diff / history / commit`。本 CLI 不读取钥匙串、不调用 AI 提供方，也不提供 `tg ai commit --json`。仓库里的 Bridge / MCP 负责上下文与意图推送，和这条受控 Git CLI 是不同入口。外部 Agent 可读取 diff 后使用自己的模型，再把提交信息交给同一 CommitService。

提交必须显式传 `--allow-write --confirm <status 返回的 fingerprint> --message-file <文件>`。指纹绑定 HEAD 和暂存区 index，不隐式暂存、不 amend、不推送。指纹变化拒绝；沿用真实 hooks。返回实际提交 OID，可通过现有 Git workbench 的 revert 流程恢复；不自动撤销远程推送。

CLI 对同一 common Git directory 使用独占 agent lock，正常退出释放；中断残留锁需要人工核查，不能自动删除重试。外部 Git 和桌面仍依赖 Git 自身的 index/ref 锁，不能保证与所有外部编辑器、进程之间的跨文件事务。

## R-15 操作日志补充

- 桌面变更/AI handler 及 workspace_task，在操作之前保存 started，结束后保存 finished。记录动作与目标，不保存密钥、AI 正文、文件正文或完整命令参数。
- 默认审计为 Tauri app_data_dir/audit；CLI 的平台默认目录一致，可用 `--audit-dir` 指定隔离目录。
- 事件 v1 字段：schemaVersion、operationId、taskId、actor、tool、action、target、phase、timestampMs、outcome，与 Dev/API 语义一致。actor/task 是关联标签，不是认证身份。
- 成功的 finished 事件 outcome 为 `succeeded`（桌面 journal 与 CLI 相同）。界面把 `succeeded` 和更早写入的 `completed` 都显示为已完成；其他 finished outcome 显示为失败或结果待核查。
- 读取审计目录时跳过单条损坏的 JSON。其余事件仍返回；目录本身读失败时，操作日志面板仍返回内存中的命令输出。
- 每个事件使用独立 create_new 文件并 sync_all，避免多进程读改写覆盖。开始持久化失败时不执行；结束失败或只有 started 时需要核查真实状态，不得盲目重试。
- Tauri operation_history 返回持久化元数据。原操作日志面板的 CLI 输出缓存仍保留最近 200 条；同时展示持久化元数据，重启后也可读取，不会将未知退出码伪装成 0。
- 清空临时输出不会删除持久化审计；原始 stdout/stderr 未持久化。当前不是防 OS 文件所有者篡改的日志系统。

macOS/Linux 创建目录 0700、文件 0600；Windows 依赖应用数据目录 ACL，未完成 Windows 真机权限验收。核心库作为独立嵌入式库使用时，调用方必须先 journal::configure；桌面和新 CLI 已配置，隔离测试默认不写用户配置目录。

当前没有全新的跨工具总控 UI、自动任务编排或全部桌面动作的外部写入 API。安装包升级、三平台完整 GUI 验收仍需独立执行。
