import { useEffect, useState, useCallback, useRef } from "react";
import {
  getAppInfo,
  checkGit,
  openRepository,
  getRepoStatus,
  getFileDiff,
  type AppInfo,
  type RepoInfo,
  type FileStatus,
  type FileDiff,
} from "./lib/host";
import { Toolbar } from "./features/toolbar/Toolbar";
import { ChangesList } from "./features/changes/ChangesList";
import { DiffViewer } from "./features/changes/DiffViewer";
import { OpenRepoModal } from "./features/toolbar/OpenRepoModal";
import { SettingsModal } from "./features/settings/SettingsModal";
import type { SelectedFileTarget } from "./features/changes/types";
import { AlertCircleIcon, FolderIcon } from "./components/icons";

export default function App() {
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null);
  const [gitAvailable, setGitAvailable] = useState(true);
  const [gitError, setGitError] = useState<string | null>(null);

  // Repository state
  const [currentRepo, setCurrentRepo] = useState<RepoInfo | null>(null);
  const [files, setFiles] = useState<FileStatus[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [recentRepos, setRecentRepos] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem("tongyun_recent_repos");
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  // Diff state
  const [selectedTarget, setSelectedTarget] = useState<SelectedFileTarget | null>(null);
  const [diff, setDiff] = useState<FileDiff | null>(null);
  const [diffLoading, setDiffLoading] = useState(false);
  const [diffError, setDiffError] = useState<string | null>(null);

  // Panel sizing
  const [sidebarWidth, setSidebarWidth] = useState<number>(() => {
    const saved = localStorage.getItem("tongyun_sidebar_width");
    return saved ? Math.max(220, Math.min(600, parseInt(saved, 10))) : 320;
  });
  const isResizingRef = useRef(false);

  // Modals
  const [openModalVisible, setOpenModalVisible] = useState(false);
  const [settingsModalVisible, setSettingsModalVisible] = useState(false);
  const [openError, setOpenError] = useState<string | null>(null);
  const [openLoading, setOpenLoading] = useState(false);

  // Theme
  const [theme, setTheme] = useState<"system" | "light" | "dark">(() => {
    return (localStorage.getItem("tongyun_theme") as "system" | "light" | "dark") || "system";
  });
  const [gitPath, setGitPath] = useState<string>(() => {
    return localStorage.getItem("tongyun_git_path") || "";
  });

  // Apply theme class
  useEffect(() => {
    const root = document.documentElement;
    if (theme === "dark") {
      root.setAttribute("data-theme", "dark");
      root.classList.add("dark");
    } else if (theme === "light") {
      root.setAttribute("data-theme", "light");
      root.classList.remove("dark");
    } else {
      root.removeAttribute("data-theme");
      root.classList.remove("dark");
    }
    localStorage.setItem("tongyun_theme", theme);
  }, [theme]);

  // Initial Git check & AppInfo
  useEffect(() => {
    async function init() {
      try {
        const info = await getAppInfo();
        setAppInfo(info);
      } catch {
        // Fallback for browser preview
        setAppInfo({
          name: "tongyun-git",
          version: "0.0.0",
          identifier: "com.tongyun.git",
          git_version: "2.47.3",
          libgit2_version: "1.9.7",
        });
      }

      try {
        const check = await checkGit(gitPath || undefined);
        setGitAvailable(check.available);
        if (!check.available) {
          setGitError(check.error || "未在系统环境中找到 Git，请检查安装或手动指定路径。");
        } else {
          setGitError(null);
        }
      } catch {
        setGitAvailable(true);
      }
    }
    init();
  }, [gitPath]);

  // Save recent repos
  const saveRecentRepo = useCallback((path: string) => {
    setRecentRepos((prev) => {
      const filtered = prev.filter((p) => p !== path);
      const updated = [path, ...filtered].slice(0, 20);
      localStorage.setItem("tongyun_recent_repos", JSON.stringify(updated));
      return updated;
    });
  }, []);

  const removeRecentRepo = useCallback((path: string) => {
    setRecentRepos((prev) => {
      const updated = prev.filter((p) => p !== path);
      localStorage.setItem("tongyun_recent_repos", JSON.stringify(updated));
      return updated;
    });
  }, []);

  // Fetch repository status
  const refreshStatus = useCallback(
    async (repoRoot: string) => {
      setIsRefreshing(true);
      try {
        const statusRes = await getRepoStatus(repoRoot);
        setFiles(statusRes.files);
        setCurrentRepo((prev) => (prev ? { ...prev, head: statusRes.head } : null));
      } catch {
        // Refresh error handled silently or in status
      } finally {
        setIsRefreshing(false);
      }
    },
    []
  );

  // Open repository action
  const handleOpenRepo = useCallback(
    async (path: string) => {
      setOpenLoading(true);
      setOpenError(null);
      try {
        const info = await openRepository(path);
        setCurrentRepo(info);
        saveRecentRepo(info.root_path);
        localStorage.setItem("tongyun_last_repo", info.root_path);
        setOpenModalVisible(false);
        setSelectedTarget(null);
        setDiff(null);

        // Fetch initial status
        await refreshStatus(info.root_path);
      } catch (err: unknown) {
        const msg =
          typeof err === "string"
            ? err
            : (err as { message?: string })?.message || String(err);
        setOpenError(msg);
      } finally {
        setOpenLoading(false);
      }
    },
    [refreshStatus, saveRecentRepo]
  );

  // Initial Git check, AppInfo & restore last repo
  useEffect(() => {
    let mounted = true;

    async function init() {
      try {
        const info = await getAppInfo();
        if (mounted) setAppInfo(info);
      } catch {
        // Fallback for browser preview
        if (mounted) {
          setAppInfo({
            name: "tongyun-git",
            version: "0.0.0",
            identifier: "com.tongyun.git",
            git_version: "2.47.3",
            libgit2_version: "1.9.7",
          });
        }
      }

      try {
        const check = await checkGit(gitPath || undefined);
        if (mounted) {
          setGitAvailable(check.available);
          if (!check.available) {
            setGitError(
              check.error || "未在系统环境中找到 Git，请检查安装或手动指定路径。"
            );
          } else {
            setGitError(null);
          }
        }
      } catch {
        if (mounted) setGitAvailable(true);
      }

      // Restore last repository if available
      const lastRepo = localStorage.getItem("tongyun_last_repo");
      if (lastRepo && mounted) {
        try {
          const info = await openRepository(lastRepo);
          if (!mounted) return;
          setCurrentRepo(info);
          const statusRes = await getRepoStatus(info.root_path);
          if (!mounted) return;
          setFiles(statusRes.files);
          setCurrentRepo({ ...info, head: statusRes.head });
        } catch {
          // Path may no longer exist
        }
      }
    }

    init();

    return () => {
      mounted = false;
    };
  }, [gitPath]);

  // Window focus auto-refresh (R-02)
  useEffect(() => {
    function onFocus() {
      if (currentRepo?.root_path) {
        refreshStatus(currentRepo.root_path);
      }
    }
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [currentRepo, refreshStatus]);

  // Selection handler
  const handleSelectTarget = (target: SelectedFileTarget) => {
    setSelectedTarget(target);
    setDiff(null);
    setDiffLoading(true);
    setDiffError(null);
  };

  // Load diff when selected target changes
  useEffect(() => {
    if (!currentRepo || !selectedTarget) {
      return;
    }

    let active = true;

    getFileDiff(currentRepo.root_path, selectedTarget.path, selectedTarget.staged)
      .then((res) => {
        if (active) {
          setDiff(res);
          setDiffLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (active) {
          const msg =
            typeof err === "string"
              ? err
              : (err as { message?: string })?.message || "计算 Diff 失败";
          setDiffError(msg);
          setDiffLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [currentRepo, selectedTarget]);

  // Resizing left sidebar
  const handleMouseDownResize = (e: React.MouseEvent) => {
    e.preventDefault();
    isResizingRef.current = true;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!isResizingRef.current) return;
      const newWidth = Math.max(220, Math.min(600, moveEvent.clientX));
      setSidebarWidth(newWidth);
    };

    const handleMouseUp = () => {
      isResizingRef.current = false;
      localStorage.setItem("tongyun_sidebar_width", sidebarWidth.toString());
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  };

  return (
    <div className="flex flex-col h-screen w-screen bg-[var(--color-bg)] text-[var(--color-text)] overflow-hidden font-sans">
      {/* Top Toolbar */}
      <Toolbar
        currentRepo={currentRepo}
        recentRepos={recentRepos}
        onOpenRepo={handleOpenRepo}
        onOpenModalClick={() => {
          setOpenError(null);
          setOpenModalVisible(true);
        }}
        onRefresh={() => currentRepo && refreshStatus(currentRepo.root_path)}
        isRefreshing={isRefreshing}
        theme={theme}
        onToggleTheme={() => setTheme(theme === "dark" ? "light" : "dark")}
        onOpenSettings={() => setSettingsModalVisible(true)}
        gitAvailable={gitAvailable}
      />

      {/* Git Missing Warning Banner (R-01) */}
      {!gitAvailable && (
        <div className="px-4 py-2 bg-[var(--color-danger)]/15 border-b border-[var(--color-danger)]/30 text-xs text-[var(--color-danger)] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircleIcon width={16} height={16} className="shrink-0" />
            <span>
              {gitError || "未检测到可用的 Git。应用核心功能已锁定，请安装 Git 或在设置中指定路径。"}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setSettingsModalVisible(true)}
            className="px-2.5 py-1 rounded bg-[var(--color-danger)] text-white text-xs font-semibold hover:opacity-90"
          >
            设置 Git 路径
          </button>
        </div>
      )}

      {/* Main Workspace Area (Layout A) */}
      <div className="flex-1 flex overflow-hidden">
        {currentRepo ? (
          <>
            {/* Left Column: Changes List & Commit Area */}
            <div
              style={{ width: `${sidebarWidth}px` }}
              className="h-full flex flex-col shrink-0 border-r border-[var(--color-border)] overflow-hidden"
            >
              <div className="flex-1 overflow-hidden">
                <ChangesList
                  files={files}
                  selectedTarget={selectedTarget}
                  onSelectTarget={handleSelectTarget}
                />
              </div>

              {/* Commit Area Placeholder for M3 */}
              <div className="p-3 border-t border-[var(--color-border)] bg-[var(--color-surface)] text-xs text-[var(--color-text-muted)] flex items-center justify-between">
                <span>提交区 (已就绪)</span>
                <span className="font-mono text-[11px] opacity-75">
                  {files.filter((f) => f.index != null).length} 个暂存
                </span>
              </div>
            </div>

            {/* Splitter Resize Handle */}
            <div
              onMouseDown={handleMouseDownResize}
              className="w-[4px] -ml-[2px] h-full cursor-col-resize hover:bg-[var(--color-accent)] transition-colors z-20 shrink-0 select-none"
            />

            {/* Right Column: Diff View */}
            <div className="flex-1 h-full overflow-hidden flex flex-col bg-[var(--color-bg)]">
              <DiffViewer diff={diff} loading={diffLoading} error={diffError} />
            </div>
          </>
        ) : (
          /* Empty Workspace State */
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-[var(--color-bg)]">
            <div className="max-w-md w-full p-8 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-xs space-y-4">
              <div className="w-12 h-12 mx-auto rounded-full bg-[var(--color-accent)]/10 text-[var(--color-accent)] flex items-center justify-center">
                <FolderIcon width={24} height={24} />
              </div>
              <div>
                <h2 className="text-base font-semibold text-[var(--color-text)]">
                  没有打开的仓库
                </h2>
                <p className="text-xs text-[var(--color-text-muted)] mt-1">
                  请选择一个包含 Git 版本控制的本地目录以开始工作。
                </p>
              </div>

              <button
                type="button"
                disabled={!gitAvailable}
                onClick={() => setOpenModalVisible(true)}
                className="px-4 py-2 rounded-md bg-[var(--color-accent)] text-white text-xs font-semibold hover:opacity-90 disabled:opacity-50 transition-all shadow-xs"
              >
                打开本地仓库
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Open Repo Modal */}
      <OpenRepoModal
        isOpen={openModalVisible}
        onClose={() => setOpenModalVisible(false)}
        onOpenRepo={handleOpenRepo}
        recentRepos={recentRepos}
        onRemoveRecent={removeRecentRepo}
        error={openError}
        loading={openLoading}
      />

      {/* Settings Modal */}
      <SettingsModal
        isOpen={settingsModalVisible}
        onClose={() => setSettingsModalVisible(false)}
        appInfo={appInfo}
        theme={theme}
        onThemeChange={setTheme}
        gitPath={gitPath}
        onGitPathChange={(p) => {
          setGitPath(p);
          localStorage.setItem("tongyun_git_path", p);
        }}
      />
    </div>
  );
}
