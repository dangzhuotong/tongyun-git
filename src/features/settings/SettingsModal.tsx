import { useState, useEffect } from "react";
import type { AppInfo, AiSettings, AiKeyStatus, AiProvider, AutoAgentConfig } from "../../lib/host";
import {
  checkGit,
  type GitCheckResult,
  getAiKeyStatus,
  saveAiKey,
  deleteAiKey,
  testAiConnection,
  fetchOllamaModels,
} from "../../lib/host";
import {
  SettingsIcon,
  CloseIcon,
  AlertCircleIcon,
  SparklesIcon,
  CheckIcon,
  KeyIcon,
} from "../../components/icons";
import { useEscapeKey } from "../../hooks/useEscapeKey";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  appInfo: AppInfo | null;
  theme: "system" | "light" | "dark";
  onThemeChange: (theme: "system" | "light" | "dark") => void;
  gitPath: string;
  onGitPathChange: (path: string) => void;
  initialTab?: "general" | "ai";
  checkingUpdate?: boolean;
  onCheckUpdate?: () => void;
}

const DEFAULT_AUTO_AGENT_SETTINGS: AutoAgentConfig = {
  enabled: true,
  burst_threshold: 5,
  burst_window_secs: 5,
  silence_timeout_secs: 300,
};

const DEFAULT_AI_SETTINGS: AiSettings = {
  provider: "kie",
  base_url: "https://api.kie.ai",
  model: "kie-default",
  language: "follow",
  conventional: false,
  timeout_seconds: 30,
  max_diff_chars: 20000,
  custom_secret_patterns: [],
  consented: false,
};

