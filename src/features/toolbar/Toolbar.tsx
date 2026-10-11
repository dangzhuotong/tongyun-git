import { useState, useRef, useEffect } from "react";
import type { RepoInfo } from "../../lib/host";
import logoUrl from "../../assets/logo.svg";
import {
  FolderIcon,
  BranchIcon,
  RefreshIcon,
  SettingsIcon,
  SunIcon,
  MoonIcon,
  ChevronDownIcon,
  ArchiveIcon,
  TagIcon,
  WorktreeIcon,
  KeyboardIcon,
  InfoIcon,
} from "../../components/icons";

interface ToolbarProps {
  currentRepo: RepoInfo | null;
  recentRepos: string[];
  onOpenRepo: (path: string) => void;
  onOpenModalClick: () => void;
  onRefresh: () => void;
  isRefreshing: boolean;
  theme: "system" | "light" | "dark";
  onToggleTheme: () => void;
  onOpenSettings: () => void;
  gitAvailable: boolean;
  activeView?: "changes" | "log";
  onViewChange?: (view: "changes" | "log") => void;
  onOpenBranchModal?: () => void;
  onPullClick?: () => void;
  isPulling?: boolean;
  onPushClick?: () => void;
  onOpenLogModal?: () => void;
  onOpenCommandPalette?: () => void;
  onOpenStashModal?: () => void;
  onCreateStashClick?: () => void;
  onOpenTagModal?: () => void;
  onOpenWorktreeModal?: () => void;
  onOpenShortcuts?: () => void;
  onOpenAbout?: () => void;
  onOpenWorkspaceTools?: () => void;
  favorite?: boolean;
  onToggleFavorite?: () => void;
}


