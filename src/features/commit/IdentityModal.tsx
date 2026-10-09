import { useState } from "react";
import { AlertCircleIcon, CloseIcon, CheckIcon } from "../../components/icons";
import { setCommitIdentity } from "../../lib/host";
import { useEscapeKey } from "../../hooks/useEscapeKey";

interface IdentityModalProps {
  isOpen: boolean;
  onClose: () => void;
  rootPath?: string;
  onConfigured?: () => void;
}

export function IdentityModal({
  isOpen,
  onClose,
  rootPath = "",
  onConfigured,
}: IdentityModalProps) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [isGlobal, setIsGlobal] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEscapeKey(onClose, isOpen);

  if (!isOpen) return null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim()) {
      setError("姓名和邮箱均不能为空");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await setCommitIdentity(rootPath, name.trim(), email.trim(), isGlobal);
      if (onConfigured) {
        onConfigured();
      } else {
        onClose();
      }
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
            <AlertCircleIcon width={16} height={16} />
            <span>未配置 Git 提交者身份</span>
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
        <form onSubmit={handleSave} className="p-4 space-y-4">
          <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">
            Git 要求在提交时记录作者姓名与邮箱，以便溯源修改记录。您可在此直接配置，或在终端中运行配置命令：
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
                姓名 / 用户名 (user.name)
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="例如: 张三 或 zhangsan"
                className="w-full px-2.5 py-1.5 rounded border border-[var(--color-border)] bg-[var(--color-bg)] text-xs text-[var(--color-text)] focus:outline-hidden focus:border-[var(--color-accent)]"
                autoFocus
              />
            </div>

            <div>
              <label className="block text-[11px] font-medium text-[var(--color-text-muted)] mb-1">
                邮箱 (user.email)
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="例如: your@example.com"
                className="w-full px-2.5 py-1.5 rounded border border-[var(--color-border)] bg-[var(--color-bg)] text-xs text-[var(--color-text)] focus:outline-hidden focus:border-[var(--color-accent)]"
              />
            </div>

            <div className="pt-1 flex items-center gap-4 text-[11px]">
              <label className="flex items-center gap-1.5 cursor-pointer text-[var(--color-text)]">
                <input
                  type="radio"
                  name="scope"
                  checked={isGlobal}
                  onChange={() => setIsGlobal(true)}
                  className="accent-[var(--color-accent)]"
                />
                <span>全局配置 (--global，推荐)</span>
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer text-[var(--color-text-muted)] hover:text-[var(--color-text)]">
                <input
                  type="radio"
                  name="scope"
                  checked={!isGlobal}
                  onChange={() => setIsGlobal(false)}
                  className="accent-[var(--color-accent)]"
                />
                <span>仅当前仓库</span>
              </label>
            </div>
          </div>

          {/* Terminal command reference */}
          <div className="pt-2 border-t border-[var(--color-border)]/60">
            <div className="p-2.5 rounded bg-[var(--color-bg)] border border-[var(--color-border)] font-mono text-[11px] space-y-1 select-text">
              <div className="text-[var(--color-text-muted)]"># 或在终端中手动执行：</div>
              <div className="text-[var(--color-accent)]">git config --global user.name &quot;Your Name&quot;</div>
              <div className="text-[var(--color-accent)]">git config --global user.email &quot;your@example.com&quot;</div>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--color-border)]">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="px-3 py-1.5 rounded border border-[var(--color-border)] text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-hover)] cursor-pointer"
            >
              稍后配置
            </button>
            <button
              type="submit"
              disabled={saving || !name.trim() || !email.trim()}
              className="px-3.5 py-1.5 rounded bg-[var(--color-accent)] text-white text-xs font-medium cursor-pointer shadow-xs hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
            >
              {saving ? (
                <span>保存中...</span>
              ) : (
                <>
                  <CheckIcon width={12} height={12} />
                  <span>保存并继续提交</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
