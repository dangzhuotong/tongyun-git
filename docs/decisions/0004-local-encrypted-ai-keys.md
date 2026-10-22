# 决策 0004：AI key 改存本机加密文件，不再写入系统钥匙串

状态：已实施（待阿橦合并前确认）。验证见文末。

日期：2026-10-21

取代 [决策 0002](0002-ai-providers-and-keys.md) 里「key 只存系统钥匙串」这一条。提供方、不读环境变量、不把 key 返回前端，仍以 0002 为准。

## 问题

保存 AI key 走 `save_ai_key` → `SystemKeyring::set_key`：服务名 `com.tongyun.git`，账户 `ai-key:<provider>`，`keyring::Entry::set_password`。macOS 把钥匙串项的 ACL 绑在二进制签名上。未签名的开发和每次更新后 cdhash 变了，每次保存都要输入登录钥匙串密码，「始终允许」留不住。

## 决定

1. 新的读写只走 `crates/tg-core/src/ai/secret_store.rs`（自 [tongyun-dev PR #32](https://github.com/dangzhuotong/tongyun-dev/pull/32) 的 `17efa7c` 移植，并补了该提交之后的审查意见）。XChaCha20-Poly1305，密钥是本机 32 字节种子 `secret.key`（mode `0600`）经 HKDF-SHA256 派生。种子用临时文件写完、fsync、再 rename 到最终文件名，并 fsync 父目录，崩溃不会留下半截种子。
2. 文件放在应用数据目录的 `secrets/`。该目录 mode `0700`，目录本身是符号链接则拒绝。**父目录不做符号链接检查**（`create_dir_all` 会跟随，macOS 的 `/tmp` 这类祖先链接仍可用）。
3. 种子创建和读-改-写共用 `lock_store`。这把锁**不可重入**：同一线程在守卫还活着时再调用会因 `flock` 死锁。
4. 已有 vault 但种子丢失时报 `MissingSeed`，**不重新生成种子**。错误信息要写明恢复办法：把 `secret.key` 从备份放回该目录，或删掉 `secrets.vault` 后重新保存 key（旧密文无法解密）。
5. 迁移只在应用启动时跑一次，对 `com.tongyun.git` 下的 `ai-key:kie`、`ai-key:openai`、`ai-key:ollama` 各读一次钥匙串。写入加密文件、fsync、读回校验成功之后才删除旧项。读失败或校验失败不删除、不写完成标记，下次启动再试。删除失败仍记下该账户已完成，之后不再碰它。`NoStorageAccess` 只在 Linux 上视为没有旧项（没有 Secret Service 时仍写完成标记，避免以后每次启动都去碰钥匙串）。macOS 和 Windows 上它是错误（登录钥匙串损坏或暂时不可用），不写标记，下次启动再试。用户取消 macOS 密码框是 `PlatformFailure`，同样不写标记。失败记入操作日志，不挡住启动。保存、清除、状态查询不跑迁移，迁移失败时这三件事仍然可用，也不会再弹授权。删除 key 时记入 `journal.done`，防止旧 key 从钥匙串回灌；启动迁移在单个账号连续失败 3 次后放弃重试并记入 `journal.done`（全量完成时写 `secrets.migrated`），亦可通过 `TONGYUN_SKIP_KEYCHAIN_MIGRATION` 环境变量或 `skip_ai_key_migration` 命令跳过导入，避免 macOS 每次启动反复弹授权窗。全部完成后写 `secrets.migrated`。之后的启动不再调用钥匙串。
6. `get_key` / `set_key` / `delete_key` 不链接到钥匙串调用。`keyring` crate 只留在 `OsKeychain`，供 `migrate_from_os_keychain` 使用。
7. 不读环境变量，不把 key 返回前端，不把明文写入设置 JSON、日志或仓库。加密存储打不开（目录是符号链接、属主不是当前用户、无法创建）时不能保存，界面说明原因，不退回明文。

## 考虑过的方案

| 方案 | 结论 | 原因 |
| --- | --- | --- |
| 继续用系统钥匙串，并给应用做 Apple 签名 | 不作为这次的修法 | 未签名的开发构建和每次更新仍会改 cdhash；「始终允许」留不住 |
| 0002 否决过的「钥匙串不可用时退回加密文件」 | 不采用那种退路 | 现在加密文件是唯一存储，不是钥匙串失败后的明文替身。种子也在本机，能读到应用数据目录的人可以解密；这是为了去掉每次保存的密码框，接受的边界 |
| 每次保存仍先写钥匙串 | 否决 | 正是密码框的来源 |

## 后果与验证

得到的：连续三次在设置里保存 key 不再弹出登录钥匙串密码。旧 key 在启动时自动进入加密文件。用户拒绝授权后，设置里仍能保存新 key，操作日志里有失败记录，下次启动再试。

放弃的：操作系统钥匙串的 ACL。拿到 `secrets/` 目录的人可以同时拿到种子和密文。

验证：

- [x] L1（2026-10-21，Rust 1.99.1）：`cargo fmt --all -- --check` 通过；`cargo clippy --workspace --all-targets -- -D warnings` 通过；`cargo test --workspace` 通过（含 `tg-core` `ai::` 63 条、`tongyun-git` lib 7 条）。覆盖往返、目录 `0700`、拒绝目录/种子/journal 符号链接、父目录符号链接会被跟随、短种子失败关闭、种子缺失不重新生成且错误含恢复说明、并发首次创建共用一把种子、迁移后连续三次 `set` 不再读旧后端、校验失败不删旧项、删除失败仍不再读、legacy 读取失败后保存和状态仍可用、`NoStorageAccess` 仅在 Linux 策略下视为没有旧项、命令层保存/清除/状态在迁移失败后仍成功且不写完成标记、迁移失败写入 journal。前端设置弹窗单测此前 10 通过，这次没有改界面。
- [ ] L4：macOS 上连续三次保存设置里的 AI key，不出现登录钥匙串密码框；已有钥匙串 key 在打开应用后仍可用于 AI。合并前需阿橦确认（密钥存储，AGENTS.md 高风险）。
