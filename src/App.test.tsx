import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import App from "./App.tsx";
import * as host from "./lib/host.ts";

vi.mock("./lib/host.ts", () => ({
  getAppInfo: vi.fn(),
  checkGit: vi.fn(),
  openRepository: vi.fn(),
  getRepoStatus: vi.fn(),
  getFileDiff: vi.fn(),
  stageFiles: vi.fn(),
  unstageFiles: vi.fn(),
  stageLines: vi.fn(),
  inspectDiscard: vi.fn(),
  discardFiles: vi.fn(),
  undoDiscard: vi.fn(),
  checkCommitIdentity: vi.fn(),
  inspectAmend: vi.fn(),
  createCommit: vi.fn(),
  getAiKeyStatus: vi.fn(),
  saveAiKey: vi.fn(),
  deleteAiKey: vi.fn(),
  testAiConnection: vi.fn(),
  fetchOllamaModels: vi.fn(),
  generateAiCommitMessage: vi.fn(),
  listBranches: vi.fn(),
  validateBranchName: vi.fn(),
  createBranch: vi.fn(),
  switchBranch: vi.fn(),
  getCommitLog: vi.fn(),
  getCommitDetails: vi.fn(),
  getCommitFileDiff: vi.fn(),
  pullRemote: vi.fn(),
  fetchRemote: vi.fn(),
  selectFolder: vi.fn(),
  initRepository: vi.fn(),
  listRepoFiles: vi.fn(),
  getFileHistory: vi.fn(),
  workspaceTask: vi.fn(async () => ({
    active: false,
    session_reference: null,
    session_label: null,
    action_taken: null,
    warning: null,
  })),
}));

