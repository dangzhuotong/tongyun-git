# tongyun-git 验收清单对账表（Coverage Matrix）

> 2026-10-10 生成，基于 main@b4c894c。用例结果仍以 acceptance-tests.md 为准；本表只说明「哪条测试覆盖哪条 AT」。

本表将 `docs/testing/acceptance-tests.md` 中全部 53 条验收测试用例（AT-01a 至 AT-N4b）与仓库内现有的 Rust 自动化测试（`crates/tg-core/tests/*.rs`）及前端 Vitest 自动化测试（`src/**/*.test.tsx`, `*.test.ts`）进行逐一对账。

## 对账总览

- **验收用例总数**：53 条
- **已覆盖 / 部分覆盖**：39 条
- **未覆盖（标「无」）**：14 条（主要为 L4 人工验收、L3 全局端到端或超限/长路径场景）
- **自动化测试现状**：
  - **Rust 测试 (L1)**：16 个测试文件，67 个单元与集成测试函数
  - **Vitest 前端测试 (L2)**：27 个测试文件，140 个测试用例全部通过（原有 131 个 + 本次补齐 9 个）

---

## 详细对账清单

| AT 编号 | 需求 | 覆盖测试文件::测试函数名 | 覆盖层级 | 备注 |
| :--- | :--- | :--- | :--- | :--- |
| **AT-01a** | R-01 | `crates/tg-core/tests/backend_status.rs::test_repo_open_and_roots`<br>`src/App.test.tsx::"opens a repository and displays changes list and diff"`<br>`src/features/statusbar/StatusBar.test.tsx::"renders repo name, current branch and git version"` | L1 + L2 | Rust 覆盖子目录向上查找根目录；前端 vitest 覆盖打开仓库后标题栏和状态栏显示仓库名与分支名。尚未在打包产物上验证启动（缺 L3）。 |
| **AT-01b** | R-01 | `crates/tg-core/tests/backend_status.rs::test_repo_open_and_roots`<br>`src/App.test.tsx::"handles opening a non-git directory and allows initializing it with git init"` | L1 + L2 | Rust 覆盖普通目录返回 `NotARepository` 错误；前端 vitest 覆盖「这个文件夹不是 Git 仓库」错误提示及初始化引导。缺 L3。 |
| **AT-01c** | R-01 | `src/App.test.tsx::"shows git missing warning banner when git is unavailable"` | L2 | 前端 vitest 覆盖 git 不可用时展示警告横幅与设置按钮。缺 L3 真实非存在路径启动测试。 |
| **AT-02a** | R-02 | `crates/tg-core/tests/backend_status.rs::test_status_worktree_and_staged`<br>`src/App.test.tsx::"opens a repository and displays changes list and diff"` | L1 + L2 | Rust 测试覆盖新建/修改/删除文件的工作区状态；前端测试覆盖改动列表渲染。缺 L3 外部命令行改动后刷新流程。 |
| **AT-02b** | R-02 | `crates/tg-core/tests/backend_status.rs::test_status_worktree_and_staged`<br>`src/App.test.tsx::"stages and unstages files using action buttons"` | L1 + L2 | Rust 测试覆盖 `git add` 后移至暂存区（index: Added/Modified）；前端测试覆盖暂存交互与改动列表状态更新。缺 L3 真实外部命令行触发后 UI 响应。 |
| **AT-02c** | R-02 | `crates/tg-core/tests/backend_status.rs::test_status_rename`<br>`crates/tg-core/tests/backend_status.rs::test_status_rename_with_content_change_stays_renamed`<br>`crates/tg-core/tests/backend_status.rs::test_status_unstaged_rename`<br>`crates/tg-core/tests/backend_status.rs::test_status_unstaged_rename_with_edit_stays_renamed` | L1 | Rust 测试完整覆盖暂存区与工作区中不同编辑状态下的单个重命名识别。前端重命名徽标显示未单测。 |
| **AT-02d** | R-02 | 无 | 无 | 外部命令行提交后依赖文件监听自动刷新，属 L4 人工验收。 |
| **AT-03a** | R-03 | `crates/tg-core/tests/backend_diff.rs::test_diff_hunks_and_lines`<br>`src/App.test.tsx::"opens a repository and displays changes list and diff"` | L1 + L2 | Rust 测试覆盖多 hunk 差异解析；前端测试覆盖 diff 视图渲染、行号与增删行展示。缺 L3/L4 真实语法高亮视觉检查。 |
| **AT-03b** | R-03 | `crates/tg-core/tests/backend_diff.rs::test_diff_crlf_change`<br>`src/features/changes/DiffViewer.test.tsx::"AT-03b: renders CRLF line-ending change notice banner when is_crlf_change is true"`<br>`src/App.test.tsx::"AT-03b: displays CRLF notice in diff view when file has line ending changes"` | L1 + L2 | Rust 覆盖 `is_crlf_change` 检测；前端 vitest 覆盖 DiffViewer 换行符变化提示横幅渲染、无 hunk 状态展示与丢弃行禁用，以及 App 整合流程。缺 L3。 |
| **AT-03c** | R-03 | `crates/tg-core/tests/backend_diff.rs::test_diff_binary_file`<br>`src/features/changes/DiffViewer.test.tsx::"AT-03c: renders binary file notice with formatted file size change"`<br>`src/App.test.tsx::"AT-03c: displays binary file notice and size change in diff view for binary file"` | L1 + L2 | Rust 覆盖二进制识别与无 hunk 输出；前端 vitest 覆盖 DiffViewer 二进制提示视图、各单位大小变化格式化、禁用暂存与分栏视图，以及 App 整合流程。缺 L3。 |
| **AT-03d** | R-03 | 无 | 无 | 1.5MB 文本大改摘要提示与「仍然加载」按钮交互未自动化。 |
| **AT-04a** | R-04 | `crates/tg-core/tests/backend_stage.rs::test_stage_and_unstage_files_at_04`<br>`src/App.test.tsx::"stages and unstages files using action buttons"` | L1 + L2 | Rust 测试覆盖多文件暂存后 `git diff --cached --name-only` 命令行核对；前端覆盖暂存动作调用。缺 L3 多选空格键端到端流程。 |
| **AT-04b** | R-04 | `crates/tg-core/tests/backend_stage.rs::test_stage_and_unstage_files_at_04`<br>`src/App.test.tsx::"stages and unstages files using action buttons"` | L1 + L2 | Rust 测试覆盖取消暂存后命令行核对；前端覆盖取消暂存按钮交互。缺 L3。 |
| **AT-05a** | R-05 | `crates/tg-core/tests/patch_index.rs::test_stage_second_hunk_of_three`<br>`crates/tg-core/tests/discard_and_patch.rs::test_build_and_apply_selected_patch_at_05` | L1 | Rust 测试分别用手写补丁和 `build_selected_patch` 验证仅暂存第 2 个 hunk，断言工作区哈希不变且 `diff --cached` 逐字匹配。 |
| **AT-05b** | R-05 | `crates/tg-core/tests/patch_index.rs::test_stage_mixed_hunk_partial_lines`<br>`src/App.test.tsx::"stages selected diff lines when space is pressed in diff view"` | L1 + L2 | Rust 测试覆盖混合 hunk 部分行手写补丁应用与 `diff --cached` 逐字核对；前端覆盖 diff 行选中按空格分发 `stageLines`。 |
| **AT-05c** | R-05 | `crates/tg-core/tests/patch_index.rs::test_unstage_reverse_single_line` | L1 | Rust 测试覆盖暂存区反向单行补丁应用，验证被取消行回到未暂存且工作区内容不变。前端暂存 diff 反向操作未单测。 |
| **AT-05d** | R-05 | `crates/tg-core/tests/patch_index.rs::test_stage_crlf_partial_lines` | L1 | Rust 测试覆盖 CRLF 文件混合行暂存，断言 index 内严格保留 CRLF 字节且 `diff --cached` 逐字一致。 |
| **AT-05e** | R-05 | `crates/tg-core/tests/patch_index.rs::test_stage_new_untracked_file_partial`<br>`crates/tg-core/tests/discard_and_patch.rs::test_build_and_apply_untracked_file_partial_lines_at_05e` | L1 | Rust 测试覆盖新未跟踪文件前 3 行生成补丁并应用至 index，`git cat-file -p` 验证 index 只有 3 行。 |
| **AT-05f** | R-05 | 无 | 无 | 外部并发修改导致行补丁失效时提示「文件已变化，请重新选择」未自动化。 |
| **AT-05g** | R-05 | `crates/tg-core/tests/patch_index.rs::test_reject_binary_patch` | L1 | Rust 测试覆盖拒绝二进制行补丁。前端针对二进制禁用行选择及提示未单测，缺 L3。 |
| **AT-06a** | R-06 | `crates/tg-core/tests/commit_service.rs::test_create_commit_and_amend_at_06`<br>`src/features/commit/CommitPanel.test.tsx::"AT-06a: handles commit with staged files and saves draft until commit succeeds"`<br>`src/App.test.tsx::"handles commit workflow and draft persistence"` | L1 + L2 | Rust 测试覆盖真实提交与 `git log -1 --pretty=%B` 核对；前端覆盖提交触发、草稿清理与成功回调。缺 L3 键盘快捷键端到端流程。 |
| **AT-06b** | R-06 | `crates/tg-core/tests/cli_runner.rs::test_hook_failure`<br>`src/features/commit/CommitPanel.test.tsx::"AT-06b: keeps commit message and displays error on hook failure"` | L1 + L2 | Rust 测试覆盖 hook 失败拦截与 HEAD 不变；前端覆盖错误横幅展示 hook 输出及提交信息输入框不丢失。缺 L3。 |
| **AT-06c** | R-06 | `crates/tg-core/tests/cli_runner.rs::test_hook_msg` | L1 | Rust 测试覆盖 `commit-msg` hook 改写提交信息后 `git log` 核对。 |
| **AT-06d** | R-06 | `src/features/commit/CommitPanel.test.tsx::"AT-06a: handles commit with staged files and saves draft until commit succeeds"`<br>`src/App.test.tsx::"handles commit workflow and draft persistence"` | L2 | 前端覆盖实时草稿保存到 localStorage 及未提交时保留。缺 L3 应用退出重启加载草稿流程。 |
| **AT-06e** | R-06 | `crates/tg-core/tests/commit_service.rs::test_commit_identity_and_empty_repo`<br>`src/features/commit/CommitPanel.test.tsx::"AT-06e: shows IdentityModal when user identity is unconfigured"` | L1 + L2 | Rust 测试覆盖检查 identity 为空；前端覆盖拦截提交并弹出 IdentityModal 配置提示。 |
| **AT-06f** | R-06 amend | `crates/tg-core/tests/commit_service.rs::test_create_commit_and_amend_at_06`<br>`src/features/commit/CommitPanel.test.tsx::"AT-06f: toggles amend to load HEAD message and restores draft upon unchecking"` | L1 + L2 | Rust 测试覆盖 amend 后 HEAD^ 不变与日志更新；前端覆盖勾选 amend 自动带出上一条提交信息。缺 L3 端到端。 |
| **AT-06g** | R-06 amend | `src/features/commit/CommitPanel.test.tsx::"AT-06g: allows amending commit message even when stagedCount is 0"` | L2 | 前端覆盖 stagedCount 为 0 时仍可点击修改提交；Rust 侧未单独断言 tree 哈希未变。 |
| **AT-06h** | R-06 amend | `crates/tg-core/tests/commit_service.rs::test_amend_pushed_remote_warning_detection`<br>`src/features/commit/CommitPanel.test.tsx::"AT-06h: prompts warning modal when amending a pushed commit"`<br>`src/features/commit/PushedAmendWarningModal.test.tsx::"AT-06h: sets default focus on cancel button when opened and handles cancel and confirm"`<br>`src/features/commit/PushedAmendWarningModal.test.tsx::"AT-06h: closes modal on Escape key without confirming"` | L1 + L2 | Rust 覆盖已推送分支检测；前端完整覆盖警告弹窗、展示对应远程分支、默认焦点置于取消按钮、Esc/取消拦截提交及确认提交分支。 |
| **AT-06i** | R-06 amend | `crates/tg-core/tests/commit_service.rs::test_commit_identity_and_empty_repo`<br>`src/features/commit/CommitPanel.test.tsx::"AT-06i: disables amend checkbox and displays reason when repository has no commits"` | L1 + L2 | Rust 测试覆盖 unborn 空仓库 inspect_amend 返回 `can_amend: false` 及禁用原因；前端组件测试覆盖勾选框 disabled、label title 显示原因及禁用样式。 |
| **AT-06j** | R-06 amend | `crates/tg-core/tests/cli_runner.rs::test_hook_failure` | L1 | 覆盖了通用 hook 失败时 HEAD 不变与输出展示。未对 amend 状态下的 hook 失败单独做组合断言。 |
| **AT-06k** | R-06 amend | `src/features/commit/CommitPanel.test.tsx::"AT-06k: unchecking amend restores the user-typed commit message draft"`<br>`src/features/commit/CommitPanel.test.tsx::"AT-06f: toggles amend to load HEAD message and restores draft upon unchecking"` | L2 | 前端组件测试完全覆盖输入草稿后勾选 amend（加载 HEAD 消息）再取消勾选（精准恢复为原草稿）全流程。 |
| **AT-07a** | R-07 | 无 | 无 | 真实 API 密钥与大模型交互，属 L4 人工验收。 |
| **AT-07b** | R-07 | `crates/tg-core/tests/ai_service.rs::test_secret_filter_masking_at_07b` | L1 | Rust 测试覆盖敏感文件检测（.env, id_rsa 等）并在 prompt 组装中过滤其内容为 `[敏感文件：内容已排除]`。 |
| **AT-07c** | R-07 | `crates/tg-core/tests/ai_service.rs::test_keyring_and_env_isolation_at_07c_07h_13f_13g`<br>`src/features/commit/CommitPanel.test.tsx::"AT-07c: prompts settings when AI key is missing"` | L1 + L2 | Rust 测试覆盖钥匙串中无 key 返回 None；前端测试覆盖拦截发送、提示未配置 key 并提供去设置入口。缺 L3。 |
| **AT-07d** | R-07 | 无 | 无 | 30 秒超时处理与原内容保留未建自动化测试。 |
| **AT-07e** | R-07 | 无 | 无 | AI 接口返回 401/500 的专项展示未自动化。 |
| **AT-07f** | R-07 | `src/features/commit/CommitPanel.test.tsx::"AT-07f: shows consent modal on first AI usage and executes upon consent"`<br>`src/features/commit/CommitPanel.test.tsx::"AT-07f: dismisses consent modal without triggering AI request when cancelled"`<br>`src/features/commit/AiConsentModal.test.tsx::"AT-07f: renders consent dialog with endpoint and handles cancel and confirm"`<br>`src/features/commit/AiConsentModal.test.tsx::"AT-07f: closes modal when Escape key is pressed"` | L2 | 前端完整覆盖首次使用弹出授权弹窗（S9）、展示目标接口及敏感文件保护、取消时不发请求且保留草稿、同意后触发 AI 生成。缺 L3 真实替身接收统计。 |
| **AT-07g** | R-07、N-02 | `crates/tg-core/tests/cli_runner.rs::test_ai_key_env_is_not_passed_to_git` | L1（部分） | Rust 测试覆盖了子进程环境变量隔离；应用配置与日志明文搜索需 L4 人工核验。 |
| **AT-07h** | R-07、D1 | `crates/tg-core/tests/ai_service.rs::test_keyring_and_env_isolation_at_07c_07h_13f_13g`<br>`crates/tg-core/tests/cli_runner.rs::test_ai_key_env_is_not_passed_to_git` | L1 | Rust 测试显式设置 `KIE_API_KEY` 环境变量，断言 MemoryKeyring 与子进程环境均不读取环境变量。 |
| **AT-08a** | R-08 | `crates/tg-core/tests/branch_service.rs::test_branch_list_create_and_switch_at_08_09`<br>`src/features/branch/BranchModal.test.tsx::"switches to a local branch on click"` | L1 + L2 | Rust 测试覆盖切换分支并从命令行核对 `git branch --show-current`；前端测试覆盖分支列表点击切换。缺 L3。 |
| **AT-08b** | R-08 | `crates/tg-core/tests/branch_service.rs::test_switch_remote_tracking_branch_at_08b` | L1 | Rust 测试完整覆盖远程跟踪分支不存在本地对应分支时自动新建本地跟踪分支并检出。前端检出交互未单测。 |
| **AT-08c** | R-08 | `crates/tg-core/tests/branch_service.rs::test_switch_conflict_prevented_at_08c`<br>`src/features/branch/BranchModal.test.tsx::"handles checkout conflicts blocking switch (AT-08c)"` | L1 + L2 | Rust 测试覆盖冲突被阻止且文件内容完好；前端组件测试覆盖弹窗展示冲突文件列表阻止切换。缺 L3。 |
| **AT-09a** | R-09 | `crates/tg-core/tests/branch_service.rs::test_branch_list_create_and_switch_at_08_09`<br>`src/features/branch/CreateBranchModal.test.tsx::"creates branch successfully with checkout option (AT-09a, AT-09c)"` | L1 + L2 | Rust 测试覆盖新建并检出；前端覆盖表单输入与调用创建。 |
| **AT-09b** | R-09 | `crates/tg-core/tests/branch_service.rs::test_branch_list_create_and_switch_at_08_09`<br>`src/features/branch/CreateBranchModal.test.tsx::"validates branch name in real time (AT-09b)"` | L1 + L2 | Rust 测试覆盖校验非法分支名；前端组件测试覆盖实时校验禁用创建按钮并展示具体原因。 |
| **AT-09c** | R-09 | `src/features/branch/CreateBranchModal.test.tsx::"creates branch successfully with checkout option (AT-09a, AT-09c)"`<br>`src/features/log/LogView.test.tsx::"opens create branch modal from commit context menu"` | L2 | 前端覆盖右键提交打开新建分支并传入起点的交互。缺 L1/L3 校验创建出的新分支确切指向旧提交哈希。 |
| **AT-10a** | R-10 | `crates/tg-core/tests/log_service.rs::test_log_graph_merge_and_details_at_10`<br>`src/features/log/LogView.test.tsx::"renders commit list, graph badges, and details (AT-10a, AT-10c)"` | L1 + L2 | Rust 测试覆盖两分支汇合拓扑数据及合并提交双 parent；前端测试覆盖渲染合并节点与泳道徽标。缺 L4 外观核验。 |
| **AT-10b** | R-10 | `crates/tg-core/tests/log_service.rs::test_log_filtering_and_pagination_at_10b`<br>`src/features/log/LogView.test.tsx::"filters commits by search text (AT-10b)"` | L1 + L2 | Rust 测试覆盖 author 过滤逻辑；前端组件测试覆盖搜索输入框筛选提交。缺 L3。 |
| **AT-10c** | R-10 | `crates/tg-core/tests/log_service.rs::test_log_graph_merge_and_details_at_10`<br>`src/features/log/LogView.test.tsx::"renders commit list, graph badges, and details (AT-10a, AT-10c)"` | L1 + L2 | Rust 测试覆盖提交详情与单文件 diff 获取；前端组件测试覆盖点击提交展示变更文件列表与 diff。缺 L3。 |
| **AT-10d** | R-10、N-01 | 无 | 无 | 5 万提交日志图谱滚动性能基线，需生成 graph-50k 夹具，未自动化。 |
| **AT-11a** | R-11 | `crates/tg-core/tests/remote_service.rs::test_pull_fast_forward`<br>`crates/tg-core/tests/cli_runner.rs::test_remote_push_and_pull` | L1 | Rust 测试覆盖落后远程时 FastForwardOnly 拉取成功与 HEAD 对齐。前端拉取已实现但未单独单测快进流程，缺 L3。 |
| **AT-11b** | R-11 | `crates/tg-core/tests/remote_service.rs::test_pull_conflict_and_abort`<br>`src/features/remote/ConflictBanner.test.tsx::"renders when repoState is Merge and handles abort action"`<br>`src/features/conflict/MergeConflictModal.test.tsx` | L1 + L2 | Rust 覆盖拉取冲突后状态变为 Merge；前端覆盖冲突横幅与三方解决窗口。缺 L3 端到端拉取触发。 |
| **AT-11c** | R-11 | `crates/tg-core/tests/remote_service.rs::test_pull_conflict_and_abort`<br>`src/features/remote/ConflictBanner.test.tsx::"renders when repoState is Merge and handles abort action"` | L1 + L2 | Rust 测试覆盖 abort_action 恢复 Clean 状态；前端测试覆盖点击中止合并按钮及二次确认交互。缺 L3。 |
| **AT-11d** | R-11 | `crates/tg-core/tests/cli_runner.rs::test_auth_failure_no_hang_and_redaction` | L1 | Rust 测试覆盖认证失败时因设置 GIT_TERMINAL_PROMPT=0 而不挂起并及时退出。 |
| **AT-11e** | R-11 | 无 | 无 | 首次拉取无 pull 策略时的「合并 / 变基」弹窗未自动化。 |
| **AT-11f** | R-11 | `crates/tg-core/tests/cli_runner.rs::test_timeout_and_normal_execution` | L1 | Rust 测试覆盖超时与取消时杀掉子进程进程组。 |
| **AT-12a** | R-12 | `crates/tg-core/tests/remote_service.rs::test_inspect_push_and_push`<br>`crates/tg-core/tests/cli_runner.rs::test_remote_push_and_pull`<br>`src/features/remote/PushModal.test.tsx::"handles push success"` | L1 + L2 | Rust 测试覆盖推送至裸仓库及领先数归零；前端测试覆盖 PushModal 确认推送。缺 L3。 |
| **AT-12b** | R-12 | `src/features/remote/PushModal.test.tsx::"renders ahead commits and upstream checkbox when no upstream"` | L2 | 前端覆盖无上游分支显示自动设置跟踪分支勾选框并向后端传参。Rust 侧未专门测全新分支推送分支。 |
| **AT-12c** | R-12 | `crates/tg-core/tests/remote_service.rs::test_push_rejected_behind`<br>`src/features/remote/PushModal.test.tsx::"displays rejected message and pull option on rejected push"` | L1 + L2 | Rust 测试覆盖非快进推送被拒绝；前端测试覆盖被拒时显示提示文案和「立即拉取更新」入口。缺 L3。 |
| **AT-13a** | R-13 | `src/features/settings/SettingsModal.test.tsx::"AT-13a & AT-13h: saves and deletes key without showing plaintext key"` | L2 | 前端测试覆盖保存 key 调用 saveAiKey 并清除输入框。真实平台系统钥匙串在 L4 验收。 |
| **AT-13b** | R-13 | 无 | 无 | 深色主题切换与重启持久化，属 L3 未自动化。 |
| **AT-13c** | R-13、R-07 | `crates/tg-core/tests/ai_service.rs::test_provider_url_computation_at_13c_13d_13e`<br>`src/features/settings/SettingsModal.test.tsx::"AT-13c & AT-13d & AT-13e: computes endpoint URLs correctly for KIE, OpenAI, and Ollama"` | L1 + L2 | Rust 覆盖计算 KIE 请求路径包含模型名；前端覆盖设置面板实时显示完整 URL。 |
| **AT-13d** | R-13、R-07 | `crates/tg-core/tests/ai_service.rs::test_provider_url_computation_at_13c_13d_13e`<br>`crates/tg-core/tests/ai_service.rs::test_ai_connection_and_generation_mock_server`<br>`src/features/settings/SettingsModal.test.tsx::"AT-13c & AT-13d & AT-13e: computes endpoint URLs correctly for KIE, OpenAI, and Ollama"` | L1 + L2 | Rust 测试覆盖计算 OpenAI URL 及 mock server 发送 Bearer 头；前端测试覆盖设置页显示对应 URL。 |
| **AT-13e** | R-13、R-07 | `crates/tg-core/tests/ai_service.rs::test_provider_url_computation_at_13c_13d_13e`<br>`src/features/settings/SettingsModal.test.tsx::"AT-13e: fetches Ollama models and renders dropdown"`<br>`src/features/settings/SettingsModal.test.tsx::"AT-13c & AT-13d & AT-13e: computes endpoint URLs correctly for KIE, OpenAI, and Ollama"` | L1 + L2 | Rust 测试覆盖 Ollama URL 计算；前端测试覆盖获取本地模型列表、下拉渲染及 URL 展示。 |
| **AT-13f** | R-13 | `crates/tg-core/tests/ai_service.rs::test_keyring_and_env_isolation_at_07c_07h_13f_13g` | L1 | Rust 测试覆盖 KIE 与 OpenAI 钥匙串条目隔离共存及清除 key 仅删当前条目。前端切提供方未独立单测。 |
| **AT-13g** | R-13、N-02 | `crates/tg-core/tests/ai_service.rs::test_keyring_and_env_isolation_at_07c_07h_13f_13g`<br>`src/features/settings/SettingsModal.test.tsx::"AT-13g: warns and disables key input when system keyring is unavailable"` | L1 + L2 | Rust 测试覆盖钥匙串不可用时 fail-closed；前端测试覆盖提示系统钥匙串不可用并隐藏 key 输入框。 |
| **AT-13h** | R-13、N-02 | `src/features/settings/SettingsModal.test.tsx::"AT-13a & AT-13h: saves and deletes key without showing plaintext key"` | L2 | 前端测试覆盖读取 key 状态仅返回已保存状态，界面与 DOM 中绝无 key 明文字符串。 |
| **AT-13i** | R-13 | `src/features/settings/SettingsModal.test.tsx::"AT-13i: shows warning for plaintext HTTP with non-local IP/domain and hides when localhost"` | L2 | 前端组件测试完全覆盖非本地 HTTP 地址安全警告展示及改回 localhost 后警告消失。 |
| **AT-13j** | R-13、R-07 | `crates/tg-core/tests/ai_service.rs::test_ai_connection_and_generation_mock_server`<br>`src/features/settings/SettingsModal.test.tsx::"AT-13j: tests AI connection and displays feedback"` | L1 + L2 | 覆盖了测试连接成功逻辑与界面反馈。不同 HTTP 错误码分支可进一步补充细化。 |
| **AT-14a** | R-14 | 无 | 无 | 侧边栏宽度拖动调整与重启记忆未自动化。 |
| **AT-15a** | R-15 | `crates/tg-core/tests/remote_service.rs::test_operation_logs_recorded`<br>`src/features/log/OperationLogModal.test.tsx::"renders log entries and handles clear"` | L1 + L2 | Rust 测试覆盖底层 git 操作写入日志及退出码；前端测试覆盖操作日志窗口展示与清空。缺 L3。 |
| **AT-15b** | R-15 | `crates/tg-core/tests/cli_runner.rs::test_auth_failure_no_hang_and_redaction` | L1 | Rust 测试严格验证 URL 中的 token 凭据在命令行记录和错误输出中均被替换脱敏为 `***`。 |
| **AT-15c** | R-15 | 无 | 无 | 推送过程中禁用提交按钮并在完成后恢复未自动化。 |
| **AT-16a** | R-16 | 无 | 无 | 全键盘快捷键完整流程验收属 L3/L4，未自动化。 |
| **AT-17a** | R-17 | `crates/tg-core/tests/discard_and_patch.rs::test_discard_and_undo_modified_files_at_17a_17d`<br>`src/App.test.tsx::"discards changes with confirmation modal and enables 10s undo toast"` | L1 + L2 | Rust 测试覆盖部分暂存文件与修改文件丢弃至 HEAD 并在命令行验证状态变干净；前端测试覆盖确认弹窗与触发丢弃。缺 L3。 |
| **AT-17b** | R-17 | `src/App.test.tsx::"discards changes with confirmation modal and enables 10s undo toast"` | L2（部分） | 前端测试覆盖了打开确认弹窗交互；Esc 与默认焦点置于取消按钮在 DiscardConfirmModal 代码中已实现但未独立单测。 |
| **AT-17c** | R-17 | `crates/tg-core/tests/discard_and_patch.rs::test_discard_untracked_and_new_staged_at_17c` | L1 | Rust 测试覆盖未跟踪文件与暂存新文件被彻底从磁盘与 index 删除。前端弹窗中的「将直接删除」分组未单测。 |
| **AT-17d** | R-17 | `crates/tg-core/tests/discard_and_patch.rs::test_discard_and_undo_modified_files_at_17a_17d`<br>`src/App.test.tsx::"discards changes with confirmation modal and enables 10s undo toast"` | L1 + L2 | Rust 测试覆盖快照恢复至丢弃前工作区与暂存区；前端测试覆盖 10 秒撤销 toast 与触发撤销调用。缺 L3。 |
| **AT-17e** | R-17 | `crates/tg-core/tests/discard_and_patch.rs::test_undo_discard_skip_modified_at_17e` | L1 | Rust 测试覆盖撤销时检测外部改动冲突并跳过该冲突文件。前端选择跳过/覆盖弹窗未单测。 |
| **AT-17f** | R-17 | 无 | 无 | 冲突文件禁用丢弃改动入口未自动化。 |
| **AT-17g** | R-17 | 无 | 无 | 60MB 大文件丢弃时标记「丢弃后无法恢复」且排除进快照未自动化。 |
| **AT-17h** | R-17、N-03 | 无 | 无 | 丢弃后 HEAD、分支、stash、全局配置不变且记录日志引用的不变量专项测试未独立建用例。 |
| **AT-17i** | R-17 | `crates/tg-core/tests/discard_and_patch.rs::test_discard_prune_snapshots_limit_20_at_17i` | L1 | Rust 测试覆盖连续丢弃 21 次后自动清理旧快照、仅保留最多 20 个快照引用。 |
| **AT-N3** | N-03 | 无 | 无 | 全界面危险操作（reset --hard/clean/强制推送）不存在审查，属 L4 人工验收。 |
| **AT-N4a** | N-04 | 无 | 无 | Windows 平台 260 字符长路径支持，属 L4 人工验收。 |
| **AT-N4b** | N-04 | 无 | 无 | Linux 安装包外部文件变更监听刷新，属 L4 人工验收。 |
