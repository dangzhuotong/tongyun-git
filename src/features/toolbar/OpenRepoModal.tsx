import { useState, type FormEvent } from "react";
import { FolderIcon, AlertCircleIcon, CloseIcon } from "../../components/icons";

interface OpenRepoModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenRepo: (path: string) => Promise<void>;
  recentRepos: string[];
  onRemoveRecent: (path: string) => void;
  error: string | null;
  loading: boolean;
}

export function OpenRepoModal({
  isOpen,
  onClose,
  onOpenRepo,
  recentRepos,
  onRemoveRecent,
  error,
  loading,
}: OpenRepoModalProps) {
  const [inputPath, setInputPath] = useState("");

  if (!isOpen) return null;

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!inputPath.trim()) return;
    onOpenRepo(inputPath.trim());
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] shadow-lg overflow-hidden flex flex-col text-xs text-[var(--color-text)]">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)]">
          <div className="flex items-center gap-2 font-semibold text-sm">
            <FolderIcon width={16} height={16} className="text-[var(--color-accent)]" />
            <span>打开 Git 仓库</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
          >
            <CloseIcon width={14} height={14} />
          </button>
        </div>

        {/* Form Body */}
        <div className="p-4 space-y-4">
          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">
                本地目录路径:
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="例如: D:/TD/projects/my-repo"
                  value={inputPath}
                  onChange={(e) => setInputPath(e.target.value)}
                  className="flex-1 px-3 py-1.5 rounded border border-[var(--color-border)] bg-[var(--color-bg)] font-mono text-xs focus:outline-none focus:border-[var(--color-accent)]"
                  autoFocus
                />
                <button
                  type="submit"
                  disabled={loading || !inputPath.trim()}
                  className="px-4 py-1.5 rounded bg-[var(--color-accent)] text-white font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
                >
                  {loading ? "打开中..." : "打开"}
                </button>
              </div>
            </div>

            {error && (
              <div className="p-2.5 rounded border border-[var(--color-danger)]/30 bg-[var(--color-danger)]/10 text-[var(--color-danger)] flex items-center gap-2">
                <AlertCircleIcon width={14} height={14} className="shrink-0" />
                <span>{error}</span>
              </div>
            )}
          </form>

          {/* Recent Repositories */}
          {recentRepos.length > 0 && (
            <div className="space-y-2 pt-2 border-t border-[var(--color-border)]">
              <span className="text-xs font-semibold text-[var(--color-text-muted)]">
                最近打开的仓库 ({recentRepos.length})
              </span>
              <div className="max-h-48 overflow-y-auto divide-y divide-[var(--color-border)]/40 rounded border border-[var(--color-border)] bg-[var(--color-bg)]">
                {recentRepos.map((path) => (
                  <div
                    key={path}
                    className="flex items-center justify-between px-3 py-2 hover:bg-[var(--color-surface-raised)] transition-colors group cursor-pointer"
                    onClick={() => onOpenRepo(path)}
                  >
                    <span className="truncate font-mono text-[11px] text-[var(--color-text)]">
                      {path}
                    </span>
                    <button
                      type="button"
                      title="从最近列表中移除"
                      onClick={(e) => {
                        e.stopPropagation();
                        onRemoveRecent(path);
                      }}
                      className="p-1 opacity-0 group-hover:opacity-100 text-[var(--color-text-muted)] hover:text-[var(--color-danger)] transition-opacity"
                    >
                      <CloseIcon width={12} height={12} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
