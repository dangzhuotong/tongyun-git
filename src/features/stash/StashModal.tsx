import { useState, useEffect, useCallback } from "react";
import {
  ArchiveIcon,
  CloseIcon,
  AlertCircleIcon,
  CheckIcon,
  RefreshIcon,
} from "../../components/icons";
import {
  listStashes,
  applyStash,
  dropStash,
  clearStashes,
  showStashDiff,
  type StashItem,
} from "../../lib/host";
import { useEscapeKey } from "../../hooks/useEscapeKey";

interface StashModalProps {
  isOpen: boolean;
  onClose: () => void;
  rootPath: string;
  onStashApplied: () => void;
}

export function StashModal(props: StashModalProps) {
  useEscapeKey(props.onClose, props.isOpen);
  if (!props.isOpen) return null;
  return <StashModalContent {...props} />;
}

function StashModalContent({
  onClose,
  rootPath,
  onStashApplied,
}: StashModalProps) {
  const [stashes, setStashes] = useState<StashItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedStashIndex, setSelectedStashIndex] = useState<number | null>(null);
  const [diffText, setDiffText] = useState<string>("");
  const [diffLoading, setDiffLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflictWarning, setConflictWarning] = useState<string | null>(null);
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);

  const refreshStashes = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await listStashes(rootPath);
      setStashes(list);
      if (list.length > 0) {
        setSelectedStashIndex((prev) => {
          if (prev !== null && list.some((s) => s.index === prev)) {
            return prev;
          }
          return list[0].index;
        });
      } else {
        setSelectedStashIndex(null);
      }
    } catch (err: unknown) {
      setError(typeof err === "string" ? err : String(err));
    } finally {
      setLoading(false);
    }
  }, [rootPath]);

  useEffect(() => {
    let canceled = false;
    listStashes(rootPath)
      .then((list) => {
        if (!canceled) {
          setStashes(list);
          if (list.length > 0) {
            setSelectedStashIndex(list[0].index);
          }
          setLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (!canceled) {
          setError(typeof err === "string" ? err : String(err));
          setLoading(false);
        }
      });
    return () => {
      canceled = true;
    };
  }, [rootPath]);

  // Load diff when selected stash changes
  useEffect(() => {
    if (selectedStashIndex === null) {
      return;
    }
    let canceled = false;
    showStashDiff(rootPath, selectedStashIndex)
      .then((diff) => {
        if (!canceled) {
          setDiffText(diff);
          setDiffLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (!canceled) {
          setDiffText(typeof err === "string" ? err : String(err));
          setDiffLoading(false);
        }
      });

    return () => {
      canceled = true;
    };
  }, [rootPath, selectedStashIndex]);

  const handleApply = async (pop: boolean) => {
    if (selectedStashIndex === null || actionLoading) return;
    setActionLoading(true);
    setError(null);
    setConflictWarning(null);

    try {
      const res = await applyStash(rootPath, selectedStashIndex, pop);
      if (res.has_conflict) {
        setConflictWarning(
          res.message || "恢复贮藏时产生冲突，已将冲突标记写入工作区，请手动解决"
        );
        onStashApplied();
        await refreshStashes();
      } else if (res.success) {
        onStashApplied();
        if (pop) {
          await refreshStashes();
        } else {
          onClose();
        }
      } else {
        setError(res.message || "恢复贮藏失败");
      }
    } catch (err: unknown) {
      setError(typeof err === "string" ? err : String(err));
    } finally {
      setActionLoading(false);
    }
  };

  const handleDrop = async () => {
    if (selectedStashIndex === null || actionLoading) return;
    setActionLoading(true);
    setError(null);
    try {
      await dropStash(rootPath, selectedStashIndex);
      await refreshStashes();
    } catch (err: unknown) {
      setError(typeof err === "string" ? err : String(err));
    } finally {
      setActionLoading(false);
    }
  };

  const handleClear = async () => {
    setActionLoading(true);
    setError(null);
    try {
      await clearStashes(rootPath);
      setConfirmClearOpen(false);
      await refreshStashes();
    } catch (err: unknown) {
      setError(typeof err === "string" ? err : String(err));
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 select-none">
      <div className="w-full max-w-3xl h-[600px] max-h-[90vh] rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] shadow-lg overflow-hidden flex flex-col text-xs text-[var(--color-text)] animate-in fade-in duration-150">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)] bg-[var(--color-bg)]/40">
          <div className="flex items-center gap-2 font-semibold text-sm text-[var(--color-accent)]">
            <ArchiveIcon width={16} height={16} />
            <span>贮藏记录管理 (Stashes)</span>
            <span className="text-xs font-normal text-[var(--color-text-muted)]">
              ({stashes.length})
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={refreshStashes}
              disabled={loading}
              className="p-1 rounded text-[var(--color-text-muted)] hover:text-[var(--color-text)] cursor-pointer"
              title="刷新"
            >
              <RefreshIcon width={14} height={14} className={loading ? "animate-spin" : ""} />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded text-[var(--color-text-muted)] hover:text-[var(--color-text)] cursor-pointer"
            >
              <CloseIcon width={14} height={14} />
            </button>
          </div>
        </div>

        {/* Conflict / Error Banner */}
        {conflictWarning && (
          <div className="px-4 py-2 bg-[var(--color-status-conflict)]/10 border-b border-[var(--color-status-conflict)]/30 text-[var(--color-status-conflict)] text-xs flex items-center gap-2">
            <AlertCircleIcon width={14} height={14} className="shrink-0" />
            <span>{conflictWarning}</span>
          </div>
        )}
        {error && (
          <div className="px-4 py-2 bg-[var(--color-error)]/10 border-b border-[var(--color-error)]/30 text-[var(--color-error)] text-xs flex items-center gap-2">
            <AlertCircleIcon width={14} height={14} className="shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Body Split */}
        <div className="flex-1 min-h-0 flex overflow-hidden">
          {/* Left: Stash list */}
          <div className="w-1/3 min-w-[240px] border-r border-[var(--color-border)] flex flex-col bg-[var(--color-bg)]/20">
            {loading ? (
              <div className="p-4 text-center text-[var(--color-text-muted)]">正在加载贮藏列表...</div>
            ) : stashes.length === 0 ? (
              <div className="p-6 text-center text-[var(--color-text-muted)] space-y-2">
                <ArchiveIcon width={24} height={24} className="mx-auto opacity-30" />
                <p>当前仓库没有任何贮藏记录</p>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto divide-y divide-[var(--color-border)]/40">
                {stashes.map((s) => {
                  const isSelected = selectedStashIndex === s.index;
                  return (
                    <button
                      key={s.name}
                      type="button"
                      onClick={() => {
                        setSelectedStashIndex(s.index);
                        setDiffLoading(true);
                      }}
                      className={`w-full text-left p-3 cursor-pointer transition-colors ${
                        isSelected
                          ? "bg-[var(--color-surface-hover)] border-l-2 border-[var(--color-accent)]"
                          : "hover:bg-[var(--color-surface-hover)]/50"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1 mb-1">
                        <span className="font-mono font-medium text-[11px] text-[var(--color-accent)]">
                          {s.name}
                        </span>
                        {s.date && (
                          <span className="text-[10px] text-[var(--color-text-muted)] truncate">
                            {s.date}
                          </span>
                        )}
                      </div>
                      {s.branch && (
                        <div className="inline-block px-1.5 py-0.5 rounded text-[10px] bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-text-muted)] mb-1">
                          {s.branch}
                        </div>
                      )}
                      <div className="text-xs text-[var(--color-text)] truncate font-normal">
                        {s.message || "无备注"}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Right: Diff Preview */}
          <div className="flex-1 flex flex-col overflow-hidden bg-[var(--color-bg)]">
            <div className="px-3 py-2 border-b border-[var(--color-border)] text-[11px] text-[var(--color-text-muted)] flex items-center justify-between">
              <span>改动内容预览 (Diff)</span>
              {selectedStashIndex !== null && (
                <span className="font-mono text-[var(--color-accent)]">
                  stash@&#123;{selectedStashIndex}&#125;
                </span>
              )}
            </div>

            <div className="flex-1 overflow-auto p-3 font-mono text-[11px] select-text">
              {diffLoading ? (
                <div className="text-[var(--color-text-muted)]">正在加载差异内容...</div>
              ) : diffText ? (
                <pre className="whitespace-pre leading-relaxed text-[var(--color-text)] font-mono">
                  {diffText}
                </pre>
              ) : (
                <div className="text-[var(--color-text-muted)] text-center py-10">
                  {selectedStashIndex === null ? "请选择左侧贮藏项" : "该贮藏项无改动或空差异"}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer actions */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-[var(--color-border)] bg-[var(--color-bg)]/40">
          <div>
            {stashes.length > 0 && (
              <button
                type="button"
                onClick={() => setConfirmClearOpen(true)}
                disabled={actionLoading}
                className="px-2.5 py-1.5 rounded border border-[var(--color-error)]/30 text-[var(--color-error)] hover:bg-[var(--color-error)]/10 text-xs cursor-pointer transition-colors"
              >
                清空全部贮藏
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded border border-[var(--color-border)] text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-hover)] cursor-pointer"
            >
              关闭
            </button>
            <button
              type="button"
              onClick={handleDrop}
              disabled={selectedStashIndex === null || actionLoading}
              className="px-3 py-1.5 rounded border border-[var(--color-border)] text-xs text-[var(--color-text)] hover:bg-[var(--color-surface-hover)] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              删除 (Drop)
            </button>
            <button
              type="button"
              onClick={() => handleApply(false)}
              disabled={selectedStashIndex === null || actionLoading}
              className="px-3 py-1.5 rounded border border-[var(--color-accent)] text-[var(--color-accent)] hover:bg-[var(--color-accent)]/10 text-xs font-medium disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              title="恢复到工作区，保留该贮藏记录"
            >
              应用 (Apply)
            </button>
            <button
              type="button"
              onClick={() => handleApply(true)}
              disabled={selectedStashIndex === null || actionLoading}
              className="px-3.5 py-1.5 rounded bg-[var(--color-accent)] text-white text-xs font-medium cursor-pointer shadow-xs hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
              title="恢复到工作区，并从列表中移除该贮藏记录"
            >
              <CheckIcon width={12} height={12} />
              <span>弹出 (Pop)</span>
            </button>
          </div>
        </div>

        {/* Clear Confirmation Submodal */}
        {confirmClearOpen && (
          <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/60 p-4 select-none">
            <div className="w-full max-w-sm rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] shadow-xl p-4 space-y-4">
              <div className="flex items-center gap-2 font-semibold text-sm text-[var(--color-error)]">
                <AlertCircleIcon width={16} height={16} />
                <span>确认清空所有贮藏？</span>
              </div>
              <p className="text-xs text-[var(--color-text)] leading-relaxed">
                此操作将永久删除全部 {stashes.length} 条贮藏记录，无法撤销。是否继续？
              </p>
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--color-border)]">
                <button
                  type="button"
                  onClick={() => setConfirmClearOpen(false)}
                  disabled={actionLoading}
                  className="px-3 py-1.5 rounded border border-[var(--color-border)] text-xs text-[var(--color-text)] hover:bg-[var(--color-surface-hover)] cursor-pointer"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={handleClear}
                  disabled={actionLoading}
                  className="px-3 py-1.5 rounded bg-[var(--color-error)] text-white text-xs font-medium cursor-pointer shadow-xs hover:opacity-90"
                >
                  {actionLoading ? "清空中..." : "确认清空"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
