import { createElement } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FileDiff, FileHistoryItem } from "../../lib/host";
import { FileHistoryPanel } from "./FileHistoryPanel";
import * as host from "../../lib/host";

vi.mock("../../lib/host", () => ({
  getFileHistory: vi.fn(),
  getCommitFileDiff: vi.fn(),
}));

const rootPath = "/repo";

const emptyDiff: FileDiff = {
  path: "a.ts",
  old_path: null,
  staged: false,
  is_binary: false,
  old_size: 1,
  new_size: 2,
  is_crlf_change: false,
  is_large: false,
  hunks: [],
};

function item(oid: string, summary: string): FileHistoryItem {
  return {
    oid,
    short_oid: oid.slice(0, 7),
    author_name: "Ada",
    author_email: "ada@example.com",
    timestamp: 1_700_000_000,
    summary,
  };
}

describe("FileHistoryPanel selection state", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(host.getCommitFileDiff).mockResolvedValue(emptyDiff);
  });

  it("shows the loading label until history arrives", () => {
    vi.mocked(host.getFileHistory).mockReturnValue(new Promise(() => {}));
    render(createElement(FileHistoryPanel, { rootPath, filePath: "a.ts" }));
    expect(screen.getByText("正在加载…")).toBeTruthy();
    expect(screen.getByRole("listbox").querySelectorAll("[role='option']")).toHaveLength(0);
  });

  it("shows the load error and does not request a diff", async () => {
    vi.mocked(host.getFileHistory).mockRejectedValue(new Error("history down"));
    render(createElement(FileHistoryPanel, { rootPath, filePath: "a.ts" }));
    expect(await screen.findByText("history down")).toBeTruthy();
    expect(screen.getByText("共 0 次提交改过这个文件")).toBeTruthy();
    expect(host.getCommitFileDiff).not.toHaveBeenCalled();
  });

  it("shows the empty state for a file that has never been committed", async () => {
    vi.mocked(host.getFileHistory).mockResolvedValue([]);
    render(createElement(FileHistoryPanel, { rootPath, filePath: "new.ts" }));
    expect(await screen.findByText("还没有提交过（新文件）")).toBeTruthy();
    expect(screen.getByText("在左侧选择一次提交查看这个文件的改动")).toBeTruthy();
    expect(host.getFileHistory).toHaveBeenCalledWith(rootPath, "new.ts", 50);
    expect(host.getCommitFileDiff).not.toHaveBeenCalled();
  });

  it("loads the first commit's diff and switches when another row is selected", async () => {
    vi.mocked(host.getFileHistory).mockResolvedValue([
      item("aaaaaaa111", "first change"),
      item("bbbbbbb222", "second change"),
    ]);
    render(createElement(FileHistoryPanel, { rootPath, filePath: "a.ts" }));

    expect(await screen.findByText("first change")).toBeTruthy();
    expect(screen.getByText("共 2 次提交改过这个文件")).toBeTruthy();
    await waitFor(() => {
      expect(host.getCommitFileDiff).toHaveBeenCalledWith(rootPath, "aaaaaaa111", "a.ts");
    });

    fireEvent.click(screen.getByText("second change"));
    await waitFor(() => {
      expect(host.getCommitFileDiff).toHaveBeenCalledWith(rootPath, "bbbbbbb222", "a.ts");
    });
  });

  it("drops the previous file's history when the path changes", async () => {
    vi.mocked(host.getFileHistory).mockImplementation(async (_root, path) => {
      if (path === "b.ts") return [item("bbbbbbb222", "only on b")];
      return [item("aaaaaaa111", "only on a")];
    });

    const view = render(createElement(FileHistoryPanel, { rootPath, filePath: "a.ts" }));
    expect(await screen.findByText("only on a")).toBeTruthy();

    view.rerender(createElement(FileHistoryPanel, { rootPath, filePath: "b.ts" }));
    expect(await screen.findByText("only on b")).toBeTruthy();
    expect(screen.queryByText("only on a")).toBeNull();
    await waitFor(() => {
      expect(host.getCommitFileDiff).toHaveBeenCalledWith(rootPath, "bbbbbbb222", "b.ts");
    });
  });
});
