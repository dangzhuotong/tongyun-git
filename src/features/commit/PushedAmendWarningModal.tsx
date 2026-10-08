import { useEffect, useRef } from "react";
import { AlertCircleIcon, CloseIcon } from "../../components/icons";

interface PushedAmendWarningModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  remoteBranches: string[];
}

export function PushedAmendWarningModal({
  isOpen,
  onClose,
  onConfirm,
  remoteBranches,
}: PushedAmendWarningModalProps) {
  const cancelBtnRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      // PRD R-06: 默认焦点在「取消」，回车不直接确认
      setTimeout(() => {
        cancelBtnRef.current?.focus();
      }, 50);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 select-none">
      <div className="w-full max-w-md rounded-lg border border-[var(--color-danger)]/50 bg-[var(--color-surface)] shadow-lg overflow-hidden flex flex-col text-xs text-[var(--color-text)]">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)] bg-[var(--color-danger)]/10">
          <div className="flex items-center gap-2 font-semibold text-sm text-[var(--color-danger)]">
            <AlertCircleIcon width={16} height={16} />
            <span>修改已推送提交警告</span>
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
          <p className="text-xs leading-relaxed text-[var(--color-text)]">
            当前 HEAD 提交已推送到以下远程分支：
          </p>

          <div className="p-2 rounded bg-[var(--color-bg)] border border-[var(--color-border)] max-h-32 overflow-y-auto font-mono text-[11px] text-[var(--color-danger)] space-y-0.5">
            {remoteBranches.map((branch) => (
              <div key={branch}>• {branch}</div>
            ))}
          </div>

          <div className="p-2.5 rounded border border-[var(--color-danger)]/30 bg-[var(--color-danger)]/10 text-[var(--color-text)] text-[11px] space-y-1">
            <p className="font-semibold text-[var(--color-danger)]">注意风险：</p>
            <p>
              修改该提交后，本地历史将与远程历史产生分叉，后续普通推送将被远程拒绝。
            </p>
            <p className="text-[var(--color-text-muted)]">
              本应用遵循安全原则，不提供强制推送（<code>git push --force</code>）入口，后续需要您在命令行自行处理。
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-[var(--color-border)] bg-[var(--color-bg)]/50">
          <button
            ref={cancelBtnRef}
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded border border-[var(--color-border)] bg-[var(--color-surface)] hover:bg-[var(--color-border)] text-xs font-semibold cursor-pointer focus:ring-2 focus:ring-[var(--color-accent)]"
          >
            取消
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="px-3 py-1.5 rounded bg-[var(--color-danger)] hover:opacity-90 text-white text-xs font-medium cursor-pointer shadow-xs"
          >
            仍然修改提交
          </button>
        </div>
      </div>
    </div>
  );
}
