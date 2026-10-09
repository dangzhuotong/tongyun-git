import { useEffect, useRef } from "react";
import type { DiscardCandidate } from "../../lib/host";
import { AlertCircleIcon, CloseIcon } from "../../components/icons";
import { useEscapeKey } from "../../hooks/useEscapeKey";

interface DiscardConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  candidates: DiscardCandidate[];
  loading: boolean;
}

export function DiscardConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  candidates,
  loading,
}: DiscardConfirmModalProps) {
  const cancelBtnRef = useRef<HTMLButtonElement>(null);

  useEscapeKey(onClose, isOpen);

  // Focus Cancel button by default on open (R-17 rule)
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        cancelBtnRef.current?.focus();
      }, 50);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const toRestore = candidates.filter((c) => !c.will_delete);
  const toDelete = candidates.filter((c) => c.will_delete);
  const hasUnrestorable = candidates.some((c) => c.unrestorable);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 select-none"
      onKeyDown={handleKeyDown}
    >
      <div className="w-full max-w-md rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] shadow-xl overflow-hidden flex flex-col text-xs text-[var(--color-text)]">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)] bg-[var(--color-surface-raised)]">
          <div className="flex items-center gap-2 font-semibold text-sm text-[var(--color-danger)]">
            <AlertCircleIcon width={16} height={16} />
            <span>丢弃改动确认</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
          >
            <CloseIcon width={14} height={14} />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-4 space-y-4">
          <p className="text-xs text-[var(--color-text)] leading-relaxed">
            确定要丢弃所选文件的全部改动吗？
            <span className="font-semibold text-[var(--color-danger)] ml-1">
              已暂存和未暂存的部分都会被丢弃。
            </span>
          </p>

          {/* Files to Restore */}
          {toRestore.length > 0 && (
            <div className="space-y-1">
              <span className="text-[11px] font-semibold text-[var(--color-text-muted)] uppercase">
                将恢复至 HEAD ({toRestore.length})
              </span>
              <div className="max-h-28 overflow-y-auto rounded border border-[var(--color-border)] bg-[var(--color-bg)] p-2 font-mono text-[11px] space-y-1">
                {toRestore.map((c) => (
                  <div key={c.path} className="flex justify-between items-center text-[var(--color-text)]">
                    <span className="truncate">{c.path}</span>
                    {c.unrestorable && (
                      <span className="text-[10px] text-[var(--color-danger)] shrink-0 font-sans ml-2">
                        超限无法快照
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Files to Delete */}
          {toDelete.length > 0 && (
            <div className="space-y-1">
              <span className="text-[11px] font-semibold text-[var(--color-danger)] uppercase">
                将直接删除 ({toDelete.length})
              </span>
              <div className="max-h-28 overflow-y-auto rounded border border-[var(--color-border)] bg-[var(--color-bg)] p-2 font-mono text-[11px] space-y-1">
                {toDelete.map((c) => (
                  <div key={c.path} className="flex justify-between items-center text-[var(--color-danger)]">
                    <span className="truncate">{c.path}</span>
                    {c.unrestorable && (
                      <span className="text-[10px] text-[var(--color-danger)] shrink-0 font-sans ml-2">
                        丢弃后无法恢复
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {hasUnrestorable && (
            <div className="p-2.5 rounded bg-[var(--color-danger)]/10 border border-[var(--color-danger)]/30 text-[11px] text-[var(--color-danger)]">
              提示：部分文件超过快照上限（单文件 &gt; 50MB 或总计 &gt; 200MB），丢弃后将无法通过撤销恢复！
            </div>
          )}

          <p className="text-[11px] text-[var(--color-text-muted)]">
            丢弃前应用会自动创建临时快照，丢弃后 10 秒内可随时撤销。
          </p>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-[var(--color-border)] bg-[var(--color-surface-raised)]">
          <button
            ref={cancelBtnRef}
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded border border-[var(--color-border)] bg-[var(--color-surface)] hover:bg-[var(--color-border)] font-medium text-xs text-[var(--color-text)]"
          >
            取消 (Esc)
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={onConfirm}
            className="px-3.5 py-1.5 rounded border border-[var(--color-danger)] text-[var(--color-danger)] hover:bg-[var(--color-danger)]/10 font-semibold text-xs transition-colors"
          >
            {loading ? "正在丢弃..." : `丢弃 ${candidates.length} 个文件的改动`}
          </button>
        </div>
      </div>
    </div>
  );
}
