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
  onFetchClick?: () => void;
  isFetching?: boolean;
  onPullClick?: () => void;
  onPullAllClick?: () => void;
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
  ahead?: number;
  behind?: number;
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
  onFetchClick,
  isFetching = false,
  onPullClick,
  onPullAllClick,
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
  ahead = 0,
  behind = 0,
}: ToolbarProps) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [pullMenuOpen, setPullMenuOpen] = useState(false);
  const pullMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
      if (pullMenuRef.current && !pullMenuRef.current.contains(event.target as Node)) {
        setPullMenuOpen(false);
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
            <div className="absolute left-0 mt-1 w-72 sm:w-80 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] shadow-lg z-40 py-1 divide-y divide-[var(--color-border)]/40">
              <button
                type="button"
                onClick={() => {
                  setDropdownOpen(false);
                  onOpenModalClick();
                }}
                className="w-full text-left px-3 py-2 hover:bg-[var(--color-surface-raised)] flex items-center gap-2 text-xs font-medium text-[var(--color-accent)] cursor-pointer transition-colors"
              >
                <FolderIcon width={14} height={14} />
                <span>打开其他目录...</span>
              </button>

              {recentRepos.length > 0 && (
                <div className="py-1">
                  <div className="px-3 py-1 text-[10px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">
                    最近打开
                  </div>
                  <div className="max-h-64 overflow-y-auto divide-y divide-[var(--color-border)]/30">
                    {recentRepos.map((path) => {
                      const name = path.split(/[\\/]/).filter(Boolean).pop() || path;
                      const isCurrent = currentRepo?.root_path === path;
                      return (
                        <button
                          key={path}
                          type="button"
                          title={path}
                          onClick={() => {
                            setDropdownOpen(false);
                            onOpenRepo(path);
                          }}
                          className={`w-full text-left px-3 py-2 hover:bg-[var(--color-surface-raised)] transition-colors cursor-pointer group flex items-start gap-2.5 ${
                            isCurrent ? "bg-[var(--color-surface-raised)]/50" : ""
                          }`}
                        >
                          <FolderIcon
                            width={14}
                            height={14}
                            className={`shrink-0 mt-0.5 ${
                              isCurrent
                                ? "text-[var(--color-accent)]"
                                : "text-[var(--color-text-muted)] group-hover:text-[var(--color-accent)]"
                            } transition-colors`}
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-1">
                              <span
                                className={`text-xs truncate ${
                                  isCurrent
                                    ? "font-semibold text-[var(--color-accent)]"
                                    : "font-medium text-[var(--color-text)]"
                                }`}
                              >
                                {name}
                              </span>
                              {isCurrent && (
                                <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-[var(--color-accent)]/15 text-[var(--color-accent)] shrink-0 font-medium leading-none">
                                  当前
                                </span>
                              )}
                            </div>
                            <div className="font-mono text-[10px] text-[var(--color-text-muted)] truncate leading-tight mt-0.5">
                              {path}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
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

        {/* Fetch Button */}
        {currentRepo && onFetchClick && (
          <button
            type="button"
            title="获取所有远程分支更新 (Fetch All: git fetch --all --prune)"
            onClick={onFetchClick}
            disabled={isFetching || isPulling}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded border border-[var(--color-border)] bg-[var(--color-bg)] hover:bg-[var(--color-surface-raised)] font-medium text-xs text-[var(--color-text)] transition-colors disabled:opacity-50 cursor-pointer"
          >
            <svg
              className={`w-3.5 h-3.5 ${isFetching ? "animate-spin text-[var(--color-accent)]" : ""}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
            <span>{isFetching ? "获取中..." : "获取"}</span>
          </button>
        )}

        {/* Pull / Pull All Button Group */}
        {currentRepo && (onPullClick || onPullAllClick) && (
          <div className="relative inline-flex items-center rounded border border-[var(--color-border)] bg-[var(--color-bg)]" ref={pullMenuRef}>
            <button
              type="button"
              title={`一键拉取所有最新代码 (Ctrl+T: 抓取全部远程分支并更新当前分支)${behind > 0 ? ` · ${behind} 个远程提交待拉取` : ""}`}
              onClick={onPullAllClick || onPullClick}
              disabled={isPulling || isFetching}
              className={`flex items-center gap-1.5 px-2.5 py-1 font-medium text-xs transition-colors disabled:opacity-50 cursor-pointer rounded-l ${
                behind > 0
                  ? "bg-[var(--ty-honey-tint)]/60 text-[var(--ty-honey)] hover:bg-[var(--ty-honey-tint)] font-semibold"
                  : "hover:bg-[var(--color-surface-raised)] text-[var(--color-text)]"
              }`}
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
              <span>{isPulling ? "正在拉取" : "一键拉取"}</span>
              {behind > 0 && (
                <span className="px-1.5 py-0.2 text-[10px] font-bold rounded-full bg-[var(--ty-honey)] text-white">
                  ↓{behind}
                </span>
              )}
            </button>
            <button
              type="button"
              title="拉取与获取选项"
              onClick={() => setPullMenuOpen(!pullMenuOpen)}
              disabled={isPulling || isFetching}
              className="px-1.5 py-1 border-l border-[var(--color-border)] hover:bg-[var(--color-surface-raised)] text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors cursor-pointer rounded-r"
            >
              <ChevronDownIcon width={10} height={10} />
            </button>

            {pullMenuOpen && (
              <div className="absolute right-0 top-full mt-1 w-60 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] shadow-lg z-50 py-1 text-xs divide-y divide-[var(--color-border)]/40">
                <div className="py-1">
                  <button
                    type="button"
                    onClick={() => {
                      setPullMenuOpen(false);
                      (onPullAllClick || onPullClick)?.();
                    }}
                    className="w-full text-left px-3 py-1.5 hover:bg-[var(--color-surface-raised)] flex items-start gap-2 text-[var(--color-text)] cursor-pointer"
                  >
                    <span className="text-[var(--color-accent)] font-bold text-sm leading-none mt-0.5">⚡</span>
                    <div>
                      <div className="font-semibold">一键拉取全部最新代码</div>
                      <div className="text-[10px] text-[var(--color-text-muted)]">抓取全部远程分支并合并当前分支 (Ctrl+T)</div>
                    </div>
                  </button>
                </div>
                <div className="py-1">
                  {onPullClick && (
                    <button
                      type="button"
                      onClick={() => {
                        setPullMenuOpen(false);
                        onPullClick();
                      }}
                      className="w-full text-left px-3 py-1.5 hover:bg-[var(--color-surface-raised)] flex items-start gap-2 text-[var(--color-text)] cursor-pointer"
                    >
                      <span className="text-[var(--color-text-muted)] leading-none mt-0.5">📥</span>
                      <div>
                        <div className="font-medium">仅拉取当前分支</div>
                        <div className="text-[10px] text-[var(--color-text-muted)]">仅同步当前跟踪分支 (git pull)</div>
                      </div>
                    </button>
                  )}
                  {onFetchClick && (
                    <button
                      type="button"
                      onClick={() => {
                        setPullMenuOpen(false);
                        onFetchClick();
                      }}
                      className="w-full text-left px-3 py-1.5 hover:bg-[var(--color-surface-raised)] flex items-start gap-2 text-[var(--color-text)] cursor-pointer"
                    >
                      <span className="text-[var(--color-text-muted)] leading-none mt-0.5">🌐</span>
                      <div>
                        <div className="font-medium">获取所有远程更新 (Fetch All)</div>
                        <div className="text-[10px] text-[var(--color-text-muted)]">更新所有远程引用，不改动本地文件</div>
                      </div>
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Push Button */}
        {currentRepo && onPushClick && (
          <button
            type="button"
            title={`推送提交到远程 (Ctrl+Shift+K)${ahead > 0 ? ` · ${ahead} 个本地提交未推送` : ""}`}
            onClick={onPushClick}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded border font-medium text-xs transition-colors cursor-pointer ${
              ahead > 0
                ? "border-[var(--color-accent)] bg-[var(--color-accent)]/15 text-[var(--color-accent)] hover:bg-[var(--color-accent)]/25 font-semibold"
                : "border-[var(--color-border)] bg-[var(--color-bg)] hover:bg-[var(--color-surface-raised)] text-[var(--color-text)]"
            }`}
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
            {ahead > 0 && (
              <span className="px-1.5 py-0.2 text-[10px] font-bold rounded-full bg-[var(--color-accent)] text-white">
                ↑{ahead}
              </span>
            )}
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
