import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { PushedAmendWarningModal } from "./PushedAmendWarningModal";

describe("PushedAmendWarningModal", () => {
  it("AT-06h: sets default focus on cancel button when opened and handles cancel and confirm", async () => {
    const onClose = vi.fn();
    const onConfirm = vi.fn();

    render(
      <PushedAmendWarningModal
        isOpen={true}
        onClose={onClose}
        onConfirm={onConfirm}
        remoteBranches={["origin/main"]}
      />
    );

    expect(screen.getByText("修改已推送提交警告")).toBeDefined();
    expect(screen.getByText("• origin/main")).toBeDefined();

    const cancelBtn = screen.getByRole("button", { name: "取消" });
    const confirmBtn = screen.getByRole("button", { name: "仍然修改提交" });

    // Verify default focus is placed on the Cancel button (AT-06h / R-06)
    await waitFor(() => {
      expect(document.activeElement).toBe(cancelBtn);
    });

    // Clicking cancel triggers onClose, never onConfirm
    fireEvent.click(cancelBtn);
    expect(onClose).toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();

    // Clicking confirm triggers onConfirm
    fireEvent.click(confirmBtn);
    expect(onConfirm).toHaveBeenCalled();
  });

  it("AT-06h: closes modal on Escape key without confirming", () => {
    const onClose = vi.fn();
    const onConfirm = vi.fn();

    render(
      <PushedAmendWarningModal
        isOpen={true}
        onClose={onClose}
        onConfirm={onConfirm}
        remoteBranches={["origin/main"]}
      />
    );

    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
