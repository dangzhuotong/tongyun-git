import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { InteractiveRebaseModal } from "./InteractiveRebaseModal";
import * as host from "../../lib/host";

vi.mock("../../lib/host", () => ({
  getRebaseCommits: vi.fn(),
  executeInteractiveRebase: vi.fn(),
}));

describe("InteractiveRebaseModal", () => {
  const rootPath = "/mock/repo";
  const baseOid = "base111222333";

  const mockCommits: host.RebaseItem[] = [
    {
      oid: "c111111111",
      short_oid: "c111111",
      summary: "First commit",
      author_name: "Alice",
      action: "pick",
      new_message: null,
    },
    {
      oid: "c222222222",
      short_oid: "c222222",
      summary: "Second commit",
      author_name: "Bob",
      action: "pick",
      new_message: null,
    },
    {
      oid: "c333333333",
      short_oid: "c333333",
      summary: "Third commit",
      author_name: "Charlie",
      action: "pick",
      new_message: null,
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(host.getRebaseCommits).mockResolvedValue(mockCommits);
    vi.mocked(host.executeInteractiveRebase).mockResolvedValue({
      success: true,
      has_conflict: false,
      message: "OK",
    });
  });

  it("does not render when isOpen is false", () => {
    const { container } = render(
      <InteractiveRebaseModal
        isOpen={false}
        onClose={vi.fn()}
        rootPath={rootPath}
        baseOid={baseOid}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders commit list and base oid", async () => {
    render(
      <InteractiveRebaseModal
        isOpen={true}
        onClose={vi.fn()}
        rootPath={rootPath}
        baseOid={baseOid}
        baseSummary="Initial release"
      />
    );

    expect(
      await screen.findByText("交互式变基 (Interactive Rebase)")
    ).toBeDefined();
    expect(await screen.findByText("First commit")).toBeDefined();
    expect(await screen.findByText("Second commit")).toBeDefined();
    expect(await screen.findByText("Third commit")).toBeDefined();
  });

  it("allows changing action from pick to squash or drop", async () => {
    render(
      <InteractiveRebaseModal
        isOpen={true}
        onClose={vi.fn()}
        rootPath={rootPath}
        baseOid={baseOid}
      />
    );

    await screen.findByText("First commit");
    const dropdowns = screen.getAllByRole("combobox");
    expect(dropdowns.length).toBe(3);

    fireEvent.change(dropdowns[1], { target: { value: "squash" } });
    expect((dropdowns[1] as HTMLSelectElement).value).toBe("squash");
  });

  it("validates that first active commit cannot be squash", async () => {
    render(
      <InteractiveRebaseModal
        isOpen={true}
        onClose={vi.fn()}
        rootPath={rootPath}
        baseOid={baseOid}
      />
    );

    await screen.findByText("First commit");
    const dropdowns = screen.getAllByRole("combobox");
    fireEvent.change(dropdowns[0], { target: { value: "squash" } });

    expect(
      await screen.findByText(
        "首个保留的提交不能为 Squash 或 Fixup，请将其设为 Pick 或 Reword。"
      )
    ).toBeDefined();

    const startBtn = screen.getByRole("button", { name: /开始变基/i });
    expect((startBtn as HTMLButtonElement).disabled).toBe(true);
  });

  it("submits rebase plan on start rebase", async () => {
    const onSuccess = vi.fn();
    const onClose = vi.fn();

    render(
      <InteractiveRebaseModal
        isOpen={true}
        onClose={onClose}
        rootPath={rootPath}
        baseOid={baseOid}
        onRebaseSuccess={onSuccess}
      />
    );

    await screen.findByText("First commit");
    const startBtn = screen.getByRole("button", { name: /开始变基/i });
    fireEvent.click(startBtn);

    await waitFor(() => {
      expect(host.executeInteractiveRebase).toHaveBeenCalledWith(rootPath, {
        base_oid: baseOid,
        items: expect.any(Array),
      });
      expect(onSuccess).toHaveBeenCalled();
      expect(onClose).toHaveBeenCalled();
    });
  });
});
