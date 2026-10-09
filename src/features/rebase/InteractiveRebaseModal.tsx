import { useState, useEffect, useCallback } from "react";
import {
  getRebaseCommits,
  executeInteractiveRebase,
  type RebaseItem,
  type RebaseAction,
} from "../../lib/host";
import {
  CloseIcon,
  CheckIcon,
  AlertCircleIcon,
  ArrowUpIcon,
  ArrowDownIcon,
  BranchIcon,
} from "../../components/icons";
import { useEscapeKey } from "../../hooks/useEscapeKey";

export interface InteractiveRebaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  rootPath: string;
  baseOid: string;
  baseSummary?: string;
  onRebaseSuccess?: () => void;
}

export function InteractiveRebaseModal(props: InteractiveRebaseModalProps) {
  useEscapeKey(props.onClose, props.isOpen);
  if (!props.isOpen) return null;
  return <InteractiveRebaseModalContent {...props} />;
}

const ACTION_OPTIONS: { value: RebaseAction; label: string; desc: string; badgeClass: string }[] = [
  {
    value: "pick",
    label: "Pick (保留)",
    desc: "正常保留此提交",
    badgeClass: "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30",
  },
  {
    value: "reword",
    label: "Reword (修改信息)",
    desc: "保留此提交但修改提交说明",
    badgeClass: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
  },
  {
    value: "squash",
    label: "Squash (压缩合并)",
    desc: "合并进上一个提交并保留/合并说明",
    badgeClass: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30",
  },
  {
    value: "fixup",
    label: "Fixup (丢弃说明合并)",
    desc: "合并进上一个提交并丢弃本次说明",
    badgeClass: "bg-purple-500/15 text-purple-600 dark:text-purple-400 border-purple-500/30",
  },
  {
    value: "drop",
    label: "Drop (丢弃)",
    desc: "彻底删除该提交",
    badgeClass: "bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30",
  },
];

