import { useState, useRef, useEffect } from "react";
import type { RepoInfo } from "../../lib/host";
import {
  FolderIcon,
  BranchIcon,
  RefreshIcon,
  SettingsIcon,
  SunIcon,
  MoonIcon,
  ChevronDownIcon,
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

        {/* Branch pill */}
        {currentRepo && (
          <div
            className="flex items-center gap-1 px-2 py-0.5 rounded bg-[var(--color-surface-raised)] border border-[var(--color-border)] font-mono text-[11px] text-[var(--color-text-muted)]"
            title={`分支: ${branchDisplay}`}
          >
            <BranchIcon width={12} height={12} className="text-[var(--color-accent)]" />
            <span className="font-medium text-[var(--color-text)] max-w-[140px] truncate">
              {branchDisplay}
            </span>
          </div>
        )}
      </div>

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
      </div>
    </header>
  );
}
