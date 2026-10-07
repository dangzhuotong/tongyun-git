import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import App from "./App.tsx";
import * as host from "./lib/host.ts";
import * as tauriApp from "@tauri-apps/api/app";

vi.mock("./lib/host.ts", () => ({
  getAppInfo: vi.fn(),
}));

vi.mock("@tauri-apps/api/app", () => ({
  getName: vi.fn(),
}));

describe("App component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders app name and git version when host is available", async () => {
    vi.mocked(tauriApp.getName).mockResolvedValue("tongyun-git");
    vi.mocked(host.getAppInfo).mockResolvedValue({
      name: "tongyun-git",
      version: "0.0.0",
      identifier: "test-id",
      git_version: "2.47.3",
      libgit2_version: "1.9.0",
    });

    render(<App />);

    expect(await screen.findByText("tongyun-git")).toBeDefined();
    expect(await screen.findByText("2.47.3")).toBeDefined();
  });

  it("shows browser preview fallback message when host is unavailable", async () => {
    vi.mocked(tauriApp.getName).mockRejectedValue(new Error("Host unavailable"));
    vi.mocked(host.getAppInfo).mockRejectedValue(new Error("Host unavailable"));

    render(<App />);

    expect(await screen.findByText("浏览器预览：宿主接口不可用")).toBeDefined();
  });
});
