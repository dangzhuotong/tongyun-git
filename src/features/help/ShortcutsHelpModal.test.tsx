import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { ShortcutsHelpModal } from "./ShortcutsHelpModal";

describe("ShortcutsHelpModal", () => {
  it("does not render when isOpen is false", () => {
    const { container } = render(
      <ShortcutsHelpModal isOpen={false} onClose={vi.fn()} />
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders shortcuts grouped by category when isOpen is true", () => {
    render(<ShortcutsHelpModal isOpen={true} onClose={vi.fn()} />);

    expect(screen.getByText("键盘快捷键速查 (Keyboard Shortcuts)")).toBeDefined();
    expect(screen.getByText("暂存与提交")).toBeDefined();
    expect(screen.getByText("日常操作")).toBeDefined();
    expect(screen.getByText("导航与视图")).toBeDefined();

    // Key shortcut entries
    expect(screen.getByText("在提交信息框内执行提交并推送")).toBeDefined();
    expect(screen.getByText("刷新工作区与仓库改动状态")).toBeDefined();
    expect(screen.getByText("丢弃所选文件的改动 (带安全快照与确认)")).toBeDefined();
  });

  it("calls onClose when close button is clicked", () => {
    const onClose = vi.fn();
    render(<ShortcutsHelpModal isOpen={true} onClose={onClose} />);

    const closeBtn = screen.getByTitle("关闭快捷键说明 (Esc)");
    fireEvent.click(closeBtn);

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