export function Toolbar({
  currentRepo,
  recentRepos,
  onOpenRepo,
  onOpenModalClick,
  onRefresh,
  isRefreshing,
  theme,
  onToggleTheme,
  onOpenSettings,
  gitAvailable,
  activeView = "changes",
  onViewChange,
  onOpenBranchModal,
  onPullClick,
  isPulling = false,
  onPushClick,
  onOpenLogModal,
  onOpenCommandPalette,
  onOpenStashModal,
  onCreateStashClick,
  onOpenTagModal,
  onOpenWorktreeModal,
  onOpenShortcuts,
  onOpenAbout,
  onOpenWorkspaceTools, favorite, onToggleFavorite,
}: ToolbarProps) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const branchDisplay = currentRepo?.head.unborn
    ? "空仓库 (无提交)"
    : currentRepo?.head.branch || "HEAD";

  return (
    <header className="h-[40px] px-3 flex items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-surface)] text-xs text-[var(--color-text)] select-none">
      {/* Left: Repo selector & Branch */}
      <div className="flex items-center gap-2">
        <img src={logoUrl} alt="橦云 Git" width={20} height={22} className="shrink-0" />
        <div className="h-3 w-px bg-[var(--color-border)] shrink-0" />
        {/* Repo dropdown */}
        <div className="relative" ref={dropdownRef}>
          <button
            type="button"
            disabled={!gitAvailable}
            onClick={() => setDropdownOpen(!dropdownOpen)}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded hover:bg-[var(--color-surface-raised)] transition-colors font-semibold text-xs border border-transparent hover:border-[var(--color-border)] disabled:opacity-50"
          >
            <FolderIcon width={14} height={14} className="text-[var(--color-accent)]" />
            <span className="max-w-[160px] truncate">
              {currentRepo ? currentRepo.name : "未打开仓库"}
            </span>
            <ChevronDownIcon width={12} height={12} className="text-[var(--color-text-muted)]" />
          </button>

          {dropdownOpen && (
            <div className="absolute left-0 mt-1 w-64 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] shadow-lg z-40 py-1 divide-y divide-[var(--color-border)]/40">
              <button
                type="button"
                onClick={() => {
                  setDropdownOpen(false);
                  onOpenModalClick();
                }}
                className="w-full text-left px-3 py-1.5 hover:bg-[var(--color-surface-raised)] flex items-center gap-2 text-xs font-medium text-[var(--color-accent)]"
              >
                <FolderIcon width={13} height={13} />
                <span>打开其他目录...</span>
              </button>

              {recentRepos.length > 0 && (
                <div className="py-1">
                  <div className="px-3 py-1 text-[10px] font-semibold text-[var(--color-text-muted)] uppercase">
                    最近打开
                  </div>
                  {recentRepos.map((path) => (
                    <button
                      key={path}
                      type="button"
                      onClick={() => {
                        setDropdownOpen(false);
                        onOpenRepo(path);
                      }}
                      className="w-full text-left px-3 py-1.5 hover:bg-[var(--color-surface-raised)] font-mono text-[11px] truncate block text-[var(--color-text)]"
                    >
                      {path}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Branch pill / switcher button */}
        {currentRepo && (
          <button
            type="button"
            onClick={onOpenBranchModal}
            className="flex items-center gap-1 px-2 py-0.5 rounded bg-[var(--color-surface-raised)] hover:bg-[var(--color-bg)] border border-[var(--color-border)] font-mono text-[11px] text-[var(--color-text-muted)] transition-colors cursor-pointer group"
            title={`分支: ${branchDisplay} (点击或快捷键 Ctrl+Shift+\` 切换)`}
          >
            <BranchIcon width={12} height={12} className="text-[var(--color-accent)]" />
            <span className="font-medium text-[var(--color-text)] max-w-[140px] truncate">
              {branchDisplay}
            </span>
            <ChevronDownIcon width={10} height={10} className="text-[var(--color-text-muted)] group-hover:text-[var(--color-text)] transition-colors ml-0.5" />
          </button>
        )}

        {/* View Segmented Control (改动 | 日志) */}
        {currentRepo && onViewChange && (
          <div className="flex items-center p-0.5 rounded bg-[var(--color-bg)] border border-[var(--color-border)] ml-1">
            <button
              type="button"
              onClick={() => onViewChange("changes")}
              className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
                activeView === "changes"
                  ? "bg-[var(--color-surface-raised)] text-[var(--color-text)] shadow-xs"
                  : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
              }`}
            >
              改动
            </button>
            <button
              type="button"
              onClick={() => onViewChange("log")}
              className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
                activeView === "log"
                  ? "bg-[var(--color-surface-raised)] text-[var(--color-text)] shadow-xs"
                  : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
              }`}
            >
              日志
            </button>
          </div>
        )}
      </div>

      {currentRepo && <div className="flex items-center gap-2">
        <button type="button" aria-label={favorite ? "取消收藏仓库" : "收藏仓库"} onClick={onToggleFavorite} className="px-2 py-1 rounded hover:bg-[var(--color-surface-raised)]">{favorite ? "★" : "☆"}</button>
        <button type="button" onClick={onOpenWorkspaceTools} className="px-2 py-1 rounded border border-[var(--color-border)] hover:bg-[var(--color-surface-raised)]">仓库工具</button>
      </div>}
      {/* Right: Actions & Tools */}
      <div className="flex items-center gap-1.5">
        {/* Open Folder Button */}
        <button
          type="button"
          disabled={!gitAvailable}
          onClick={onOpenModalClick}
          className="flex items-center gap-1 px-2.5 py-1 rounded border border-[var(--color-border)] bg-[var(--color-bg)] hover:bg-[var(--color-surface-raised)] font-medium text-xs text-[var(--color-text)] transition-colors disabled:opacity-50"
        >
          <FolderIcon width={13} height={13} />
          <span>打开文件夹</span>
        </button>

        {/* Pull Button */}
        {currentRepo && onPullClick && (
          <button
            type="button"
            title="拉取远程更新 (Ctrl+T)"
            onClick={onPullClick}
            disabled={isPulling}
            className="flex items-center gap-1 px-2.5 py-1 rounded border border-[var(--color-border)] bg-[var(--color-bg)] hover:bg-[var(--color-surface-raised)] font-medium text-xs text-[var(--color-text)] transition-colors disabled:opacity-50 cursor-pointer"
          >
            <svg
              className={`w-3.5 h-3.5 ${isPulling ? "animate-bounce text-[var(--color-accent)]" : ""}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 14l-7 7m0 0l-7-7m7 7V3"
              />
            </svg>
            <span>{isPulling ? "正在拉取" : "拉取"}</span>
          </button>
        )}

        {/* Push Button */}
        {currentRepo && onPushClick && (
          <button
            type="button"
            title="推送提交到远程 (Ctrl+Shift+K)"
            onClick={onPushClick}
            className="flex items-center gap-1 px-2.5 py-1 rounded border border-[var(--color-border)] bg-[var(--color-bg)] hover:bg-[var(--color-surface-raised)] font-medium text-xs text-[var(--color-text)] transition-colors cursor-pointer"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 10l7-7m0 0l7 7m-7-7v18"
              />
            </svg>
            <span>推送</span>
          </button>
        )}

        {/* Stash Button Group */}
        {currentRepo && (onOpenStashModal || onCreateStashClick) && (
          <div className="flex items-center rounded border border-[var(--color-border)] bg-[var(--color-bg)] overflow-hidden">
            {onCreateStashClick && (
              <button
                type="button"
                title="贮藏当前工作区改动 (Stash)"
                onClick={onCreateStashClick}
                className="flex items-center gap-1 px-2.5 py-1 font-medium text-xs text-[var(--color-text)] hover:bg-[var(--color-surface-raised)] transition-colors cursor-pointer"
              >
                <ArchiveIcon width={13} height={13} />
                <span>贮藏</span>
              </button>
            )}
            {onOpenStashModal && (
              <button
                type="button"
                title="管理贮藏记录 (Stashes)"
                onClick={onOpenStashModal}
                className="px-1.5 py-1 text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-raised)] border-l border-[var(--color-border)] cursor-pointer"
              >
                <ChevronDownIcon width={11} height={11} />
              </button>
            )}
          </div>
        )}

        {/* Tag Button */}
        {currentRepo && onOpenTagModal && (
          <button
            type="button"
            title="标签管理 (Git Tags)"
            onClick={onOpenTagModal}
            className="flex items-center gap-1 px-2 py-1 rounded hover:bg-[var(--color-surface-raised)] text-[var(--color-text)] transition-colors border border-[var(--color-border)] cursor-pointer"
          >
            <TagIcon width={13} height={13} className="text-[var(--ty-honey)]" />
            <span className="hidden sm:inline font-medium text-[11px]">标签</span>
          </button>
        )}

        {/* Worktree Button */}
        {currentRepo && onOpenWorktreeModal && (
          <button
            type="button"
            title="管理 Git 工作区 (Git Worktrees)"
            onClick={onOpenWorktreeModal}
            className="flex items-center gap-1 px-2 py-1 rounded hover:bg-[var(--color-surface-raised)] text-[var(--color-text)] transition-colors border border-[var(--color-border)] cursor-pointer"
          >
            <WorktreeIcon width={13} height={13} className="text-[var(--color-accent)]" />
            <span className="hidden sm:inline font-medium text-[11px]">工作区</span>
          </button>
        )}


        {/* Refresh Button */}
        <button
          type="button"
          title="刷新改动列表 (F5)"
          onClick={onRefresh}
          disabled={isRefreshing || !currentRepo}
          className="p-1.5 rounded hover:bg-[var(--color-surface-raised)] text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors disabled:opacity-50"
        >
          <RefreshIcon
            width={14}
            height={14}
            className={isRefreshing ? "animate-spin" : ""}
          />
        </button>

        {/* Command Palette Button */}
        {onOpenCommandPalette && (
          <button
            type="button"
            title="命令面板 (Ctrl+Shift+P)"
            onClick={onOpenCommandPalette}
            className="p-1.5 rounded hover:bg-[var(--color-surface-raised)] text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors cursor-pointer"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
          </button>
        )}

        {/* Operation Log Button */}
        {onOpenLogModal && (
          <button
            type="button"
            title="Git 命令行操作日志"
            onClick={onOpenLogModal}
            className="p-1.5 rounded hover:bg-[var(--color-surface-raised)] text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors cursor-pointer"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 6h16M4 12h16M4 18h7"
              />
            </svg>
          </button>
        )}

        {/* Keyboard Shortcuts Button */}
        {onOpenShortcuts && (
          <button
            type="button"
            title="键盘快捷键帮助 (? 或 F1)"
            onClick={onOpenShortcuts}
            className="p-1.5 rounded hover:bg-[var(--color-surface-raised)] text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors cursor-pointer"
          >
            <KeyboardIcon width={14} height={14} />
          </button>
        )}

        {/* Theme Toggle Button */}
        <button
          type="button"
          title="切换主题"
          onClick={onToggleTheme}
          className="p-1.5 rounded hover:bg-[var(--color-surface-raised)] text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors"
        >
          {theme === "dark" ? (
            <SunIcon width={14} height={14} />
          ) : (
            <MoonIcon width={14} height={14} />
          )}
        </button>

        {/* Settings Button */}
        <button
          type="button"
          title="打开设置"
          onClick={onOpenSettings}
          className="p-1.5 rounded hover:bg-[var(--color-surface-raised)] text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors"
        >
          <SettingsIcon width={14} height={14} />
        </button>

        {/* About App Button */}
        {onOpenAbout && (
          <button
            type="button"
            title="关于 橦云 Git"
            onClick={onOpenAbout}
            className="p-1.5 rounded hover:bg-[var(--color-surface-raised)] text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors cursor-pointer"
          >
            <InfoIcon width={14} height={14} />
          </button>
        )}
      </div>
    </header>
  );
}
