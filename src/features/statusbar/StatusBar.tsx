import {
  BranchIcon,
  TagIcon,
  TerminalIcon,
  KeyboardIcon,
  InfoIcon,
} from "../../components/icons";
import type { RepoInfo, AppInfo } from "../../lib/host";

interface StatusBarProps {
  repo?: RepoInfo | null;
  currentRepo?: RepoInfo | null;
  appInfo?: AppInfo | null;
  gitVersion?: string | null;
  statusMessage?: string;
  isRefreshing?: boolean;
  isPulling?: boolean;
  onOpenBranchModal: () => void;
  onOpenTagModal: () => void;
  onOpenLogModal: () => void;
  onOpenShortcuts: () => void;
  onOpenAbout: () => void;
}

export function StatusBar({
  repo,
  currentRepo,
  appInfo,
  gitVersion,
  statusMessage = "就绪",
  isRefreshing = false,
  isPulling = false,
  onOpenBranchModal,
  onOpenTagModal,
  onOpenLogModal,
  onOpenShortcuts,
  onOpenAbout,
}: StatusBarProps) {
  const activeRepo = repo ?? currentRepo ?? null;
  const activeGitVersion = gitVersion ?? appInfo?.git_version ?? null;
  const currentBranch = activeRepo?.head?.branch || (activeRepo?.head?.oid ? activeRepo.head.oid.slice(0, 7) : null);

  return (
    <footer className="h-6 px-3 bg-[var(--color-surface)] border-t border-[var(--color-border)] flex items-center justify-between text-[11px] text-[var(--color-text-muted)] select-none shrink-0 z-30">
      {/* Left: Repo, Branch & Status */}
      <div className="flex items-center gap-3">
        {activeRepo ? (
          <>
            {/* Branch button */}
            <button
              type="button"
              onClick={onOpenBranchModal}
              className="flex items-center gap-1.5 hover:text-[var(--color-accent)] cursor-pointer transition-colors px-1 py-0.5 rounded-sm hover:bg-[var(--color-surface-raised)]"
              title="点击切换或新建分支"
            >
              <BranchIcon width={12} height={12} className="text-[var(--color-accent)]" />
              <span className="font-medium text-[var(--color-text)]">
                {currentBranch || "无分支"}
              </span>
            </button>

            {/* Repo Name */}
            <span
              className="truncate max-w-[180px] font-mono text-[var(--color-text-muted)] hover:text-[var(--color-text)] cursor-help"
              title={`仓库根路径: ${activeRepo.root_path}`}
            >
              {activeRepo.name}
            </span>
          </>
        ) : (
          <span className="text-[var(--color-text-muted)]">未加载仓库</span>
        )}

        {/* Center/Status feedback */}
        <div className="flex items-center gap-1.5 pl-2 border-l border-[var(--color-border)]">
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              isRefreshing || isPulling
                ? "bg-[var(--color-accent)] animate-ping"
                : "bg-emerald-500"
            }`}
          />
          <span className="truncate max-w-[200px]">
            {isPulling ? "正在拉取远程..." : isRefreshing ? "正在刷新状态..." : statusMessage}
          </span>
        </div>
      </div>

      {/* Right: Quick Tools & Info */}
      <div className="flex items-center gap-3">
        {/* Tag button */}
        {activeRepo && (
          <button
            type="button"
            onClick={onOpenTagModal}
            className="flex items-center gap-1 hover:text-[var(--color-accent)] cursor-pointer transition-colors px-1.5 py-0.5 rounded-sm hover:bg-[var(--color-surface-raised)]"
            title="管理 Git 标签 (Tags)"
          >
            <TagIcon width={12} height={12} />
            <span>标签</span>
          </button>
        )}

        {/* Operation Log button */}
        <button
          type="button"
          onClick={onOpenLogModal}
          className="flex items-center gap-1 hover:text-[var(--color-accent)] cursor-pointer transition-colors px-1.5 py-0.5 rounded-sm hover:bg-[var(--color-surface-raised)]"
          title="查看 Git 终端操作日志 (R-15)"
        >
          <TerminalIcon width={12} height={12} />
          <span>终端日志</span>
        </button>

        {/* Git Version */}
        {activeGitVersion && (
          <span className="font-mono text-[10px] hidden sm:inline" title="系统 Git 版本">
            {activeGitVersion.replace(/^git version\s*/i, "git ")}
          </span>
        )}

        {/* Encoding / Line Endings */}
        <span className="text-[10px] hidden md:inline font-mono">UTF-8</span>

        {/* Keyboard Shortcuts */}
        <button
          type="button"
          onClick={onOpenShortcuts}
          className="flex items-center gap-1 hover:text-[var(--color-accent)] cursor-pointer transition-colors px-1 py-0.5 rounded-sm hover:bg-[var(--color-surface-raised)]"
          title="查看键盘快捷键帮助 (? 或 F1)"
        >
          <KeyboardIcon width={12} height={12} />
          <span className="hidden sm:inline">快捷键</span>
        </button>

        {/* About App */}
        <button
          type="button"
          onClick={onOpenAbout}
          className="hover:text-[var(--color-text)] cursor-pointer transition-colors px-1 py-0.5 rounded-sm hover:bg-[var(--color-surface-raised)]"
          title="关于 橦云 Git"
        >
          <InfoIcon width={12} height={12} />
        </button>
      </div>
    </footer>
  );
}
