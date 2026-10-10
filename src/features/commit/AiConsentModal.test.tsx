import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { AiConsentModal } from "./AiConsentModal";

describe("AiConsentModal", () => {
  it("AT-07f: renders consent dialog with endpoint and handles cancel and confirm", () => {
    const onClose = vi.fn();
    const onConfirm = vi.fn();

    render(
      <AiConsentModal
        isOpen={true}
        onClose={onClose}
        onConfirm={onConfirm}
        endpointUrl="https://api.kie.ai/kie-default/v1/chat/completions"
      />
    );

    expect(screen.getByText("AI 生成提交信息授权")).toBeDefined();
    expect(
      screen.getByText("https://api.kie.ai/kie-default/v1/chat/completions")
    ).toBeDefined();
    expect(screen.getByText("发送内容包括：")).toBeDefined();
    expect(screen.getAllByText(/已暂存的代码改动/).length).toBeGreaterThanOrEqual(1);

    // Cancel action (AT-07f: 取消则不执行请求)
    const cancelBtn = screen.getByRole("button", { name: "取消" });
    fireEvent.click(cancelBtn);
    expect(onClose).toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();

    // Confirm action
    const confirmBtn = screen.getByRole("button", { name: "同意并生成" });
    fireEvent.click(confirmBtn);
    expect(onConfirm).toHaveBeenCalled();
  });

  it("AT-07f: closes modal when Escape key is pressed", () => {
    const onClose = vi.fn();
    render(
      <AiConsentModal
        isOpen={true}
        onClose={onClose}
        onConfirm={vi.fn()}
        endpointUrl="https://api.kie.ai/kie-default/v1/chat/completions"
      />
    );

    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });
});
