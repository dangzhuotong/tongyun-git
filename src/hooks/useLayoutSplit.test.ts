import { renderHook, act, cleanup } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { MouseEvent as ReactMouseEvent } from "react";
import { useLayoutSplit } from "./useLayoutSplit";

const mouseDown = () => {
  const preventDefault = vi.fn();
  return { event: { preventDefault } as unknown as ReactMouseEvent, preventDefault };
};

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  cleanup();
});

describe("useLayoutSplit initial state", () => {
  it("falls back to defaults when nothing is persisted", () => {
    const { result } = renderHook(() => useLayoutSplit());
    expect(result.current.sidebarWidth).toBe(320);
    expect(result.current.treeWidth).toBe(240);
    expect(result.current.treeCollapsed).toBe(false);
  });

  it("restores persisted widths and collapse state", () => {
    localStorage.setItem("tongyun_sidebar_width", "400");
    localStorage.setItem("tongyun_tree_width", "300");
    localStorage.setItem("tongyun_tree_collapsed", "true");
    const { result } = renderHook(() => useLayoutSplit());
    expect(result.current.sidebarWidth).toBe(400);
    expect(result.current.treeWidth).toBe(300);
    expect(result.current.treeCollapsed).toBe(true);
  });

  it("clamps persisted widths into their allowed ranges", () => {
    localStorage.setItem("tongyun_sidebar_width", "10");
    localStorage.setItem("tongyun_tree_width", "9999");
    const { result } = renderHook(() => useLayoutSplit());
    expect(result.current.sidebarWidth).toBe(220);
    expect(result.current.treeWidth).toBe(420);
  });
});

describe("useLayoutSplit persistence", () => {
  it("toggles tree collapse and writes it to storage", () => {
    const { result } = renderHook(() => useLayoutSplit());
    act(() => result.current.toggleTreeCollapsed());
    expect(result.current.treeCollapsed).toBe(true);
    expect(localStorage.getItem("tongyun_tree_collapsed")).toBe("true");

    act(() => result.current.toggleTreeCollapsed());
    expect(result.current.treeCollapsed).toBe(false);
    expect(localStorage.getItem("tongyun_tree_collapsed")).toBe("false");
  });
});

describe("useLayoutSplit resizing", () => {
  it("resizes and persists the tree width within bounds", () => {
    const { result } = renderHook(() => useLayoutSplit());
    const { event, preventDefault } = mouseDown();

    act(() => result.current.handleMouseDownTreeResize(event));
    expect(preventDefault).toHaveBeenCalled();

    act(() => window.dispatchEvent(new MouseEvent("mousemove", { clientX: 315 })));
    expect(result.current.treeWidth).toBe(315);

    act(() => window.dispatchEvent(new MouseEvent("mousemove", { clientX: 900 })));
    expect(result.current.treeWidth).toBe(420);

    act(() => window.dispatchEvent(new MouseEvent("mouseup", { clientX: 350 })));
    expect(localStorage.getItem("tongyun_tree_width")).toBe("350");
  });

  it("resizes the sidebar relative to the tree offset and persists", () => {
    const { result } = renderHook(() => useLayoutSplit());
    const { event } = mouseDown();

    act(() => result.current.handleMouseDownResize(event));
    act(() => window.dispatchEvent(new MouseEvent("mousemove", { clientX: 240 + 380 })));
    expect(result.current.sidebarWidth).toBe(380);

    act(() => window.dispatchEvent(new MouseEvent("mouseup", { clientX: 240 + 380 })));
    expect(localStorage.getItem("tongyun_sidebar_width")).toBe("380");
  });

  it("stops tracking after mouseup", () => {
    const { result } = renderHook(() => useLayoutSplit());
    const { event } = mouseDown();

    act(() => result.current.handleMouseDownTreeResize(event));
    act(() => window.dispatchEvent(new MouseEvent("mousemove", { clientX: 300 })));
    act(() => window.dispatchEvent(new MouseEvent("mouseup", { clientX: 300 })));
    act(() => window.dispatchEvent(new MouseEvent("mousemove", { clientX: 200 })));
    expect(result.current.treeWidth).toBe(300);
  });
});
