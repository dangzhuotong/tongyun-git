import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { AiReviewModal } from "./AiReviewModal";
import type { DiffReviewResult } from "../../lib/host";

describe("AiReviewModal", () => {
  const mockResult: DiffReviewResult = {
    summary: "发现 1 处高危硬编码密码与 1 处调试日志",
    passed: false,
    issues: [
      {
        level: "danger",
        file: "src/config.ts",
        message: "检测到明文 API 密钥暴露",
        suggestion: "将其移至环境变量或配置中心",
      },
      {
        level: "warning",
        file: "src/auth.ts",
        message: "未处理可能的空指针异常",
        suggestion: "增加可选链或 null 检查",
      },
      {
        level: "info",
        file: "src/index.ts",
        message: "存在 console.log 临时调试日志",
        suggestion: "在提交前清理调试输出",
      },
    ],
  };

  it("renders review issues and filters correctly", () => {
    const handleClose = vi.fn();
    const handleProceed = vi.fn();

    render(
      <AiReviewModal
        isOpen={true}
        result={mockResult}
        loading={false}
        error={null}
        onClose={handleClose}
        onProceedCommit={handleProceed}
      />
    );

    expect(screen.getByText(/AI 提交前代码审查/i)).toBeDefined();
    expect(screen.getByText("发现 1 处高危硬编码密码与 1 处调试日志")).toBeDefined();
    expect(screen.getByText("检测到明文 API 密钥暴露")).toBeDefined();
    expect(screen.getByText("未处理可能的空指针异常")).toBeDefined();
    expect(screen.getByText("存在 console.log 临时调试日志")).toBeDefined();

    // Filter by danger
    const dangerTab = screen.getByRole("button", { name: /高危/i });
    fireEvent.click(dangerTab);

    expect(screen.getByText("检测到明文 API 密钥暴露")).toBeDefined();
    expect(screen.queryByText("未处理可能的空指针异常")).toBeNull();

    // Click proceed
    const proceedBtn = screen.getByRole("button", { name: "知晓并继续提交" });
    fireEvent.click(proceedBtn);
    expect(handleProceed).toHaveBeenCalledTimes(1);
    expect(handleClose).toHaveBeenCalledTimes(1);

    // Click close
    const closeBtn = screen.getByRole("button", { name: "关闭修改" });
    fireEvent.click(closeBtn);
    expect(handleClose).toHaveBeenCalledTimes(2);
  });

  it("renders passed state when no issues found", () => {
    const passedResult: DiffReviewResult = {
      summary: "代码质量良好，暂存区未检测到安全漏洞或代码异味",
      passed: true,
      issues: [],
    };

    render(
      <AiReviewModal
        isOpen={true}
        result={passedResult}
        loading={false}
        error={null}
        onClose={vi.fn()}
        onProceedCommit={vi.fn()}
      />
    );

    expect(screen.getByText(/审查通过/i)).toBeDefined();
    expect(screen.getByText("代码规范整洁")).toBeDefined();
  });
});
