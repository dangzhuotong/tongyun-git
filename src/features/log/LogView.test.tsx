import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { LogView } from "./LogView";
import * as host from "../../lib/host";

vi.mock("../../lib/host", () => ({
  getCommitLog: vi.fn(),
  getCommitDetails: vi.fn(),
  getCommitFileDiff: vi.fn(),
  aiSearchLog: vi.fn(),
  getAiKeyStatus: vi.fn(),
}));

describe("LogView", () => {
  const rootPath = "/mock/repo";
  const mockCommits: host.LogCommit[] = [
    {
      oid: "commit111",
      short_oid: "com111",
      summary: "feat: add user login",
      message: "feat: add user login",
      author_name: "Alice",
      author_email: "alice@example.com",
      timestamp: 1710000000,
      parents: ["commit000"],
      col: 0,
      edges: [],
      refs: [
        { name: "HEAD", kind: "Head" },
        { name: "main", kind: "LocalBranch" },
      ],
    },
    {
      oid: "commit222",
      short_oid: "com222",
      summary: "fix: button style bug",
      message: "fix: button style bug",
      author_name: "Bob",
      author_email: "bob@example.com",
      timestamp: 1709900000,
      parents: ["commit000"],
      col: 1,
      edges: [{ from_col: 1, to_col: 0 }],
      refs: [{ name: "origin/dev", kind: "RemoteBranch" }],
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(host.getCommitLog).mockResolvedValue({
      commits: mockCommits,
      has_more: false,
      total_matched: 2,
    });
    vi.mocked(host.getCommitDetails).mockResolvedValue({
      oid: "commit111",
      short_oid: "com111",
      parents: ["commit000"],
      author_name: "Alice",
      author_email: "alice@example.com",
      author_timestamp: 1710000000,
      committer_name: "Alice",
      committer_email: "alice@example.com",
      commit_timestamp: 1710000000,
      message: "feat: add user login\n\ndetailed description",
      files: [
        {
          path: "src/auth.ts",
          old_path: null,
          kind: "Modified",
        },
      ],
    });
    vi.mocked(host.getCommitFileDiff).mockResolvedValue({
      path: "src/auth.ts",
      old_path: null,
      staged: false,
      is_binary: false,
      is_crlf_change: false,
      is_large: false,
      hunks: [
        {
          header: "@@ -1,3 +1,4 @@",
          old_start: 1,
          old_lines: 3,
          new_start: 1,
          new_lines: 4,
          lines: [
            { origin: " ", old_lineno: 1, new_lineno: 1, content: "const a = 1;" },
            { origin: "+", old_lineno: null, new_lineno: 2, content: "const b = 2;" },
          ],
        },
      ],
    });
  });

  it("renders commit list, graph badges, and details (AT-10a, AT-10c)", async () => {
    render(
      <LogView
        rootPath={rootPath}
        onOpenCreateBranch={vi.fn()}
      />
    );

    expect(await screen.findByText("feat: add user login")).toBeDefined();
    expect(screen.getByText("fix: button style bug")).toBeDefined();
    expect(screen.getAllByText("Alice").length).toBeGreaterThan(0);
    expect(screen.getByText("Bob")).toBeDefined();
    expect(screen.getByText("HEAD")).toBeDefined();
    expect(screen.getByText("main")).toBeDefined();
    expect(screen.getByText("origin/dev")).toBeDefined();

    // Verify first commit details and file diff are loaded
    await waitFor(() => {
      expect(screen.getAllByText("src/auth.ts").length).toBeGreaterThan(0);
      expect(screen.getByText(/const b = 2;/)).toBeDefined();
    });
  });

  it("filters commits by search text (AT-10b)", async () => {
    render(
      <LogView
        rootPath={rootPath}
        onOpenCreateBranch={vi.fn()}
      />
    );

    await screen.findByText("feat: add user login");

    const searchInput = screen.getByPlaceholderText("过滤 作者 / 标题 / 哈希...");
    fireEvent.change(searchInput, { target: { value: "Bob" } });

    await waitFor(() => {
      expect(host.getCommitLog).toHaveBeenCalledWith(
        rootPath,
        expect.objectContaining({
          filter_query: "Bob",
        })
      );
    });
  });

  it("switches scope between all branches and current branch", async () => {
    render(
      <LogView
        rootPath={rootPath}
        onOpenCreateBranch={vi.fn()}
      />
    );

    await screen.findByText("feat: add user login");

    const currentBranchBtn = screen.getByText("当前分支");
    fireEvent.click(currentBranchBtn);

    await waitFor(() => {
      expect(host.getCommitLog).toHaveBeenCalledWith(
        rootPath,
        expect.objectContaining({
          all_branches: false,
        })
      );
    });
  });

  it("opens create branch modal from commit context menu", async () => {
    const onOpenCreateBranch = vi.fn();
    render(
      <LogView
        rootPath={rootPath}
        onOpenCreateBranch={onOpenCreateBranch}
      />
    );

    const commitRow = await screen.findByText("feat: add user login");
    fireEvent.contextMenu(commitRow);

    const newBranchOption = await screen.findByText("从这里新建分支...");
    fireEvent.click(newBranchOption);

    expect(onOpenCreateBranch).toHaveBeenCalledWith("commit111");
  });

  it("handles AI natural language log query correctly", async () => {
    vi.mocked(host.getAiKeyStatus).mockResolvedValue({
      kie: true,
      openai: false,
      ollama: false,
      keyring_available: true,
    });
    vi.mocked(host.aiSearchLog).mockResolvedValue({
      answer: "登录功能是由 Alice 在 commit com111 中实现的",
      matched_oids: [
        {
          oid: "commit111",
          reason: "feat: add user login 实现了登录逻辑",
        },
      ],
    });

    render(
      <LogView
        rootPath={rootPath}
        onOpenCreateBranch={vi.fn()}
      />
    );

    await screen.findByText("feat: add user login");

    // Toggle AI Search
    const aiToggleBtn = screen.getByRole("button", { name: /AI 问历史/i });
    fireEvent.click(aiToggleBtn);

    const input = screen.getByPlaceholderText(/用自然语言提问历史/i);
    fireEvent.change(input, { target: { value: "谁实现了登录？" } });

    const searchBtn = screen.getByRole("button", { name: "提问" });
    fireEvent.click(searchBtn);

    // Verify AI response banner appears
    await screen.findByText("AI 历史洞察解答");
    expect(screen.getByText("登录功能是由 Alice 在 commit com111 中实现的")).toBeDefined();
    expect(screen.getByText("✨ AI匹配")).toBeDefined();
  });

  it("allows resizing details panel with splitter and toggling wide-screen mode", async () => {
    render(
      <LogView
        rootPath={rootPath}
        onOpenCreateBranch={vi.fn()}
      />
    );

    await screen.findByText("feat: add user login");

    const splitter = screen.getByTitle(/拖动调整日志列表与代码详情宽度/i);
    expect(splitter).toBeDefined();

    // Trigger splitter drag
    fireEvent.mouseDown(splitter, { clientX: 500 });
    fireEvent.mouseMove(window, { clientX: 300 });
    fireEvent.mouseUp(window, { clientX: 300 });

    // Wide screen toggle button
    const wideScreenBtn = await screen.findByRole("button", { name: /宽屏看代码|标准宽度/i });
    expect(wideScreenBtn).toBeDefined();
    fireEvent.click(wideScreenBtn);
  });

  it("supports dragging column resize handles on table header and resetting width on double click", async () => {
    render(
      <LogView
        rootPath={rootPath}
        onOpenCreateBranch={vi.fn()}
      />
    );

    await screen.findByText("feat: add user login");

    const authorResizeHandle = screen.getByTitle(/按住拖拽调整作者列宽/i);
    const dateResizeHandle = screen.getByTitle(/按住拖拽调整日期列宽/i);
    const shaResizeHandle = screen.getByTitle(/按住拖拽调整 SHA 列宽/i);

    expect(authorResizeHandle).toBeDefined();
    expect(dateResizeHandle).toBeDefined();
    expect(shaResizeHandle).toBeDefined();

    // Drag author column handle
    fireEvent.mouseDown(authorResizeHandle, { clientX: 200 });
    fireEvent.mouseMove(window, { clientX: 250 });
    fireEvent.mouseUp(window, { clientX: 250 });

    // Double click to reset
    fireEvent.doubleClick(authorResizeHandle);
  });
});
