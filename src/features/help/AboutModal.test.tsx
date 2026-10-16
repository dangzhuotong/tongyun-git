import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AboutModal } from "./AboutModal";

describe("AboutModal", () => {
  it("shows the current version and checks for updates", () => {
    const onCheckUpdate = vi.fn();
    const onClose = vi.fn();
    render(
      <AboutModal
        isOpen
        onClose={onClose}
        appInfo={{
          name: "tongyun-git",
          version: "0.1.0",
          identifier: "com.tongyun.git",
          git_version: "2.47.0",
          libgit2_version: "1.9.0",
        }}
        onCheckUpdate={onCheckUpdate}
      />
    );

    expect(screen.getByText("当前版本 v0.1.0")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "检查更新" }));
    expect(onCheckUpdate).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByRole("button", { name: "确定" }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
