import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
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

describe("App Project File Tree integration", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();

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
        target_oid: "abc1234",
      },
    ]);
    vi.mocked(host.getCommitLog).mockResolvedValue({
      commits: [],
      has_more: false,
      total_matched: 0,
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
      ],
    });
    vi.mocked(host.listRepoFiles).mockResolvedValue([
      { path: "src/main.rs", deleted_on_disk: false },
      { path: "README.md", deleted_on_disk: false },
    ]);
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
    vi.mocked(host.getFileHistory).mockResolvedValue([
      {
        oid: "commit111",
        short_oid: "commit1",
        summary: "feat: update main",
        author_name: "Developer",
        author_email: "dev@example.com",
        timestamp: 1712500000,
      },
    ]);
    vi.mocked(host.getCommitFileDiff).mockResolvedValue({
      path: "src/main.rs",
      old_path: null,
      staged: false,
      is_binary: false,
      old_size: 10,
      new_size: 20,
      is_crlf_change: false,
      is_large: false,
      hunks: [],
    });
  });

  it("shows project file tree when repository is open, calls get_file_diff and get_file_history", async () => {
    localStorage.setItem("tongyun_last_repo", "/test/my-repo");
    render(<App />);

    // 1. Project file tree is rendered
    expect(await screen.findByLabelText("项目文件树")).toBeDefined();
    expect(screen.getByText("项目")).toBeDefined();

    // 2. Click folder "src" to expand
    await waitFor(() => {
      expect(document.querySelector('[role="tree"] [data-path="src"]')).not.toBeNull();
    });
    fireEvent.click(document.querySelector('[role="tree"] [data-path="src"]')!);

    // 3. Click changed file "src/main.rs" in tree
    await waitFor(() => {
      expect(document.querySelector('[role="tree"] [data-path="src/main.rs"]')).not.toBeNull();
    });
    fireEvent.click(document.querySelector('[role="tree"] [data-path="src/main.rs"]')!);

    // Verify get_file_diff is called
    await waitFor(() => {
      expect(host.getFileDiff).toHaveBeenCalledWith("/test/my-repo", "src/main.rs", false);
    });

    // 4. Click "历史" tab
    const historyTab = await screen.findByRole("tab", { name: "历史" });
    expect(historyTab).toBeDefined();
    fireEvent.click(historyTab);

    // Verify get_file_history is called
    await waitFor(() => {
      expect(host.getFileHistory).toHaveBeenCalledWith("/test/my-repo", "src/main.rs", 50);
    });
    expect(await screen.findByText("feat: update main")).toBeDefined();
  });

  it("shows placeholder for clean file, clicking view history switches to history tab", async () => {
    localStorage.setItem("tongyun_last_repo", "/test/my-repo");
    render(<App />);

    await screen.findByLabelText("项目文件树");
    await waitFor(() => {
      expect(document.querySelector('[role="tree"] [data-path="README.md"]')).not.toBeNull();
    });

    // Click clean file README.md in tree
    fireEvent.click(document.querySelector('[role="tree"] [data-path="README.md"]')!);

    // Placeholder message should be shown in changes view
    expect(await screen.findByText("这个文件没有未提交的改动")).toBeDefined();
    const viewHistoryBtn = screen.getByRole("button", { name: "查看历史" });
    expect(viewHistoryBtn).toBeDefined();

    // Click view history button
    fireEvent.click(viewHistoryBtn);

    // Should switch to history tab and call getFileHistory
    await waitFor(() => {
      expect(host.getFileHistory).toHaveBeenCalledWith("/test/my-repo", "README.md", 50);
    });
    const historyTab = screen.getByRole("tab", { name: "历史" });
    expect(historyTab.getAttribute("aria-selected")).toBe("true");
  });

  it("collapses tree to 28px bar and expands back", async () => {
    localStorage.setItem("tongyun_last_repo", "/test/my-repo");
    render(<App />);

    await screen.findByLabelText("项目文件树");
    const hideBtn = screen.getByRole("button", { name: "收起文件树" });
    fireEvent.click(hideBtn);

    // Now collapsed bar is rendered with expand button
    const expandBtn = await screen.findByLabelText("展开文件树");
    expect(expandBtn).toBeDefined();
    expect(localStorage.getItem("tongyun_tree_collapsed")).toBe("true");

    // Click expand button to restore
    fireEvent.click(expandBtn);
    expect(await screen.findByLabelText("项目文件树")).toBeDefined();
    expect(localStorage.getItem("tongyun_tree_collapsed")).toBe("false");
  });
});
