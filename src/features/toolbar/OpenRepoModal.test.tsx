import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { OpenRepoModal } from "./OpenRepoModal";

vi.mock("@tauri-apps/api/webview", () => ({
  getCurrentWebview: () => ({
    onDragDropEvent: vi.fn().mockResolvedValue(() => {}),
  }),
}));

vi.mock("../../lib/host", () => ({
  selectFolder: vi.fn(),
}));

describe("OpenRepoModal", () => {
  it("renders open repo tab by default and triggers onOpenRepo", async () => {
    const onOpenRepo = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();

    render(
      <OpenRepoModal
        isOpen={true}
        onClose={onClose}
        onOpenRepo={onOpenRepo}
        recentRepos={["/path/to/recent"]}
        onRemoveRecent={vi.fn()}
        error={null}
        loading={false}
      />
    );

    expect(screen.getByText("打开本地 Git 仓库")).toBeDefined();
    expect(screen.getByText("/path/to/recent")).toBeDefined();

    const input = screen.getByPlaceholderText(/例如: D:\/TD\/projects\/my-repo/);
    fireEvent.change(input, { target: { value: "/my/custom/path" } });

    const openBtn = screen.getByRole("button", { name: "打开" });
    fireEvent.click(openBtn);

    await waitFor(() => {
      expect(onOpenRepo).toHaveBeenCalledWith("/my/custom/path");
    });
  });

  it("switches to clone tab and triggers onCloneRepo", async () => {
    const onCloneRepo = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();

    render(
      <OpenRepoModal
        isOpen={true}
        onClose={onClose}
        onOpenRepo={vi.fn()}
        onCloneRepo={onCloneRepo}
        recentRepos={[]}
        onRemoveRecent={vi.fn()}
        error={null}
        loading={false}
        initialTab="clone"
      />
    );

    expect(screen.getByText("从远程 Git 克隆仓库")).toBeDefined();

    const urlInput = screen.getByPlaceholderText(/例如: https:\/\/github.com/);
    const dirInput = screen.getByPlaceholderText(/例如: D:\/TD\/projects\/target-repo/);

    fireEvent.change(urlInput, { target: { value: "https://github.com/user/demo.git" } });
    fireEvent.change(dirInput, { target: { value: "D:/TD/demo" } });

    const cloneBtn = screen.getByRole("button", { name: "开始克隆并打开" });
    fireEvent.click(cloneBtn);

    await waitFor(() => {
      expect(onCloneRepo).toHaveBeenCalledWith(
        "https://github.com/user/demo.git",
        "D:/TD/demo"
      );
    });
  });
});
