import { useState } from "react";
import { createTag, pushTag, type TagItem } from "../../lib/host";
import { CloseIcon, TagIcon } from "../../components/icons";
import { useEscapeKey } from "../../hooks/useEscapeKey";

interface CreateTagModalProps {
  isOpen: boolean;
  onClose: () => void;
  rootPath: string;
  targetOid?: string | null;
  onTagCreated?: (tag: TagItem) => void;
  onSuccess?: () => void;
}

export function CreateTagModal(props: CreateTagModalProps) {
  useEscapeKey(props.onClose, props.isOpen);
  if (!props.isOpen) return null;
  return <CreateTagModalContent {...props} />;
}

function CreateTagModalContent({
  onClose,
  rootPath,
  targetOid,
  onTagCreated,
  onSuccess,
}: CreateTagModalProps) {
  const [tagName, setTagName] = useState("");
  const [message, setMessage] = useState("");
  const [shouldPush, setShouldPush] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = tagName.trim();
    if (!trimmed) {
      setError("标签名称不能为空");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const created = await createTag(
        rootPath,
        trimmed,
        targetOid || null,
        message.trim() ? message.trim() : null
      );

      if (shouldPush) {
        await pushTag(rootPath, trimmed);
      }

      onTagCreated?.(created);
      onSuccess?.();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 select-none">
      <div className="w-full max-w-md rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-2xl overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)] bg-[var(--color-surface-raised)]">
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-md bg-[var(--color-accent)]/15 text-[var(--color-accent)]">
              <TagIcon width={16} height={16} />
            </span>
            <h2 className="text-sm font-semibold text-[var(--color-text)]">
              新建标签 (Create Tag)
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

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {error && (
            <div className="p-2.5 rounded-lg border border-[var(--color-danger)]/30 bg-[var(--color-danger)]/10 text-[var(--color-danger)] text-xs">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-[var(--color-text)] mb-1">
              标签名称 <span className="text-[var(--color-danger)]">*</span>
            </label>
            <input
              type="text"
              autoFocus
              placeholder="如 v1.0.0 或 release-202610"
              value={tagName}
              onChange={(e) => setTagName(e.target.value)}
              className="w-full px-3 py-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] text-xs text-[var(--color-text)] focus:outline-hidden focus:border-[var(--color-accent)]"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[var(--color-text)] mb-1">
              目标提交 (Target Commit)
            </label>
            <div className="px-3 py-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-raised)] text-xs font-mono text-[var(--color-text-muted)]">
              {targetOid ? targetOid.slice(0, 8) : "当前 HEAD"}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-[var(--color-text)] mb-1">
              标签附注信息 (可选，留空则为轻量标签)
            </label>
            <textarea
              rows={3}
              placeholder="填写附注说明将创建为附注标签 (Annotated Tag)..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="w-full px-3 py-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] text-xs text-[var(--color-text)] focus:outline-hidden focus:border-[var(--color-accent)] resize-none"
            />
          </div>

          <div className="flex items-center gap-2 pt-1">
            <input
              id="shouldPushTag"
              type="checkbox"
              checked={shouldPush}
              onChange={(e) => setShouldPush(e.target.checked)}
              className="rounded border-[var(--color-border)] text-[var(--color-accent)] focus:ring-0 cursor-pointer"
            />
            <label
              htmlFor="shouldPushTag"
              className="text-xs text-[var(--color-text)] cursor-pointer select-none"
            >
              创建后同时推送到远程仓库 (`git push origin &lt;tag&gt;`)
            </label>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--color-border)]">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-3 py-1.5 rounded-lg border border-[var(--color-border)] text-xs font-medium text-[var(--color-text)] hover:bg-[var(--color-surface-raised)] cursor-pointer transition-colors"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={loading || !tagName.trim()}
              className="px-4 py-1.5 rounded-lg bg-[var(--color-accent)] text-white text-xs font-medium hover:opacity-90 disabled:opacity-50 cursor-pointer transition-opacity"
            >
              {loading ? "创建中..." : "创建标签"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
