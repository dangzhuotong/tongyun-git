import type { AutoAgentConfig, WorkspaceRequest } from "./host";

export const AUTO_AGENT_SETTINGS_KEY = "tongyun_auto_agent_settings";
export const AUTO_AGENT_SETTINGS_EVENT = "tongyun-auto-agent-settings";

export const DEFAULT_AUTO_AGENT_SETTINGS: AutoAgentConfig = {
  enabled: true,
  burst_threshold: 5,
  burst_window_secs: 5,
  silence_timeout_secs: 300,
};

function positiveNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
}

/** Merge stored settings with defaults. Partial or corrupt JSON must not disable detection. */
export function loadAutoAgentConfig(raw: string | null): AutoAgentConfig {
  if (!raw) return { ...DEFAULT_AUTO_AGENT_SETTINGS };
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { ...DEFAULT_AUTO_AGENT_SETTINGS };
    }
    const record = parsed as Partial<AutoAgentConfig>;
    return {
      enabled: typeof record.enabled === "boolean" ? record.enabled : DEFAULT_AUTO_AGENT_SETTINGS.enabled,
      burst_threshold: positiveNumber(record.burst_threshold, DEFAULT_AUTO_AGENT_SETTINGS.burst_threshold),
      burst_window_secs: positiveNumber(record.burst_window_secs, DEFAULT_AUTO_AGENT_SETTINGS.burst_window_secs),
      silence_timeout_secs: positiveNumber(
        record.silence_timeout_secs,
        DEFAULT_AUTO_AGENT_SETTINGS.silence_timeout_secs,
      ),
    };
  } catch {
    return { ...DEFAULT_AUTO_AGENT_SETTINGS };
  }
}

/** The backend diffs the worktree itself, so the request carries no counts. */
export function autoCheckRequest(config: AutoAgentConfig): WorkspaceRequest {
  return { type: "auto_check", config };
}

export interface AutoNoticeGate {
  shouldReport(message: string): boolean;
  reset(): void;
}

/** Keep a persistent failure from raising a toast every five seconds. */
export function createAutoNoticeGate(): AutoNoticeGate {
  let last: string | null = null;
  return {
    shouldReport(message: string): boolean {
      if (last === message) return false;
      last = message;
      return true;
    },
    reset(): void {
      last = null;
    },
  };
}

export function formatHostError(error: unknown): string {
  if (typeof error === "string" && error.trim()) return error;
  if (error instanceof Error && error.message.trim()) return error.message;
  return "自动会话检查失败";
}
