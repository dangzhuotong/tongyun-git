import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { DiffViewer } from "./DiffViewer";
import type { FileDiff } from "../../lib/host";

const longContent =
  "const veryLongVariableNameToTestDiffViewerHorizontalScrollingBehaviorWithoutTruncation = 'super long string value that should overflow and not be truncated';";

const mockDiff: FileDiff = {
  path: "src/example.ts",
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
        { origin: "-", old_lineno: 2, new_lineno: null, content: "const oldLine = 2;" },
        { origin: "+", old_lineno: null, new_lineno: 2, content: longContent },
        { origin: " ", old_lineno: 3, new_lineno: 3, content: "const c = 3;" },
      ],
    },
  ],
};

const mockMultiHunkDiff: FileDiff = {
  path: "src/multi.ts",
  old_path: null,
  staged: false,
  is_binary: false,
  is_crlf_change: false,
  is_large: false,
  hunks: [
    {
      header: "@@ -1,5 +1,6 @@",
      old_start: 1,
      old_lines: 5,
      new_start: 1,
      new_lines: 6,
      lines: [
        { origin: "-", old_lineno: 1, new_lineno: null, content: "del 1" },
        { origin: "-", old_lineno: 2, new_lineno: null, content: "del 2" },
        { origin: "+", old_lineno: null, new_lineno: 1, content: "add 1" },
        { origin: " ", old_lineno: 3, new_lineno: 2, content: "context 1" },
      ],
    },
    {
      header: "@@ -10,3 +11,6 @@",
      old_start: 10,
      old_lines: 3,
      new_start: 11,
      new_lines: 6,
      lines: [
        { origin: "+", old_lineno: null, new_lineno: 11, content: "add 2" },
        { origin: "+", old_lineno: null, new_lineno: 12, content: "add 3" },
        { origin: "+", old_lineno: null, new_lineno: 13, content: "add 4" },
        { origin: " ", old_lineno: 11, new_lineno: 14, content: "context 2" },
      ],
    },
  ],
};

const mockCrlfDiff: FileDiff = {
  path: "docs/crlf.txt",
  old_path: null,
  staged: false,
  is_binary: false,
  is_crlf_change: true,
  is_large: false,
  hunks: [
    {
      header: "@@ -1,2 +1,2 @@",
      old_start: 1,
      old_lines: 2,
      new_start: 1,
      new_lines: 2,
      lines: [
        { origin: " ", old_lineno: 1, new_lineno: 1, content: "hello" },
        { origin: "+", old_lineno: null, new_lineno: 2, content: "world" },
      ],
    },
  ],
};

const mockCrlfEmptyHunksDiff: FileDiff = {
  path: "docs/crlf-only.txt",
  old_path: null,
  staged: false,
  is_binary: false,
  is_crlf_change: true,
  is_large: false,
  hunks: [],
};

const mockBinaryDiff: FileDiff = {
  path: "assets/logo.png",
  old_path: null,
  staged: false,
  is_binary: true,
  old_size: 1024,
  new_size: 2048,
  is_crlf_change: false,
  is_large: false,
  hunks: [],
};

