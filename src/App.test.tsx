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
}));

describe("App workspace and components", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
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
});
