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
    expect(await screen.findByText("my-repo")).toBeDefined();
    expect(await screen.findByText("main")).toBeDefined();

    // Verify files rendered in list
    expect(await screen.findByText("src/main.rs")).toBeDefined();
    expect(screen.getByText("README.md")).toBeDefined();

    // Click on src/main.rs to load diff
    fireEvent.click(screen.getByText("src/main.rs"));

    // Verify diff content
    await waitFor(() => {
      expect(screen.getByText('println!("new");')).toBeDefined();
    });
    expect(screen.getByText('println!("old");')).toBeDefined();
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
    const fileItem = await screen.findByText("src/main.rs");
    fireEvent.click(fileItem);

    // Wait for diff line to render
    const diffLine = await screen.findByText("let x = 1;");
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
    await screen.findByText("src/main.rs");

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
});

