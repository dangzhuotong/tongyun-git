import { AlertCircleIcon, CloseIcon } from "../../components/icons";

interface IdentityModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function IdentityModal({ isOpen, onClose }: IdentityModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 select-none">
      <div className="w-full max-w-md rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] shadow-lg overflow-hidden flex flex-col text-xs text-[var(--color-text)]">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)]">
          <div className="flex items-center gap-2 font-semibold text-sm text-[var(--color-accent)]">
            <AlertCircleIcon width={16} height={16} />
            <span>未配置 Git 提交者身份</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
          >
            <CloseIcon width={14} height={14} />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-3">
          <p className="text-xs text-[var(--color-text)] leading-relaxed">
            Git 要求在提交时记录作者姓名和邮箱。请在终端中运行以下命令进行配置：
          </p>

          <div className="p-3 rounded bg-[var(--color-bg)] border border-[var(--color-border)] font-mono text-[11px] space-y-2 select-text">
            <div>
              <span className="text-[var(--color-text-muted)]"># 配置您的全局用户名</span>
              <div className="text-[var(--color-accent)] mt-0.5">git config --global user.name &quot;Your Name&quot;</div>
            </div>
            <div>
              <span className="text-[var(--color-text-muted)]"># 配置您的全局邮箱</span>
              <div className="text-[var(--color-accent)] mt-0.5">git config --global user.email &quot;your@example.com&quot;</div>
            </div>
          </div>

          <p className="text-[11px] text-[var(--color-text-muted)]">
            本应用遵循非侵入原则，不会擅自修改您的全局 Git 配置文件。配置完成后即可正常提交。
          </p>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end px-4 py-3 border-t border-[var(--color-border)] bg-[var(--color-bg)]/50">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded bg-[var(--color-accent)] text-white text-xs font-medium cursor-pointer shadow-xs"
          >
            我知道了
          </button>
        </div>
      </div>
    </div>
  );
}
