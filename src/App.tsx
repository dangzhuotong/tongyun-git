import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import type { Update } from "@tauri-apps/plugin-updater";
import { getCurrentWebview } from "@tauri-apps/api/webview";
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
  pullRemote,
  fetchRemote,
  selectFolder,
  initRepository,
  cloneRepository,
  workspaceTask,
  type AppInfo,
  type RepoInfo,
  type FileStatus,
  type FileDiff,
  type AutoCheckReport,
} from "./lib/host";
import {
  AUTO_AGENT_SETTINGS_EVENT,
  AUTO_AGENT_SETTINGS_KEY,
  autoCheckRequest,
  formatHostError,
  loadAutoAgentConfig,
} from "./lib/autoAgentConfig";
import { WorkspaceTools } from "./features/workspace/WorkspaceTools";
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
import { PushModal } from "./features/remote/PushModal";
import { ConflictBanner } from "./features/remote/ConflictBanner";
import { OperationLogModal } from "./features/log/OperationLogModal";
import { CommandPalette, CommandItem } from "./features/command/CommandPalette";
import { StashModal } from "./features/stash/StashModal";
import { CreateStashModal } from "./features/stash/CreateStashModal";
import { TagModal } from "./features/tag/TagModal";
import { CreateTagModal } from "./features/tag/CreateTagModal";
import { FileHistoryModal } from "./features/history/FileHistoryModal";
import { ShortcutsHelpModal } from "./features/help/ShortcutsHelpModal";
import { AboutModal } from "./features/help/AboutModal";
import { UpdateModal } from "./UpdateModal";
import { checkForAppUpdate } from "./updater";
import { MergeConflictModal } from "./features/conflict/MergeConflictModal";
import { InteractiveRebaseModal } from "./features/rebase/InteractiveRebaseModal";
import { WorktreeModal } from "./features/worktree/WorktreeModal";
import { StatusBar } from "./features/statusbar/StatusBar";
import { FileTreePanel } from "./features/tree/FileTreePanel";
import type { FileTreeNode } from "./features/tree/buildTree";
import { FileHistoryPanel } from "./features/history/FileHistoryPanel";
import type { SelectedFileTarget } from "./features/changes/types";
import { AlertCircleIcon, FolderIcon, CloseIcon, SparklesIcon } from "./components/icons";
import { useLayoutSplit } from "./hooks/useLayoutSplit";
import { useAppModals } from "./hooks/useAppModals";

