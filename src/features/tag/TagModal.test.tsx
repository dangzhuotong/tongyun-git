import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { TagModal } from "./TagModal";
import * as host from "../../lib/host";

vi.mock("../../lib/host", () => ({
  listTags: vi.fn(),
  deleteTag: vi.fn(),
  pushTag: vi.fn(),
  pushAllTags: vi.fn(),
  deleteRemoteTag: vi.fn(),
  createTag: vi.fn(),
}));

describe("TagModal", () => {
  const rootPath = "/test/repo";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not render when isOpen is false", () => {
    const { container } = render(
      <TagModal isOpen={false} onClose={vi.fn()} rootPath={rootPath} />
    );
    expect(container.firstChild).toBeNull();
  });

  it("loads and displays tag list and filters by keyword", async () => {
    vi.mocked(host.listTags).mockResolvedValue([
      {
        name: "v1.0.0",
        target_oid: "abc123456789",
        short_oid: "abc1234",
        is_annotated: true,
        message: "Release 1.0.0",
        tagger_name: "Developer",
        timestamp: 1712500000,
      },
      {
        name: "v0.9.0",
        target_oid: "def123456789",
        short_oid: "def1234",
        is_annotated: false,
        message: null,
        tagger_name: null,
        timestamp: 1712400000,
      },
    ]);

    render(<TagModal isOpen={true} onClose={vi.fn()} rootPath={rootPath} />);

    expect(await screen.findByText("v1.0.0")).toBeDefined();
    expect(screen.getByText("v0.9.0")).toBeDefined();
    expect(screen.getByText("Release 1.0.0")).toBeDefined();

    // Filter by '1.0'
    const filterInput = screen.getByPlaceholderText(/搜索标签名称/);
    fireEvent.change(filterInput, { target: { value: "1.0" } });

    expect(screen.getByText("v1.0.0")).toBeDefined();
    expect(screen.queryByText("v0.9.0")).toBeNull();
  });

  it("supports pushing single tag and pushing all tags", async () => {
    vi.mocked(host.listTags).mockResolvedValue([
      {
        name: "v1.0.0",
        target_oid: "abc123456789",
        short_oid: "abc1234",
        is_annotated: false,
        message: null,
        tagger_name: null,
        timestamp: 1712500000,
      },
    ]);
    vi.mocked(host.pushTag).mockResolvedValue();
    vi.mocked(host.pushAllTags).mockResolvedValue();

    render(<TagModal isOpen={true} onClose={vi.fn()} rootPath={rootPath} />);
    await screen.findByText("v1.0.0");

    // Click push single tag
    const pushSingleBtn = screen.getByRole("button", { name: "推送" });
    fireEvent.click(pushSingleBtn);

    await waitFor(() => {
      expect(host.pushTag).toHaveBeenCalledWith(rootPath, "v1.0.0");
    });

    // 单条推送完成前「推送全部」是禁用的，这时点击不会调用 pushAllTags。
    await waitFor(() => {
      const button = screen.getByRole("button", { name: /推送全部标签/ }) as HTMLButtonElement;
      expect(button.disabled).toBe(false);
    });
    fireEvent.click(screen.getByRole("button", { name: /推送全部标签/ }));

    await waitFor(() => {
      expect(host.pushAllTags).toHaveBeenCalledWith(rootPath);
    });
  });

  it("handles deleting a tag with remote deletion", async () => {
    vi.mocked(host.listTags).mockResolvedValue([
      {
        name: "v1.0.0",
        target_oid: "abc123456789",
        short_oid: "abc1234",
        is_annotated: false,
        message: null,
        tagger_name: null,
        timestamp: 1712500000,
      },
    ]);
    vi.mocked(host.deleteTag).mockResolvedValue();
    vi.mocked(host.deleteRemoteTag).mockResolvedValue();

    render(<TagModal isOpen={true} onClose={vi.fn()} rootPath={rootPath} />);
    await screen.findByText("v1.0.0");

    const deleteBtn = screen.getByRole("button", { name: "删除" });
    fireEvent.click(deleteBtn);

    // Confirmation dialog appears
    expect(screen.getByText(/确定要删除标签/)).toBeDefined();

    // Check delete remote
    const remoteCheckbox = screen.getByLabelText(/同时删除远程仓库上的同名标签/);
    fireEvent.click(remoteCheckbox);

    const confirmBtn = screen.getByRole("button", { name: "确认删除" });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(host.deleteTag).toHaveBeenCalledWith(rootPath, "v1.0.0");
      expect(host.deleteRemoteTag).toHaveBeenCalledWith(rootPath, "v1.0.0");
    });
  });
});
