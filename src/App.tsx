import { useEffect, useState, useCallback, useRef } from "react";
import {
  getAppInfo,
  checkGit,
  openRepository,
  getRepoStatus,
  getFileDiff,
  stageFiles,
  unstageFiles,
  stageLines,
  inspectDiscard,
  discardFiles,
  undoDiscard,
  type AppInfo,
  type RepoInfo,
  type FileStatus,
  type FileDiff,
  type DiscardCandidate,
} from "./lib/host";
import { Toolbar } from "./features/toolbar/Toolbar";
import { ChangesList } from "./features/changes/ChangesList";
import { DiffViewer } from "./features/changes/DiffViewer";
import { OpenRepoModal } from "./features/toolbar/OpenRepoModal";
import { SettingsModal } from "./features/settings/SettingsModal";
import { CommitPanel } from "./features/commit/CommitPanel";
import { DiscardConfirmModal } from "./features/changes/DiscardConfirmModal";
import { BranchModal } from "./features/branch/BranchModal";
import { CreateBranchModal } from "./features/branch/CreateBranchModal";
import { LogView } from "./features/log/LogView";
import type { SelectedFileTarget } from "./features/changes/types";
import { AlertCircleIcon, FolderIcon, CloseIcon } from "./components/icons";

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
  const [settingsTab, setSettingsTab] = useState<"general" | "ai">("general");
  const [openError, setOpenError] = useState<string | null>(null);
  const [openLoading, setOpenLoading] = useState(false);

  // Active view: changes vs commit log (M4)
  const [activeView, setActiveView] = useState<"changes" | "log">("changes");

  // Branch management modals (R-08, R-09)
  const [branchModalOpen, setBranchModalOpen] = useState(false);
  const [createBranchModalOpen, setCreateBranchModalOpen] = useState(false);
  const [createBranchStartPoint, setCreateBranchStartPoint] = useState<string | null>(null);

  // Discard & Undo state (R-17)
  const [discardModalVisible, setDiscardModalVisible] = useState(false);
  const [discardCandidates, setDiscardCandidates] = useState<DiscardCandidate[]>([]);
  const [discardLoading, setDiscardLoading] = useState(false);
  const [undoToast, setUndoToast] = useState<{
    count: number;
    secondsLeft: number;
    snapshotRef: string;
  } | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // 10-second undo countdown timer (R-17)
  const hasUndoToast = Boolean(undoToast);
  useEffect(() => {
    if (!hasUndoToast) return;
    const timer = setInterval(() => {
      setUndoToast((prev) => {
        if (!prev || prev.secondsLeft <= 1) {
          return null;
        }
        return { ...prev, secondsLeft: prev.secondsLeft - 1 };
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [hasUndoToast]);

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

  // Global branch modal shortcut: Ctrl/Cmd + Shift + ` (R-08)
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === "`" || e.code === "Backquote")) {
        e.preventDefault();
        if (currentRepo) {
          setBranchModalOpen((prev) => !prev);
        }
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [currentRepo]);

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

  // Stage & Unstage handlers (R-04)
  const handleStageFiles = useCallback(
    async (paths: string[]) => {
      if (!currentRepo || paths.length === 0) return;
      try {
        await stageFiles(currentRepo.root_path, paths);
        await refreshStatus(currentRepo.root_path);
        if (selectedTarget && paths.includes(selectedTarget.path)) {
          getFileDiff(currentRepo.root_path, selectedTarget.path, selectedTarget.staged)
            .then(setDiff)
            .catch(() => setDiff(null));
        }
      } catch (err: unknown) {
        setActionError(err instanceof Error ? err.message : String(err));
      }
    },
    [currentRepo, refreshStatus, selectedTarget]
  );

  const handleUnstageFiles = useCallback(
    async (paths: string[]) => {
      if (!currentRepo || paths.length === 0) return;
      try {
        await unstageFiles(currentRepo.root_path, paths);
        await refreshStatus(currentRepo.root_path);
        if (selectedTarget && paths.includes(selectedTarget.path)) {
          getFileDiff(currentRepo.root_path, selectedTarget.path, selectedTarget.staged)
            .then(setDiff)
            .catch(() => setDiff(null));
        }
      } catch (err: unknown) {
        setActionError(err instanceof Error ? err.message : String(err));
      }
    },
    [currentRepo, refreshStatus, selectedTarget]
  );

  // Line / Hunk staging handler (R-05)
  const handleStageHunkLines = useCallback(
    async (hunkIndex: number, lineIndices: number[], reverse: boolean) => {
      if (!currentRepo || !selectedTarget) return;
      const targetFile = files.find((f) => f.path === selectedTarget.path);
      const isNewFile =
        targetFile?.worktree === "Untracked" && targetFile?.index == null;
      try {
        await stageLines(
          currentRepo.root_path,
          selectedTarget.path,
          hunkIndex,
          lineIndices,
          reverse,
          isNewFile
        );
        await refreshStatus(currentRepo.root_path);
        // Reload diff
        const newDiff = await getFileDiff(
          currentRepo.root_path,
          selectedTarget.path,
          selectedTarget.staged
        );
        setDiff(newDiff);
      } catch (err: unknown) {
        setActionError(err instanceof Error ? err.message : String(err));
      }
    },
    [currentRepo, selectedTarget, files, refreshStatus]
  );

  // Discard handlers (R-17)
  const handleOpenDiscardModal = useCallback(
    async (paths: string[]) => {
      if (!currentRepo || paths.length === 0) return;
      try {
        const candidates = await inspectDiscard(currentRepo.root_path, paths);
        setDiscardCandidates(candidates);
        setDiscardModalVisible(true);
      } catch (err: unknown) {
        setActionError(err instanceof Error ? err.message : String(err));
      }
    },
    [currentRepo]
  );

  const handleConfirmDiscard = useCallback(async () => {
    if (!currentRepo || discardCandidates.length === 0) return;
    setDiscardLoading(true);
    try {
      const paths = discardCandidates.map((c) => c.path);
      const result = await discardFiles(currentRepo.root_path, paths);
      setDiscardModalVisible(false);
      await refreshStatus(currentRepo.root_path);

      if (selectedTarget && paths.includes(selectedTarget.path)) {
        try {
          const newDiff = await getFileDiff(
            currentRepo.root_path,
            selectedTarget.path,
            selectedTarget.staged
          );
          setDiff(newDiff);
        } catch {
          setSelectedTarget(null);
          setDiff(null);
        }
      }

      if (result.snapshot_ref) {
        setUndoToast({
          count: result.discarded_count,
          secondsLeft: 10,
          snapshotRef: result.snapshot_ref,
        });
      }
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : String(err));
    } finally {
      setDiscardLoading(false);
    }
  }, [currentRepo, discardCandidates, refreshStatus, selectedTarget]);

  const handleUndoDiscard = useCallback(async () => {
    if (!currentRepo) return;
    try {
      const res = await undoDiscard(currentRepo.root_path, true);
      setUndoToast(null);
      await refreshStatus(currentRepo.root_path);
      if (selectedTarget) {
        try {
          const newDiff = await getFileDiff(
            currentRepo.root_path,
            selectedTarget.path,
            selectedTarget.staged
          );
          setDiff(newDiff);
        } catch {
          // ignore
        }
      }
      if (res.skipped_files.length > 0) {
        alert(
          `已恢复 ${res.restored_count} 个文件。以下文件因检测到外部修改被跳过：\n${res.skipped_files.join("\n")}`
        );
      }
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : String(err));
    }
  }, [currentRepo, refreshStatus, selectedTarget]);

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
        onOpenSettings={() => {
          setSettingsTab("general");
          setSettingsModalVisible(true);
        }}
        gitAvailable={gitAvailable}
        activeView={activeView}
        onViewChange={setActiveView}
        onOpenBranchModal={() => setBranchModalOpen(true)}
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

      {/* Operation Error Banner */}
      {actionError && (
        <div className="px-4 py-2 bg-[var(--color-danger)]/15 border-b border-[var(--color-danger)]/30 text-xs text-[var(--color-danger)] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircleIcon width={16} height={16} className="shrink-0" />
            <span>{actionError}</span>
          </div>
          <button
            type="button"
            onClick={() => setActionError(null)}
            className="p-1 hover:opacity-75"
          >
            <CloseIcon width={14} height={14} />
          </button>
        </div>
      )}

      {/* Main Workspace Area (Layout A) */}
      <div className="flex-1 flex overflow-hidden">
        {currentRepo ? (
          activeView === "changes" ? (
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
                    onStageFiles={handleStageFiles}
                    onUnstageFiles={handleUnstageFiles}
                    onDiscardFiles={handleOpenDiscardModal}
                  />
                </div>

                {/* Commit Area (R-06 & R-07) */}
                <CommitPanel
                  key={currentRepo.root_path}
                  rootPath={currentRepo.root_path}
                  stagedCount={files.filter((f) => f.index != null).length}
                  onCommitSuccess={() => {
                    refreshStatus(currentRepo.root_path);
                    setSelectedTarget(null);
                    setDiff(null);
                  }}
                  onOpenSettings={() => {
                    setSettingsTab("ai");
                    setSettingsModalVisible(true);
                  }}
                  disabled={!gitAvailable || isRefreshing}
                />
              </div>

              {/* Splitter Resize Handle */}
              <div
                onMouseDown={handleMouseDownResize}
                className="w-[4px] -ml-[2px] h-full cursor-col-resize hover:bg-[var(--color-accent)] transition-colors z-20 shrink-0 select-none"
              />

              {/* Right Column: Diff View */}
              <div className="flex-1 h-full overflow-hidden flex flex-col bg-[var(--color-bg)]">
                <DiffViewer
                  diff={diff}
                  loading={diffLoading}
                  error={diffError}
                  onStageHunkLines={handleStageHunkLines}
                />
              </div>
            </>
          ) : (
            /* Log View (R-10) */
            <div className="flex-1 h-full overflow-hidden flex flex-col bg-[var(--color-bg)]">
              <LogView
                rootPath={currentRepo.root_path}
                onOpenCreateBranch={(oid) => {
                  setCreateBranchStartPoint(oid);
                  setCreateBranchModalOpen(true);
                }}
              />
            </div>
          )
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

      {/* Discard Confirmation Modal (R-17) */}
      <DiscardConfirmModal
        isOpen={discardModalVisible}
        onClose={() => setDiscardModalVisible(false)}
        onConfirm={handleConfirmDiscard}
        candidates={discardCandidates}
        loading={discardLoading}
      />

      {/* 10-Second Undo Discard Notification Toast (R-17) */}
      {undoToast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-6 right-6 z-50 flex items-center gap-3 px-4 py-3 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)] shadow-lg animate-in fade-in slide-in-from-bottom-2 text-xs"
        >
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[var(--color-accent)] animate-pulse" />
            <span className="text-[var(--color-text)]">
              已丢弃 {undoToast.count} 个文件改动，快照已建立 ({undoToast.secondsLeft} 秒)
            </span>
          </div>
          <button
            type="button"
            onClick={handleUndoDiscard}
            className="px-2.5 py-1 rounded bg-[var(--color-accent)] text-white font-medium hover:opacity-90 transition-opacity cursor-pointer"
          >
            撤销丢弃
          </button>
          <button
            type="button"
            onClick={() => setUndoToast(null)}
            className="p-1 rounded text-[var(--color-text-muted)] hover:text-[var(--color-text)] cursor-pointer"
            title="关闭提示"
          >
            <CloseIcon width={14} height={14} />
          </button>
        </div>
      )}

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
        initialTab={settingsTab}
      />

      {/* Branch Modal (R-08) */}
      {currentRepo && (
        <BranchModal
          isOpen={branchModalOpen}
          onClose={() => setBranchModalOpen(false)}
          rootPath={currentRepo.root_path}
          onBranchSwitched={() => {
            refreshStatus(currentRepo.root_path);
            setSelectedTarget(null);
            setDiff(null);
          }}
        />
      )}

      {/* Create Branch Modal (R-09) */}
      {currentRepo && (
        <CreateBranchModal
          isOpen={createBranchModalOpen}
          onClose={() => {
            setCreateBranchModalOpen(false);
            setCreateBranchStartPoint(null);
          }}
          rootPath={currentRepo.root_path}
          startPoint={createBranchStartPoint}
          onBranchCreated={() => {
            setCreateBranchModalOpen(false);
            setCreateBranchStartPoint(null);
            refreshStatus(currentRepo.root_path);
          }}
        />
      )}
    </div>
  );
}
