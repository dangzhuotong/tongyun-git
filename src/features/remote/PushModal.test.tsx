import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { PushModal } from "./PushModal";
import * as host from "../../lib/host";

vi.mock("../../lib/host", () => ({
  inspectPush: vi.fn(),
  pushRemote: vi.fn(),
  pullRemote: vi.fn(),
}));

describe("PushModal", () => {
  const rootPath = "/mock/repo";
  const mockInspection: host.PushInspection = {
    current_branch: "feat-new",
    upstream_branch: null,
    default_remote: "origin",
    default_target_branch: "feat-new",
    needs_upstream_setup: true,
    ahead_count: 2,
    ahead_commits: [
      {
        oid: "1234567890abcdef",
        short_oid: "1234567",
        summary: "feat: commit one",
        author_name: "Developer",
      },
      {
        oid: "abcdef1234567890",
        short_oid: "abcdef1",
        summary: "feat: commit two",
        author_name: "Developer",
      },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(host.inspectPush).mockResolvedValue(mockInspection);
  });

  it("renders ahead commits and upstream checkbox when no upstream", async () => {
    render(
      <PushModal
        isOpen={true}
        rootPath={rootPath}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />
    );

    expect(await screen.findByText("feat: commit one")).toBeDefined();
    expect(screen.getByText("feat: commit two")).toBeDefined();
    expect(screen.getByText("2 个提交领先")).toBeDefined();
    expect(screen.getByText(/自动设置跟踪分支/)).toBeDefined();
  });

  it("handles push success", async () => {
    vi.mocked(host.pushRemote).mockResolvedValue({
      success: true,
      rejected: false,
      output: "ok",
      error_message: null,
    });

    const onClose = vi.fn();
    const onSuccess = vi.fn();

    render(
      <PushModal
        isOpen={true}
        rootPath={rootPath}
        onClose={onClose}
        onSuccess={onSuccess}
      />
    );

    await screen.findByText("feat: commit one");

    const pushBtn = screen.getByText("确定推送 (Push)");
    fireEvent.click(pushBtn);

    await waitFor(() => {
      expect(host.pushRemote).toHaveBeenCalledWith(
        rootPath,
        "origin",
        "feat-new",
        true
      );
      expect(onSuccess).toHaveBeenCalled();
      expect(onClose).toHaveBeenCalled();
    });
  });

  it("displays rejected message and pull option on rejected push", async () => {
    vi.mocked(host.pushRemote).mockResolvedValue({
      success: false,
      rejected: true,
      output: "",
      error_message: "远程包含您本地没有的新提交，请先拉取更新。",
    });

    render(
      <PushModal
        isOpen={true}
        rootPath={rootPath}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />
    );

    await screen.findByText("feat: commit one");

    const pushBtn = screen.getByText("确定推送 (Push)");
    fireEvent.click(pushBtn);

    expect(
      await screen.findByText("远程包含您本地没有的新提交，请先拉取更新。")
    ).toBeDefined();
    expect(screen.getByText("立即拉取更新 (Pull)")).toBeDefined();
  });
});
