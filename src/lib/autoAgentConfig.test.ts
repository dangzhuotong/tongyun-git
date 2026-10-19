import { describe, expect, it } from "vitest";
import {
  DEFAULT_AUTO_AGENT_SETTINGS,
  autoCheckRequest,
  createAutoNoticeGate,
  formatHostError,
  loadAutoAgentConfig,
} from "./autoAgentConfig";

describe("loadAutoAgentConfig", () => {
  it("fills defaults when stored settings omit fields", () => {
    expect(loadAutoAgentConfig('{"enabled":false}')).toEqual({
      ...DEFAULT_AUTO_AGENT_SETTINGS,
      enabled: false,
    });
  });

  it("falls back to defaults for corrupt or empty storage", () => {
    expect(loadAutoAgentConfig(null)).toEqual(DEFAULT_AUTO_AGENT_SETTINGS);
    expect(loadAutoAgentConfig("not-json")).toEqual(DEFAULT_AUTO_AGENT_SETTINGS);
    expect(loadAutoAgentConfig("[]")).toEqual(DEFAULT_AUTO_AGENT_SETTINGS);
  });
});

describe("autoCheckRequest", () => {
  it("sends no change count because the backend diffs the worktree", () => {
    const request = autoCheckRequest({ ...DEFAULT_AUTO_AGENT_SETTINGS, enabled: false });
    expect(request).toEqual({
      type: "auto_check",
      config: { ...DEFAULT_AUTO_AGENT_SETTINGS, enabled: false },
    });
  });
});

describe("createAutoNoticeGate", () => {
  it("dedupes the same persistent failure but reports a new one", () => {
    const gate = createAutoNoticeGate();
    expect(gate.shouldReport("仓库已被移走")).toBe(true);
    expect(gate.shouldReport("仓库已被移走")).toBe(false);
    expect(gate.shouldReport("快照写入失败")).toBe(true);
    gate.reset();
    expect(gate.shouldReport("仓库已被移走")).toBe(true);
  });
});

describe("formatHostError", () => {
  it("surfaces string and Error failures", () => {
    expect(formatHostError("快照写入失败")).toBe("快照写入失败");
    expect(formatHostError(new Error("基线没有保存"))).toBe("基线没有保存");
  });
});
