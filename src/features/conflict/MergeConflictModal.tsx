import { useState, useEffect, useCallback } from "react";
import {
  listConflicts,
  getConflictDetails,
  resolveConflictFile,
  acceptOurs,
  acceptTheirs,
  continueMergeOrRebase,
  type ConflictFileSummary,
  type ConflictFileDetails,
} from "../../lib/host";
import {
  CloseIcon,
  GitMergeIcon,
  CheckIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  AlertCircleIcon,
  RefreshIcon,
} from "../../components/icons";
import { useEscapeKey } from "../../hooks/useEscapeKey";
import { applyConflictHunk, hasUnresolvedConflictMarkers } from "./applyHunk";

interface MergeConflictModalProps {
  isOpen: boolean;
  onClose: () => void;
  rootPath: string;
  initialFilePath?: string | null;
  onConflictsResolved?: () => void;
}

export function MergeConflictModal(props: MergeConflictModalProps) {
  useEscapeKey(props.onClose, props.isOpen);
  if (!props.isOpen) return null;
  return <MergeConflictModalContent {...props} />;
}

function MergeConflictModalContent({
  onClose,
  rootPath,
  initialFilePath,
  onConflictsResolved,
}: MergeConflictModalProps) {
  const [conflictFiles, setConflictFiles] = useState<ConflictFileSummary[]>([]);
  const [selectedFilePath, setSelectedFilePath] = useState<string>(
    initialFilePath || ""
  );
  const [details, setDetails] = useState<ConflictFileDetails | null>(null);
  const [resultContent, setResultContent] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [completingMerge, setCompletingMerge] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Load conflict files list
  const loadConflictList = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await listConflicts(rootPath);
      setConflictFiles(list);
      if (list.length > 0) {
        setSelectedFilePath((prev) => {
          if (prev && list.some((f) => f.path === prev)) return prev;
          return list[0].path;
        });
      } else {
        setSelectedFilePath("");
        setDetails(null);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [rootPath]);

  useEffect(() => {
    let canceled = false;
    listConflicts(rootPath)
      .then((list) => {
        if (!canceled) {
          setConflictFiles(list);
          setLoading(false);
          if (list.length > 0) {
            setSelectedFilePath((prev) => {
              if (prev && list.some((f) => f.path === prev)) return prev;
              return list[0].path;
            });
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
  }, [rootPath]);

  // Load details for the currently selected file whenever selectedFilePath changes
  useEffect(() => {
    if (!selectedFilePath) {
      return;
    }

    let canceled = false;
    getConflictDetails(rootPath, selectedFilePath)
      .then((d) => {
        if (!canceled) {
          setDetails(d);
          setResultContent(d.worktree_content || d.our_content || "");
          setDetailsLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (!canceled) {
          setError(err instanceof Error ? err.message : String(err));
          setDetailsLoading(false);
        }
      });

    return () => {
      canceled = true;
    };
  }, [rootPath, selectedFilePath]);

  // Handle Accept All Left (Ours)
  const handleAcceptAllOurs = async () => {
    if (!selectedFilePath) return;
    setSaving(true);
    setError(null);
    try {
      await acceptOurs(rootPath, selectedFilePath);
      setSuccessMsg(`已将 ${selectedFilePath} 全部采用本地 (Ours) 代码并标记解决`);
      onConflictsResolved?.();
      await loadConflictList();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  // Handle Accept All Right (Theirs)
  const handleAcceptAllTheirs = async () => {
    if (!selectedFilePath) return;
    setSaving(true);
    setError(null);
    try {
      await acceptTheirs(rootPath, selectedFilePath);
      setSuccessMsg(`已将 ${selectedFilePath} 全部采用传入 (Theirs) 代码并标记解决`);
      onConflictsResolved?.();
      await loadConflictList();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  // Handle Save and Mark Resolved
  const handleSaveAndResolve = async () => {
    if (!selectedFilePath) return;
    // Warn if result still contains conflict markers
    if (hasUnresolvedConflictMarkers(resultContent)) {
      const confirmSave = window.confirm(
        "合并结果中仍包含 Git 冲突标记 (<<<<<<< 或 =======)。确定仍要以此内容标记解决吗？"
      );
      if (!confirmSave) return;
    }

    setSaving(true);
    setError(null);
    try {
      await resolveConflictFile(rootPath, selectedFilePath, resultContent);
      setSuccessMsg(`文件 ${selectedFilePath} 冲突已成功解决并暂存！`);
      onConflictsResolved?.();
      await loadConflictList();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  // Accept specific hunk from Ours into Result
  const handleAcceptHunkOurs = (hunkIdx: number) => {
    if (!details || !details.hunks[hunkIdx]) return;
    setResultContent(
      applyConflictHunk(resultContent, hunkIdx, details.hunks[hunkIdx].our_lines),
    );
  };

  // Accept specific hunk from Theirs into Result
  const handleAcceptHunkTheirs = (hunkIdx: number) => {
    if (!details || !details.hunks[hunkIdx]) return;
    setResultContent(
      applyConflictHunk(resultContent, hunkIdx, details.hunks[hunkIdx].their_lines),
    );
  };

  // Complete Merge / Continue
  const handleCompleteMerge = async () => {
    setCompletingMerge(true);
    setError(null);
    try {
      await continueMergeOrRebase(rootPath);
      onConflictsResolved?.();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setCompletingMerge(false);
    }
  };

  const hasRemainingConflicts = conflictFiles.length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-3 select-none">
      <div className="w-full h-full max-w-[96vw] max-h-[94vh] rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-2xl overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-150">
        {/* Header Bar */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-[var(--color-border)] bg-[var(--color-surface-raised)] shrink-0">
          <div className="flex items-center gap-3">
            <span className="p-1.5 rounded-md bg-[var(--ty-honey-tint)] text-[var(--ty-honey)]">
              <GitMergeIcon width={16} height={16} />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold text-[var(--color-text)]">
                  三方合并冲突解决器 (3-Way Merge Tool)
                </h2>
                {hasRemainingConflicts ? (
                  <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-[var(--ty-honey-tint)] text-[var(--ty-honey)]">
                    剩余 {conflictFiles.length} 个冲突文件
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-[var(--color-status-added)]/15 text-[var(--color-status-added)] flex items-center gap-1">
                    <CheckIcon width={12} height={12} />
                    <span>所有冲突已全部解决！</span>
                  </span>
                )}
              </div>
              <p className="text-[11px] text-[var(--color-text-muted)]">
                IntelliJ IDEA 经典三栏比对 · 本地代码 « 结果编辑 » 传入代码
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {!hasRemainingConflicts && (
              <button
                type="button"
                onClick={handleCompleteMerge}
                disabled={completingMerge}
                className="px-3.5 py-1.5 rounded-lg bg-[var(--color-accent)] text-white text-xs font-semibold hover:opacity-90 transition-opacity cursor-pointer flex items-center gap-1.5 shadow-sm"
              >
                <CheckIcon width={13} height={13} />
                <span>{completingMerge ? "正在提交合并..." : "完成合并提交 (Complete Merge)"}</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded-md text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface)] transition-colors cursor-pointer"
              title="关闭窗口"
            >
              <CloseIcon width={16} height={16} />
            </button>
          </div>
        </div>

        {/* Action Controls & File Switcher Toolbar */}
        {hasRemainingConflicts && (
          <div className="px-4 py-2 border-b border-[var(--color-border)] bg-[var(--color-surface)] flex items-center justify-between gap-4 shrink-0 text-xs">
            {/* File Selector */}
            <div className="flex items-center gap-2">
              <span className="text-[var(--color-text-muted)] font-medium">冲突文件:</span>
              <select
                value={selectedFilePath}
                onChange={(e) => {
                  setSelectedFilePath(e.target.value);
                  setDetailsLoading(true);
                }}
                className="px-2.5 py-1 rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-text)] font-mono text-xs focus:outline-hidden focus:border-[var(--color-accent)] cursor-pointer"
              >
                {conflictFiles.map((f, idx) => (
                  <option key={f.path} value={f.path}>
                    ({idx + 1}/{conflictFiles.length}) {f.path}
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={loadConflictList}
                className="p-1 rounded text-[var(--color-text-muted)] hover:text-[var(--color-text)] cursor-pointer"
                title="重新检测冲突列表"
              >
                <RefreshIcon width={13} height={13} />
              </button>
            </div>

            {/* Quick Actions */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleAcceptAllOurs}
                disabled={saving || detailsLoading}
                className="px-2.5 py-1 rounded border border-[var(--color-border)] bg-[var(--color-surface-raised)] hover:bg-[var(--color-bg)] text-[var(--color-text)] text-xs font-medium transition-colors cursor-pointer flex items-center gap-1"
                title="整份文件全部采用本地分支 (Ours) 内容"
              >
                <ArrowRightIcon width={12} height={12} />
                <span>全部采用本地</span>
              </button>

              <button
                type="button"
                onClick={handleAcceptAllTheirs}
                disabled={saving || detailsLoading}
                className="px-2.5 py-1 rounded border border-[var(--color-border)] bg-[var(--color-surface-raised)] hover:bg-[var(--color-bg)] text-[var(--color-text)] text-xs font-medium transition-colors cursor-pointer flex items-center gap-1"
                title="整份文件全部采用传入分支 (Theirs) 内容"
              >
                <ArrowLeftIcon width={12} height={12} />
                <span>全部采用传入</span>
              </button>

              <button
                type="button"
                onClick={handleSaveAndResolve}
                disabled={saving || detailsLoading}
                className="px-3 py-1 rounded bg-[var(--color-accent)] text-white text-xs font-medium hover:opacity-90 transition-opacity cursor-pointer flex items-center gap-1.5 shadow-xs"
                title="将中间结果保存至工作区并标记冲突已解决 (git add)"
              >
                <CheckIcon width={13} height={13} />
                <span>{saving ? "正在保存..." : "标记此文件已解决"}</span>
              </button>
            </div>
          </div>
        )}

        {/* Notice Banners */}
        {error && (
          <div className="px-4 py-2 border-b border-[var(--color-danger)]/30 bg-[var(--color-danger)]/10 text-[var(--color-danger)] text-xs shrink-0 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertCircleIcon width={14} height={14} />
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

        {successMsg && (
          <div className="px-4 py-1.5 border-b border-[var(--color-status-added)]/30 bg-[var(--color-status-added)]/10 text-[var(--color-status-added)] text-xs shrink-0 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckIcon width={14} height={14} />
              <span>{successMsg}</span>
            </div>
            <button
              type="button"
              onClick={() => setSuccessMsg(null)}
              className="hover:opacity-80 cursor-pointer"
            >
              <CloseIcon width={14} height={14} />
            </button>
          </div>
        )}

        {/* Main 3-Way Panes */}
        <div className="flex-1 flex overflow-hidden">
          {loading ? (
            <div className="flex-1 flex items-center justify-center text-xs text-[var(--color-text-muted)]">
              正在检查冲突状态...
            </div>
          ) : !hasRemainingConflicts ? (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-3">
              <div className="w-12 h-12 rounded-full bg-[var(--color-status-added)]/10 text-[var(--color-status-added)] flex items-center justify-center">
                <CheckIcon width={24} height={24} />
              </div>
              <h3 className="text-base font-bold text-[var(--color-text)]">
                所有冲突已全部解决！
              </h3>
              <p className="text-xs text-[var(--color-text-muted)] max-w-sm">
                当前仓库所有冲突文件已成功解决并加入暂存区。您可以点击右上角的「完成合并提交」以结束本次合并。
              </p>
              <button
                type="button"
                onClick={handleCompleteMerge}
                disabled={completingMerge}
                className="px-4 py-2 rounded-lg bg-[var(--color-accent)] text-white text-xs font-semibold hover:opacity-90 transition-opacity cursor-pointer mt-2"
              >
                {completingMerge ? "正在提交合并..." : "完成合并提交 (git commit)"}
              </button>
            </div>
          ) : detailsLoading ? (
            <div className="flex-1 flex items-center justify-center text-xs text-[var(--color-text-muted)]">
              正在加载文件内容...
            </div>
          ) : details?.is_binary ? (
            <div className="flex-1 flex items-center justify-center text-xs text-[var(--color-text-muted)]">
              二进制文件冲突，无法进行行级三方比对。请使用「全部采用本地」或「全部采用传入」进行解决。
            </div>
          ) : (
            <div className="flex-1 grid grid-cols-3 divide-x divide-[var(--color-border)] h-full overflow-hidden">
              {/* Left Column: Ours / Local */}
              <div className="flex flex-col h-full overflow-hidden bg-[var(--color-bg)]">
                <div className="px-3 py-1.5 border-b border-[var(--color-border)] bg-[var(--color-surface-raised)] flex items-center justify-between shrink-0">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-[var(--color-accent)]" />
                    <span className="text-xs font-semibold text-[var(--color-text)]">
                      本地分支 (Ours)
                    </span>
                  </div>
                  <span className="text-[10px] text-[var(--color-text-muted)] font-mono">
                    HEAD 改动
                  </span>
                </div>

                <div className="flex-1 overflow-auto p-2 font-mono text-[12px] leading-[20px] select-text">
                  {details?.hunks && details.hunks.length > 0 ? (
                    <div className="space-y-4">
                      {details.hunks.map((hunk, idx) => (
                        <div
                          key={idx}
                          className="rounded border border-[var(--color-accent)]/30 bg-[var(--color-accent)]/5 p-2 space-y-1.5"
                        >
                          <div className="flex items-center justify-between border-b border-[var(--color-accent)]/20 pb-1">
                            <span className="text-[10px] text-[var(--color-accent)] font-bold">
                              冲突块 #{idx + 1}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleAcceptHunkOurs(idx)}
                              className="px-2 py-0.5 rounded bg-[var(--color-accent)] text-white text-[10px] font-medium hover:bg-[var(--ty-matcha-hover)] transition-colors cursor-pointer flex items-center gap-1"
                              title="采纳此块到中间合并结果"
                            >
                              <span>采纳此块</span>
                              <ArrowRightIcon width={10} height={10} />
                            </button>
                          </div>
                          <pre className="whitespace-pre-wrap break-all text-[var(--color-text)]">
                            {hunk.our_lines.join("\n") || "(空内容)"}
                          </pre>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <pre className="whitespace-pre-wrap break-all text-[var(--color-text)]">
                      {details?.our_content || "(无独立本地内容)"}
                    </pre>
                  )}
                </div>
              </div>

              {/* Middle Column: Result (Live Editor) */}
              <div className="flex flex-col h-full overflow-hidden bg-[var(--color-surface)]">
                <div className="px-3 py-1.5 border-b border-[var(--color-border)] bg-[var(--color-surface-raised)] flex items-center justify-between shrink-0">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-[var(--color-accent)] animate-pulse" />
                    <span className="text-xs font-semibold text-[var(--color-text)]">
                      最终合并结果 (Result)
                    </span>
                  </div>
                  <span className="text-[10px] text-[var(--color-text-muted)]">
                    可在此直接编辑
                  </span>
                </div>

                <div className="flex-1 flex flex-col p-2 overflow-hidden">
                  <textarea
                    value={resultContent}
                    onChange={(e) => setResultContent(e.target.value)}
                    className="w-full flex-1 p-2 font-mono text-[12px] leading-[20px] bg-[var(--color-bg)] border border-[var(--color-border)] rounded-md resize-none focus:outline-hidden focus:border-[var(--color-accent)] text-[var(--color-text)]"
                    placeholder="在此编辑最终合并代码..."
                    spellCheck={false}
                  />
                </div>
              </div>

              {/* Right Column: Theirs / Remote */}
              <div className="flex flex-col h-full overflow-hidden bg-[var(--color-bg)]">
                <div className="px-3 py-1.5 border-b border-[var(--color-border)] bg-[var(--color-surface-raised)] flex items-center justify-between shrink-0">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-[var(--ty-sky)]" />
                    <span className="text-xs font-semibold text-[var(--color-text)]">
                      传入分支 (Theirs)
                    </span>
                  </div>
                  <span className="text-[10px] text-[var(--color-text-muted)] font-mono">
                    Incoming 改动
                  </span>
                </div>

                <div className="flex-1 overflow-auto p-2 font-mono text-[12px] leading-[20px] select-text">
                  {details?.hunks && details.hunks.length > 0 ? (
                    <div className="space-y-4">
                      {details.hunks.map((hunk, idx) => (
                        <div
                          key={idx}
                          className="rounded border border-[var(--ty-sky)]/30 bg-[var(--ty-sky-tint)]/40 p-2 space-y-1.5"
                        >
                          <div className="flex items-center justify-between border-b border-[var(--ty-sky)]/20 pb-1">
                            <button
                              type="button"
                              onClick={() => handleAcceptHunkTheirs(idx)}
                              className="px-2 py-0.5 rounded bg-[var(--ty-sky)] text-white text-[10px] font-medium hover:opacity-90 transition-opacity cursor-pointer flex items-center gap-1"
                              title="采纳此块到中间合并结果"
                            >
                              <ArrowLeftIcon width={10} height={10} />
                              <span>采纳此块</span>
                            </button>
                            <span className="text-[10px] text-[var(--ty-sky)] font-bold">
                              冲突块 #{idx + 1}
                            </span>
                          </div>
                          <pre className="whitespace-pre-wrap break-all text-[var(--color-text)]">
                            {hunk.their_lines.join("\n") || "(空内容)"}
                          </pre>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <pre className="whitespace-pre-wrap break-all text-[var(--color-text)]">
                      {details?.their_content || "(无独立传入内容)"}
                    </pre>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