export default function App() {
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [activeUpdate, setActiveUpdate] = useState<Update | null>(null);
  const [updateToast, setUpdateToast] = useState<{ text: string; tone: "ok" | "danger" } | null>(
    null,
  );
  const checkingUpdateRef = useRef(false);
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

  const [logSelectedOid, setLogSelectedOid] = useState<string | null>(null);
  const [favoriteRepos, setFavoriteRepos] = useState<string[]>(() => {
    try { const value: unknown = JSON.parse(localStorage.getItem("tongyun_favorite_repos") || "[]"); return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : []; } catch { return []; }
  });
  const toggleFavorite = () => {
    if (!currentRepo) return;
    const next = favoriteRepos.includes(currentRepo.root_path) ? favoriteRepos.filter(p => p !== currentRepo.root_path) : [...favoriteRepos, currentRepo.root_path];
    setFavoriteRepos(next); localStorage.setItem("tongyun_favorite_repos", JSON.stringify(next));
  };

  // Diff state
  const [selectedTarget, setSelectedTarget] = useState<SelectedFileTarget | null>(null);
  const [diff, setDiff] = useState<FileDiff | null>(null);
  const [diffLoading, setDiffLoading] = useState(false);
  const [diffError, setDiffError] = useState<string | null>(null);

  // Panel layout and split resizing
  const {
    sidebarWidth,
    treeWidth,
    treeCollapsed,
    setTreeCollapsed,
    handleMouseDownTreeResize,
    handleMouseDownResize,
  } = useLayoutSplit();

  // Project tree selection & diff view tab
  const [treeRefreshKey, setTreeRefreshKey] = useState(0);
  const [treeSelectedPath, setTreeSelectedPath] = useState<string | null>(null);
  const [diffTab, setDiffTab] = useState<"changes" | "history">("changes");

  // Modals management
  const {
    openModalVisible,
    setOpenModalVisible,
    openModalTab,
    setOpenModalTab,
    openError,
    setOpenError,
    openLoading,
    setOpenLoading,
    openAttemptPath,
    setOpenAttemptPath,
    settingsModalVisible,
    setSettingsModalVisible,
    settingsTab,
    setSettingsTab,
    branchModalOpen,
    setBranchModalOpen,
    createBranchModalOpen,
    setCreateBranchModalOpen,
    createBranchStartPoint,
    setCreateBranchStartPoint,
    pushModalOpen,
    setPushModalOpen,
    logModalOpen,
    setLogModalOpen,
    stashModalOpen,
    setStashModalOpen,
    createStashModalOpen,
    setCreateStashModalOpen,
    commandPaletteOpen,
    setCommandPaletteOpen,
    tagModalOpen,
    setTagModalOpen,
    createTagModalOpen,
    setCreateTagModalOpen,
    createTagTargetOid,
    setCreateTagTargetOid,
    fileHistoryModalOpen,
    setFileHistoryModalOpen,
    historyFilePath,
    setHistoryFilePath,
    shortcutsModalOpen,
    setShortcutsModalOpen,
    aboutModalOpen,
    setAboutModalOpen,
    discardModalVisible,
    setDiscardModalVisible,
    discardCandidates,
    setDiscardCandidates,
    discardLoading,
    setDiscardLoading,
    conflictModalOpen,
    setConflictModalOpen,
    conflictModalTargetFile,
    setConflictModalTargetFile,
    handleOpenConflictModal,
    rebaseModalOpen,
    setRebaseModalOpen,
    rebaseBaseOid,
    setRebaseBaseOid,
    rebaseBaseSummary,
    setRebaseBaseSummary,
    handleOpenInteractiveRebase,
    worktreeModalOpen,
    setWorktreeModalOpen,
    workspaceTools,
    setWorkspaceTools,
  } = useAppModals();

  // Active view: changes vs commit log (M4)
  const [activeView, setActiveView] = useState<"changes" | "log">("changes");

  // Remote sync feedback
  const [isPulling, setIsPulling] = useState(false);
  const [syncToast, setSyncToast] = useState<{ message: string; isError?: boolean } | null>(null);

  // Discard & Undo state (R-17)
  const [lineDiscard, setLineDiscard] = useState<{ expected: FileDiff; hunkIndex: number; indices: number[] } | null>(null);
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

  // Sync Toast auto-dismiss (4s)
  useEffect(() => {
    if (!syncToast) return;
    const timer = setTimeout(() => {
      setSyncToast(null);
    }, 4000);
    return () => clearTimeout(timer);
  }, [syncToast]);

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
          version: "0.1.1",
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

  const reportAutoCheck = useCallback((repoRoot: string) => {
    const config = loadAutoAgentConfig(localStorage.getItem(AUTO_AGENT_SETTINGS_KEY));
    return Promise.resolve()
      .then(() => workspaceTask<AutoCheckReport>(repoRoot, autoCheckRequest(config)))
      .then((report) => {
        if (report?.warning) {
          setSyncToast({ message: report.warning, isError: true });
        } else if (report?.action_taken) {
          setSyncToast({ message: report.action_taken });
        }
      })
      .catch((error: unknown) => {
        setSyncToast({ message: formatHostError(error), isError: true });
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
        setTreeRefreshKey((k) => k + 1);
        void reportAutoCheck(repoRoot);
      } catch {
        // Refresh error handled silently or in status
      } finally {
        setIsRefreshing(false);
      }
    },
    [reportAutoCheck]
  );

  // Pull remote action (R-11)
  const handlePull = useCallback(async () => {
    if (!currentRepo || isPulling) return;
    setIsPulling(true);
    setSyncToast(null);
    try {
      const res = await pullRemote(currentRepo.root_path, null, null, "Merge");
      if (res.success) {
        setSyncToast({ message: "拉取成功，已同步最新提交" });
        await refreshStatus(currentRepo.root_path);
      } else if (res.has_conflict) {
        setSyncToast({ message: "拉取产生冲突，已切换至冲突解决状态", isError: true });
        await refreshStatus(currentRepo.root_path);
      } else {
        setSyncToast({ message: res.error_message || "拉取失败", isError: true });
      }
    } catch (e) {
      setSyncToast({ message: typeof e === "string" ? e : String(e), isError: true });
    } finally {
      setIsPulling(false);
    }
  }, [currentRepo, isPulling, refreshStatus]);

  // Fetch remote action (R-11)
  const handleFetch = useCallback(async () => {
    if (!currentRepo) return;
    try {
      const res = await fetchRemote(currentRepo.root_path, null, false);
      if (res.success) {
        setSyncToast({ message: "获取远程更新完成 (Fetch)" });
        await refreshStatus(currentRepo.root_path);
      } else {
        setSyncToast({ message: res.error_message || "获取更新失败", isError: true });
      }
    } catch (e) {
      setSyncToast({ message: typeof e === "string" ? e : String(e), isError: true });
    }
  }, [currentRepo, refreshStatus]);

  // Open repository action
  const handleOpenRepo = useCallback(
    async (path: string) => {
      let cleanPath = path.trim();
      if (
        (cleanPath.startsWith('"') && cleanPath.endsWith('"')) ||
        (cleanPath.startsWith("'") && cleanPath.endsWith("'"))
      ) {
        cleanPath = cleanPath.slice(1, -1).trim();
      }
      setOpenAttemptPath(cleanPath);
      setOpenLoading(true);
      setOpenError(null);
      try {
        const info = await openRepository(cleanPath);
        setCurrentRepo(info);
        saveRecentRepo(info.root_path);
        localStorage.setItem("tongyun_last_repo", info.root_path);
        setOpenModalVisible(false);
        setSelectedTarget(null);
        setTreeSelectedPath(null);
        setDiff(null);

        // Fetch initial status
        await refreshStatus(info.root_path);
      } catch (err: unknown) {
        const msg =
          typeof err === "string"
            ? err
            : (err as { message?: string })?.message || String(err);
        setOpenError(msg);
        setOpenModalVisible(true);
      } finally {
        setOpenLoading(false);
      }
    },
    [refreshStatus, saveRecentRepo]
  );

  // Init repository action
  const handleInitRepo = useCallback(
    async (path: string) => {
      setOpenLoading(true);
      setOpenError(null);
      try {
        const info = await initRepository(path);
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

  // Clone repository action
  const handleCloneRepo = useCallback(
    async (url: string, targetPath: string) => {
      setOpenLoading(true);
      setOpenError(null);
      try {
        const info = await cloneRepository(url, targetPath);
        setCurrentRepo(info);
        saveRecentRepo(info.root_path);
        localStorage.setItem("tongyun_last_repo", info.root_path);
        setOpenModalVisible(false);
        setSelectedTarget(null);
        setDiff(null);
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
            version: "0.1.1",
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

  // Periodic background check for Auto Agent session (V2-07).
  // Disabled detection still checks so an active auto session can end.
  useEffect(() => {
    if (!currentRepo) return;
    const repoPath = currentRepo.root_path;
    const tick = () => {
      void reportAutoCheck(repoPath);
    };
    tick();
    const timer = setInterval(tick, 5000);
    window.addEventListener(AUTO_AGENT_SETTINGS_EVENT, tick);
    return () => {
      clearInterval(timer);
      window.removeEventListener(AUTO_AGENT_SETTINGS_EVENT, tick);
    };
  }, [currentRepo, reportAutoCheck]);

  // Global shortcuts (R-08, R-11, R-12, R-16)
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Command Palette: Ctrl/Cmd + Shift + P
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === "P" || e.key === "p")) {
        e.preventDefault();
        setCommandPaletteOpen((prev) => !prev);
        return;
      }

      // Branch modal: Ctrl/Cmd + Shift + `
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === "`" || e.code === "Backquote")) {
        e.preventDefault();
        if (currentRepo) {
          setBranchModalOpen((prev) => !prev);
        }
        return;
      }

      // Pull: Ctrl/Cmd + T
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && (e.key === "T" || e.key === "t")) {
        e.preventDefault();
        if (currentRepo) {
          handlePull();
        }
        return;
      }

      // Push: Ctrl/Cmd + Shift + K
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === "K" || e.key === "k")) {
        e.preventDefault();
        if (currentRepo) {
          setPushModalOpen(true);
        }
        return;
      }

      // View Switch: Alt + 0 -> changes, Alt + 9 -> log
      if (e.altKey && (e.key === "0" || e.code === "Digit0")) {
        e.preventDefault();
        setActiveView("changes");
        return;
      }
      if (e.altKey && (e.key === "9" || e.code === "Digit9")) {
        e.preventDefault();
        setActiveView("log");
        return;
      }

      // Shortcuts Help: F1 or ?
      if (e.key === "F1" || (e.key === "?" && !e.ctrlKey && !e.metaKey)) {
        const targetTag = (e.target as HTMLElement)?.tagName?.toLowerCase();
        if (targetTag !== "input" && targetTag !== "textarea") {
          e.preventDefault();
          setShortcutsModalOpen((prev) => !prev);
          return;
        }
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [currentRepo, handlePull]);

  // Global Drag & Drop folder support (Windows / Desktop)
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    try {
      getCurrentWebview()
        .onDragDropEvent((event) => {
          if (event.payload.type === "drop" && event.payload.paths.length > 0) {
            const droppedPath = event.payload.paths[0];
            if (droppedPath) {
              handleOpenRepo(droppedPath);
            }
          }
        })
        .then((fn) => {
          unlisten = fn;
        })
        .catch(() => {});
    } catch {
      // ignore
    }

    return () => {
      unlisten?.();
    };
  }, [handleOpenRepo]);

  const handleCheckUpdate = useCallback(async (manual: boolean) => {
    if (checkingUpdateRef.current) return;
    checkingUpdateRef.current = true;
    setCheckingUpdate(true);
    try {
      const update = await checkForAppUpdate();
      if (update) {
        setActiveUpdate((prev) => {
          prev?.close().catch(() => {});
          return update;
        });
      } else if (manual) {
        setUpdateToast({ text: "已是最新版本", tone: "ok" });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (manual) {
        setUpdateToast({ text: `检查更新失败：${message}`, tone: "danger" });
      }
    } finally {
      checkingUpdateRef.current = false;
      setCheckingUpdate(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void handleCheckUpdate(false);
    }, 3000);
    return () => window.clearTimeout(timer);
  }, [handleCheckUpdate]);

  useEffect(() => {
    if (!updateToast) return;
    const timer = window.setTimeout(() => setUpdateToast(null), 4000);
    return () => window.clearTimeout(timer);
  }, [updateToast]);

  // Command list for CommandPalette (R-16)
  const commandList: CommandItem[] = useMemo(() => {
    const list: CommandItem[] = [
      {
        id: "cmd-palette",
        title: "命令面板 (Command Palette)",
        shortcut: "Ctrl+Shift+P",
        action: () => setCommandPaletteOpen(true),
      },
      {
        id: "view-changes",
        title: "切换到改动视图 (View Changes)",
        shortcut: "Alt+0",
        action: () => setActiveView("changes"),
      },
      {
        id: "view-log",
        title: "切换到提交历史 (View Git Log)",
        shortcut: "Alt+9",
        action: () => setActiveView("log"),
      },
      {
        id: "open-repo",
        title: "打开本地仓库 (Open Repository)",
        action: () => setOpenModalVisible(true),
      },
      {
        id: "open-settings",
        title: "打开应用设置 (Settings)",
        action: () => {
          setSettingsTab("general");
          setSettingsModalVisible(true);
        },
      },
      {
        id: "open-ai-settings",
        title: "配置 AI 提供方与密钥 (AI Settings)",
        action: () => {
          setSettingsTab("ai");
          setSettingsModalVisible(true);
        },
      },
      {
        id: "keyboard-shortcuts",
        title: "查看键盘快捷键帮助 (Shortcuts Help)",
        shortcut: "? / F1",
        action: () => setShortcutsModalOpen(true),
      },
      {
        id: "about-app",
        title: "关于 橦云 Git (About)",
        action: () => setAboutModalOpen(true),
      },
    ];

    if (currentRepo) {
      list.unshift(
        {
          id: "git-pull",
          title: "拉取远程分支 (Git Pull)",
          description: "从远程拉取并合并当前分支的最新提交",
          shortcut: "Ctrl+T",
          action: () => handlePull(),
        },
        {
          id: "git-push",
          title: "推送提交到远程 (Git Push)",
          description: "检查领先提交并推送至对应远程分支",
          shortcut: "Ctrl+Shift+K",
          action: () => setPushModalOpen(true),
        },
        {
          id: "git-fetch",
          title: "获取远程更新 (Git Fetch)",
          description: "下载远程分支与标签引用，不自动合并",
          action: () => handleFetch(),
        },
        {
          id: "switch-branch",
          title: "切换与管理分支 (Switch Branch)",
          shortcut: "Ctrl+Shift+`",
          action: () => setBranchModalOpen(true),
        },
        {
          id: "create-branch",
          title: "从 HEAD 新建分支 (Create Branch)",
          action: () => {
            setCreateBranchStartPoint(null);
            setCreateBranchModalOpen(true);
          },
        },
        {
          id: "git-tags",
          title: "管理 Git 标签 (Manage Tags)",
          description: "查看标签列表、推送标签至远程或删除标签",
          action: () => setTagModalOpen(true),
        },
        {
          id: "git-create-tag",
          title: "新建 Git 标签 (Create Tag)",
          description: "在当前 HEAD 创建轻量或附注标签",
          action: () => {
            setCreateTagTargetOid(null);
            setCreateTagModalOpen(true);
          },
        },
        {
          id: "git-logs",
          title: "查看 Git 操作日志 (Operation Log)",
          description: "查看所有调用的系统 Git 命令行记录与耗时",
          action: () => setLogModalOpen(true),
        },
        {
          id: "git-stash",
          title: "贮藏当前工作区改动 (Stash Changes)",
          description: "临时保存未提交改动并还原工作区至干净状态",
          action: () => setCreateStashModalOpen(true),
        },
        {
          id: "git-stashes",
          title: "管理贮藏记录 (Manage Stashes)",
          description: "查看历史贮藏、恢复弹出 (Pop/Apply) 或删除",
          action: () => setStashModalOpen(true),
        },
        {
          id: "workspace-tools",
          title: "仓库工具：会话快照、搁置、分支比较和 blame",
          action: () => setWorkspaceTools({ tab: "overview" }),
        },
        {
          id: "git-worktrees",
          title: "管理 Git 工作区 (Git Worktrees)",
          description: "查看与管理多工作树、切换工作区或新建 Worktree",
          action: () => setWorktreeModalOpen(true),
        },
        {
          id: "resolve-conflicts",
          title: "三方合并冲突解决器 (Resolve Conflicts)",
          description: "使用三栏视图解决合并与变基文件冲突",
          action: () => handleOpenConflictModal(),
        },
        {
          id: "refresh-status",
          title: "刷新仓库状态 (Refresh Status)",
          shortcut: "F5",
          action: () => refreshStatus(currentRepo.root_path),
        }
      );
    }

    return list;
  }, [currentRepo, handlePull, handleFetch, refreshStatus, handleOpenConflictModal]);

  // Selection handler
  const handleSelectTarget = useCallback((target: SelectedFileTarget) => {
    setSelectedTarget(target);
    setTreeSelectedPath(target.path);
    setDiff(null);
    setDiffLoading(true);
    setDiffError(null);
  }, []);

  const handleOpenFileFromTree = useCallback(
    (node: FileTreeNode) => {
      setTreeSelectedPath(node.path);
      if (node.fileStatus) {
        const staged = Boolean(
          node.fileStatus.index != null &&
          node.fileStatus.worktree == null &&
          node.fileStatus.index !== "Untracked"
        );
        handleSelectTarget({
          path: node.path,
          staged,
          status: node.fileStatus,
        });
      } else {
        setSelectedTarget(null);
        setDiff(null);
      }
    },
    [handleSelectTarget]
  );

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
        setLineDiscard(null);
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
      if (lineDiscard) {
        await workspaceTask(currentRepo.root_path, { type: "discard_lines", expected: lineDiscard.expected, hunk_index: lineDiscard.hunkIndex, selected: lineDiscard.indices });
        setDiscardModalVisible(false); setLineDiscard(null);
        await refreshStatus(currentRepo.root_path);
        setDiff(await getFileDiff(currentRepo.root_path, lineDiscard.expected.path, false));
        setSyncToast({ message: "已丢弃所选行，可在仓库工具的撤回备份中恢复" });
        return;
      }
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
  }, [currentRepo, discardCandidates, refreshStatus, selectedTarget, lineDiscard]);

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
        recentRepos={[...favoriteRepos, ...recentRepos.filter(p => !favoriteRepos.includes(p))]}
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
        onPullClick={handlePull}
        isPulling={isPulling}
        onPushClick={() => setPushModalOpen(true)}
        onOpenLogModal={() => setLogModalOpen(true)}
        onOpenCommandPalette={() => setCommandPaletteOpen(true)}
        onOpenStashModal={() => setStashModalOpen(true)}
        onCreateStashClick={() => setCreateStashModalOpen(true)}
        onOpenTagModal={() => setTagModalOpen(true)}
        onOpenWorktreeModal={() => setWorktreeModalOpen(true)}
        onOpenShortcuts={() => setShortcutsModalOpen(true)}
        onOpenAbout={() => setAboutModalOpen(true)}
        onOpenWorkspaceTools={() => setWorkspaceTools({ tab: "overview" })}
        favorite={!!currentRepo && favoriteRepos.includes(currentRepo.root_path)}
        onToggleFavorite={toggleFavorite}
      />


      {/* Conflict / In-Progress Action Banner (R-11, R-17) */}
      {currentRepo && (
        <ConflictBanner
          rootPath={currentRepo.root_path}
          repoState={currentRepo.head.repo_state}
          onAbortSuccess={() => refreshStatus(currentRepo.root_path)}
          onOpenResolveConflicts={() => handleOpenConflictModal()}
        />
      )}

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
              {/* Leftmost Column: Project File Tree */}
              {treeCollapsed ? (
                <div
                  style={{ width: "28px" }}
                  className="h-full flex flex-col items-center py-2 bg-[var(--color-surface)] border-r border-[var(--color-border)] shrink-0 select-none"
                >
                  <button
                    type="button"
                    onClick={() => {
                      setTreeCollapsed(false);
                      try {
                        localStorage.setItem("tongyun_tree_collapsed", "false");
                      } catch {
                        // Storage failure ignored
                      }
                    }}
                    aria-label="展开文件树"
                    title="展开文件树"
                    className="tree-tool flex items-center justify-center p-1 rounded-md text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-raised)] cursor-pointer"
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <rect x="3" y="4" width="18" height="16" rx="3" />
                      <path d="M9 4v16" />
                      <path d="m14 10 2 2-2 2" />
                    </svg>
                  </button>
                  <span className="text-xs font-semibold text-[var(--color-text-muted)] mt-3 [writing-mode:vertical-rl] tracking-widest">
                    项目
                  </span>
                </div>
              ) : (
                <>
                  <div
                    style={{ width: `${treeWidth}px` }}
                    className="h-full flex flex-col shrink-0 border-r border-[var(--color-border)] overflow-hidden"
                  >
                    <FileTreePanel
                      rootPath={currentRepo.root_path}
                      statusFiles={files}
                      refreshKey={treeRefreshKey}
                      selectedPath={treeSelectedPath}
                      onOpenFile={handleOpenFileFromTree}
                      onHide={() => {
                        setTreeCollapsed(true);
                        try {
                          localStorage.setItem("tongyun_tree_collapsed", "true");
                        } catch {
                          // Storage failure ignored
                        }
                      }}
                    />
                  </div>
                  <div
                    onMouseDown={handleMouseDownTreeResize}
                    className="w-[4px] -ml-[2px] h-full cursor-col-resize hover:bg-[var(--color-accent)] transition-colors z-20 shrink-0 select-none"
                  />
                </>
              )}

              {/* Middle Column: Changes List & Commit Area */}
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
                    onOpenFileHistory={(p) => {
                      setHistoryFilePath(p);
                      setFileHistoryModalOpen(true);
                    }}
                    onResolveConflict={handleOpenConflictModal}
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

              {/* Right Column: Diff View or File History */}
              <div className="flex-1 h-full overflow-hidden flex flex-col bg-[var(--color-bg)]">
                {/* 36px Tab Bar */}
                <div className="h-[36px] px-3.5 border-b border-[var(--color-border)] bg-[var(--color-surface)] ty-panel-header flex items-center justify-between shrink-0 select-none">
                  <div className="flex items-center gap-1 bg-[var(--ty-surface-sunken)] p-0.5 rounded-lg border border-[var(--color-border)]/70 shadow-2xs" role="tablist" aria-label="文件视图">
                    <button
                      type="button"
                      role="tab"
                      aria-selected={diffTab === "changes"}
                      onClick={() => setDiffTab("changes")}
                      className={`flex items-center px-3 py-1 text-xs cursor-pointer rounded-md font-semibold transition-all ${
                        diffTab === "changes"
                          ? "bg-[var(--color-surface)] text-[var(--color-text)] shadow-xs border border-white/60 dark:border-white/5"
                          : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
                      }`}
                    >
                      改动
                    </button>
                    {treeSelectedPath && (
                      <button
                        type="button"
                        role="tab"
                        aria-selected={diffTab === "history"}
                        onClick={() => setDiffTab("history")}
                        className={`flex items-center px-3 py-1 text-xs cursor-pointer rounded-md font-semibold transition-all ${
                          diffTab === "history"
                            ? "bg-[var(--color-surface)] text-[var(--color-text)] shadow-xs border border-white/60 dark:border-white/5"
                            : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
                        }`}
                      >
                        历史
                      </button>
                    )}
                  </div>
                  {treeSelectedPath && (
                    <span
                      className="font-mono text-[11px] px-2.5 py-0.5 rounded-full bg-[var(--ty-surface-sunken)] text-[var(--color-text-muted)] border border-[var(--color-border)]/70 truncate max-w-[50%]"
                      title={treeSelectedPath}
                    >
                      {treeSelectedPath}
                    </span>
                  )}
                </div>

                {/* Content Area */}
                {diffTab === "history" && treeSelectedPath ? (
                  <FileHistoryPanel
                    rootPath={currentRepo.root_path}
                    filePath={treeSelectedPath}
                    key={treeSelectedPath}
                  />
                ) : treeSelectedPath && !selectedTarget ? (
                  <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-[var(--color-bg)] select-none">
                    <div className="space-y-3 max-w-sm">
                      <p className="font-mono text-xs font-semibold text-[var(--color-text)] truncate" title={treeSelectedPath}>
                        {treeSelectedPath}
                      </p>
                      <p className="text-xs text-[var(--color-text-muted)]">
                        这个文件没有未提交的改动
                      </p>
                      <div>
                        <button
                          type="button"
                          onClick={() => setDiffTab("history")}
                          className="px-3 py-1.5 rounded-md text-xs font-medium border border-[var(--color-border)] bg-[var(--color-surface)] hover:bg-[var(--color-surface-raised)] text-[var(--color-text)] transition-colors cursor-pointer"
                        >
                          查看历史
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <DiffViewer
                    diff={diff}
                    loading={diffLoading}
                    error={diffError}
                    onStageHunkLines={handleStageHunkLines}
                    onDiscardHunkLines={(hunkIndex, indices) => {
                      if (diff) { setLineDiscard({ expected: diff, hunkIndex, indices }); setDiscardCandidates([{ path: diff.path, will_delete: false, unrestorable: false, size: diff.new_size || 0 }]); setDiscardModalVisible(true); }
                    }}
                  />
                )}
              </div>
            </>
          ) : (
            /* Log View (R-10) */
            <div className="flex-1 h-full overflow-hidden flex flex-col bg-[var(--color-bg)]">
              <LogView
                key={`${currentRepo.root_path}:${logSelectedOid || "history"}`}
                rootPath={currentRepo.root_path}
                initialSelectedOid={logSelectedOid}
                onOpenHistoryTools={oid => setWorkspaceTools({ tab: "history", target: oid })}
                onOpenCreateBranch={(oid) => {
                  setCreateBranchStartPoint(oid);
                  setCreateBranchModalOpen(true);
                }}
                onOpenCreateTag={(oid) => {
                  setCreateTagTargetOid(oid);
                  setCreateTagModalOpen(true);
                }}
                onOpenFileHistory={(filePath) => {
                  setHistoryFilePath(filePath);
                  setFileHistoryModalOpen(true);
                }}
                onOpenInteractiveRebase={handleOpenInteractiveRebase}
                onRefreshRepo={() => refreshStatus(currentRepo.root_path)}
              />
            </div>
          )
        ) : (
          /* Empty Workspace State */
          <div className="flex-1 flex flex-col items-center justify-center p-6 text-center bg-[var(--color-bg)] overflow-y-auto">
            <div className="max-w-xl w-full p-8 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] ty-card shadow-card-premium space-y-6 relative overflow-hidden">
              <div className="space-y-2">
                <div className="w-14 h-14 mx-auto rounded-2xl bg-[var(--ty-matcha-tint)] text-[var(--color-accent)] border border-[var(--color-accent)]/20 flex items-center justify-center shadow-2xs">
                  <FolderIcon width={28} height={28} />
                </div>
                <h2 className="text-lg font-bold text-[var(--color-text)]">
                  欢迎使用 橦云 Git
                </h2>
                <span className="sr-only">没有打开的仓库</span>
                <p className="text-xs text-[var(--color-text-muted)] max-w-md mx-auto leading-relaxed">
                  对标 IntelliJ IDEA 的独立桌面 Git 客户端 · 深度键盘流与本地 AI 助手
                </p>
              </div>

              {/* Quick Actions */}
              <div className="flex flex-wrap items-center justify-center gap-2.5 pt-1">
                <button
                  type="button"
                  disabled={!gitAvailable}
                  onClick={() => {
                    setOpenModalTab("open");
                    setOpenModalVisible(true);
                  }}
                  className="px-4 py-2.5 rounded-xl bg-[var(--color-accent)] hover:bg-[var(--ty-matcha-hover)] text-white text-xs font-semibold disabled:opacity-50 transition-all shadow-xs hover:shadow-sm active:scale-[0.98] ty-btn-tactile cursor-pointer flex items-center gap-2"
                >
                  <FolderIcon width={14} height={14} />
                  <span>打开本地仓库</span>
                </button>
                <button
                  type="button"
                  disabled={!gitAvailable}
                  onClick={() => {
                    setOpenModalTab("clone");
                    setOpenModalVisible(true);
                  }}
                  className="px-4 py-2.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] hover:bg-[var(--color-surface-raised)] text-[var(--color-text)] text-xs font-medium disabled:opacity-50 transition-all shadow-2xs hover:shadow-xs active:scale-[0.98] ty-btn-tactile cursor-pointer flex items-center gap-2"
                >
                  <svg className="w-4 h-4 text-[var(--ty-sky)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  <span>从 Git 克隆仓库</span>
                </button>
                <button
                  type="button"
                  disabled={!gitAvailable}
                  onClick={async () => {
                    const selected = await selectFolder();
                    if (selected) {
                      handleOpenRepo(selected);
                    }
                  }}
                  className="px-4 py-2.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] hover:bg-[var(--color-surface-raised)] text-[var(--color-text)] text-xs font-medium disabled:opacity-50 transition-all shadow-2xs hover:shadow-xs active:scale-[0.98] ty-btn-tactile cursor-pointer"
                >
                  浏览文件夹...
                </button>
              </div>

              {/* Recent Repositories */}
              {recentRepos.length > 0 && (
                <div className="pt-4 border-t border-[var(--color-border)] text-left space-y-2">
                  <div className="flex items-center justify-between px-1">
                    <span className="text-xs font-semibold text-[var(--color-text-muted)]">
                      最近打开的仓库
                    </span>
                    <span className="text-[11px] text-[var(--color-text-muted)] font-mono">
                      {recentRepos.length} 个
                    </span>
                  </div>
                  <div className="max-h-48 overflow-y-auto rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-raised)] divide-y divide-[var(--color-border)]/50">
                    {recentRepos.map((repoPath) => {
                      const name = repoPath.split(/[/\\]/).filter(Boolean).pop() || repoPath;
                      return (
                        <div
                          key={repoPath}
                          onClick={() => handleOpenRepo(repoPath)}
                          className="px-3 py-2 flex items-center justify-between hover:bg-[var(--color-surface)] cursor-pointer transition-colors group"
                        >
                          <div className="min-w-0 flex items-center gap-2">
                            <FolderIcon width={13} height={13} className="text-[var(--color-accent)] shrink-0" />
                            <span className="text-xs font-medium text-[var(--color-text)] shrink-0">
                              {name}
                            </span>
                            <span className="text-[11px] font-mono text-[var(--color-text-muted)] truncate max-w-[280px]">
                              {repoPath}
                            </span>
                          </div>
                          <button
                            type="button"
                            title="从最近列表移除"
                            onClick={(e) => {
                              e.stopPropagation();
                              removeRecentRepo(repoPath);
                            }}
                            className="p-1 rounded opacity-0 group-hover:opacity-100 text-[var(--color-text-muted)] hover:text-[var(--color-danger)] transition-opacity cursor-pointer"
                          >
                            <CloseIcon width={12} height={12} />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* AI-first friendly guidance footer */}
              <div className="pt-2 text-[11px] text-[var(--color-text-muted)] flex items-center justify-center gap-2">
                <span className="flex items-center gap-1.5 text-[var(--color-text-muted)]">
                  <SparklesIcon width={12} height={12} className="text-[var(--color-accent)]" />
                  内置本地 AI 提交生成与代码审查 · 开箱即用
                </span>
                <span>·</span>
                <button
                  type="button"
                  onClick={() => setSettingsModalVisible(true)}
                  className="text-[var(--color-accent)] hover:underline cursor-pointer"
                >
                  配置 AI 模型
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Bottom Status Bar */}
      <StatusBar
        currentRepo={currentRepo}
        isRefreshing={isRefreshing}
        isPulling={isPulling}
        gitVersion={appInfo?.git_version}
        onOpenBranchModal={() => setBranchModalOpen(true)}
        onOpenTagModal={() => setTagModalOpen(true)}
        onOpenWorktreeModal={() => setWorktreeModalOpen(true)}
        onOpenLogModal={() => setLogModalOpen(true)}
        onOpenShortcuts={() => setShortcutsModalOpen(true)}
        onOpenAbout={() => setAboutModalOpen(true)}
      />

      {/* Discard Confirmation Modal (R-17) */}
      <DiscardConfirmModal
        isOpen={discardModalVisible}
        onClose={() => setDiscardModalVisible(false)}
        onConfirm={handleConfirmDiscard}
        candidates={discardCandidates}
        loading={discardLoading}
        lineCount={lineDiscard?.indices.length}
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

      {currentRepo && workspaceTools && <WorkspaceTools key={currentRepo.root_path} rootPath={currentRepo.root_path} initialTab={workspaceTools.tab} initialTarget={workspaceTools.target} initialFile={selectedTarget?.path || ""} onClose={() => setWorkspaceTools(null)} onChanged={() => { void refreshStatus(currentRepo.root_path); if (selectedTarget) void getFileDiff(currentRepo.root_path, selectedTarget.path, selectedTarget.staged).then(setDiff).catch(() => setDiff(null)); }} onOpenRepo={handleOpenRepo} onShowCommit={oid => { setLogSelectedOid(oid); setActiveView("log"); setWorkspaceTools(null); }} />}
      {/* Open Repo Modal */}
      <OpenRepoModal
        isOpen={openModalVisible}
        onClose={() => setOpenModalVisible(false)}
        onOpenRepo={handleOpenRepo}
        onInitRepo={handleInitRepo}
        onCloneRepo={handleCloneRepo}
        recentRepos={recentRepos}
        onRemoveRecent={removeRecentRepo}
        error={openError}
        loading={openLoading}
        initialPath={openAttemptPath}
        initialTab={openModalTab}
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
        checkingUpdate={checkingUpdate}
        onCheckUpdate={() => void handleCheckUpdate(true)}
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
      {/* Push Modal (R-12) */}
      {currentRepo && (
        <PushModal
          isOpen={pushModalOpen}
          rootPath={currentRepo.root_path}
          onClose={() => setPushModalOpen(false)}
          onSuccess={() => refreshStatus(currentRepo.root_path)}
        />
      )}

      {/* Operation Log Modal (R-15) */}
      <OperationLogModal
        isOpen={logModalOpen}
        onClose={() => setLogModalOpen(false)}
      />

      {/* Stash Modals */}
      {currentRepo && (
        <>
          <StashModal
            isOpen={stashModalOpen}
            onClose={() => setStashModalOpen(false)}
            rootPath={currentRepo.root_path}
            onStashApplied={() => refreshStatus(currentRepo.root_path)}
          />
          <CreateStashModal
            isOpen={createStashModalOpen}
            onClose={() => setCreateStashModalOpen(false)}
            rootPath={currentRepo.root_path}
            onSuccess={() => refreshStatus(currentRepo.root_path)}
          />
          <TagModal
            isOpen={tagModalOpen}
            onClose={() => setTagModalOpen(false)}
            rootPath={currentRepo.root_path}
            onCreateTagClick={(oid?: string | null) => {
              setCreateTagTargetOid(oid || null);
              setCreateTagModalOpen(true);
            }}
          />
          <CreateTagModal
            isOpen={createTagModalOpen}
            onClose={() => {
              setCreateTagModalOpen(false);
              setCreateTagTargetOid(null);
            }}
            rootPath={currentRepo.root_path}
            targetOid={createTagTargetOid || undefined}
            onSuccess={() => {
              refreshStatus(currentRepo.root_path);
            }}
          />
          <FileHistoryModal
            isOpen={fileHistoryModalOpen}
            onClose={() => {
              setFileHistoryModalOpen(false);
              setHistoryFilePath("");
            }}
            rootPath={currentRepo.root_path}
            filePath={historyFilePath}
          />
          <MergeConflictModal
            isOpen={conflictModalOpen}
            onClose={() => {
              setConflictModalOpen(false);
              setConflictModalTargetFile(null);
            }}
            rootPath={currentRepo.root_path}
            initialFilePath={conflictModalTargetFile}
            onConflictsResolved={() => {
              refreshStatus(currentRepo.root_path);
              setSelectedTarget(null);
              setDiff(null);
            }}
          />
          <InteractiveRebaseModal
            isOpen={rebaseModalOpen}
            onClose={() => {
              setRebaseModalOpen(false);
              setRebaseBaseOid("");
              setRebaseBaseSummary(undefined);
            }}
            rootPath={currentRepo.root_path}
            baseOid={rebaseBaseOid}
            baseSummary={rebaseBaseSummary}
            onRebaseSuccess={() => {
              refreshStatus(currentRepo.root_path);
              setSelectedTarget(null);
              setDiff(null);
            }}
          />
          <WorktreeModal
            isOpen={worktreeModalOpen}
            onClose={() => setWorktreeModalOpen(false)}
            rootPath={currentRepo.root_path}
            onOpenRepo={handleOpenRepo}
          />
        </>

      )}

      {/* Help & About Modals */}
      <ShortcutsHelpModal
        isOpen={shortcutsModalOpen}
        onClose={() => setShortcutsModalOpen(false)}
      />
      <AboutModal
        isOpen={aboutModalOpen}
        onClose={() => setAboutModalOpen(false)}
        appInfo={appInfo}
        checkingUpdate={checkingUpdate}
        onCheckUpdate={() => void handleCheckUpdate(true)}
      />

      {activeUpdate && (
        <UpdateModal
          update={activeUpdate}
          onClose={() => {
            activeUpdate.close().catch(() => {});
            setActiveUpdate(null);
          }}
        />
      )}

      {updateToast && (
        <div
          role="status"
          className={`fixed bottom-10 left-1/2 -translate-x-1/2 z-[60] px-4 py-2 rounded-lg text-xs font-medium shadow-lg border ${
            updateToast.tone === "danger"
              ? "bg-[var(--color-danger)]/15 border-[var(--color-danger)]/40 text-[var(--color-danger)]"
              : "bg-[var(--color-surface)] border-[var(--color-border)] text-[var(--color-text)]"
          }`}
        >
          {updateToast.text}
        </div>
      )}

      {/* Command Palette (R-16) */}
      <CommandPalette
        isOpen={commandPaletteOpen}
        onClose={() => setCommandPaletteOpen(false)}
        commands={commandList}
      />

      {/* Sync / Pull Toast Notification */}
      {syncToast && (
        <div
          role="status"
          aria-live="polite"
          className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 px-4 py-3 rounded-lg border shadow-lg text-xs animate-in fade-in slide-in-from-bottom-2 ${
            syncToast.isError
              ? "bg-[var(--ty-peach-tint)] border-[var(--color-danger-border)] text-[var(--ty-peach-text)]"
              : "bg-[var(--color-surface)] border-[var(--color-border)] text-[var(--color-text)]"
          }`}
        >
          <span>{syncToast.message}</span>
          <button
            type="button"
            onClick={() => setSyncToast(null)}
            className="p-1 rounded text-[var(--color-text-muted)] hover:text-[var(--color-text)] cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}
