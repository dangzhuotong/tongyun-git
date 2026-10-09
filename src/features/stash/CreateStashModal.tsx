import { useState, type FormEvent } from "react";
import { ArchiveIcon, CloseIcon, AlertCircleIcon, CheckIcon } from "../../components/icons";
import { createStash } from "../../lib/host";
import { useEscapeKey } from "../../hooks/useEscapeKey";

interface CreateStashModalProps {
  isOpen: boolean;
  onClose: () => void;
  rootPath: string;
  onSuccess: () => void;
}

export function CreateStashModal({
  isOpen,
  onClose,
  rootPath,
  onSuccess,
}: CreateStashModalProps) {
  const [message, setMessage] = useState("");
  const [includeUntracked, setIncludeUntracked] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEscapeKey(onClose, isOpen);

  if (!isOpen) return null;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    try {
      await createStash(rootPath, message.trim() || null, includeUntracked);
      setMessage("");
      setIncludeUntracked(false);
      onSuccess();
      onClose();
    } catch (err: unknown) {
      setError(typeof err === "string" ? err : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 select-none">
      <div className="w-full max-w-md rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] shadow-lg overflow-hidden flex flex-col text-xs text-[var(--color-text)] animate-in fade-in duration-150">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)] bg-[var(--color-bg)]/40">
          <div className="flex items-center gap-2 font-semibold text-sm text-[var(--color-accent)]">
            <ArchiveIcon width={16} height={16} />
            <span>贮藏工作区改动 (Stash)</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded text-[var(--color-text-muted)] hover:text-[var(--color-text)] cursor-pointer"
          >
            <CloseIcon width={14} height={14} />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">
            将当前未提交的改动保存到贮藏栈中，重置工作区以便切换分支或拉取代码。
          </p>

          {error && (
            <div className="p-2.5 rounded bg-[var(--color-error)]/10 border border-[var(--color-error)]/30 text-[var(--color-error)] text-xs flex items-center gap-2">
              <AlertCircleIcon width={14} height={14} className="shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="space-y-3">
            <div>
              <label className="block text-[11px] font-medium text-[var(--color-text-muted)] mb-1">
                贮藏备注说明 (可选)
              </label>
              <input
                type="text"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="例如: 临时保存尚未写完的功能"
                className="w-full px-2.5 py-1.5 rounded border border-[var(--color-border)] bg-[var(--color-bg)] text-xs text-[var(--color-text)] focus:outline-hidden focus:border-[var(--color-accent)]"
                autoFocus
              />
            </div>

            <label className="flex items-center gap-2 cursor-pointer text-xs text-[var(--color-text)] select-none">
              <input
                type="checkbox"
                checked={includeUntracked}
                onChange={(e) => setIncludeUntracked(e.target.checked)}
                className="rounded accent-[var(--color-accent)] cursor-pointer"
              />
              <span>包含未跟踪的新建文件 (-u, --include-untracked)</span>
            </label>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--color-border)]">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="px-3 py-1.5 rounded border border-[var(--color-border)] text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-hover)] cursor-pointer"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-3.5 py-1.5 rounded bg-[var(--color-accent)] text-white text-xs font-medium cursor-pointer shadow-xs hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
            >
              {saving ? (
                <span>正在贮藏...</span>
              ) : (
                <>
                  <CheckIcon width={12} height={12} />
                  <span>贮藏改动</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
