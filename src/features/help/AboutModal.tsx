import { type AppInfo } from "../../lib/host";
import { CloseIcon, InfoIcon, BranchIcon } from "../../components/icons";
import { useEscapeKey } from "../../hooks/useEscapeKey";

interface AboutModalProps {
  isOpen: boolean;
  onClose: () => void;
  appInfo: AppInfo | null;
  checkingUpdate?: boolean;
  onCheckUpdate?: () => void;
}

export function AboutModal({
  isOpen,
  onClose,
  appInfo,
  checkingUpdate = false,
  onCheckUpdate,
}: AboutModalProps) {
  useEscapeKey(onClose, isOpen);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 select-none">
      <div className="w-full max-w-md rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-2xl overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)] bg-[var(--color-surface-raised)]">
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-md bg-[var(--color-accent)]/15 text-[var(--color-accent)]">
              <InfoIcon width={16} height={16} />
            </span>
            <h2 className="text-sm font-semibold text-[var(--color-text)]">
              关于 橦云 Git
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-md text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface)] transition-colors cursor-pointer"
          >
            <CloseIcon width={16} height={16} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 text-center space-y-4">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-[var(--color-accent)]/10 text-[var(--color-accent)] border border-[var(--color-accent)]/20 flex items-center justify-center shadow-xs">
            <BranchIcon width={32} height={32} />
          </div>

          <div>
            <h3 className="text-lg font-bold text-[var(--color-text)]">
              橦云 Git (tongyun-git)
            </h3>
            <p className="text-xs text-[var(--color-text-muted)] mt-1">
              对标 IntelliJ IDEA 的独立桌面 Git 客户端 · 自带智能 AI 能力
            </p>
            <div className="inline-block mt-2 px-2.5 py-0.5 rounded-full bg-[var(--color-accent)]/10 border border-[var(--color-accent)]/20 text-[var(--color-accent)] text-xs font-mono font-medium">
              当前版本 v{appInfo?.version || "0.1.1"}
            </div>
          </div>

          {/* System details */}
          <div className="p-3.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-raised)] text-left text-xs space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-[var(--color-text-muted)]">系统 Git 引擎:</span>
              <span className="font-mono text-[var(--color-text)]">
                {appInfo?.git_version || "系统默认"}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[var(--color-text-muted)]">底层 libgit2:</span>
              <span className="font-mono text-[var(--color-text)]">
                {appInfo?.libgit2_version || "1.9.0"}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[var(--color-text-muted)]">核心架构:</span>
              <span className="text-[var(--color-text)]">
                Tauri 2 + Rust + React 19
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[var(--color-text-muted)]">应用标识:</span>
              <span className="font-mono text-[11px] text-[var(--color-text-muted)]">
                {appInfo?.identifier || "com.tongyun.git"}
              </span>
            </div>
          </div>

          <div className="text-[11px] text-[var(--color-text-muted)] pt-2 border-t border-[var(--color-border)] flex items-center justify-between">
            <span>© 2026 橦云 Tongyun. 保留所有权利。</span>
            <span className="text-[var(--color-accent)]">生产环境就绪</span>
          </div>
        </div>

        <div className="px-4 py-2.5 bg-[var(--color-surface-raised)] border-t border-[var(--color-border)] flex justify-end gap-2">
          <button
            type="button"
            onClick={onCheckUpdate}
            disabled={checkingUpdate || !onCheckUpdate}
            className="px-4 py-1.5 rounded-md text-xs font-medium border border-[var(--color-border)] text-[var(--color-text)] hover:bg-[var(--color-surface)] transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {checkingUpdate ? "正在检查更新…" : "检查更新"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-md text-xs font-medium bg-[var(--color-accent)] text-white hover:opacity-90 transition-opacity cursor-pointer"
          >
            确定
          </button>
        </div>
      </div>
    </div>
  );
}
