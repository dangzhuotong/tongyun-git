import { useState, useEffect } from "react";
import {
  getFileHistory,
  getCommitFileDiff,
  type FileHistoryItem,
  type FileDiff,
} from "../../lib/host";
import { CloseIcon, HistoryIcon, FileIcon } from "../../components/icons";
import { DiffViewer } from "../changes/DiffViewer";
import { useEscapeKey } from "../../hooks/useEscapeKey";

interface FileHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  rootPath: string;
  filePath: string;
  onSelectCommit?: (oid: string) => void;
}

export function FileHistoryModal(props: FileHistoryModalProps) {
  useEscapeKey(props.onClose, props.isOpen);
  if (!props.isOpen) return null;
  return <FileHistoryModalContent {...props} />;
}

function FileHistoryModalContent({
  onClose,
  rootPath,
  filePath,
  onSelectCommit,
}: FileHistoryModalProps) {
  const [history, setHistory] = useState<FileHistoryItem[]>([]);
  const [selectedOid, setSelectedOid] = useState<string | null>(null);
  const [loadedDiffOid, setLoadedDiffOid] = useState<string | null>(null);
  const [diff, setDiff] = useState<FileDiff | null>(null);
  const [loading, setLoading] = useState(() => Boolean(filePath));
  const [error, setError] = useState<string | null>(null);

  const diffLoading = Boolean(selectedOid && loadedDiffOid !== selectedOid);

  // Load history list on mount
  useEffect(() => {
    if (!filePath) return;
    let canceled = false;
    getFileHistory(rootPath, filePath, 50)
      .then((items) => {
        if (!canceled) {
          setHistory(items);
          setLoading(false);
          if (items.length > 0) {
            setSelectedOid(items[0].oid);
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
  }, [rootPath, filePath]);

  // Load diff when selected commit changes
  useEffect(() => {
    if (!selectedOid || !filePath) return;
    let canceled = false;

    getCommitFileDiff(rootPath, selectedOid, filePath)
      .then((d) => {
        if (!canceled) {
          setDiff(d);
          setLoadedDiffOid(selectedOid);
        }
      })
      .catch((err: unknown) => {
        if (!canceled) {
          setDiff(null);
          setLoadedDiffOid(selectedOid);
          setError(err instanceof Error ? err.message : String(err));
        }
      });

    return () => {
      canceled = true;
    };
  }, [rootPath, selectedOid, filePath]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 select-none">
      <div className="w-full max-w-5xl h-[85vh] rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-2xl overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)] bg-[var(--color-surface-raised)] shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="p-1.5 rounded-md bg-[var(--color-accent)]/15 text-[var(--color-accent)] shrink-0">
              <HistoryIcon width={16} height={16} />
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold text-[var(--color-text)] shrink-0">
                  文件提交历史 (File History)
                </h2>
                <span className="text-xs font-mono text-[var(--color-accent)] truncate">
                  {filePath}
                </span>
              </div>
              <span className="text-[11px] text-[var(--color-text-muted)]">
                共 {history.length} 次变更记录
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-md text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface)] transition-colors cursor-pointer"
          >
            <CloseIcon width={16} height={16} />
          </button>
        </div>

        {/* Error Banner */}
        {error && (
          <div className="px-4 py-2 border-b border-[var(--color-danger)]/30 bg-[var(--color-danger)]/10 text-[var(--color-danger)] text-xs shrink-0 flex items-center justify-between">
            <span>{error}</span>
            <button
              type="button"
              onClick={() => setError(null)}
              className="text-[var(--color-danger)] hover:opacity-80 cursor-pointer"
            >
              <CloseIcon width={14} height={14} />
            </button>
          </div>
        )}

        {/* Two-Pane Body */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left Pane: Commit List */}
          <div className="w-80 border-r border-[var(--color-border)] bg-[var(--color-surface)] overflow-y-auto shrink-0 flex flex-col">
            {loading ? (
              <div className="p-8 text-center text-xs text-[var(--color-text-muted)]">
                正在加载文件历史...
              </div>
            ) : history.length === 0 ? (
              <div className="p-8 text-center text-xs text-[var(--color-text-muted)]">
                暂无历史记录
              </div>
            ) : (
              <div className="divide-y divide-[var(--color-border)]/50">
                {history.map((item) => {
                  const isSelected = item.oid === selectedOid;
                  const dateStr = new Date(
                    item.timestamp * 1000
                  ).toLocaleDateString();

                  return (
                    <div
                      key={item.oid}
                      onClick={() => setSelectedOid(item.oid)}
                      className={`p-3 cursor-pointer transition-colors text-xs ${
                        isSelected
                          ? "bg-[var(--color-accent)]/10 text-[var(--color-accent)] border-l-2 border-[var(--color-accent)]"
                          : "hover:bg-[var(--color-surface-raised)] text-[var(--color-text)]"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1 mb-1">
                        <span className="font-mono text-[11px] font-semibold text-[var(--color-text-muted)]">
                          {item.short_oid}
                        </span>
                        <span className="text-[10px] text-[var(--color-text-muted)]">
                          {dateStr}
                        </span>
                      </div>
                      <p className="font-medium truncate text-xs mb-1">
                        {item.summary}
                      </p>
                      <div className="flex items-center justify-between text-[11px] text-[var(--color-text-muted)]">
                        <span>{item.author_name}</span>
                        {onSelectCommit && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onSelectCommit(item.oid);
                              onClose();
                            }}
                            className="text-[10px] text-[var(--color-accent)] hover:underline cursor-pointer"
                          >
                            跳至提交图
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Right Pane: Diff Viewer */}
          <div className="flex-1 flex flex-col overflow-hidden bg-[var(--color-bg)]">
            {selectedOid ? (
              <DiffViewer
                diff={diff}
                loading={diffLoading}
                readOnly={true}
              />
            ) : (
              <div className="flex-1 flex items-center justify-center text-xs text-[var(--color-text-muted)]">
                <div className="flex items-center gap-2">
                  <FileIcon width={16} height={16} />
                  <span>在左侧选择一次提交查看改动</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