describe("DiffViewer", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("renders long lines without truncate class in unified view", () => {
    localStorage.setItem("tongyun_diff_layout", "unified");

    render(
      <DiffViewer
        diff={mockDiff}
        loading={false}
        error={null}
      />
    );

    const longLineSpan = screen.getByText((_, el) => el?.textContent?.trim() === longContent.trim());
    expect(longLineSpan).toBeDefined();
    expect(longLineSpan.className).not.toContain("truncate");
    expect(longLineSpan.className).not.toContain("overflow-x-hidden");
    expect(longLineSpan.className).toContain("whitespace-pre");
  });

  it("renders split view with two scroll containers and matching row counts", () => {
    localStorage.setItem("tongyun_diff_layout", "split");

    render(
      <DiffViewer
        diff={mockDiff}
        loading={false}
        error={null}
      />
    );

    const leftContainer = screen.getByTestId("diff-split-left");
    const rightContainer = screen.getByTestId("diff-split-right");

    expect(leftContainer).toBeDefined();
    expect(rightContainer).toBeDefined();

    // Check row counts on both sides (each row is h-[20px])
    const leftRows = leftContainer.querySelectorAll(".h-\\[20px\\]");
    const rightRows = rightContainer.querySelectorAll(".h-\\[20px\\]");
    expect(leftRows.length).toBeGreaterThan(0);
    expect(leftRows.length).toBe(rightRows.length);

    // Verify long line in split view does not have truncate class
    const longLineSpan = screen.getByText((_, el) => el?.textContent?.trim() === longContent.trim());
    expect(longLineSpan.className).not.toContain("truncate");
    expect(longLineSpan.className).not.toContain("overflow-x-hidden");
  });

  it("synchronizes scrollTop and scrollLeft from left to right and vice versa in split view", () => {
    localStorage.setItem("tongyun_diff_layout", "split");

    render(
      <DiffViewer
        diff={mockDiff}
        loading={false}
        error={null}
      />
    );

    const left = screen.getByTestId("diff-split-left");
    const right = screen.getByTestId("diff-split-right");

    // Scroll left -> right should follow
    left.scrollTop = 150;
    left.scrollLeft = 90;
    fireEvent.scroll(left);

    expect(right.scrollTop).toBe(150);
    expect(right.scrollLeft).toBe(90);

    // Scroll right -> left should follow
    right.scrollTop = 320;
    right.scrollLeft = 210;
    fireEvent.scroll(right);

    expect(left.scrollTop).toBe(320);
    expect(left.scrollLeft).toBe(210);
  });

  it("prevents rebound by ignoring echo scroll events from non-active side and syncs from active side", () => {
    localStorage.setItem("tongyun_diff_layout", "split");

    render(
      <DiffViewer
        diff={mockDiff}
        loading={false}
        error={null}
      />
    );

    const left = screen.getByTestId("diff-split-left");
    const right = screen.getByTestId("diff-split-right");

    // (a) 在右栏 fireEvent.mouseEnter 后，对左栏派发 scroll 事件（模拟回声）不会改写右栏的值
    right.scrollTop = 250;
    right.scrollLeft = 120;
    fireEvent.mouseEnter(right);

    // 模拟左栏因尺寸不同或夹紧派发不同坐标的回声 scroll 事件
    left.scrollTop = 180;
    left.scrollLeft = 80;
    fireEvent.scroll(left);

    // 右栏值不被左栏回声改写
    expect(right.scrollTop).toBe(250);
    expect(right.scrollLeft).toBe(120);

    // (b) 在左栏 mouseEnter 后滚左栏，右栏跟随
    fireEvent.mouseEnter(left);
    left.scrollTop = 360;
    left.scrollLeft = 140;
    fireEvent.scroll(left);

    expect(right.scrollTop).toBe(360);
    expect(right.scrollLeft).toBe(140);
  });

  it("aligns rows across multiple hunks in split view", () => {
    localStorage.setItem("tongyun_diff_layout", "split");

    render(
      <DiffViewer
        diff={mockMultiHunkDiff}
        loading={false}
        error={null}
      />
    );

    const left = screen.getByTestId("diff-split-left");
    const right = screen.getByTestId("diff-split-right");

    const leftRows = left.querySelectorAll(".h-\\[20px\\]");
    const rightRows = right.querySelectorAll(".h-\\[20px\\]");

    // Both sides should have aligned row count
    expect(leftRows.length).toBe(rightRows.length);
    // Hunk 1: 2 deletes aligned with 1 add -> max(2, 1) = 2, + 1 context = 3 rows
    // Hunk 2: 0 deletes aligned with 3 adds -> max(0, 3) = 3, + 1 context = 4 rows
    // Total rows = 3 + 4 = 7 rows
    expect(leftRows.length).toBe(7);
  });

  it("allows selecting lines in split view and triggers staging", async () => {
    localStorage.setItem("tongyun_diff_layout", "split");
    const onStageHunkLines = vi.fn().mockResolvedValue(undefined);

    render(
      <DiffViewer
        diff={mockDiff}
        loading={false}
        error={null}
        onStageHunkLines={onStageHunkLines}
      />
    );

    // Click addition line on right side
    const addLine = screen.getByText((_, el) => el?.textContent?.trim() === longContent.trim());
    fireEvent.click(addLine);

    // Space key to stage selected line
    fireEvent.keyDown(window, { key: " " });

    expect(onStageHunkLines).toHaveBeenCalledWith(0, [2], false);
  });

  it("switches layout between unified and split views using toolbar buttons", () => {
    localStorage.setItem("tongyun_diff_layout", "unified");

    render(
      <DiffViewer
        diff={mockDiff}
        loading={false}
        error={null}
      />
    );

    expect(screen.queryByTestId("diff-split-left")).toBeNull();

    // Click split button
    const splitBtn = screen.getByTitle("左右分栏对比视图 (Split)");
    fireEvent.click(splitBtn);

    expect(screen.getByTestId("diff-split-left")).toBeDefined();
    expect(screen.getByTestId("diff-split-right")).toBeDefined();
    expect(localStorage.getItem("tongyun_diff_layout")).toBe("split");

    // Click unified button
    const unifiedBtn = screen.getByTitle("统一视图 (Unified)");
    fireEvent.click(unifiedBtn);

    expect(screen.queryByTestId("diff-split-left")).toBeNull();
    expect(localStorage.getItem("tongyun_diff_layout")).toBe("unified");
  });

  // --- AT-03b: CRLF line-ending change tests ---

  it("AT-03b: renders CRLF line-ending change notice banner when is_crlf_change is true", () => {
    render(
      <DiffViewer
        diff={mockCrlfDiff}
        loading={false}
        error={null}
      />
    );

    expect(
      screen.getByText("文件仅换行符（CRLF ↔ LF）发生变化。")
    ).toBeDefined();
    expect(screen.getByText("docs/crlf.txt")).toBeDefined();
    expect(screen.getByText("未暂存改动 (工作区 对比 Index)")).toBeDefined();
    expect(screen.getByText("world")).toBeDefined();
  });

  it("AT-03b: renders CRLF notice banner even when diff has no hunks", () => {
    render(
      <DiffViewer
        diff={mockCrlfEmptyHunksDiff}
        loading={false}
        error={null}
      />
    );

    expect(
      screen.getByText("文件仅换行符（CRLF ↔ LF）发生变化。")
    ).toBeDefined();
    expect(screen.getByText("该文件无内容改动或改动已被忽略。")).toBeDefined();
  });

  it("AT-03b: does not render CRLF notice banner when is_crlf_change is false", () => {
    render(
      <DiffViewer
        diff={mockDiff}
        loading={false}
        error={null}
      />
    );

    expect(
      screen.queryByText("文件仅换行符（CRLF ↔ LF）发生变化。")
    ).toBeNull();
  });

  it("AT-03b: suppresses line-level discard action for CRLF change diffs", () => {
    const onDiscardHunkLines = vi.fn();
    render(
      <DiffViewer
        diff={mockCrlfDiff}
        loading={false}
        error={null}
        onDiscardHunkLines={onDiscardHunkLines}
      />
    );

    // Select the changed line
    const addLine = screen.getByText("world");
    fireEvent.click(addLine);

    // The discard button should not be displayed
    expect(screen.queryByText(/丢弃所选行/)).toBeNull();

    // Press 'd' shortcut - should not trigger discard
    fireEvent.keyDown(window, { key: "d" });
    expect(onDiscardHunkLines).not.toHaveBeenCalled();
  });

  // --- AT-03c: Binary file notice tests ---

  it("AT-03c: renders binary file notice with formatted file size change", () => {
    render(
      <DiffViewer
        diff={mockBinaryDiff}
        loading={false}
        error={null}
      />
    );

    expect(screen.getByText("二进制文件")).toBeDefined();
    expect(screen.getByText("大小变化: 1.0 KB → 2.0 KB")).toBeDefined();
    expect(screen.getByText("assets/logo.png")).toBeDefined();
    expect(screen.queryByText("该文件无内容改动或改动已被忽略。")).toBeNull();
  });

  it("AT-03c: formats various file size changes correctly in binary view (bytes, MB, null/unknown)", () => {
    const { rerender } = render(
      <DiffViewer
        diff={{
          ...mockBinaryDiff,
          old_size: 512,
          new_size: 768,
        }}
        loading={false}
        error={null}
      />
    );
    expect(screen.getByText("大小变化: 512 B → 768 B")).toBeDefined();

    rerender(
      <DiffViewer
        diff={{
          ...mockBinaryDiff,
          old_size: 1048576,
          new_size: 3145728,
        }}
        loading={false}
        error={null}
      />
    );
    expect(screen.getByText("大小变化: 1.00 MB → 3.00 MB")).toBeDefined();

    rerender(
      <DiffViewer
        diff={{
          ...mockBinaryDiff,
          old_size: null,
          new_size: 1024,
        }}
        loading={false}
        error={null}
      />
    );
    expect(screen.getByText("大小变化: 未知 → 1.0 KB")).toBeDefined();

    rerender(
      <DiffViewer
        diff={{
          ...mockBinaryDiff,
          old_size: null,
          new_size: null,
        }}
        loading={false}
        error={null}
      />
    );
    expect(screen.getByText("大小变化: 未知 → 未知")).toBeDefined();
  });

  it("AT-03c: disables line staging shortcuts, buttons, and split layout for binary files", () => {
    localStorage.setItem("tongyun_diff_layout", "split");
    const onStageHunkLines = vi.fn().mockResolvedValue(undefined);

    render(
      <DiffViewer
        diff={mockBinaryDiff}
        loading={false}
        error={null}
        onStageHunkLines={onStageHunkLines}
      />
    );

    // Staging button should not be present
    expect(screen.queryByText(/暂存所选/)).toBeNull();

    // Split containers should not be rendered for binary files
    expect(screen.queryByTestId("diff-split-left")).toBeNull();
    expect(screen.queryByTestId("diff-split-right")).toBeNull();

    // Press 'a' key (select all) then ' ' (stage) - should be no-op for binary files
    fireEvent.keyDown(window, { key: "a" });
    fireEvent.keyDown(window, { key: " " });
    expect(onStageHunkLines).not.toHaveBeenCalled();
  });
});

