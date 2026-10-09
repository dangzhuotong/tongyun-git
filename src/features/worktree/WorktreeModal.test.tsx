import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { WorktreeModal } from "./WorktreeModal";
import * as host from "../../lib/host";

vi.mock("../../lib/host", () => ({
  listWorktrees: vi.fn(),
  addWorktree: vi.fn(),
  removeWorktree: vi.fn(),
  lockWorktree: vi.fn(),
  unlockWorktree: vi.fn(),
  pruneWorktrees: vi.fn(),
  listBranches: vi.fn(),
  selectFolder: vi.fn(),
}));

describe("WorktreeModal", () => {
  const rootPath = "d:/test/repo";

  const mockWorktrees: host.WorktreeItem[] = [
    {
      name: "main-worktree",
      path: "d:/test/repo",
      head_oid: "abc111222",
      branch: "main",
      is_main: true,
      is_locked: false,
      lock_reason: null,
      is_bare: false,
      is_detached: false,
    },
    {
      name: "feature-worktree",
      path: "d:/test/feature-wt",
      head_oid: "def333444",
      branch: "feature-branch",
      is_main: false,
      is_locked: false,
      lock_reason: null,
      is_bare: false,
      is_detached: false,
    },
    {
      name: "locked-worktree",
      path: "d:/test/locked-wt",
      head_oid: "ghi555666",
      branch: "experiment-branch",
      is_main: false,
      is_locked: true,
      lock_reason: "正在排期",
      is_bare: false,
      is_detached: false,
    },
  ];

  const mockBranches: host.BranchItem[] = [
    { name: "main", is_head: true, is_remote: false, upstream: null, ahead: 0, behind: 0, target_oid: "abc111" },
    { name: "feature-branch", is_head: false, is_remote: false, upstream: null, ahead: 0, behind: 0, target_oid: "def222" },
    { name: "experiment-branch", is_head: false, is_remote: false, upstream: null, ahead: 0, behind: 0, target_oid: "ghi333" },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(host.listWorktrees).mockResolvedValue(mockWorktrees);
    vi.mocked(host.listBranches).mockResolvedValue(mockBranches);
    vi.mocked(host.addWorktree).mockResolvedValue();
    vi.mocked(host.removeWorktree).mockResolvedValue();
    vi.mocked(host.lockWorktree).mockResolvedValue();
    vi.mocked(host.unlockWorktree).mockResolvedValue();
    vi.mocked(host.pruneWorktrees).mockResolvedValue();
  });

  it("does not render when isOpen is false", () => {
    const { container } = render(
      <WorktreeModal
        isOpen={false}
        onClose={vi.fn()}
        rootPath={rootPath}
        onOpenRepo={vi.fn()}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders worktree items and badges correctly", async () => {
    render(
      <WorktreeModal
        isOpen={true}
        onClose={vi.fn()}
        rootPath={rootPath}
        onOpenRepo={vi.fn()}
      />
    );

    expect(await screen.findByText("管理 Git 工作区 (Git Worktrees)")).toBeDefined();
    expect(await screen.findByText("main-worktree")).toBeDefined();
    expect(await screen.findByText("feature-worktree")).toBeDefined();
    expect(await screen.findByText("locked-worktree")).toBeDefined();
    expect(screen.getByText("主工作区")).toBeDefined();
    expect(screen.getByText("当前已打开")).toBeDefined();
    expect(screen.getByText(/已锁定/)).toBeDefined();
  });

  it("switches to another worktree when clicking '打开切换'", async () => {
    const onOpenRepo = vi.fn();
    const onClose = vi.fn();

    render(
      <WorktreeModal
        isOpen={true}
        onClose={onClose}
        rootPath={rootPath}
        onOpenRepo={onOpenRepo}
      />
    );

    await screen.findByText("feature-worktree");
    const switchButtons = screen.getAllByText("打开切换");
    expect(switchButtons.length).toBeGreaterThan(0);

    fireEvent.click(switchButtons[0]);
    expect(onOpenRepo).toHaveBeenCalledWith("d:/test/feature-wt");
    expect(onClose).toHaveBeenCalled();
  });

  it("locks an unlocked worktree", async () => {
    render(
      <WorktreeModal
        isOpen={true}
        onClose={vi.fn()}
        rootPath={rootPath}
        onOpenRepo={vi.fn()}
      />
    );

    await screen.findByText("feature-worktree");
    const lockButtons = screen.getAllByRole("button", { name: "锁定" });
    fireEvent.click(lockButtons[0]);

    expect(await screen.findByText(/锁定工作区:/)).toBeDefined();
    const confirmButton = screen.getByRole("button", { name: "确认锁定" });
    fireEvent.click(confirmButton);

    await waitFor(() => {
      expect(host.lockWorktree).toHaveBeenCalledWith(
        rootPath,
        "d:/test/repo",
        undefined
      );
    });
  });

  it("unlocks a locked worktree", async () => {
    render(
      <WorktreeModal
        isOpen={true}
        onClose={vi.fn()}
        rootPath={rootPath}
        onOpenRepo={vi.fn()}
      />
    );

    await screen.findByText("locked-worktree");
    const unlockButton = screen.getByRole("button", { name: "解锁" });
    fireEvent.click(unlockButton);

    await waitFor(() => {
      expect(host.unlockWorktree).toHaveBeenCalledWith(
        rootPath,
        "d:/test/locked-wt"
      );
    });
  });

  it("removes a non-main worktree with confirmation", async () => {
    render(
      <WorktreeModal
        isOpen={true}
        onClose={vi.fn()}
        rootPath={rootPath}
        onOpenRepo={vi.fn()}
      />
    );

    await screen.findByText("feature-worktree");
    const removeButtons = screen.getAllByRole("button", { name: "移除" });
    fireEvent.click(removeButtons[0]);

    expect(await screen.findByText("确认移除工作区？")).toBeDefined();
    const confirmRemoveBtn = screen.getByRole("button", { name: "确认移除" });
    fireEvent.click(confirmRemoveBtn);

    await waitFor(() => {
      expect(host.removeWorktree).toHaveBeenCalledWith(
        rootPath,
        "d:/test/feature-wt",
        false
      );
    });
  });

  it("prunes invalid worktrees when clicking '修剪 (Prune)'", async () => {
    render(
      <WorktreeModal
        isOpen={true}
        onClose={vi.fn()}
        rootPath={rootPath}
        onOpenRepo={vi.fn()}
      />
    );

    await screen.findByText("管理 Git 工作区 (Git Worktrees)");
    const pruneBtn = screen.getByRole("button", { name: "修剪 (Prune)" });
    fireEvent.click(pruneBtn);

    await waitFor(() => {
      expect(host.pruneWorktrees).toHaveBeenCalledWith(rootPath);
    });
  });

  it("creates a new worktree and calls addWorktree", async () => {
    const onOpenRepo = vi.fn();
    const onClose = vi.fn();

    render(
      <WorktreeModal
        isOpen={true}
        onClose={onClose}
        rootPath={rootPath}
        onOpenRepo={onOpenRepo}
      />
    );

    await screen.findByText("管理 Git 工作区 (Git Worktrees)");
    const addBtn = screen.getByRole("button", { name: "+ 新建工作区" });
    fireEvent.click(addBtn);

    const pathInput = screen.getByPlaceholderText(/例如: \.\.\/my-feature-wt/);
    fireEvent.change(pathInput, { target: { value: "d:/test/new-wt" } });

    const createBtn = screen.getByRole("button", { name: "确认创建" });
    fireEvent.click(createBtn);

    await waitFor(() => {
      expect(host.addWorktree).toHaveBeenCalledWith(
        rootPath,
        "d:/test/new-wt",
        "main",
        false
      );
      expect(onOpenRepo).toHaveBeenCalledWith("d:/test/new-wt");
      expect(onClose).toHaveBeenCalled();
    });
  });
});
