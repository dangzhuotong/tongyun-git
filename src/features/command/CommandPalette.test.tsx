import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { CommandPalette, CommandItem } from "./CommandPalette";

describe("CommandPalette", () => {
  const mockCommands: CommandItem[] = [
    {
      id: "pull",
      title: "拉取远程分支 (Git Pull)",
      shortcut: "Ctrl+T",
      action: vi.fn(),
    },
    {
      id: "push",
      title: "推送提交到远程 (Git Push)",
      shortcut: "Ctrl+Shift+K",
      action: vi.fn(),
    },
    {
      id: "settings",
      title: "打开应用设置",
      action: vi.fn(),
    },
  ];

  it("renders command list and filters by input", () => {
    render(
      <CommandPalette
        isOpen={true}
        onClose={vi.fn()}
        commands={mockCommands}
      />
    );

    expect(screen.getByText("拉取远程分支 (Git Pull)")).toBeDefined();
    expect(screen.getByText("推送提交到远程 (Git Push)")).toBeDefined();
    expect(screen.getByText("打开应用设置")).toBeDefined();

    const input = screen.getByPlaceholderText("搜索命令或操作...");
    fireEvent.change(input, { target: { value: "推送" } });

    expect(screen.getByText("推送提交到远程 (Git Push)")).toBeDefined();
    expect(screen.queryByText("拉取远程分支 (Git Pull)")).toBeNull();
  });

  it("executes command on click", () => {
    const onClose = vi.fn();
    render(
      <CommandPalette
        isOpen={true}
        onClose={onClose}
        commands={mockCommands}
      />
    );

    const pullItem = screen.getByText("拉取远程分支 (Git Pull)");
    fireEvent.click(pullItem);

    expect(mockCommands[0].action).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it("handles enter key to execute selected command", () => {
    const onClose = vi.fn();
    render(
      <CommandPalette
        isOpen={true}
        onClose={onClose}
        commands={mockCommands}
      />
    );

    const input = screen.getByPlaceholderText("搜索命令或操作...");
    fireEvent.keyDown(input, { key: "Enter" });

    expect(mockCommands[0].action).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it("navigates with ArrowDown and ArrowUp and filters by shortcut", () => {
    const onClose = vi.fn();
    render(
      <CommandPalette
        isOpen={true}
        onClose={onClose}
        commands={mockCommands}
      />
    );

    const input = screen.getByPlaceholderText("搜索命令或操作...");

    // Test shortcut filtering
    fireEvent.change(input, { target: { value: "Ctrl+T" } });
    expect(screen.getByText("拉取远程分支 (Git Pull)")).toBeDefined();
    expect(screen.queryByText("推送提交到远程 (Git Push)")).toBeNull();

    // Clear search and test arrow navigation
    fireEvent.change(input, { target: { value: "" } });
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });

    // Second item (Push) selected and executed
    expect(mockCommands[1].action).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });
});