function InteractiveRebaseModalContent({
  onClose,
  rootPath,
  baseOid,
  baseSummary,
  onRebaseSuccess,
}: InteractiveRebaseModalProps) {
  const [items, setItems] = useState<RebaseItem[]>([]);
  const [originalItems, setOriginalItems] = useState<RebaseItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [executing, setExecuting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);

  useEffect(() => {
    let canceled = false;
    getRebaseCommits(rootPath, baseOid)
      .then((data) => {
        if (!canceled) {
          setItems(data);
          setOriginalItems(data);
          setLoading(false);
          if (data.length > 0) {
            setSelectedIdx(0);
          }
        }
      })
      .catch((err: unknown) => {
        if (!canceled) {
          setError(err instanceof Error ? err.message : String(err));
          setLoading(false);
        }
      });
    return () => {
      canceled = true;
    };
  }, [rootPath, baseOid]);

  const handleMoveUp = useCallback((index: number) => {
    if (index <= 0) return;
    setItems((prev) => {
      const next = [...prev];
      const temp = next[index - 1];
      next[index - 1] = next[index];
      next[index] = temp;
      return next;
    });
    setSelectedIdx(index - 1);
  }, []);

  const handleMoveDown = useCallback((index: number) => {
    setItems((prev) => {
      if (index >= prev.length - 1) return prev;
      const next = [...prev];
      const temp = next[index + 1];
      next[index + 1] = next[index];
      next[index] = temp;
      return next;
    });
    setSelectedIdx(index + 1);
  }, []);

  const handleActionChange = (index: number, action: RebaseAction) => {
    setItems((prev) => {
      const next = [...prev];
      const current = next[index];
      next[index] = {
        ...current,
        action,
        new_message:
          action === "reword" || action === "squash"
            ? current.new_message ?? current.summary
            : null,
      };
      return next;
    });
  };

  const handleMessageChange = (index: number, msg: string) => {
    setItems((prev) => {
      const next = [...prev];
      next[index] = {
        ...next[index],
        new_message: msg,
      };
      return next;
    });
  };

  const handleReset = () => {
    setItems(originalItems);
    setError(null);
  };

  const handleAllPick = () => {
    setItems((prev) =>
      prev.map((item) => ({
        ...item,
        action: "pick",
        new_message: null,
      }))
    );
  };

  // Validation
  const firstActiveItem = items.find((i) => i.action !== "drop");
  const isInvalidFirst =
    firstActiveItem &&
    (firstActiveItem.action === "squash" || firstActiveItem.action === "fixup");

  const handleStartRebase = async () => {
    if (items.length === 0 || isInvalidFirst) return;
    setExecuting(true);
    setError(null);
    try {
      const res = await executeInteractiveRebase(rootPath, {
        base_oid: baseOid,
        items,
      });

      if (res.success) {
        onRebaseSuccess?.();
        onClose();
      } else if (res.has_conflict) {
        onRebaseSuccess?.();
        onClose();
      } else {
        setError(res.message || "变基操作执行失败");
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setExecuting(false);
    }
  };

  const shortBaseOid = baseOid.slice(0, 7);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 select-none">
      <div className="w-full max-w-4xl max-h-[90vh] rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-[var(--color-border)] bg-[var(--color-surface-raised)] shrink-0">
          <div className="flex items-center gap-3">
            <span className="p-2 rounded-lg bg-[var(--color-accent)]/15 text-[var(--color-accent)]">
              <BranchIcon width={18} height={18} />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold text-[var(--color-text)]">
                  交互式变基 (Interactive Rebase)
                </h2>
                <span className="px-2 py-0.5 rounded text-[11px] font-mono font-medium bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-text-muted)]">
                  基底: {shortBaseOid}
                </span>
              </div>
              <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5">
                基于 {shortBaseOid} {baseSummary ? `(${baseSummary})` : ""} 重整历史提交 · 上方较旧，下方较新
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-md text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface)] transition-colors cursor-pointer"
            title="关闭窗口 (Esc)"
          >
            <CloseIcon width={16} height={16} />
          </button>
        </div>

        {/* Toolbar */}
        <div className="px-5 py-2 border-b border-[var(--color-border)] bg-[var(--color-surface)] flex items-center justify-between text-xs shrink-0">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={selectedIdx === null || selectedIdx <= 0 || executing}
              onClick={() => selectedIdx !== null && handleMoveUp(selectedIdx)}
              className="px-2.5 py-1 rounded border border-[var(--color-border)] bg-[var(--color-surface-raised)] hover:bg-[var(--color-bg)] disabled:opacity-40 text-[var(--color-text)] transition-colors cursor-pointer flex items-center gap-1"
              title="向上移动所选提交 (向前调整顺序)"
            >
              <ArrowUpIcon width={12} height={12} />
              <span>上移</span>
            </button>
            <button
              type="button"
              disabled={selectedIdx === null || selectedIdx >= items.length - 1 || executing}
              onClick={() => selectedIdx !== null && handleMoveDown(selectedIdx)}
              className="px-2.5 py-1 rounded border border-[var(--color-border)] bg-[var(--color-surface-raised)] hover:bg-[var(--color-bg)] disabled:opacity-40 text-[var(--color-text)] transition-colors cursor-pointer flex items-center gap-1"
              title="向下移动所选提交 (向后调整顺序)"
            >
              <ArrowDownIcon width={12} height={12} />
              <span>下移</span>
            </button>
            <div className="h-4 w-px bg-[var(--color-border)] mx-1" />
            <button
              type="button"
              disabled={executing}
              onClick={handleAllPick}
              className="px-2.5 py-1 rounded border border-[var(--color-border)] bg-[var(--color-surface-raised)] hover:bg-[var(--color-bg)] text-[var(--color-text)] transition-colors cursor-pointer"
            >
              全部设为 Pick
            </button>
            <button
              type="button"
              disabled={executing}
              onClick={handleReset}
              className="px-2.5 py-1 rounded border border-[var(--color-border)] bg-[var(--color-surface-raised)] hover:bg-[var(--color-bg)] text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors cursor-pointer"
            >
              重置顺序
            </button>
          </div>

          <span className="text-[11px] text-[var(--color-text-muted)] font-mono">
            共 {items.length} 个提交
          </span>
        </div>

        {/* Warning & Error Alerts */}
        {isInvalidFirst && (
          <div className="px-5 py-2 bg-rose-500/10 border-b border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs flex items-center gap-2 shrink-0">
            <AlertCircleIcon width={14} height={14} className="shrink-0" />
            <span>首个保留的提交不能为 Squash 或 Fixup，请将其设为 Pick 或 Reword。</span>
          </div>
        )}
        {error && (
          <div className="px-5 py-2 bg-[var(--color-danger)]/10 border-b border-[var(--color-danger)]/20 text-[var(--color-danger)] text-xs flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              <AlertCircleIcon width={14} height={14} className="shrink-0" />
              <span>{error}</span>
            </div>
            <button
              type="button"
              onClick={() => setError(null)}
              className="text-[var(--color-danger)] hover:opacity-80 cursor-pointer"
            >
              <CloseIcon width={14} height={14} />
            </button>
          </div>
        )}

        {/* Commit Items Table */}
        <div className="flex-1 overflow-y-auto divide-y divide-[var(--color-border)]/60 text-xs font-mono">
          {loading ? (
            <div className="p-8 text-center text-[var(--color-text-muted)] text-xs font-sans">
              正在加载待变基提交序列...
            </div>
          ) : items.length === 0 ? (
            <div className="p-8 text-center text-[var(--color-text-muted)] text-xs font-sans">
              当前分支与基底之间没有需要变基的提交。
            </div>
          ) : (
            items.map((item, index) => {
              const isSelected = selectedIdx === index;
              const isDrop = item.action === "drop";
              const currentAction =
                ACTION_OPTIONS.find((a) => a.value === item.action) || ACTION_OPTIONS[0];

              return (
                <div
                  key={item.oid}
                  onClick={() => setSelectedIdx(index)}
                  className={`px-5 py-2.5 flex flex-col gap-1.5 cursor-pointer transition-colors ${
                    isSelected
                      ? "bg-[var(--color-selection)]/40 border-l-2 border-[var(--color-accent)] pl-[18px]"
                      : "hover:bg-[var(--color-surface-raised)]"
                  } ${isDrop ? "opacity-50" : ""}`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      {/* Index */}
                      <span className="text-[11px] text-[var(--color-text-muted)] w-5 text-right font-mono">
                        {index + 1}.
                      </span>

                      {/* Action Dropdown */}
                      <select
                        value={item.action}
                        disabled={executing}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) =>
                          handleActionChange(index, e.target.value as RebaseAction)
                        }
                        className={`px-2 py-0.5 rounded border text-[11px] font-medium font-sans cursor-pointer focus:outline-hidden ${currentAction.badgeClass}`}
                      >
                        {ACTION_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>

                      {/* Commit OID */}
                      <span className="px-1.5 py-0.5 rounded bg-[var(--color-bg)] border border-[var(--color-border)] text-[11px] text-[var(--color-accent)] font-semibold shrink-0">
                        {item.short_oid}
                      </span>

                      {/* Commit Summary */}
                      <span
                        className={`truncate text-xs font-sans font-medium text-[var(--color-text)] ${
                          isDrop ? "line-through text-[var(--color-text-muted)]" : ""
                        }`}
                        title={item.summary}
                      >
                        {item.summary}
                      </span>
                    </div>

                    {/* Author & Reorder Buttons */}
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-[11px] text-[var(--color-text-muted)] font-sans hidden sm:inline">
                        {item.author_name}
                      </span>

                      <div className="flex items-center gap-0.5">
                        <button
                          type="button"
                          disabled={index <= 0 || executing}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleMoveUp(index);
                          }}
                          className="p-1 rounded text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface)] disabled:opacity-20 cursor-pointer"
                          title="上移此行"
                        >
                          <ArrowUpIcon width={12} height={12} />
                        </button>
                        <button
                          type="button"
                          disabled={index >= items.length - 1 || executing}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleMoveDown(index);
                          }}
                          className="p-1 rounded text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface)] disabled:opacity-20 cursor-pointer"
                          title="下移此行"
                        >
                          <ArrowDownIcon width={12} height={12} />
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Inline message input for Reword or Squash */}
                  {(item.action === "reword" || item.action === "squash") && (
                    <div
                      className="ml-8 mt-1 flex items-center gap-2"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <span className="text-[11px] text-[var(--color-text-muted)] font-sans shrink-0">
                        新提交说明:
                      </span>
                      <input
                        type="text"
                        value={item.new_message ?? item.summary}
                        disabled={executing}
                        onChange={(e) => handleMessageChange(index, e.target.value)}
                        className="flex-1 px-2.5 py-1 text-xs rounded border border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-text)] font-sans focus:outline-hidden focus:border-[var(--color-accent)]"
                        placeholder="请输入变基后的新提交说明..."
                      />
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-[var(--color-border)] bg-[var(--color-surface-raised)] flex items-center justify-between shrink-0 text-xs">
          <div className="text-[11px] text-[var(--color-text-muted)] flex items-center gap-2">
            <span>💡 提示：变基将重写所选提交，如果分支已推送，后续推送需使用强制推送。</span>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              disabled={executing}
              onClick={onClose}
              className="px-3.5 py-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] hover:bg-[var(--color-bg)] text-[var(--color-text)] font-medium transition-colors cursor-pointer"
            >
              取消
            </button>
            <button
              type="button"
              disabled={executing || isInvalidFirst || items.length === 0}
              onClick={handleStartRebase}
              className="px-4 py-1.5 rounded-lg bg-[var(--color-accent)] hover:opacity-90 disabled:opacity-50 text-white font-semibold transition-opacity cursor-pointer flex items-center gap-1.5 shadow-sm"
            >
              <CheckIcon width={13} height={13} />
              <span>{executing ? "正在变基中..." : "开始变基 (Start Rebase)"}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
