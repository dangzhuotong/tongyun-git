import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { SettingsModal } from "./SettingsModal";
import * as host from "../../lib/host";

vi.mock("../../lib/host", () => ({
  checkGit: vi.fn(),
  getAiKeyStatus: vi.fn(),
  saveAiKey: vi.fn(),
  deleteAiKey: vi.fn(),
  testAiConnection: vi.fn(),
  fetchOllamaModels: vi.fn(),
}));

describe("SettingsModal component", () => {
  const defaultAppInfo = {
    name: "tongyun-git",
    version: "0.1.0",
    identifier: "test-id",
    git_version: "2.47.0",
    libgit2_version: "1.9.0",
  };

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it("switches between General and AI tabs", async () => {
    vi.mocked(host.getAiKeyStatus).mockResolvedValue({
      kie: false,
      openai: false,
      ollama: false,
      keyring_available: true,
    });

    render(
      <SettingsModal
        isOpen={true}
        onClose={vi.fn()}
        appInfo={defaultAppInfo}
        theme="system"
        onThemeChange={vi.fn()}
        gitPath=""
        onGitPathChange={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(host.getAiKeyStatus).toHaveBeenCalled();
    });

    // Initial tab is General
    expect(screen.getByText("Git 可执行文件路径")).toBeDefined();

    // Click AI tab
    const aiTab = screen.getByText("AI 提交助手");
    fireEvent.click(aiTab);

    expect(screen.getByText("AI 服务提供方")).toBeDefined();
    expect(screen.getByText("API 密钥 (安全存入系统钥匙串)")).toBeDefined();
  });

  it("AT-13c & AT-13d & AT-13e: computes endpoint URLs correctly for KIE, OpenAI, and Ollama", async () => {
    vi.mocked(host.getAiKeyStatus).mockResolvedValue({
      kie: true,
      openai: false,
      ollama: false,
      keyring_available: true,
    });

    render(
      <SettingsModal
        isOpen={true}
        onClose={vi.fn()}
        appInfo={defaultAppInfo}
        theme="system"
        onThemeChange={vi.fn()}
        gitPath=""
        onGitPathChange={vi.fn()}
        initialTab="ai"
      />
    );

    await waitFor(() => {
      expect(host.getAiKeyStatus).toHaveBeenCalled();
    });

    // Default is KIE
    expect(
      screen.getByText("https://api.kie.ai/kie-default/v1/chat/completions")
    ).toBeDefined();

    // Switch to OpenAI
    const openaiBtn = screen.getByRole("button", { name: "OpenAI 兼容" });
    fireEvent.click(openaiBtn);
    expect(
      screen.getByText("https://api.openai.com/v1/chat/completions")
    ).toBeDefined();

    // Switch to Ollama
    const ollamaBtn = screen.getByRole("button", { name: "Ollama (本地)" });
    fireEvent.click(ollamaBtn);
    expect(
      screen.getByText("http://localhost:11434/v1/chat/completions")
    ).toBeDefined();
  });

  it("AT-13i: shows warning for plaintext HTTP with non-local IP/domain and hides when localhost", async () => {
    vi.mocked(host.getAiKeyStatus).mockResolvedValue({
      kie: false,
      openai: false,
      ollama: false,
      keyring_available: true,
    });

    render(
      <SettingsModal
        isOpen={true}
        onClose={vi.fn()}
        appInfo={defaultAppInfo}
        theme="system"
        onThemeChange={vi.fn()}
        gitPath=""
        onGitPathChange={vi.fn()}
        initialTab="ai"
      />
    );

    await waitFor(() => {
      expect(host.getAiKeyStatus).toHaveBeenCalled();
    });

    const ollamaBtn = screen.getByRole("button", { name: "Ollama (本地)" });
    fireEvent.click(ollamaBtn);

    const baseUrlInput = screen.getByPlaceholderText(
      "http://localhost:11434"
    ) as HTMLInputElement;

    // Change to external HTTP IP
    fireEvent.change(baseUrlInput, {
      target: { value: "http://192.168.1.100:11434" },
    });
    expect(
      screen.getByText("该地址使用 HTTP 明文协议，请求内容和凭据可能明文经过网络")
    ).toBeDefined();

    // Change back to localhost
    fireEvent.change(baseUrlInput, {
      target: { value: "http://localhost:11434" },
    });
    expect(
      screen.queryByText(
        "该地址使用 HTTP 明文协议，请求内容和凭据可能明文经过网络"
      )
    ).toBeNull();
  });

  it("AT-13g: warns and disables key input when system keyring is unavailable", async () => {
    vi.mocked(host.getAiKeyStatus).mockResolvedValue({
      kie: false,
      openai: false,
      ollama: false,
      keyring_available: false,
    });

    render(
      <SettingsModal
        isOpen={true}
        onClose={vi.fn()}
        appInfo={defaultAppInfo}
        theme="system"
        onThemeChange={vi.fn()}
        gitPath=""
        onGitPathChange={vi.fn()}
        initialTab="ai"
      />
    );

    expect(
      await screen.findByText(/系统钥匙串服务不可用（如 Linux 未运行 Secret Service）/)
    ).toBeDefined();
    expect(screen.queryByPlaceholderText(/输入 API Key/)).toBeNull();
  });

  it("AT-13a & AT-13h: saves and deletes key without showing plaintext key", async () => {
    vi.mocked(host.getAiKeyStatus)
      .mockResolvedValueOnce({
        kie: false,
        openai: false,
        ollama: false,
        keyring_available: true,
      })
      .mockResolvedValueOnce({
        kie: true,
        openai: false,
        ollama: false,
        keyring_available: true,
      })
      .mockResolvedValueOnce({
        kie: false,
        openai: false,
        ollama: false,
        keyring_available: true,
      });

    vi.mocked(host.saveAiKey).mockResolvedValue();
    vi.mocked(host.deleteAiKey).mockResolvedValue();

    render(
      <SettingsModal
        isOpen={true}
        onClose={vi.fn()}
        appInfo={defaultAppInfo}
        theme="system"
        onThemeChange={vi.fn()}
        gitPath=""
        onGitPathChange={vi.fn()}
        initialTab="ai"
      />
    );

    const keyInput = (await screen.findByPlaceholderText(
      /输入 API Key 并存入钥匙串/
    )) as HTMLInputElement;

    fireEvent.change(keyInput, { target: { value: "secret-key-12345" } });
    const saveBtn = screen.getByRole("button", { name: "保存 Key" });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(host.saveAiKey).toHaveBeenCalledWith("kie", "secret-key-12345");
    });

    // Key input should be cleared
    expect(keyInput.value).toBe("");

    // Delete key
    const deleteBtn = await screen.findByRole("button", { name: "清除 Key" });
    fireEvent.click(deleteBtn);

    await waitFor(() => {
      expect(host.deleteAiKey).toHaveBeenCalledWith("kie");
    });
  });

  it("AT-13e: fetches Ollama models and renders dropdown", async () => {
    vi.mocked(host.getAiKeyStatus).mockResolvedValue({
      kie: false,
      openai: false,
      ollama: false,
      keyring_available: true,
    });
    vi.mocked(host.fetchOllamaModels).mockResolvedValue([
      "llama3:latest",
      "mistral:latest",
    ]);

    render(
      <SettingsModal
        isOpen={true}
        onClose={vi.fn()}
        appInfo={defaultAppInfo}
        theme="system"
        onThemeChange={vi.fn()}
        gitPath=""
        onGitPathChange={vi.fn()}
        initialTab="ai"
      />
    );

    // Switch to Ollama
    const ollamaBtn = screen.getByRole("button", { name: "Ollama (本地)" });
    fireEvent.click(ollamaBtn);

    const fetchBtn = screen.getByRole("button", { name: "获取本地模型列表" });
    fireEvent.click(fetchBtn);

    await waitFor(() => {
      expect(host.fetchOllamaModels).toHaveBeenCalled();
      expect(screen.getByText("llama3:latest")).toBeDefined();
      expect(screen.getByText("mistral:latest")).toBeDefined();
    });
  });

  it("AT-13j: tests AI connection and displays feedback", async () => {
    vi.mocked(host.getAiKeyStatus).mockResolvedValue({
      kie: true,
      openai: false,
      ollama: false,
      keyring_available: true,
    });
    vi.mocked(host.testAiConnection).mockResolvedValue("连接成功，API 响应正常");

    render(
      <SettingsModal
        isOpen={true}
        onClose={vi.fn()}
        appInfo={defaultAppInfo}
        theme="system"
        onThemeChange={vi.fn()}
        gitPath=""
        onGitPathChange={vi.fn()}
        initialTab="ai"
      />
    );

    const testBtn = screen.getByRole("button", { name: "测试 AI 连接" });
    fireEvent.click(testBtn);

    await waitFor(() => {
      expect(screen.getByText("连接成功，API 响应正常")).toBeDefined();
    });
  });

  it("AT-13f: switches between providers showing independent key status and allows deleting provider key", async () => {
    vi.mocked(host.getAiKeyStatus).mockResolvedValue({
      kie: true,
      openai: false,
      ollama: false,
      keyring_available: true,
    });
    vi.mocked(host.deleteAiKey).mockResolvedValue();

    render(
      <SettingsModal
        isOpen={true}
        onClose={vi.fn()}
        appInfo={defaultAppInfo}
        theme="system"
        onThemeChange={vi.fn()}
        gitPath=""
        onGitPathChange={vi.fn()}
        initialTab="ai"
      />
    );

    // KIE initially shows saved status
    expect(await screen.findByText(/已配置 Key/)).toBeDefined();
    expect(screen.getByRole("button", { name: "清除 Key" })).toBeDefined();

    // Click "清除 Key" on KIE
    const clearKieBtn = screen.getByRole("button", { name: "清除 Key" });
    fireEvent.click(clearKieBtn);
    await waitFor(() => {
      expect(host.deleteAiKey).toHaveBeenCalledWith("kie");
    });

    // Switch to OpenAI: currently not configured
    const openaiBtn = screen.getByRole("button", { name: "OpenAI 兼容" });
    fireEvent.click(openaiBtn);
    expect(screen.getByPlaceholderText(/输入 API Key/)).toBeDefined();
    expect(screen.getByText(/未配置 Key/)).toBeDefined();
  });

  it("checks for updates from the general tab", async () => {
    vi.mocked(host.getAiKeyStatus).mockResolvedValue({
      kie: false,
      openai: false,
      ollama: false,
      keyring_available: true,
    });
    const onCheckUpdate = vi.fn();
    render(
      <SettingsModal
        isOpen={true}
        onClose={vi.fn()}
        appInfo={defaultAppInfo}
        theme="system"
        onThemeChange={vi.fn()}
        gitPath=""
        onGitPathChange={vi.fn()}
        onCheckUpdate={onCheckUpdate}
      />
    );

    await waitFor(() => {
      expect(host.getAiKeyStatus).toHaveBeenCalled();
    });
    expect(screen.getByText("v0.1.0")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "检查更新" }));
    expect(onCheckUpdate).toHaveBeenCalledOnce();
  });

  it("V2-07: toggles auto agent detection on and off and persists settings", async () => {
    vi.mocked(host.getAiKeyStatus).mockResolvedValue({
      kie: false,
      openai: false,
      ollama: false,
      keyring_available: true,
    });

    render(
      <SettingsModal
        isOpen={true}
        onClose={vi.fn()}
        appInfo={defaultAppInfo}
        theme="system"
        onThemeChange={vi.fn()}
        gitPath=""
        onGitPathChange={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(host.getAiKeyStatus).toHaveBeenCalled();
    });

    // Toggle checkbox should be present and checked by default
    const toggle = screen.getByRole("checkbox", {
      name: /Agent 会话自动检测与快照/,
    }) as HTMLInputElement;
    expect(toggle.checked).toBe(true);

    // Uncheck toggle to disable auto detection
    fireEvent.click(toggle);
    expect(toggle.checked).toBe(false);

    // Check localStorage
    const saved = JSON.parse(localStorage.getItem("tongyun_auto_agent_settings") || "{}");
    expect(saved.enabled).toBe(false);

    // Re-enable toggle
    fireEvent.click(toggle);
    expect(toggle.checked).toBe(true);
    const reSaved = JSON.parse(localStorage.getItem("tongyun_auto_agent_settings") || "{}");
    expect(reSaved.enabled).toBe(true);
  });
});
