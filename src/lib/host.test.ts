import { describe, it, expect, vi, beforeEach } from "vitest";

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));

vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));

import {
  getAppInfo,
  checkGit,
  openRepository,
  getRepoStatus,
  getFileDiff,
  stageLines,
  fetchRemote,
  workspaceTask,
  clearAgentIntent,
} from "./host";

beforeEach(() => {
  invokeMock.mockReset();
  localStorage.clear();
});

describe("host invoke wrappers", () => {
  it("forwards the command name and camelCase args", async () => {
    await getAppInfo();
    expect(invokeMock).toHaveBeenCalledWith("app_info");

    await checkGit("C:/git.exe");
    expect(invokeMock).toHaveBeenCalledWith("check_git", { customPath: "C:/git.exe" });
  });

  it("maps repository and diff arguments to the Rust command shape", async () => {
    await openRepository("/repo");
    expect(invokeMock).toHaveBeenCalledWith("open_repository", { path: "/repo" });

    await getRepoStatus("/repo");
    expect(invokeMock).toHaveBeenCalledWith("get_repo_status", { rootPath: "/repo" });

    await getFileDiff("/repo", "src/a.ts", true);
    expect(invokeMock).toHaveBeenCalledWith("get_file_diff", {
      rootPath: "/repo",
      path: "src/a.ts",
      staged: true,
    });
  });

  it("keeps line-staging selection flags intact", async () => {
    await stageLines("/repo", "a.ts", 2, [0, 3, 5], true, false);
    expect(invokeMock).toHaveBeenCalledWith("stage_lines", {
      rootPath: "/repo",
      path: "a.ts",
      hunkIndex: 2,
      selectedLineIndices: [0, 3, 5],
      reverse: true,
      isNewFile: false,
    });
  });

  it("applies optional-argument defaults", async () => {
    await fetchRemote("/repo");
    expect(invokeMock).toHaveBeenCalledWith("fetch_remote", {
      rootPath: "/repo",
      remote: undefined,
      prune: false,
    });
  });

  it("sends a void command without a payload", async () => {
    await clearAgentIntent();
    expect(invokeMock).toHaveBeenCalledWith("clear_agent_intent");
  });
});

describe("workspaceTask", () => {
  it("passes the request through and reads the configured git path", async () => {
    localStorage.setItem("tongyun_git_path", "C:/tools/git.exe");
    await workspaceTask("/repo", { type: "overview" });
    expect(invokeMock).toHaveBeenCalledWith("workspace_task", {
      rootPath: "/repo",
      request: { type: "overview" },
      gitPath: "C:/tools/git.exe",
    });
  });

  it("sends null gitPath when nothing is configured", async () => {
    await workspaceTask("/repo", { type: "blame", path: "a.ts", start: 0, count: 10 });
    expect(invokeMock).toHaveBeenCalledWith("workspace_task", {
      rootPath: "/repo",
      request: { type: "blame", path: "a.ts", start: 0, count: 10 },
      gitPath: null,
    });
  });
});
