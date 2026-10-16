import { renderHook, act, cleanup } from "@testing-library/react";
import { describe, it, expect, afterEach } from "vitest";
import { useAppModals } from "./useAppModals";

afterEach(() => {
  cleanup();
});

describe("useAppModals", () => {
  it("starts with every modal closed", () => {
    const { result } = renderHook(() => useAppModals());
    expect(result.current.openModalVisible).toBe(false);
    expect(result.current.settingsModalVisible).toBe(false);
    expect(result.current.branchModalOpen).toBe(false);
    expect(result.current.conflictModalOpen).toBe(false);
    expect(result.current.rebaseModalOpen).toBe(false);
    expect(result.current.workspaceTools).toBeNull();
  });

  it("opens the conflict modal with an optional target file", () => {
    const { result } = renderHook(() => useAppModals());

    act(() => result.current.handleOpenConflictModal());
    expect(result.current.conflictModalOpen).toBe(true);
    expect(result.current.conflictModalTargetFile).toBeNull();

    act(() => result.current.handleOpenConflictModal("src/a.ts"));
    expect(result.current.conflictModalOpen).toBe(true);
    expect(result.current.conflictModalTargetFile).toBe("src/a.ts");
  });

  it("stores the interactive rebase base and summary", () => {
    const { result } = renderHook(() => useAppModals());

    act(() => result.current.handleOpenInteractiveRebase("abc123", "init"));
    expect(result.current.rebaseModalOpen).toBe(true);
    expect(result.current.rebaseBaseOid).toBe("abc123");
    expect(result.current.rebaseBaseSummary).toBe("init");
  });
});