export function SettingsModal({
  isOpen,
  onClose,
  appInfo,
  theme,
  onThemeChange,
  gitPath,
  onGitPathChange,
  initialTab = "general",
  checkingUpdate = false,
  onCheckUpdate,
}: SettingsModalProps) {
  useEscapeKey(onClose, isOpen);

  const [activeTab, setActiveTab] = useState<"general" | "ai">(initialTab);

  // General tab state
  const [customPath, setCustomPath] = useState(gitPath);
  const [testResult, setTestResult] = useState<GitCheckResult | null>(null);
  const [testing, setTesting] = useState(false);

  // Auto Agent settings (V2-07)
  const [autoAgentSettings, setAutoAgentSettings] = useState<AutoAgentConfig>(() => {
    try {
      const stored = localStorage.getItem("tongyun_auto_agent_settings");
      if (stored) return { ...DEFAULT_AUTO_AGENT_SETTINGS, ...JSON.parse(stored) };
    } catch {
      // ignore
    }
    return DEFAULT_AUTO_AGENT_SETTINGS;
  });

  const updateAutoAgentSettings = (partial: Partial<AutoAgentConfig>) => {
    const updated = { ...autoAgentSettings, ...partial };
    setAutoAgentSettings(updated);
    localStorage.setItem("tongyun_auto_agent_settings", JSON.stringify(updated));
  };

  // AI tab state
  const [aiSettings, setAiSettings] = useState<AiSettings>(() => {
    try {
      const stored = localStorage.getItem("tongyun_ai_settings");
      if (stored) return { ...DEFAULT_AI_SETTINGS, ...JSON.parse(stored) };
    } catch {
      // ignore
    }
    return DEFAULT_AI_SETTINGS;
  });

  const [keyStatus, setKeyStatus] = useState<AiKeyStatus | null>(null);
  const [newKey, setNewKey] = useState("");
  const [keySaving, setKeySaving] = useState(false);
  const [keyError, setKeyError] = useState<string | null>(null);
  const [keySuccessMessage, setKeySuccessMessage] = useState<string | null>(null);

  const [testingAi, setTestingAi] = useState(false);
  const [testAiResult, setTestAiResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  const [ollamaModels, setOllamaModels] = useState<string[]>([]);
  const [fetchingOllama, setFetchingOllama] = useState(false);

  // Sync state when modal opens
  const [prevIsOpen, setPrevIsOpen] = useState(isOpen);
  if (prevIsOpen !== isOpen) {
    setPrevIsOpen(isOpen);
    if (isOpen) {
      setCustomPath(gitPath);
      setTestAiResult(null);
      setKeyError(null);
      setNewKey("");
    }
  }

  // Load key status when modal opens
  const refreshKeyStatus = async () => {
    try {
      const status = await getAiKeyStatus();
      setKeyStatus(status);
    } catch {
      setKeyStatus(null);
    }
  };

  useEffect(() => {
    let canceled = false;
    if (isOpen) {
      getAiKeyStatus()
        .then((status) => {
          if (!canceled) setKeyStatus(status);
        })
        .catch(() => {
          if (!canceled) setKeyStatus(null);
        });
    }
    return () => {
      canceled = true;
    };
  }, [isOpen]);

  // Persist AI settings
  const updateAiSettings = (partial: Partial<AiSettings>) => {
    if (partial.provider && partial.provider !== aiSettings.provider) {
      setKeyError(null);
      setKeySuccessMessage(null);
      setNewKey("");
      setTestAiResult(null);
    }
    const updated = { ...aiSettings, ...partial };
    setAiSettings(updated);
    localStorage.setItem("tongyun_ai_settings", JSON.stringify(updated));
  };

  if (!isOpen) return null;

  // Test Git
  const handleTestGit = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await checkGit(customPath.trim() || undefined);
      setTestResult(res);
      if (res.available) {
        onGitPathChange(customPath.trim());
      }
    } catch (e: any) {
      setTestResult({
        available: false,
        error: e?.message || String(e),
      });
    } finally {
      setTesting(false);
    }
  };

  // Save AI Key
  const handleSaveKey = async () => {
    if (!newKey.trim()) return;
    setKeySaving(true);
    setKeyError(null);
    setKeySuccessMessage(null);
    try {
      await saveAiKey(aiSettings.provider, newKey.trim());
      setNewKey("");
      setKeySuccessMessage("密钥已安全加密保存到系统钥匙串");
      await refreshKeyStatus();
    } catch (err: any) {
      setKeyError(err?.message || String(err));
    } finally {
      setKeySaving(false);
    }
  };

  // Delete AI Key
  const handleDeleteKey = async () => {
    setKeySaving(true);
    setKeyError(null);
    setKeySuccessMessage(null);
    try {
      await deleteAiKey(aiSettings.provider);
      setKeySuccessMessage("密钥已从系统钥匙串中清除");
      await refreshKeyStatus();
    } catch (err: any) {
      setKeyError(err?.message || String(err));
    } finally {
      setKeySaving(false);
    }
  };

  // Fetch Ollama Models (AT-13e)
  const handleFetchOllamaModels = async () => {
    setFetchingOllama(true);
    try {
      const models = await fetchOllamaModels(aiSettings.base_url || undefined);
      setOllamaModels(models);
      if (models.length > 0 && !models.includes(aiSettings.model)) {
        updateAiSettings({ model: models[0] });
      }
    } catch (err: any) {
      setTestAiResult({
        success: false,
        message: `获取 Ollama 模型失败: ${err?.message || String(err)}`,
      });
    } finally {
      setFetchingOllama(false);
    }
  };

  // Test AI Connection (AT-13c, AT-13d, AT-13j)
  const handleTestAi = async () => {
    setTestingAi(true);
    setTestAiResult(null);
    try {
      // Auto-save key if user typed a key but forgot to click Save Key
      if (newKey.trim()) {
        try {
          await saveAiKey(aiSettings.provider, newKey.trim());
          setNewKey("");
          setKeySuccessMessage("已自动为您将密钥存入系统钥匙串");
          await refreshKeyStatus();
        } catch {
          // ignore error here, proceed to test
        }
      }

      const msg = await testAiConnection(aiSettings);
      setTestAiResult({ success: true, message: msg || "连接成功" });
    } catch (err: any) {
      setTestAiResult({
        success: false,
        message: err?.message || String(err),
      });
    } finally {
      setTestingAi(false);
    }
  };

  // Check if URL is plaintext HTTP non-localhost (AT-13i)
  const isPlaintextHttpWarning = () => {
    const url = aiSettings.base_url || "";
    if (!url.toLowerCase().startsWith("http://")) return false;
    try {
      const parsed = new URL(url);
      const host = parsed.hostname.toLowerCase();
      if (host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "[::1]") {
        return false;
      }
      return true;
    } catch {
      return false;
    }
  };

  // Compute final endpoint for display (PRD R-07 / R-13)
  const getComputedEndpoint = () => {
    const raw = (aiSettings.base_url || "").trim().replace(/\/+$/, "");
    if (aiSettings.provider === "kie") {
      const base = raw || "https://api.kie.ai";
      const model = aiSettings.model.trim() || "<模型>";
      return `${base}/${model}/v1/chat/completions`;
    }
    if (aiSettings.provider === "openai") {
      const base = raw || "https://api.openai.com/v1";
      return `${base}/chat/completions`;
    }
    if (aiSettings.provider === "ollama") {
      const base = raw || "http://localhost:11434";
      return `${base}/v1/chat/completions`;
    }
    return raw;
  };

  const isCurrentProviderKeySaved =
    aiSettings.provider === "kie"
      ? Boolean(keyStatus?.kie)
      : aiSettings.provider === "openai"
      ? Boolean(keyStatus?.openai)
      : Boolean(keyStatus?.ollama);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 select-none">
      <div className="w-full max-w-xl max-h-[90vh] rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] shadow-lg overflow-hidden flex flex-col text-xs text-[var(--color-text)]">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)]">
          <div className="flex items-center gap-2 font-semibold text-sm">
            <SettingsIcon width={16} height={16} className="text-[var(--color-accent)]" />
            <span>设置</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded text-[var(--color-text-muted)] hover:text-[var(--color-text)] cursor-pointer"
          >
            <CloseIcon width={14} height={14} />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-[var(--color-border)] bg-[var(--color-bg)]/40 px-4 pt-2 gap-4">
          <button
            type="button"
            onClick={() => setActiveTab("general")}
            className={`pb-2 font-medium border-b-2 cursor-pointer transition-colors ${
              activeTab === "general"
                ? "border-[var(--color-accent)] text-[var(--color-accent)]"
                : "border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
            }`}
          >
            通用设置
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("ai")}
            className={`flex items-center gap-1.5 pb-2 font-medium border-b-2 cursor-pointer transition-colors ${
              activeTab === "ai"
                ? "border-[var(--color-accent)] text-[var(--color-accent)]"
                : "border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
            }`}
          >
            <SparklesIcon width={13} height={13} />
            <span>AI 提交助手</span>
          </button>
        </div>

        {/* Content Area */}
        <div className="p-4 overflow-y-auto space-y-5 flex-1">
          {activeTab === "general" ? (
            /* General Settings Tab */
            <>
              {/* Theme Option */}
              <div className="space-y-2">
                <label className="block text-xs font-semibold text-[var(--color-text)]">
                  界面主题
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(
                    [
                      { id: "system", label: "跟随系统" },
                      { id: "light", label: "浅色" },
                      { id: "dark", label: "深色" },
                    ] as const
                  ).map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => onThemeChange(t.id)}
                      className={`py-1.5 px-3 rounded border text-center font-medium transition-colors cursor-pointer ${
                        theme === t.id
                          ? "border-[var(--color-accent)] bg-[var(--color-accent)]/10 text-[var(--color-accent)]"
                          : "border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Git Executable Path */}
              <div className="space-y-2 pt-2 border-t border-[var(--color-border)]">
                <label className="block text-xs font-semibold text-[var(--color-text)]">
                  Git 可执行文件路径
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="默认使用系统 PATH 中的 git"
                    value={customPath}
                    onChange={(e) => setCustomPath(e.target.value)}
                    className="flex-1 px-3 py-1.5 rounded border border-[var(--color-border)] bg-[var(--color-bg)] font-mono text-xs focus:outline-none focus:border-[var(--color-accent)] select-text"
                  />
                  <button
                    type="button"
                    onClick={handleTestGit}
                    disabled={testing}
                    className="px-3 py-1.5 rounded border border-[var(--color-border)] bg-[var(--color-surface-raised)] hover:bg-[var(--color-border)] font-medium text-[var(--color-text)] cursor-pointer"
                  >
                    {testing ? "测试中..." : "测试连接"}
                  </button>
                </div>

                {testResult && (
                  <div
                    className={`p-2 rounded border flex items-center gap-2 text-xs ${
                      testResult.available
                        ? "border-[var(--color-status-added)]/30 bg-[var(--color-status-added)]/10 text-[var(--color-status-added)]"
                        : "border-[var(--color-danger)]/30 bg-[var(--color-danger)]/10 text-[var(--color-danger)]"
                    }`}
                  >
                    <AlertCircleIcon width={14} height={14} className="shrink-0" />
                    <span>
                      {testResult.available
                        ? `Git 正常可用: ${testResult.version}`
                        : `Git 检测失败: ${testResult.error || "找不到可执行文件"}`}
                    </span>
                  </div>
                )}
              </div>

              {/* Agent Session Auto-Detection (V2-07) */}
              <div className="space-y-3 pt-2 border-t border-[var(--color-border)]">
                <div className="flex items-center justify-between">
                  <div>
                    <label htmlFor="auto-agent-toggle" className="block text-xs font-semibold text-[var(--color-text)]">
                      Agent 会话自动检测与快照 (V2-07)
                    </label>
                    <p className="text-[11px] text-[var(--color-text-muted)]">
                      检测已知 Agent 进程（Cursor、tongyun-cli、claude、codex）启动或文件短时间突增，自动开会话并打快照
                    </p>
                  </div>
                  <input
                    id="auto-agent-toggle"
                    type="checkbox"
                    checked={autoAgentSettings.enabled}
                    onChange={(e) => updateAutoAgentSettings({ enabled: e.target.checked })}
                    className="cursor-pointer"
                  />
                </div>

                {autoAgentSettings.enabled && (
                  <div className="grid grid-cols-3 gap-2 pt-1 text-xs">
                    <div>
                      <label className="block text-[11px] text-[var(--color-text-muted)] mb-1">
                        突增阈值 (个文件)
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={100}
                        value={autoAgentSettings.burst_threshold}
                        onChange={(e) =>
                          updateAutoAgentSettings({
                            burst_threshold: Math.max(1, parseInt(e.target.value) || 1),
                          })
                        }
                        className="w-full px-2 py-1 rounded border border-[var(--color-border)] bg-[var(--color-bg)] font-mono text-xs focus:outline-none focus:border-[var(--color-accent)]"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-[var(--color-text-muted)] mb-1">
                        判定窗口 (秒)
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={60}
                        value={autoAgentSettings.burst_window_secs}
                        onChange={(e) =>
                          updateAutoAgentSettings({
                            burst_window_secs: Math.max(1, parseInt(e.target.value) || 1),
                          })
                        }
                        className="w-full px-2 py-1 rounded border border-[var(--color-border)] bg-[var(--color-bg)] font-mono text-xs focus:outline-none focus:border-[var(--color-accent)]"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-[var(--color-text-muted)] mb-1">
                        静默超时 (分钟)
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={60}
                        value={Math.round(autoAgentSettings.silence_timeout_secs / 60)}
                        onChange={(e) =>
                          updateAutoAgentSettings({
                            silence_timeout_secs:
                              Math.max(1, parseInt(e.target.value) || 1) * 60,
                          })
                        }
                        className="w-full px-2 py-1 rounded border border-[var(--color-border)] bg-[var(--color-bg)] font-mono text-xs focus:outline-none focus:border-[var(--color-accent)]"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* About / Versions */}
              <div className="space-y-1.5 pt-2 border-t border-[var(--color-border)] text-[11px] text-[var(--color-text-muted)]">
                <div className="flex justify-between">
                  <span>应用名称</span>
                  <span className="font-medium text-[var(--color-text)]">{appInfo?.name}</span>
                </div>
                <div className="flex justify-between items-center gap-2">
                  <span>应用版本</span>
                  <span className="flex items-center gap-2">
                    <span className="font-mono text-[var(--color-text)]">
                      v{appInfo?.version || "0.1.0"}
                    </span>
                    <button
                      type="button"
                      onClick={onCheckUpdate}
                      disabled={checkingUpdate || !onCheckUpdate}
                      className="px-2 py-0.5 rounded-md text-[11px] font-medium bg-[var(--color-accent)] text-white hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                    >
                      {checkingUpdate ? "正在检查更新…" : "检查更新"}
                    </button>
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>libgit2</span>
                  <span className="font-mono">{appInfo?.libgit2_version}</span>
                </div>
              </div>
            </>
          ) : (
            /* AI Settings Tab (R-07 & R-13) */
            <>
              {/* Provider Selection */}
              <div className="space-y-2">
                <label className="block text-xs font-semibold text-[var(--color-text)]">
                  AI 服务提供方
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(
                    [
                      { id: "kie", label: "KIE" },
                      { id: "openai", label: "OpenAI 兼容" },
                      { id: "ollama", label: "Ollama (本地)" },
                    ] as const
                  ).map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => {
                        const nextProvider = p.id as AiProvider;
                        let nextBase = aiSettings.base_url;
                        let nextModel = aiSettings.model;
                        if (nextProvider === "kie") {
                          nextBase = "https://api.kie.ai";
                          nextModel = "kie-default";
                        } else if (nextProvider === "openai") {
                          nextBase = "https://api.openai.com/v1";
                          nextModel = "gpt-4o-mini";
                        } else if (nextProvider === "ollama") {
                          nextBase = "http://localhost:11434";
                          nextModel = "llama3";
                        }
                        updateAiSettings({
                          provider: nextProvider,
                          base_url: nextBase,
                          model: nextModel,
                        });
                        setTestAiResult(null);
                      }}
                      className={`py-1.5 px-3 rounded border text-center font-medium transition-colors cursor-pointer ${
                        aiSettings.provider === p.id
                          ? "border-[var(--color-accent)] bg-[var(--color-accent)]/10 text-[var(--color-accent)]"
                          : "border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Endpoint Base URL */}
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-[var(--color-text)]">
                  API 基础地址 (Base URL)
                </label>
                <input
                  type="text"
                  value={aiSettings.base_url || ""}
                  onChange={(e) => updateAiSettings({ base_url: e.target.value })}
                  placeholder={
                    aiSettings.provider === "kie"
                      ? "https://api.kie.ai"
                      : aiSettings.provider === "ollama"
                      ? "http://localhost:11434"
                      : "https://api.openai.com/v1"
                  }
                  className="w-full px-3 py-1.5 rounded border border-[var(--color-border)] bg-[var(--color-bg)] font-mono text-xs focus:outline-none focus:border-[var(--color-accent)] select-text"
                />

                {/* HTTP Plaintext Warning (AT-13i) */}
                {isPlaintextHttpWarning() && (
                  <div className="p-2 rounded border border-[var(--color-danger)]/30 bg-[var(--color-danger)]/10 text-[var(--color-danger)] text-[11px] flex items-center gap-1.5">
                    <AlertCircleIcon width={13} height={13} className="shrink-0" />
                    <span>该地址使用 HTTP 明文协议，请求内容和凭据可能明文经过网络</span>
                  </div>
                )}

                {/* Computed Final Endpoint Display (PRD R-07 / R-13) */}
                <div className="text-[11px] text-[var(--color-text-muted)] flex items-center gap-1 font-mono break-all select-text">
                  <span>最终请求地址:</span>
                  <span className="text-[var(--color-accent)]">{getComputedEndpoint()}</span>
                </div>
              </div>

              {/* Model Selection */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-semibold text-[var(--color-text)]">
                    模型名称 (Model)
                  </label>
                  {aiSettings.provider === "ollama" && (
                    <button
                      type="button"
                      onClick={handleFetchOllamaModels}
                      disabled={fetchingOllama}
                      className="text-[11px] text-[var(--color-accent)] hover:underline cursor-pointer disabled:opacity-50"
                    >
                      {fetchingOllama ? "获取中..." : "获取本地模型列表"}
                    </button>
                  )}
                </div>

                {aiSettings.provider === "ollama" && ollamaModels.length > 0 ? (
                  <select
                    value={aiSettings.model}
                    onChange={(e) => updateAiSettings({ model: e.target.value })}
                    className="w-full px-3 py-1.5 rounded border border-[var(--color-border)] bg-[var(--color-bg)] text-xs focus:outline-none focus:border-[var(--color-accent)] cursor-pointer"
                  >
                    {ollamaModels.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={aiSettings.model}
                    onChange={(e) => updateAiSettings({ model: e.target.value })}
                    placeholder="输入模型名，如 gpt-4o-mini, llama3, qwen2.5 等"
                    className="w-full px-3 py-1.5 rounded border border-[var(--color-border)] bg-[var(--color-bg)] text-xs font-mono focus:outline-none focus:border-[var(--color-accent)] select-text"
                  />
                )}
              </div>

              {/* API Key Management (PRD D1 & 决策 0002) */}
              <div className="space-y-2 pt-2 border-t border-[var(--color-border)]">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 font-semibold text-xs text-[var(--color-text)]">
                    <KeyIcon width={14} height={14} className="text-[var(--color-accent)]" />
                    <span>API 密钥 (安全存入系统钥匙串)</span>
                  </div>

                  {/* Status Badge */}
                  <div className="flex items-center gap-1.5">
                    {isCurrentProviderKeySaved ? (
                      <span className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-[var(--color-status-added)]/15 text-[var(--color-status-added)] border border-[var(--color-status-added)]/30">
                        <CheckIcon width={11} height={11} />
                        已配置 Key
                      </span>
                    ) : (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-[var(--color-border)] text-[var(--color-text-muted)]">
                        {aiSettings.provider === "ollama" ? "可选" : "未配置 Key"}
                      </span>
                    )}
                  </div>
                </div>

                {/* Keyring unavailable notice (AT-13g) */}
                {keyStatus && !keyStatus.keyring_available ? (
                  <div className="p-2.5 rounded border border-[var(--color-danger)]/30 bg-[var(--color-danger)]/10 text-[var(--color-danger)] text-[11px] flex gap-2">
                    <AlertCircleIcon width={14} height={14} className="shrink-0 mt-0.5" />
                    <div>
                      系统钥匙串服务不可用（如 Linux 未运行 Secret Service）。为保护密钥安全，应用不会以明文保存密钥。请配置系统钥匙串服务，或改用无需密钥的本机 Ollama。
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="flex gap-2">
                      <input
                        type="password"
                        value={newKey}
                        onChange={(e) => setNewKey(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && newKey.trim() && !keySaving) {
                            handleSaveKey();
                          }
                        }}
                        placeholder={
                          isCurrentProviderKeySaved
                            ? "输入新密钥以覆盖现有密钥..."
                            : "输入 API Key 并存入钥匙串..."
                        }
                        className="flex-1 px-3 py-1.5 rounded border border-[var(--color-border)] bg-[var(--color-bg)] font-mono text-xs focus:outline-none focus:border-[var(--color-accent)] select-text"
                      />
                      <button
                        type="button"
                        onClick={handleSaveKey}
                        disabled={!newKey.trim() || keySaving}
                        className="px-3 py-1.5 rounded bg-[var(--color-accent)] hover:opacity-90 disabled:opacity-40 text-white font-medium text-xs cursor-pointer shadow-xs"
                      >
                        {keySaving ? "保存中..." : "保存 Key"}
                      </button>
                      {isCurrentProviderKeySaved && (
                        <button
                          type="button"
                          onClick={handleDeleteKey}
                          disabled={keySaving}
                          className="px-2.5 py-1.5 rounded border border-[var(--color-danger)]/40 text-[var(--color-danger)] hover:bg-[var(--color-danger)]/10 font-medium text-xs cursor-pointer"
                        >
                          清除 Key
                        </button>
                      )}
                    </div>

                    {keySuccessMessage && (
                      <div className="text-[11px] text-[var(--color-status-added)] flex items-center gap-1 font-medium animate-in fade-in">
                        <CheckIcon width={12} height={12} />
                        <span>{keySuccessMessage}</span>
                      </div>
                    )}

                    {keyError && (
                      <div className="text-[11px] text-[var(--color-danger)] flex items-center gap-1">
                        <AlertCircleIcon width={12} height={12} />
                        <span>{keyError}</span>
                      </div>
                    )}
                  </div>
                )}
                <p className="text-[10px] text-[var(--color-text-muted)]">
                  密钥完全由 Rust 本地调用操作系统钥匙串加密保存，不存入任何文件，不读取环境变量，界面不回显明文。
                </p>
              </div>

              {/* Options: Language & Conventional Commits */}
              <div className="grid grid-cols-2 gap-4 pt-2 border-t border-[var(--color-border)]">
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-[var(--color-text)]">
                    生成语言风格
                  </label>
                  <select
                    value={aiSettings.language}
                    onChange={(e) => updateAiSettings({ language: e.target.value })}
                    className="w-full px-2.5 py-1.5 rounded border border-[var(--color-border)] bg-[var(--color-bg)] text-xs focus:outline-none focus:border-[var(--color-accent)] cursor-pointer"
                  >
                    <option value="follow">跟随仓库最近提交历史</option>
                    <option value="zh">中文</option>
                    <option value="en">English</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-[var(--color-text)]">
                    超时时间 (秒)
                  </label>
                  <input
                    type="number"
                    min={10}
                    max={120}
                    value={aiSettings.timeout_seconds}
                    onChange={(e) =>
                      updateAiSettings({
                        timeout_seconds: Math.max(10, Math.min(120, parseInt(e.target.value, 10) || 30)),
                      })
                    }
                    className="w-full px-2.5 py-1.5 rounded border border-[var(--color-border)] bg-[var(--color-bg)] text-xs font-mono focus:outline-none focus:border-[var(--color-accent)]"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <label className="flex items-center gap-2 cursor-pointer select-none text-xs text-[var(--color-text)]">
                  <input
                    type="checkbox"
                    checked={aiSettings.conventional}
                    onChange={(e) => updateAiSettings({ conventional: e.target.checked })}
                    className="rounded border-[var(--color-border)] text-[var(--color-accent)] focus:ring-[var(--color-accent)] cursor-pointer"
                  />
                  <span>遵循 Conventional Commits 规范 (feat:, fix:, docs: 等)</span>
                </label>
              </div>

              {/* Test Connection Button & Result (AT-13c, AT-13j) */}
              <div className="pt-2 border-t border-[var(--color-border)] space-y-2">
                <button
                  type="button"
                  onClick={handleTestAi}
                  disabled={testingAi}
                  className="px-4 py-1.5 rounded border border-[var(--color-border)] bg-[var(--color-surface-raised)] hover:bg-[var(--color-border)] text-[var(--color-text)] font-medium text-xs cursor-pointer shadow-2xs"
                >
                  {testingAi ? "测试连接中..." : "测试 AI 连接"}
                </button>

                {testAiResult && (
                  <div
                    className={`p-2.5 rounded border flex items-start gap-2 text-xs ${
                      testAiResult.success
                        ? "border-[var(--color-status-added)]/30 bg-[var(--color-status-added)]/10 text-[var(--color-status-added)]"
                        : "border-[var(--color-danger)]/30 bg-[var(--color-danger)]/10 text-[var(--color-danger)]"
                    }`}
                  >
                    <AlertCircleIcon width={14} height={14} className="shrink-0 mt-0.5" />
                    <div className="font-mono break-all select-text">
                      {testAiResult.message}
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end px-4 py-3 border-t border-[var(--color-border)] bg-[var(--color-bg)]/40">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded bg-[var(--color-accent)] hover:opacity-90 text-white text-xs font-semibold cursor-pointer shadow-xs"
          >
            完成
          </button>
        </div>
      </div>
    </div>
  );
}