describe("App workspace and components", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    vi.mocked(host.inspectAmend).mockResolvedValue({
      can_amend: false,
      disabled_reason: null,
      head_message: null,
      is_pushed: false,
      pushed_remote_branches: [],
    });
    vi.mocked(host.getAiKeyStatus).mockResolvedValue({
      kie: false,
      openai: false,
      ollama: false,
      keyring_available: true,
    });
    vi.mocked(host.listBranches).mockResolvedValue([
      {
        name: "main",
        is_head: true,
        is_remote: false,
        upstream: "origin/main",
        ahead: 0,
        behind: 0,
        target_oid: "a1b2c3d",
      },
    ]);
    vi.mocked(host.getCommitLog).mockResolvedValue({
      commits: [],
      has_more: false,
      total_matched: 0,
    });
    vi.mocked(host.listRepoFiles).mockResolvedValue([]);
    vi.mocked(host.getFileHistory).mockResolvedValue([]);
    vi.mocked(host.workspaceTask).mockResolvedValue({
      active: false,
      session_reference: null,
      session_label: null,
      action_taken: null,
      warning: null,
    });
  });

  it("renders empty workspace when no repository is opened", async () => {
    vi.mocked(host.getAppInfo).mockResolvedValue({
      name: "tongyun-git",
      version: "0.0.0",
      identifier: "test-id",
      git_version: "2.47.3",
      libgit2_version: "1.9.7",
    });
    vi.mocked(host.checkGit).mockResolvedValue({
      available: true,
      version: "git version 2.47.3",
      error: null,
    });

    render(<App />);

    expect(await screen.findByText("没有打开的仓库")).toBeDefined();
    expect(screen.getByText("打开本地仓库")).toBeDefined();
    expect(screen.getByText("未打开仓库")).toBeDefined();
  });

  it("shows git missing warning banner when git is unavailable", async () => {
    vi.mocked(host.getAppInfo).mockResolvedValue({
      name: "tongyun-git",
      version: "0.0.0",
      identifier: "test-id",
      git_version: null,
      libgit2_version: "1.9.7",
    });
    vi.mocked(host.checkGit).mockResolvedValue({
      available: false,
      version: null,
      error: "Git not found",
    });

    render(<App />);

    expect(
      await screen.findByText(/Git not found/)
    ).toBeDefined();
    expect(screen.getByText("设置 Git 路径")).toBeDefined();
  });

  it("opens a repository and displays changes list and diff", async () => {
    vi.mocked(host.getAppInfo).mockResolvedValue({
      name: "tongyun-git",
      version: "0.0.0",
      identifier: "test-id",
      git_version: "2.47.3",
      libgit2_version: "1.9.7",
    });
    vi.mocked(host.checkGit).mockResolvedValue({
      available: true,
      version: "git version 2.47.3",
      error: null,
    });
    vi.mocked(host.openRepository).mockResolvedValue({
      root_path: "/test/my-repo",
      name: "my-repo",
      head: {
        branch: "main",
        oid: "abc1234",
        unborn: false,
      },
    });
    vi.mocked(host.getRepoStatus).mockResolvedValue({
      head: {
        branch: "main",
        oid: "abc1234",
        unborn: false,
      },
      files: [
        {
          path: "src/main.rs",
          old_path: null,
          index: null,
          worktree: "Modified",
          conflicted: false,
        },
        {
          path: "README.md",
          old_path: null,
          index: "Added",
          worktree: null,
          conflicted: false,
        },
      ],
    });
    vi.mocked(host.getFileDiff).mockResolvedValue({
      path: "src/main.rs",
      old_path: null,
      staged: false,
      is_binary: false,
      old_size: 100,
      new_size: 120,
      is_crlf_change: false,
      is_large: false,
      hunks: [
        {
          old_start: 1,
          old_lines: 3,
          new_start: 1,
          new_lines: 4,
          header: "@@ -1,3 +1,4 @@",
          lines: [
            { origin: " ", old_lineno: 1, new_lineno: 1, content: "fn main() {" },
            { origin: "-", old_lineno: 2, new_lineno: null, content: '    println!("old");' },
            { origin: "+", old_lineno: null, new_lineno: 2, content: '    println!("new");' },
            { origin: " ", old_lineno: 3, new_lineno: 3, content: "}" },
          ],
        },
      ],
    });

    render(<App />);

    // Click "打开本地仓库" to open modal
    const openBtn = await screen.findByText("打开本地仓库");
    fireEvent.click(openBtn);

    // Enter path and submit
    const input = screen.getByPlaceholderText(/例如: D:\/TD\/projects\/my-repo/);
    fireEvent.change(input, { target: { value: "/test/my-repo" } });
    const submitBtn = screen.getByRole("button", { name: "打开" });
    fireEvent.click(submitBtn);

    // Verify repository is rendered
    expect((await screen.findAllByText("my-repo")).length).toBeGreaterThanOrEqual(1);
    expect((await screen.findAllByText("main")).length).toBeGreaterThanOrEqual(1);

    // Verify files rendered in list
    expect(await screen.findByTitle("src/main.rs")).toBeDefined();
    expect(screen.getAllByText("README.md").length).toBeGreaterThanOrEqual(1);

    // Click on src/main.rs to load diff
    fireEvent.click(screen.getByTitle("src/main.rs"));

    // Verify diff content
    await waitFor(() => {
      expect(screen.getByText((_, el) => el?.textContent?.trim() === 'println!("new");')).toBeDefined();
    });
    expect(screen.getByText((_, el) => el?.textContent?.trim() === 'println!("old");')).toBeDefined();
    expect(screen.getByText("@@ -1,3 +1,4 @@")).toBeDefined();
  });

  it("stages and unstages files using action buttons", async () => {
    vi.mocked(host.getAppInfo).mockResolvedValue({
      name: "tongyun-git",
      version: "0.0.0",
      identifier: "test-id",
      git_version: "2.47.3",
      libgit2_version: "1.9.7",
    });
    vi.mocked(host.checkGit).mockResolvedValue({
      available: true,
      version: "git version 2.47.3",
      error: null,
    });
    vi.mocked(host.openRepository).mockResolvedValue({
      root_path: "/test/my-repo",
      name: "my-repo",
      head: { branch: "main", oid: "abc1234", unborn: false },
    });
    vi.mocked(host.getRepoStatus).mockResolvedValue({
      head: { branch: "main", oid: "abc1234", unborn: false },
      files: [
        {
          path: "src/main.rs",
          old_path: null,
          index: null,
          worktree: "Modified",
          conflicted: false,
        },
        {
          path: "README.md",
          old_path: null,
          index: "Added",
          worktree: null,
          conflicted: false,
        },
      ],
    });
    vi.mocked(host.stageFiles).mockResolvedValue();
    vi.mocked(host.unstageFiles).mockResolvedValue();

    render(<App />);

    const openBtn = await screen.findByText("打开本地仓库");
    fireEvent.click(openBtn);
    const input = screen.getByPlaceholderText(/例如: D:\/TD\/projects\/my-repo/);
    fireEvent.change(input, { target: { value: "/test/my-repo" } });
    fireEvent.click(screen.getByRole("button", { name: "打开" }));

    // Find and click the stage button (+) on src/main.rs
    const stageBtn = await screen.findByTitle("暂存此文件 (空格)");
    fireEvent.click(stageBtn);

    await waitFor(() => {
      expect(host.stageFiles).toHaveBeenCalledWith("/test/my-repo", ["src/main.rs"]);
    });

    // Find and click the unstage button (-) on README.md
    const unstageBtn = screen.getByTitle("取消暂存此文件");
    fireEvent.click(unstageBtn);

    await waitFor(() => {
      expect(host.unstageFiles).toHaveBeenCalledWith("/test/my-repo", ["README.md"]);
    });
  });

  it("stages selected diff lines when space is pressed in diff view", async () => {
    vi.mocked(host.getAppInfo).mockResolvedValue({
      name: "tongyun-git",
      version: "0.0.0",
      identifier: "test-id",
      git_version: "2.47.3",
      libgit2_version: "1.9.7",
    });
    vi.mocked(host.checkGit).mockResolvedValue({
      available: true,
      version: "git version 2.47.3",
      error: null,
    });
    vi.mocked(host.openRepository).mockResolvedValue({
      root_path: "/test/my-repo",
      name: "my-repo",
      head: { branch: "main", oid: "abc1234", unborn: false },
    });
    vi.mocked(host.getRepoStatus).mockResolvedValue({
      head: { branch: "main", oid: "abc1234", unborn: false },
      files: [
        {
          path: "src/main.rs",
          old_path: null,
          index: null,
          worktree: "Modified",
          conflicted: false,
        },
      ],
    });
    vi.mocked(host.getFileDiff).mockResolvedValue({
      path: "src/main.rs",
      old_path: null,
      staged: false,
      is_binary: false,
      old_size: 100,
      new_size: 120,
      is_crlf_change: false,
      is_large: false,
      hunks: [
        {
          old_start: 1,
          old_lines: 2,
          new_start: 1,
          new_lines: 3,
          header: "@@ -1,2 +1,3 @@",
          lines: [
            { origin: " ", old_lineno: 1, new_lineno: 1, content: "fn main() {" },
            { origin: "+", old_lineno: null, new_lineno: 2, content: '    let x = 1;' },
            { origin: " ", old_lineno: 2, new_lineno: 3, content: "}" },
          ],
        },
      ],
    });
    vi.mocked(host.stageLines).mockResolvedValue();

    render(<App />);

    const openBtn = await screen.findByText("打开本地仓库");
    fireEvent.click(openBtn);
    const input = screen.getByPlaceholderText(/例如: D:\/TD\/projects\/my-repo/);
    fireEvent.change(input, { target: { value: "/test/my-repo" } });
    fireEvent.click(screen.getByRole("button", { name: "打开" }));

    // Select src/main.rs to open diff
    const fileItem = await screen.findByTitle("src/main.rs");
    fireEvent.click(fileItem);

    // Wait for diff line to render
    const diffLine = await screen.findByText((_, el) => el?.textContent?.trim() === "let x = 1;");
    fireEvent.click(diffLine);

    // Press space to stage the selected line
    fireEvent.keyDown(window, { key: " " });

    await waitFor(() => {
      expect(host.stageLines).toHaveBeenCalledWith(
        "/test/my-repo",
        "src/main.rs",
        0,
        [1],
        false,
        false
      );
    });
  });

  it("discards changes with confirmation modal and enables 10s undo toast", async () => {
    vi.mocked(host.getAppInfo).mockResolvedValue({
      name: "tongyun-git",
      version: "0.0.0",
      identifier: "test-id",
      git_version: "2.47.3",
      libgit2_version: "1.9.7",
    });
    vi.mocked(host.checkGit).mockResolvedValue({
      available: true,
      version: "git version 2.47.3",
      error: null,
    });
    vi.mocked(host.openRepository).mockResolvedValue({
      root_path: "/test/my-repo",
      name: "my-repo",
      head: { branch: "main", oid: "abc1234", unborn: false },
    });
    vi.mocked(host.getRepoStatus).mockResolvedValue({
      head: { branch: "main", oid: "abc1234", unborn: false },
      files: [
        {
          path: "src/main.rs",
          old_path: null,
          index: null,
          worktree: "Modified",
          conflicted: false,
        },
      ],
    });
    vi.mocked(host.inspectDiscard).mockResolvedValue([
      {
        path: "src/main.rs",
        will_delete: false,
        unrestorable: false,
        size: 1024,
      },
    ]);
    vi.mocked(host.discardFiles).mockResolvedValue({
      snapshot_ref: "refs/tongyun/discard/1712500000",
      discarded_count: 1,
      unrestorable_files: [],
    });
    vi.mocked(host.undoDiscard).mockResolvedValue({
      restored_count: 1,
      skipped_files: [],
    });

    render(<App />);

    const openBtn = await screen.findByText("打开本地仓库");
    fireEvent.click(openBtn);
    const input = screen.getByPlaceholderText(/例如: D:\/TD\/projects\/my-repo/);
    fireEvent.change(input, { target: { value: "/test/my-repo" } });
    fireEvent.click(screen.getByRole("button", { name: "打开" }));

    // Wait for file list to render
    await screen.findByTitle("src/main.rs");

    // Click discard button on src/main.rs
    const discardBtn = await screen.findByTitle("丢弃此文件的改动 (Ctrl+Alt+Z)");
    fireEvent.click(discardBtn);

    // Verify confirmation modal opens
    expect(host.inspectDiscard).toHaveBeenCalledWith("/test/my-repo", ["src/main.rs"]);
    expect(await screen.findByText("丢弃改动确认")).toBeDefined();
    expect(screen.getByText("确定要丢弃所选文件的全部改动吗？")).toBeDefined();

    // Confirm discard
    const confirmBtn = screen.getByRole("button", { name: "丢弃 1 个文件的改动" });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(host.discardFiles).toHaveBeenCalledWith("/test/my-repo", ["src/main.rs"]);
    });

    // Verify 10-second undo toast appears
    expect(await screen.findByText(/已丢弃 1 个文件改动，快照已建立/)).toBeDefined();
    const undoBtn = screen.getByRole("button", { name: "撤销丢弃" });

    // Click undo
    fireEvent.click(undoBtn);
    await waitFor(() => {
      expect(host.undoDiscard).toHaveBeenCalledWith("/test/my-repo", true);
    });
  });

  it("handles commit workflow and draft persistence", async () => {
    vi.mocked(host.getAppInfo).mockResolvedValue({
      name: "tongyun-git",
      version: "0.0.0",
      identifier: "test-id",
      git_version: "2.47.3",
      libgit2_version: "1.9.7",
    });
    vi.mocked(host.checkGit).mockResolvedValue({
      available: true,
      version: "git version 2.47.3",
      error: null,
    });
    vi.mocked(host.openRepository).mockResolvedValue({
      root_path: "/test/my-repo",
      name: "my-repo",
      head: {
        branch: "main",
        oid: "abc1234",
        unborn: false,
      },
    });
    vi.mocked(host.getRepoStatus).mockResolvedValue({
      head: {
        branch: "main",
        oid: "abc1234",
        unborn: false,
      },
      files: [
        {
          path: "src/main.rs",
          old_path: null,
          worktree: null,
          index: "Modified",
          conflicted: false,
        },
      ],
    });
    vi.mocked(host.inspectAmend).mockResolvedValue({
      can_amend: true,
      disabled_reason: null,
      head_message: "feat: initial commit\n\nbody details",
      is_pushed: false,
      pushed_remote_branches: [],
    });
    vi.mocked(host.checkCommitIdentity).mockResolvedValue({
      name: "Alice",
      email: "alice@example.com",
    });
    vi.mocked(host.createCommit).mockResolvedValue({
      oid: "def5678",
      short_oid: "def5678",
      summary: "feat: implement commit",
    });

    render(<App />);

    const openBtn = await screen.findByText("打开本地仓库");
    fireEvent.click(openBtn);
    const input = screen.getByPlaceholderText(/例如: D:\/TD\/projects\/my-repo/);
    fireEvent.change(input, { target: { value: "/test/my-repo" } });
    fireEvent.click(screen.getByRole("button", { name: "打开" }));

    // Verify commit area rendered
    const textarea = (await screen.findByPlaceholderText(
      /提交信息 \(首行标题/
    )) as HTMLTextAreaElement;
    expect(textarea).toBeDefined();

    // Type commit message
    fireEvent.change(textarea, { target: { value: "feat: implement commit" } });
    expect(localStorage.getItem("tongyun_commit_draft_/test/my-repo")).toBe(
      "feat: implement commit"
    );

    // Commit button should be enabled for 1 staged file
    const commitBtn = screen.getByRole("button", { name: "提交 (1)" });
    fireEvent.click(commitBtn);

    await waitFor(() => {
      expect(host.checkCommitIdentity).toHaveBeenCalledWith("/test/my-repo");
      expect(host.createCommit).toHaveBeenCalledWith(
        "/test/my-repo",
        "feat: implement commit",
        false
      );
    });

    // Draft should be cleared after success
    expect(localStorage.getItem("tongyun_commit_draft_/test/my-repo")).toBeNull();
  });

  it("handles opening a non-git directory and allows initializing it with git init", async () => {
    vi.mocked(host.getAppInfo).mockResolvedValue({
      name: "tongyun-git",
      version: "0.0.0",
      identifier: "test-id",
      git_version: "2.47.3",
      libgit2_version: "1.9.7",
    });
    vi.mocked(host.checkGit).mockResolvedValue({
      available: true,
      version: "git version 2.47.3",
      error: null,
    });
    vi.mocked(host.openRepository).mockRejectedValueOnce("这个文件夹不是 Git 仓库");
    vi.mocked(host.initRepository).mockResolvedValueOnce({
      root_path: "/test/new-repo",
      name: "new-repo",
      head: {
        branch: "main",
        oid: null,
        unborn: true,
      },
    });
    vi.mocked(host.getRepoStatus).mockResolvedValue({
      head: {
        branch: "main",
        oid: null,
        unborn: true,
      },
      files: [],
    });

    render(<App />);

    const openBtn = await screen.findByText("打开本地仓库");
    fireEvent.click(openBtn);

    const input = screen.getByPlaceholderText(/例如: D:\/TD\/projects\/my-repo/);
    fireEvent.change(input, { target: { value: "/test/new-repo" } });
    fireEvent.click(screen.getByRole("button", { name: "打开" }));

    // Should display not a git repo error
    expect(await screen.findByText("这个文件夹不是 Git 仓库")).toBeDefined();

    // Should offer to initialize
    const initBtn = screen.getByRole("button", {
      name: "在此初始化 Git 仓库 (git init) 并打开",
    });
    expect(initBtn).toBeDefined();

    fireEvent.click(initBtn);

    await waitFor(() => {
      expect(host.initRepository).toHaveBeenCalledWith("/test/new-repo");
      expect(screen.getAllByText("new-repo").length).toBeGreaterThanOrEqual(1);
    });
  });

  it("AT-03b: displays CRLF notice in diff view when file has line ending changes", async () => {
    vi.mocked(host.getAppInfo).mockResolvedValue({
      name: "tongyun-git",
      version: "0.0.0",
      identifier: "test-id",
      git_version: "2.47.3",
      libgit2_version: "1.9.7",
    });
    vi.mocked(host.checkGit).mockResolvedValue({
      available: true,
      version: "git version 2.47.3",
      error: null,
    });
    vi.mocked(host.openRepository).mockResolvedValue({
      root_path: "/test/my-repo",
      name: "my-repo",
      head: {
        branch: "main",
        oid: "abc1234",
        unborn: false,
      },
    });
    vi.mocked(host.getRepoStatus).mockResolvedValue({
      head: {
        branch: "main",
        oid: "abc1234",
        unborn: false,
      },
      files: [
        {
          path: "src/crlf.txt",
          old_path: null,
          index: null,
          worktree: "Modified",
          conflicted: false,
        },
      ],
    });
    vi.mocked(host.getFileDiff).mockResolvedValue({
      path: "src/crlf.txt",
      old_path: null,
      staged: false,
      is_binary: false,
      old_size: 100,
      new_size: 120,
      is_crlf_change: true,
      is_large: false,
      hunks: [],
    });

    render(<App />);

    const openBtn = await screen.findByText("打开本地仓库");
    fireEvent.click(openBtn);

    const input = screen.getByPlaceholderText(/例如: D:\/TD\/projects\/my-repo/);
    fireEvent.change(input, { target: { value: "/test/my-repo" } });
    fireEvent.click(screen.getByRole("button", { name: "打开" }));

    expect(await screen.findByTitle("src/crlf.txt")).toBeDefined();
    fireEvent.click(screen.getByTitle("src/crlf.txt"));

    await waitFor(() => {
      expect(screen.getByText("文件仅换行符（CRLF ↔ LF）发生变化。")).toBeDefined();
    });
  });

  it("AT-03c: displays binary file notice and size change in diff view for binary file", async () => {
    vi.mocked(host.getAppInfo).mockResolvedValue({
      name: "tongyun-git",
      version: "0.0.0",
      identifier: "test-id",
      git_version: "2.47.3",
      libgit2_version: "1.9.7",
    });
    vi.mocked(host.checkGit).mockResolvedValue({
      available: true,
      version: "git version 2.47.3",
      error: null,
    });
    vi.mocked(host.openRepository).mockResolvedValue({
      root_path: "/test/my-repo",
      name: "my-repo",
      head: {
        branch: "main",
        oid: "abc1234",
        unborn: false,
      },
    });
    vi.mocked(host.getRepoStatus).mockResolvedValue({
      head: {
        branch: "main",
        oid: "abc1234",
        unborn: false,
      },
      files: [
        {
          path: "assets/image.png",
          old_path: null,
          index: null,
          worktree: "Modified",
          conflicted: false,
        },
      ],
    });
    vi.mocked(host.getFileDiff).mockResolvedValue({
      path: "assets/image.png",
      old_path: null,
      staged: false,
      is_binary: true,
      old_size: 1024,
      new_size: 2048,
      is_crlf_change: false,
      is_large: false,
      hunks: [],
    });

    render(<App />);

    const openBtn = await screen.findByText("打开本地仓库");
    fireEvent.click(openBtn);

    const input = screen.getByPlaceholderText(/例如: D:\/TD\/projects\/my-repo/);
    fireEvent.change(input, { target: { value: "/test/my-repo" } });
    fireEvent.click(screen.getByRole("button", { name: "打开" }));

    expect(await screen.findByTitle("assets/image.png")).toBeDefined();
    fireEvent.click(screen.getByTitle("assets/image.png"));

    await waitFor(() => {
      expect(screen.getByText("二进制文件")).toBeDefined();
    });
    expect(screen.getByText("大小变化: 1.0 KB → 2.0 KB")).toBeDefined();
  });

  async function openRepoWithFiles(files: host.FileStatus[]) {
    vi.mocked(host.getAppInfo).mockResolvedValue({
      name: "tongyun-git",
      version: "0.0.0",
      identifier: "test-id",
      git_version: "2.47.3",
      libgit2_version: "1.9.7",
    });
    vi.mocked(host.checkGit).mockResolvedValue({
      available: true,
      version: "git version 2.47.3",
      error: null,
    });
    vi.mocked(host.openRepository).mockResolvedValue({
      root_path: "/test/my-repo",
      name: "my-repo",
      head: { branch: "main", oid: "abc1234", unborn: false },
    });
    vi.mocked(host.getRepoStatus).mockResolvedValue({
      head: { branch: "main", oid: "abc1234", unborn: false },
      files,
    });
    render(<App />);
    fireEvent.click(await screen.findByText("打开本地仓库"));
    fireEvent.change(screen.getByPlaceholderText(/例如: D:\/TD\/projects\/my-repo/), {
      target: { value: "/test/my-repo" },
    });
    fireEvent.click(screen.getByRole("button", { name: "打开" }));
    expect((await screen.findAllByText("my-repo")).length).toBeGreaterThanOrEqual(1);
  }

  it("does not send a dirty-file total with the auto-check request", async () => {
    const files = Array.from({ length: 6 }, (_, i) => ({
      path: `dirty${i}.txt`,
      old_path: null,
      index: null,
      worktree: "Modified" as const,
      conflicted: false,
    }));
    await openRepoWithFiles(files);
    await waitFor(() => {
      expect(vi.mocked(host.workspaceTask).mock.calls.length).toBeGreaterThan(0);
    });
    const autoChecks = vi
      .mocked(host.workspaceTask)
      .mock.calls.filter(([, request]) => request.type === "auto_check");
    expect(autoChecks.length).toBeGreaterThan(0);
    for (const [, request] of autoChecks) {
      expect(request).toEqual({
        type: "auto_check",
        config: expect.objectContaining({ enabled: expect.any(Boolean) }),
      });
    }
  });

  it("still auto-checks when detection is disabled", async () => {
    localStorage.setItem(
      "tongyun_auto_agent_settings",
      JSON.stringify({ enabled: false }),
    );
    await openRepoWithFiles([]);
    await waitFor(() => {
      const auto = vi.mocked(host.workspaceTask).mock.calls.filter(([, request]) => request.type === "auto_check");
      expect(auto.length).toBeGreaterThan(0);
      expect(auto[0][1]).toMatchObject({
        type: "auto_check",
        config: expect.objectContaining({
          enabled: false,
          burst_threshold: 5,
          silence_timeout_secs: 300,
        }),
      });
    });
  });

  it("shows auto-check failures instead of ignoring them", async () => {
    vi.mocked(host.workspaceTask).mockRejectedValue("快照写入失败");
    await openRepoWithFiles([]);
    expect(await screen.findByText("快照写入失败")).toBeDefined();
  });

});


