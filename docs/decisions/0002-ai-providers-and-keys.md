# 决策 0002：AI 提供方由用户选择，key 由用户填写

状态：提供方与「不读环境变量」已实施。**key 的存放位置改由 [决策 0004](0004-local-encrypted-ai-keys.md) 规定**（本机加密文件，不再写入系统钥匙串）。

日期：2026-10-07；存放位置 2026-10-21 被 0004 取代

## 问题

R-07 的 AI 写提交信息需要调用大模型接口。原方案默认 KIE，key 依次从环境变量 `KIE_API_KEY` 和系统钥匙串读取（PRD 原 Q1）。问题：

- 现有 KIE key 可能设了只允许服务器 IP 的白名单，桌面端直连会失败。
- 读环境变量会让应用在用户不知情时用上 shell 里的某把 key，也让「key 从哪来」不透明。
- 以后仓库公开、给别人用时，不能假设别人有 KIE。

## 决定

1. 应用**不内置任何 key**，也**不读取任何环境变量**里的 key。key 只能由用户在设置页填写。
2. 支持三种提供方，都走 chat completions 格式、流式返回：
   - KIE：`https://api.kie.ai/<模型>/v1/chat/completions`，必须有 key。
   - OpenAI 兼容接口：用户填 base URL，应用接 `/chat/completions`，必须有 key。
   - Ollama：默认 `http://localhost:11434`，用 `/v1/chat/completions`，模型列表读 `/api/tags`，key 可选。
3. key 按提供方分开存放，只在 Rust 层读取；Tauri 命令只返回 `has_key: bool`，不把 key 返回给前端。存放位置见 [决策 0004](0004-local-encrypted-ai-keys.md)。旧钥匙串账户仍是服务名 `com.tongyun.git`、账户 `ai-key:<kie|openai|ollama>`，只在迁移时读一次。
4. 加密存储不可用时不能保存 key，界面说明原因；**不退回明文文件**。
5. L1 测试用内存替身和本地 HTTP 替身，CI 不调用真实提供方，也不调用真实钥匙串。

## 考虑过的方案

| 方案 | 结论 | 原因 |
| --- | --- | --- |
| 环境变量 `KIE_API_KEY` 优先 + 钥匙串（原方案） | 否决 | 来源不透明；IP 白名单下桌面端不可用；不利于以后给别人用 |
| 应用内置一把有额度上限的 key | 否决 | 打包进安装包等于公开 key；阿橦明确不要内置 |
| 钥匙串不可用时退回加密文件 | 当时否决；2026-10-21 由 [决策 0004](0004-local-encrypted-ai-keys.md) 改为加密文件是唯一存储，不是失败后退回明文 |
| 只支持 OpenAI 兼容一种，KIE 用「地址模板」 | 否决 | KIE 把模型放在路径里，让用户自己写模板容易出错；Ollama 的模型列表需要单独接口 |

## 后果与验证

得到的：key 来源只有一个、可解释；没有 KIE 或 KIE 有白名单时可以换服务商或本机 Ollama；仓库和安装包里不可能带 key。

放弃的：在 shell 里设环境变量就能直接用的便利。Linux 没有 Secret Service 时的限制已由 [决策 0004](0004-local-encrypted-ai-keys.md) 取消。

验证（存放位置的验收写在决策 0004）：

- [ ] AT-07c、AT-07h：没有已保存的 key 时不发请求，设了 `KIE_API_KEY` 也不读。
- [ ] AT-13c / d / e：三种提供方的请求地址、`Authorization` 头、模型名符合上面的规则。
- [ ] AT-13f / g / h：按提供方分别存取；加密存储不可用时不落明文；前端拿不到 key。
- [ ] AT-07g、AT-13a：用过之后在仓库、设置 JSON、日志里搜不到 key 明文。
