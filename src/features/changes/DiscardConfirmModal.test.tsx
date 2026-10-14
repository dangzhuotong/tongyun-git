import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { DiscardConfirmModal } from "./DiscardConfirmModal";
import type { DiscardCandidate } from "../../lib/host";

describe("DiscardConfirmModal (AT-17b, AT-17c, AT-17g)", () => {
  const mockCandidates: DiscardCandidate[] = [
    {
      path: "src/modified.ts",
      will_delete: false,
      unrestorable: false,
      size: 1024,
    },
    {
      path: "src/untracked.ts",
      will_delete: true,
      unrestorable: false,
      size: 2048,
    },
  ];

  it("AT-17b: sets default focus on cancel button and handles cancel and confirm", async () => {
    const onClose = vi.fn();
    const onConfirm = vi.fn().mockResolvedValue(undefined);

    render(
      <DiscardConfirmModal
        isOpen={true}
        onClose={onClose}
        onConfirm={onConfirm}
        candidates={mockCandidates}
        loading={false}
      />
    );

    // Cancel button should receive focus by default (timeout 50ms)
    await waitFor(() => {
      const cancelBtn = screen.getByRole("button", { name: /取消/ });
      expect(document.activeElement).toBe(cancelBtn);
    });

    // Click cancel calls onClose
    const cancelBtn = screen.getByRole("button", { name: /取消/ });
    fireEvent.click(cancelBtn);
    expect(onClose).toHaveBeenCalled();

    // Click confirm calls onConfirm
    const confirmBtn = screen.getByRole("button", {
      name: `丢弃 ${mockCandidates.length} 个文件的改动`,
    });
    fireEvent.click(confirmBtn);
    expect(onConfirm).toHaveBeenCalled();
  });

  it("AT-17b: closes modal when Escape key is pressed", () => {
    const onClose = vi.fn();

    render(
      <DiscardConfirmModal
        isOpen={true}
        onClose={onClose}
        onConfirm={vi.fn()}
        candidates={mockCandidates}
        loading={false}
      />
    );

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(onClose).toHaveBeenCalled();
  });

  it("AT-17c: groups candidates into '将恢复至 HEAD' and '将直接删除'", () => {
    render(
      <DiscardConfirmModal
        isOpen={true}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
        candidates={mockCandidates}
        loading={false}
      />
    );

    expect(screen.getByText(/将恢复至 HEAD \(1\)/)).toBeDefined();
    expect(screen.getByText("modified.ts")).toBeDefined();

    expect(screen.getByText(/将直接删除 \(1\)/)).toBeDefined();
    expect(screen.getByText("untracked.ts")).toBeDefined();
  });

  it("AT-17g: displays warning badge and banner for unrestorable large files (>=50MB)", () => {
    const largeCandidates: DiscardCandidate[] = [
      {
        path: "huge-tracked.bin",
        will_delete: false,
        unrestorable: true,
        size: 60 * 1024 * 1024,
      },
      {
        path: "huge-data.bin",
        will_delete: true,
        unrestorable: true,
        size: 60 * 1024 * 1024,
      },
    ];

    render(
      <DiscardConfirmModal
        isOpen={true}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
        candidates={largeCandidates}
        loading={false}
      />
    );

    expect(
      screen.getByText(/提示：部分文件超过快照上限.*丢弃后将无法通过撤销恢复/)
    ).toBeDefined();
    expect(screen.getByText("超限无法快照")).toBeDefined();
    expect(screen.getByText("丢弃后无法恢复")).toBeDefined();
  });

  it("supports line-level discard confirmation mode", () => {
    render(
      <DiscardConfirmModal
        isOpen={true}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
        candidates={[
          {
            path: "src/file.ts",
            will_delete: false,
            unrestorable: false,
            size: 500,
          },
        ]}
        loading={false}
        lineCount={3}
      />
    );

    expect(screen.getByText(/确定丢弃选中的 3 行改动吗？/)).toBeDefined();
    expect(screen.getByText(/所选行所在文件 \(1\)/)).toBeDefined();
  });
});
