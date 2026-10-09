import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { StashModal } from "./StashModal";
import * as host from "../../lib/host";

vi.mock("../../lib/host", () => ({
  listStashes: vi.fn(),
  applyStash: vi.fn(),
  dropStash: vi.fn(),
  clearStashes: vi.fn(),
  showStashDiff: vi.fn(),
}));

describe("StashModal", () => {
  const rootPath = "/mock/repo";
  const mockStashes: host.StashItem[] = [
    {
      index: 0,
      name: "stash@{0}",
      branch: "main",
      message: "WIP work on feature A",
      date: "10 minutes ago",
    },
    {
      index: 1,
      name: "stash@{1}",
      branch: "dev",
      message: "temporary backup",
      date: "yesterday",
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(host.listStashes).mockResolvedValue(mockStashes);
    vi.mocked(host.showStashDiff).mockResolvedValue("diff --git a/file.txt b/file.txt\n+hello stash");
    vi.mocked(host.applyStash).mockResolvedValue({
      success: true,
      has_conflict: false,
      message: null,
    });
    vi.mocked(host.dropStash).mockResolvedValue();
    vi.mocked(host.clearStashes).mockResolvedValue();
  });

  it("renders stash list and previews diff", async () => {
    render(
      <StashModal
        isOpen={true}
        onClose={vi.fn()}
        rootPath={rootPath}
        onStashApplied={vi.fn()}
      />
    );

    expect(await screen.findByText("WIP work on feature A")).toBeDefined();
    expect(screen.getByText("temporary backup")).toBeDefined();

    await waitFor(() => {
      expect(host.showStashDiff).toHaveBeenCalledWith(rootPath, 0);
      expect(screen.getByText(/hello stash/)).toBeDefined();
    });
  });

  it("triggers pop on selected stash", async () => {
    const onStashApplied = vi.fn();
    render(
      <StashModal
        isOpen={true}
        onClose={vi.fn()}
        rootPath={rootPath}
        onStashApplied={onStashApplied}
      />
    );

    expect(await screen.findByText("WIP work on feature A")).toBeDefined();

    const popBtn = screen.getByRole("button", { name: /弹出 \(Pop\)/ });
    fireEvent.click(popBtn);

    await waitFor(() => {
      expect(host.applyStash).toHaveBeenCalledWith(rootPath, 0, true);
      expect(onStashApplied).toHaveBeenCalled();
    });
  });

  it("triggers apply on selected stash", async () => {
    const onStashApplied = vi.fn();
    const onClose = vi.fn();
    render(
      <StashModal
        isOpen={true}
        onClose={onClose}
        rootPath={rootPath}
        onStashApplied={onStashApplied}
      />
    );

    expect(await screen.findByText("WIP work on feature A")).toBeDefined();

    const applyBtn = screen.getByRole("button", { name: /应用 \(Apply\)/ });
    fireEvent.click(applyBtn);

    await waitFor(() => {
      expect(host.applyStash).toHaveBeenCalledWith(rootPath, 0, false);
      expect(onStashApplied).toHaveBeenCalled();
      expect(onClose).toHaveBeenCalled();
    });
  });

  it("triggers drop on selected stash", async () => {
    render(
      <StashModal
        isOpen={true}
        onClose={vi.fn()}
        rootPath={rootPath}
        onStashApplied={vi.fn()}
      />
    );

    expect(await screen.findByText("WIP work on feature A")).toBeDefined();

    const dropBtn = screen.getByRole("button", { name: /删除 \(Drop\)/ });
    fireEvent.click(dropBtn);

    await waitFor(() => {
      expect(host.dropStash).toHaveBeenCalledWith(rootPath, 0);
      expect(host.listStashes).toHaveBeenCalledTimes(2);
    });
  });

  it("triggers clear all with confirmation modal", async () => {
    render(
      <StashModal
        isOpen={true}
        onClose={vi.fn()}
        rootPath={rootPath}
        onStashApplied={vi.fn()}
      />
    );

    expect(await screen.findByText("WIP work on feature A")).toBeDefined();

    const clearAllBtn = screen.getByRole("button", { name: "清空全部贮藏" });
    fireEvent.click(clearAllBtn);

    expect(screen.getByText("确认清空所有贮藏？")).toBeDefined();

    const confirmBtn = screen.getByRole("button", { name: "确认清空" });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(host.clearStashes).toHaveBeenCalledWith(rootPath);
    });
  });
});
