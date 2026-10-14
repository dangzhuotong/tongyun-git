import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ChangesList } from "./ChangesList";
import type { FileStatus } from "../../lib/host";

describe("ChangesList component (AT-02a, AT-02b, AT-02c)", () => {
  const onSelectTarget = vi.fn();
  const onStageFiles = vi.fn().mockResolvedValue(undefined);
  const onUnstageFiles = vi.fn().mockResolvedValue(undefined);
  const onDiscardFiles = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  const mockFiles: FileStatus[] = [
    {
      path: "src/new-file.ts",
      old_path: null,
      index: "Added",
      worktree: null,
      conflicted: false,
    },
    {
      path: "src/modified.ts",
      old_path: null,
      index: null,
      worktree: "Modified",
      conflicted: false,
    },
    {
      path: "src/deleted.ts",
      old_path: null,
      index: null,
      worktree: "Deleted",
      conflicted: false,
    },
    {
      path: "notes.txt",
      old_path: null,
      index: null,
      worktree: "Untracked",
      conflicted: false,
    },
    {
      path: "src/renamed.ts",
      old_path: "src/old-name.ts",
      index: "Renamed",
      worktree: null,
      conflicted: false,
    },
    {
      path: "src/conflict.ts",
      old_path: null,
      index: "Modified",
      worktree: "Modified",
      conflicted: true,
    },
  ];

  it("AT-02c: displays renamed file with 'R' badge and 'new ← old' label", () => {
    render(
      <ChangesList
        files={mockFiles}
        selectedTarget={null}
        onSelectTarget={onSelectTarget}
        onStageFiles={onStageFiles}
        onUnstageFiles={onUnstageFiles}
        onDiscardFiles={onDiscardFiles}
      />
    );

    // Renamed file badge 'R'
    const rBadge = screen.getByTitle("重命名");
    expect(rBadge).toBeDefined();
    expect(rBadge.textContent).toBe("R");

    // File label showing new <- old
    expect(screen.getByText("renamed.ts ← old-name.ts")).toBeDefined();
  });

  it("AT-02a & AT-02b: categorizes files into Conflicted, Staged, Unstaged, and Untracked groups", () => {
    render(
      <ChangesList
        files={mockFiles}
        selectedTarget={null}
        onSelectTarget={onSelectTarget}
        onStageFiles={onStageFiles}
        onUnstageFiles={onUnstageFiles}
        onDiscardFiles={onDiscardFiles}
      />
    );

    expect(screen.getByText("改动 (6)")).toBeDefined();
    expect(screen.getByText("冲突")).toBeDefined();
    expect(screen.getByText("已暂存")).toBeDefined();
    expect(screen.getByText("未暂存")).toBeDefined();
    expect(screen.getByText("未跟踪")).toBeDefined();

    // Check status badges
    expect(screen.getByTitle("新增").textContent).toBe("A");
    expect(screen.getByTitle("修改").textContent).toBe("M");
    expect(screen.getByTitle("删除").textContent).toBe("D");
    expect(screen.getByTitle("未跟踪").textContent).toBe("U");
    expect(screen.getByTitle("冲突").textContent).toBe("!");
  });

  it("selects a file when clicked", () => {
    render(
      <ChangesList
        files={mockFiles}
        selectedTarget={null}
        onSelectTarget={onSelectTarget}
        onStageFiles={onStageFiles}
        onUnstageFiles={onUnstageFiles}
        onDiscardFiles={onDiscardFiles}
      />
    );

    const fileRow = screen.getByText("modified.ts");
    fireEvent.click(fileRow);

    expect(onSelectTarget).toHaveBeenCalledWith({
      path: "src/modified.ts",
      staged: false,
      status: mockFiles[1],
    });
  });

  it("handles space keyboard shortcut to stage or unstage currently selected file", () => {
    const { rerender } = render(
      <ChangesList
        files={mockFiles}
        selectedTarget={{
          path: "src/modified.ts",
          staged: false,
          status: mockFiles[1],
        }}
        onSelectTarget={onSelectTarget}
        onStageFiles={onStageFiles}
        onUnstageFiles={onUnstageFiles}
        onDiscardFiles={onDiscardFiles}
      />
    );

    // Press Space on unstaged file -> stageFiles
    fireEvent.keyDown(window, { key: " " });
    expect(onStageFiles).toHaveBeenCalledWith(["src/modified.ts"]);

    // Rerender with staged selection
    rerender(
      <ChangesList
        files={mockFiles}
        selectedTarget={{
          path: "src/new-file.ts",
          staged: true,
          status: mockFiles[0],
        }}
        onSelectTarget={onSelectTarget}
        onStageFiles={onStageFiles}
        onUnstageFiles={onUnstageFiles}
        onDiscardFiles={onDiscardFiles}
      />
    );

    // Press Space on staged file -> unstageFiles
    fireEvent.keyDown(window, { key: " " });
    expect(onUnstageFiles).toHaveBeenCalledWith(["src/new-file.ts"]);
  });

  it("switches view mode between flat and tree", () => {
    render(
      <ChangesList
        files={mockFiles}
        selectedTarget={null}
        onSelectTarget={onSelectTarget}
        onStageFiles={onStageFiles}
        onUnstageFiles={onUnstageFiles}
        onDiscardFiles={onDiscardFiles}
      />
    );

    const treeBtn = screen.getByTitle("目录树视图");
    fireEvent.click(treeBtn);
    expect(localStorage.getItem("tongyun_view_mode")).toBe("tree");

    const flatBtn = screen.getByTitle("平铺视图");
    fireEvent.click(flatBtn);
    expect(localStorage.getItem("tongyun_view_mode")).toBe("flat");
  });
});
