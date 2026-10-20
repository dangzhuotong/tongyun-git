import { useState, useEffect } from "react";
import {
  listBranches,
  switchBranch,
  fetchRemote,
  type BranchItem,
} from "../../lib/host";
import {
  BranchIcon,
  CloseIcon,
  AlertCircleIcon,
  CheckIcon,
} from "../../components/icons";
import { CreateBranchModal } from "./CreateBranchModal";
import { useEscapeKey } from "../../hooks/useEscapeKey";

interface BranchModalProps {
  isOpen: boolean;
  onClose: () => void;
  rootPath: string;
  onBranchSwitched: () => void;
}

export function BranchModal(props: BranchModalProps) {
  useEscapeKey(props.onClose, props.isOpen);
  if (!props.isOpen) return null;
  return <BranchModalContent {...props} />;
}

function BranchModalContent({
  onClose,
  rootPath,
  onBranchSwitched,
}: Omit<BranchModalProps, "isOpen">) {
  const [branches, setBranches] = useState<BranchItem[]>([]);
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [switching, setSwitching] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Conflicting files blocking modal (AT-08c / wireframe S5)
  const [conflictModalData, setConflictModalData] = useState<{
    targetBranch: string;
    files: string[];
  } | null>(null);

  // Create branch modal
  const [createModalOpen, setCreateModalOpen] = useState(false);

  const refreshBranches = async () => {
    setLoading(true);
    try {
      const list = await listBranches(rootPath);
      setBranches(list);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleFetchAll = async () => {
    if (fetching) return;
    setFetching(true);
    setError(null);
    try {
      const res = await fetchRemote(rootPath, null, true);
      if (!res.success) {
        setError(res.error_message || "获取远程分支失败");
      }
      await refreshBranches();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setFetching(false);
    }
  };

  useEffect(() => {
    let canceled = false;
    listBranches(rootPath)
      .then((list) => {
        if (!canceled) {
          setBranches(list);
          setLoading(false);
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

  // Filtered branches
  const filtered = branches.filter((b) =>
    b.name.toLowerCase().includes(filter.toLowerCase())
  );

  const localBranches = filtered.filter((b) => !b.is_remote);
  const remoteBranches = filtered.filter((b) => b.is_remote);

  const handleSelectBranch = async (branch: BranchItem) => {
    if (branch.is_head || switching) return;

    setSwitching(true);
    setError(null);

    try {
      const res = await switchBranch(rootPath, branch.name, branch.is_remote);
      if (res.success) {
        onBranchSwitched();
        onClose();
      } else if (res.conflicting_files && res.conflicting_files.length > 0) {
        // Switch blocked due to uncommitted working tree changes (AT-08c)
        setConflictModalData({
          targetBranch: branch.name,
          files: res.conflicting_files,
        });
      } else {
        setError(res.error_message || "切换分支失败");
      }
    } catch (err: any) {
      setError(err?.message || String(err));
    } finally {
      setSwitching(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 select-none">
        <div className="w-full max-w-md max-h-[80vh] rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] shadow-lg overflow-hidden flex flex-col text-xs text-[var(--color-text)]">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)]">
            <div className="flex items-center gap-2 font-semibold text-sm">
              <BranchIcon width={16} height={16} className="text-[var(--color-accent)]" />
              <span>分支管理</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleFetchAll}
                disabled={fetching}
                title="抓取所有远程分支最新状态 (Fetch All: git fetch --all --prune)"
                className="flex items-center gap-1 px-2 py-1 rounded border border-[var(--color-border)] hover:bg-[var(--color-surface-raised)] text-[var(--color-text)] font-medium text-[11px] cursor-pointer disabled:opacity-50"
              >
                <svg
                  className={`w-3 h-3 ${fetching ? "animate-spin text-[var(--color-accent)]" : ""}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                  />
                </svg>
                <span>{fetching ? "获取中..." : "获取远程"}</span>
              </button>
              <button
                type="button"
                onClick={() => setCreateModalOpen(true)}
                className="px-2 py-1 rounded bg-[var(--color-accent)] hover:opacity-90 text-white font-medium text-[11px] cursor-pointer shadow-2xs"
              >
                + 新建分支
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

          {/* Filter Input */}
          <div className="p-3 border-b border-[var(--color-border)] bg-[var(--color-bg)]/30">
            <input
              type="text"
              autoFocus
              placeholder="过滤分支..."
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="w-full px-3 py-1.5 rounded border border-[var(--color-border)] bg-[var(--color-bg)] text-xs focus:outline-none focus:border-[var(--color-accent)] select-text font-mono"
            />
          </div>

          {/* Error Banner */}
          {error && (
            <div className="px-3 py-2 bg-[var(--color-danger)]/15 border-b border-[var(--color-danger)]/30 text-xs text-[var(--color-danger)] flex items-center justify-between">
              <div className="flex items-center gap-1.5 overflow-hidden">
                <AlertCircleIcon width={13} height={13} className="shrink-0" />
                <span className="truncate select-text">{error}</span>
              </div>
              <button
                type="button"
                onClick={() => setError(null)}
                className="p-0.5 hover:opacity-75 cursor-pointer"
              >
                <CloseIcon width={12} height={12} />
              </button>
            </div>
          )}

          {/* Branch Lists */}
          <div className="flex-1 overflow-y-auto p-2 space-y-3">
            {loading ? (
              <div className="py-8 text-center text-[var(--color-text-muted)]">
                加载分支中...
              </div>
            ) : (
              <>
                {/* Local Branches (R-08) */}
                <div className="space-y-1">
                  <div className="px-2 py-1 text-[10px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">
                    本地分支 ({localBranches.length})
                  </div>
                  {localBranches.length === 0 ? (
                    <div className="px-2 py-1 text-[11px] text-[var(--color-text-muted)] italic">
                      无匹配的本地分支
                    </div>
                  ) : (
                    localBranches.map((b) => (
                      <button
                        key={b.name}
                        type="button"
                        onClick={() => handleSelectBranch(b)}
                        disabled={b.is_head || switching}
                        className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded text-left transition-colors font-mono text-xs ${
                          b.is_head
                            ? "bg-[var(--color-accent)]/15 text-[var(--color-accent)] font-semibold cursor-default"
                            : "hover:bg-[var(--color-surface-raised)] cursor-pointer text-[var(--color-text)]"
                        }`}
                      >
                        <div className="flex items-center gap-2 truncate">
                          {b.is_head ? (
                            <CheckIcon width={13} height={13} className="text-[var(--color-accent)] shrink-0" />
                          ) : (
                            <div className="w-[13px]" />
                          )}
                          <span className="truncate">{b.name}</span>
                        </div>

                        {/* Tracking status (Ahead / Behind) */}
                        <div className="flex items-center gap-2 text-[11px] shrink-0 font-sans">
                          {b.upstream && (b.ahead > 0 || b.behind > 0) && (
                            <span className="text-[var(--color-text-muted)] font-mono">
                              {b.ahead > 0 && `↑${b.ahead} `}
                              {b.behind > 0 && `↓${b.behind}`}
                            </span>
                          )}
                          {b.upstream && (
                            <span className="text-[10px] text-[var(--color-text-muted)] opacity-75 truncate max-w-[100px]">
                              {b.upstream}
                            </span>
                          )}
                        </div>
                      </button>
                    ))
                  )}
                </div>

                {/* Remote Branches (R-08 / AT-08b) */}
                <div className="space-y-1 pt-2 border-t border-[var(--color-border)]/50">
                  <div className="px-2 py-1 text-[10px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">
                    远程分支 ({remoteBranches.length})
                  </div>
                  {remoteBranches.length === 0 ? (
                    <div className="px-2 py-1 text-[11px] text-[var(--color-text-muted)] italic">
                      无匹配的远程分支
                    </div>
                  ) : (
                    remoteBranches.map((b) => {
                      const localName = b.name.split("/").slice(1).join("/");
                      const hasLocal = branches.some(
                        (other) => !other.is_remote && other.name === localName
                      );

                      return (
                        <button
                          key={b.name}
                          type="button"
                          onClick={() => handleSelectBranch(b)}
                          disabled={switching}
                          className="w-full flex items-center justify-between px-2.5 py-1.5 rounded text-left hover:bg-[var(--color-surface-raised)] transition-colors font-mono text-xs cursor-pointer text-[var(--color-text)]"
                        >
                          <div className="flex items-center gap-2 truncate">
                            <BranchIcon width={13} height={13} className="text-[var(--color-text-muted)] shrink-0" />
                            <span className="truncate">{b.name}</span>
                          </div>

                          {!hasLocal && (
                            <span className="text-[10px] px-1 py-0.2 rounded bg-[var(--color-border)] text-[var(--color-text-muted)] font-sans">
                              本地无
                            </span>
                          )}
                        </button>
                      );
                    })
                  )}
                </div>
              </>
            )}
          </div>

          {/* Footer */}
          <div className="px-4 py-2 border-t border-[var(--color-border)] bg-[var(--color-bg)]/30 text-[11px] text-[var(--color-text-muted)] flex items-center justify-between">
            <span>点击分支名直接切换</span>
            <span className="font-mono">{branches.length} 个分支</span>
          </div>
        </div>
      </div>

      {/* Switch Conflict Prevention Modal (AT-08c / wireframe S5) */}
      {conflictModalData && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/60 p-4 select-none">
          <div className="w-full max-w-md rounded-lg border border-[var(--color-danger)]/40 bg-[var(--color-surface)] shadow-xl overflow-hidden flex flex-col text-xs text-[var(--color-text)]">
            <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)] bg-[var(--color-danger)]/10">
              <div className="flex items-center gap-2 font-semibold text-sm text-[var(--color-danger)]">
                <AlertCircleIcon width={16} height={16} />
                <span>无法切换分支</span>
              </div>
              <button
                type="button"
                onClick={() => setConflictModalData(null)}
                className="p-1 rounded text-[var(--color-text-muted)] hover:text-[var(--color-text)] cursor-pointer"
              >
                <CloseIcon width={14} height={14} />
              </button>
            </div>

            <div className="p-4 space-y-3">
              <p className="text-xs leading-relaxed text-[var(--color-text)]">
                切换到 <strong>{conflictModalData.targetBranch}</strong> 将覆盖下列文件的未提交改动：
              </p>

              <div className="p-2 rounded bg-[var(--color-bg)] border border-[var(--color-border)] max-h-36 overflow-y-auto font-mono text-[11px] text-[var(--color-danger)] space-y-0.5 select-text">
                {conflictModalData.files.map((f) => (
                  <div key={f}>• {f}</div>
                ))}
              </div>

              <p className="text-[11px] text-[var(--color-text-muted)]">
                为防止您的代码丢失，Git 已阻止切换。请先提交、暂存或丢弃这些改动后再试。
              </p>
            </div>

            <div className="flex items-center justify-end px-4 py-3 border-t border-[var(--color-border)] bg-[var(--color-bg)]/40">
              <button
                type="button"
                onClick={() => setConflictModalData(null)}
                className="px-4 py-1.5 rounded bg-[var(--color-accent)] text-white text-xs font-semibold cursor-pointer shadow-xs"
              >
                知道了
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Branch Submodal */}
      <CreateBranchModal
        isOpen={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        rootPath={rootPath}
        onBranchCreated={() => {
          refreshBranches();
          onBranchSwitched();
        }}
      />
    </>
  );
}
