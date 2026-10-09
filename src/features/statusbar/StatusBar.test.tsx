import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { StatusBar } from "./StatusBar";
import type { RepoInfo, AppInfo } from "../../lib/host";

describe("StatusBar", () => {
  const dummyRepo: RepoInfo = {
    name: "tongyun-core",
    root_path: "/path/to/repo",
    head: {
      branch: "feature/tag-support",
      oid: "1234567890abcdef",
      unborn: false,
    },
  };

  const dummyAppInfo: AppInfo = {
    name: "tongyun-git",
    version: "1.0.0",
    identifier: "com.tongyun.git",
    git_version: "git version 2.47.3",
    libgit2_version: "1.9.7",
  };

  it("renders repo name, current branch and git version", () => {
    render(
      <StatusBar
        currentRepo={dummyRepo}
        appInfo={dummyAppInfo}
        onOpenBranchModal={vi.fn()}
        onOpenTagModal={vi.fn()}
        onOpenLogModal={vi.fn()}
        onOpenShortcuts={vi.fn()}
        onOpenAbout={vi.fn()}
      />
    );

    expect(screen.getByText("tongyun-core")).toBeDefined();
    expect(screen.getByText("feature/tag-support")).toBeDefined();
    expect(screen.getByText("git 2.47.3")).toBeDefined();
    expect(screen.getByText("就绪")).toBeDefined();
  });

  it("triggers callbacks when clicking status bar items", () => {
    const onOpenBranch = vi.fn();
    const onOpenTag = vi.fn();
    const onOpenLog = vi.fn();
    const onOpenShortcuts = vi.fn();
    const onOpenAbout = vi.fn();

    render(
      <StatusBar
        currentRepo={dummyRepo}
        appInfo={dummyAppInfo}
        onOpenBranchModal={onOpenBranch}
        onOpenTagModal={onOpenTag}
        onOpenLogModal={onOpenLog}
        onOpenShortcuts={onOpenShortcuts}
        onOpenAbout={onOpenAbout}
      />
    );

    fireEvent.click(screen.getByText("feature/tag-support"));
    expect(onOpenBranch).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTitle("管理 Git 标签 (Tags)"));
    expect(onOpenTag).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTitle("查看 Git 终端操作日志 (R-15)"));
    expect(onOpenLog).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTitle("查看键盘快捷键帮助 (? 或 F1)"));
    expect(onOpenShortcuts).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTitle("关于 橦云 Git"));
    expect(onOpenAbout).toHaveBeenCalledTimes(1);
  });

  it("shows refresh and pull indicators appropriately", () => {
    const { rerender } = render(
      <StatusBar
        currentRepo={dummyRepo}
        isRefreshing={true}
        onOpenBranchModal={vi.fn()}
        onOpenTagModal={vi.fn()}
        onOpenLogModal={vi.fn()}
        onOpenShortcuts={vi.fn()}
        onOpenAbout={vi.fn()}
      />
    );
    expect(screen.getByText("正在刷新状态...")).toBeDefined();

    rerender(
      <StatusBar
        currentRepo={dummyRepo}
        isPulling={true}
        onOpenBranchModal={vi.fn()}
        onOpenTagModal={vi.fn()}
        onOpenLogModal={vi.fn()}
        onOpenShortcuts={vi.fn()}
        onOpenAbout={vi.fn()}
      />
    );
    expect(screen.getByText("正在拉取远程...")).toBeDefined();
  });
});
