import { renderHook } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { useEscapeKey } from "./useEscapeKey";

describe("useEscapeKey hook", () => {
  it("invokes onClose callback when Escape key is pressed", () => {
    const onClose = vi.fn();
    renderHook(() => useEscapeKey(onClose, true));

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not invoke onClose when non-Escape keys are pressed", () => {
    const onClose = vi.fn();
    renderHook(() => useEscapeKey(onClose, true));

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    window.dispatchEvent(new KeyboardEvent("keydown", { key: " " }));
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab" }));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("does not invoke onClose when enabled is false", () => {
    const onClose = vi.fn();
    renderHook(() => useEscapeKey(onClose, false));

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("removes event listener on unmount", () => {
    const onClose = vi.fn();
    const { unmount } = renderHook(() => useEscapeKey(onClose, true));

    unmount();
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(onClose).not.toHaveBeenCalled();
  });
});
