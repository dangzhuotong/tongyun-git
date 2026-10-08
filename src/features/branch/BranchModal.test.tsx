import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { BranchModal } from "./BranchModal";
import * as host from "../../lib/host";

vi.mock("../../lib/host", () => ({
  listBranches: vi.fn(),
  switchBranch: vi.fn(),
  validateBranchName: vi.fn(),
  createBranch: vi.fn(),
}));

describe("BranchModal", () => {
  const rootPath = "/mock/repo";
  const mockBranches: host.BranchItem[] = [
    {
      name: "main",
      is_head: true,
      is_remote: false,
      upstream: "origin/main",
      ahead: 1,
      behind: 2,
      target_oid: "1111aaa",
    },
    {
      name: "dev",
      is_head: false,
      is_remote: false,
      upstream: null,
      ahead: 0,
      behind: 0,
      target_oid: "2222bbb",
    },
    {
      name: "origin/feat-remote",
      is_head: false,
      is_remote: true,
      upstream: null,
      ahead: 0,
      behind: 0,
      target_oid: "3333ccc",
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(host.listBranches).mockResolvedValue(mockBranches);
  });

  it("renders branch list with local and remote branches", async () => {
    render(
      <BranchModal
        isOpen={true}
        onClose={vi.fn()}
        rootPath={rootPath}
        onBranchSwitched={vi.fn()}
      />
    );

    expect(await screen.findByText("main")).toBeDefined();
    expect(screen.getByText("dev")).toBeDefined();
    expect(screen.getByText("origin/feat-remote")).toBeDefined();

    // Check HEAD button is disabled and ahead/behind badges are rendered
    const mainBtn = screen.getByText("main").closest("button")!;
    expect(mainBtn).toHaveProperty("disabled", true);
    expect(screen.getByText(/↑1/)).toBeDefined();
    expect(screen.getByText(/↓2/)).toBeDefined();
  });

  it("filters branch list by keyword", async () => {
    render(
      <BranchModal
        isOpen={true}
        onClose={vi.fn()}
        rootPath={rootPath}
        onBranchSwitched={vi.fn()}
      />
    );

    await screen.findByText("main");
    const input = screen.getByPlaceholderText("过滤分支...");
    fireEvent.change(input, { target: { value: "feat" } });

    expect(screen.queryByText("main")).toBeNull();
    expect(screen.queryByText("dev")).toBeNull();
    expect(screen.getByText("origin/feat-remote")).toBeDefined();
  });

  it("switches to a local branch on click", async () => {
    const onSwitched = vi.fn();
    const onClose = vi.fn();
    vi.mocked(host.switchBranch).mockResolvedValue({
      success: true,
      current_branch: "dev",
      conflicting_files: [],
      error_message: null,
    });

    render(
      <BranchModal
        isOpen={true}
        onClose={onClose}
        rootPath={rootPath}
        onBranchSwitched={onSwitched}
      />
    );

    const devBtn = await screen.findByText("dev");
    fireEvent.click(devBtn.closest("button")!);

    await waitFor(() => {
      expect(host.switchBranch).toHaveBeenCalledWith(rootPath, "dev", false);
      expect(onSwitched).toHaveBeenCalled();
      expect(onClose).toHaveBeenCalled();
    });
  });

  it("handles checkout conflicts blocking switch (AT-08c)", async () => {
    vi.mocked(host.switchBranch).mockResolvedValue({
      success: false,
      current_branch: "main",
      conflicting_files: ["src/main.rs", "Cargo.toml"],
      error_message: "Your local changes to the following files would be overwritten by checkout",
    });

    render(
      <BranchModal
        isOpen={true}
        onClose={vi.fn()}
        rootPath={rootPath}
        onBranchSwitched={vi.fn()}
      />
    );

    const devBtn = await screen.findByText("dev");
    fireEvent.click(devBtn.closest("button")!);

    expect(await screen.findByText("无法切换分支")).toBeDefined();
    expect(screen.getByText(/将覆盖下列文件的未提交改动/)).toBeDefined();
    expect(screen.getByText(/src\/main\.rs/)).toBeDefined();
    expect(screen.getByText(/Cargo\.toml/)).toBeDefined();

    // Clicking "知道了" dismisses the conflict modal
    const okBtn = screen.getByText("知道了");
    fireEvent.click(okBtn);

    await waitFor(() => {
      expect(screen.queryByText("无法切换分支")).toBeNull();
    });
  });
});
