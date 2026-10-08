import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { CreateBranchModal } from "./CreateBranchModal";
import * as host from "../../lib/host";

vi.mock("../../lib/host", () => ({
  validateBranchName: vi.fn(),
  createBranch: vi.fn(),
}));

describe("CreateBranchModal", () => {
  const rootPath = "/mock/repo";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders with startPoint and disables create button when empty", () => {
    render(
      <CreateBranchModal
        isOpen={true}
        onClose={vi.fn()}
        rootPath={rootPath}
        startPoint="main"
        onBranchCreated={vi.fn()}
      />
    );

    expect(screen.getByText("新建分支")).toBeDefined();
    expect(screen.getByText("main")).toBeDefined();
    const createBtn = screen.getByRole("button", { name: "创建" });
    expect(createBtn).toHaveProperty("disabled", true);
  });

  it("validates branch name in real time (AT-09b)", async () => {
    vi.mocked(host.validateBranchName).mockResolvedValue({
      valid: false,
      error_message: "分支名包含非法字符或格式不正确",
    });

    render(
      <CreateBranchModal
        isOpen={true}
        onClose={vi.fn()}
        rootPath={rootPath}
        startPoint="HEAD"
        onBranchCreated={vi.fn()}
      />
    );

    const input = screen.getByPlaceholderText("例如: feature/login");
    fireEvent.change(input, { target: { value: "invalid branch name" } });

    expect(await screen.findByText("分支名包含非法字符或格式不正确")).toBeDefined();
    const createBtn = screen.getByRole("button", { name: "创建" });
    expect(createBtn).toHaveProperty("disabled", true);
  });

  it("creates branch successfully with checkout option (AT-09a, AT-09c)", async () => {
    vi.mocked(host.validateBranchName).mockResolvedValue({
      valid: true,
      error_message: null,
    });
    vi.mocked(host.createBranch).mockResolvedValue(undefined);

    const onCreated = vi.fn();
    const onClose = vi.fn();

    render(
      <CreateBranchModal
        isOpen={true}
        onClose={onClose}
        rootPath={rootPath}
        startPoint="1111aaa"
        onBranchCreated={onCreated}
      />
    );

    const input = screen.getByPlaceholderText("例如: feature/login");
    fireEvent.change(input, { target: { value: "feat/search" } });

    await waitFor(() => {
      const createBtn = screen.getByRole("button", { name: "创建" });
      expect(createBtn).toHaveProperty("disabled", false);
    });

    const createBtn = screen.getByRole("button", { name: "创建" });
    fireEvent.click(createBtn);

    await waitFor(() => {
      expect(host.createBranch).toHaveBeenCalledWith(
        rootPath,
        "feat/search",
        "1111aaa",
        true
      );
      expect(onCreated).toHaveBeenCalled();
      expect(onClose).toHaveBeenCalled();
    });
  });
});
