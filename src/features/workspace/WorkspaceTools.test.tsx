import { fireEvent, render, screen, waitFor, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { WorkspaceTools } from "./WorkspaceTools";
import { workspaceTask, getRepoStatus } from "../../lib/host";
vi.mock("../../lib/host", () => ({ workspaceTask: vi.fn(), getRepoStatus: vi.fn() }));
const props = { rootPath: "/fixture", onClose: vi.fn(), onChanged: vi.fn(), onOpenRepo: vi.fn(), onShowCommit: vi.fn() };
const snapshots = [{ reference: "refs/tongyun/snapshots/1", label: "我的会话", kind: "agent_finished", created_ms: 1 }];
afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getRepoStatus).mockResolvedValue({ head: { branch: "main", oid: "abc", unborn: false, repo_state: "Clean" }, files: [{ path: "a.ts", old_path: null, index: null, worktree: "Modified", conflicted: false }] });
  vi.mocked(workspaceTask).mockImplementation(async (_root, request) => {
    if (request.type === "snapshots") return snapshots;
    if (request.type === "changes") return [{ path: "a.ts", saved: { oid: "old", mode: 33188 }, current: { oid: "new", mode: 33188 }, current_index: null, can_restore: true }];
    if (request.type === "restore") return { restored: 1, skipped: [], undo_ref: "undo" };
    if (request.type === "overview") return { worktrees: [{ path: "/fixture", branch: "main", changed: ["a.ts"], ahead: 1, behind: 2, error: null }], overlaps: { "a.ts": ["/fixture", "/other"] } };
    return null;
  });
});
describe("workspace workflows", () => {
  it("shows worktree status and overlapping paths and opens selected worktree", async () => {
    render(<WorkspaceTools {...props} />);
    expect(await screen.findByText("↑1 ↓2")).toBeInTheDocument();
    expect(screen.getByText("/other")).toBeInTheDocument();
    fireEvent.click(screen.getByText("打开工作区"));
    expect(props.onOpenRepo).toHaveBeenCalledWith("/fixture");
  });
  it("requires explicit confirmation and preserves cancel focus for restore", async () => {
    render(<WorkspaceTools {...props} initialTab="snapshots" />);
    fireEvent.click(await screen.findByText("我的会话"));
    const checkbox = await screen.findByRole("checkbox", { name: /a.ts.*将恢复内容/ });
    fireEvent.click(checkbox); fireEvent.click(screen.getByText("恢复所选文件"));
    expect(screen.getByText("取消")).toHaveFocus();
    expect(vi.mocked(workspaceTask).mock.calls.some(([, r]) => r.type === "restore")).toBe(false);
    fireEvent.click(screen.getByText("取消"));
    fireEvent.click(screen.getByText("恢复所选文件")); fireEvent.click(screen.getByText("确认执行"));
    await waitFor(() => expect(props.onChanged).toHaveBeenCalled());
    expect(vi.mocked(workspaceTask).mock.calls.find(([, r]) => r.type === "restore")?.[1]).toMatchObject({ changes: [{ path: "a.ts" }] });
  });
  it("disables restoring files changed after the session", async () => {
    vi.mocked(workspaceTask).mockImplementation(async (_root, request) => request.type === "snapshots" ? snapshots : [{ path: "a.ts", saved: null, current: null, current_index: null, can_restore: false }]);
    render(<WorkspaceTools {...props} initialTab="snapshots" />);
    fireEvent.click(await screen.findByText("我的会话"));
    expect(await screen.findByRole("checkbox", { name: /a.ts.*不能覆盖/ })).toBeDisabled();
    expect(screen.getByText("恢复所选文件")).toBeDisabled();
  });
  it("does not execute history operations on cancel and displays backend errors", async () => {
    render(<WorkspaceTools {...props} initialTab="history" initialTarget="abc123" />);
    await waitFor(() => expect(screen.getByText("撤销目标提交 (revert)")).not.toBeDisabled());
    fireEvent.click(screen.getByText("撤销目标提交 (revert)")); fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(vi.mocked(workspaceTask).mock.calls.some(([, r]) => r.type === "history")).toBe(false);
    vi.mocked(workspaceTask).mockRejectedValue("请先提交或贮藏改动");
    fireEvent.click(screen.getByText("撤销目标提交 (revert)")); fireEvent.click(screen.getByText("确认执行"));
    expect(await screen.findByRole("alert")).toHaveTextContent("请先提交或贮藏改动");
  });
  it("opens the exact blamed commit", async () => {
    vi.mocked(workspaceTask).mockResolvedValue([{ line: 1, oid: "1234567890", author: "Tester", content: "hello" }]);
    render(<WorkspaceTools {...props} initialTab="blame" initialFile="a.ts" />);
    await waitFor(() => expect(screen.getByText("查看 blame")).not.toBeDisabled());
    fireEvent.click(screen.getByText("查看 blame")); fireEvent.click(await screen.findByText("12345678"));
    expect(props.onShowCommit).toHaveBeenCalledWith("1234567890");
  });
});
