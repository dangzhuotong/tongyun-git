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

    const longLineSpan = screen.getByText(longContent);
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
    const longLineSpan = screen.getByText(longContent);
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
    const addLine = screen.getByText(longContent);
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
});
