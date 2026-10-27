import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Update } from "@tauri-apps/plugin-updater";
import { UpdateModal } from "./UpdateModal";

vi.mock("@tauri-apps/plugin-process", () => ({
  relaunch: vi.fn(async () => {}),
}));

function fakeUpdate(overrides: Partial<Update> = {}): Update {
  return {
    version: "0.2.0",
    currentVersion: "0.1.0",
    date: "2026-10-16T00:00:00Z",
    body: "修复若干问题",
    downloadAndInstall: vi.fn(async () => {}),
    close: vi.fn(async () => {}),
    ...overrides,
  } as unknown as Update;
}

describe("UpdateModal", () => {
  it("shows the new version and can be dismissed", () => {
    const onClose = vi.fn();
    render(<UpdateModal update={fakeUpdate()} onClose={onClose} />);

    expect(screen.getByText("发现新版本")).toBeDefined();
    expect(screen.getByText("v0.2.0")).toBeDefined();
    expect(screen.getByText("修复若干问题")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "稍后" }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("downloads and installs when confirmed", async () => {
    const update = fakeUpdate();
    render(<UpdateModal update={update} onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "立即更新并重启" }));
    await waitFor(() => {
      expect(update.downloadAndInstall).toHaveBeenCalledOnce();
    });
  });
});
