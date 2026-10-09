import { useState, useEffect, useCallback, useMemo } from "react";
import {
  listWorktrees,
  addWorktree,
  removeWorktree,
  lockWorktree,
  unlockWorktree,
  pruneWorktrees,
  listBranches,
  selectFolder,
  type WorktreeItem,
  type BranchItem,
} from "../../lib/host";
import {
  CloseIcon,
  RefreshIcon,
  WorktreeIcon,
  BranchIcon,
  FolderIcon,
  AlertCircleIcon,
  CheckIcon,
} from "../../components/icons";
import { useEscapeKey } from "../../hooks/useEscapeKey";

interface WorktreeModalProps {
  isOpen: boolean;
  onClose: () => void;
  rootPath: string;
  onOpenRepo: (path: string) => void;
}

export function WorktreeModal(props: WorktreeModalProps) {
  useEscapeKey(props.onClose, props.isOpen);
  if (!props.isOpen) return null;
  return <WorktreeModalContent {...props} />;
}

function normalizePath(p: string): string {
  return p.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
}

function WorktreeModalContent({
  onClose,
  rootPath,
  onOpenRepo,
}: WorktreeModalProps) {
  const [worktrees, setWorktrees] = useState<WorktreeItem[]>([]);
  const [branches, setBranches] = useState<BranchItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // New worktree form state
  const [showAddForm, setShowAddForm] = useState(false);
  const [newPath, setNewPath] = useState("");
  const [branchMode, setBranchMode] = useState<"existing" | "new">("existing");
  const [selectedBranch, setSelectedBranch] = useState("");
  const [newBranchName, setNewBranchName] = useState("");
  const [autoSwitch, setAutoSwitch] = useState(true);

  // Lock confirmation modal / prompt
  const [lockingTarget, setLockingTarget] = useState<WorktreeItem | null>(null);
  const [lockReason, setLockReason] = useState("");

  // Remove confirmation modal
  const [removingTarget, setRemovingTarget] = useState<WorktreeItem | null>(null);
  const [forceRemove, setForceRemove] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [wtList, branchList] = await Promise.all([
        listWorktrees(rootPath),
        listBranches(rootPath),
      ]);
      setWorktrees(wtList);
      setBranches(branchList);
      if (branchList.length > 0 && !selectedBranch) {
        const head = branchList.find((b) => b.is_head) || branchList[0];
        setSelectedBranch(head.name);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [rootPath, selectedBranch]);

  useEffect(() => {
    let canceled = false;
    Promise.all([listWorktrees(rootPath), listBranches(rootPath)])
      .then(([wtList, branchList]) => {
        if (!canceled) {
          setWorktrees(wtList);
          setBranches(branchList);
          if (branchList.length > 0) {
            const head = branchList.find((b) => b.is_head) || branchList[0];
            setSelectedBranch(head.name);
          }
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

  const normCurrent = useMemo(() => normalizePath(rootPath), [rootPath]);

  const handleSelectFolder = async () => {
    try {
      const selected = await selectFolder();
      if (selected) {
        setNewPath(selected);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleCreateWorktree = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPath.trim()) {
      setError("请输入或选择工作区目录路径");
      return;
    }
    const branchToUse =
      branchMode === "new" ? newBranchName.trim() : selectedBranch.trim();
    if (!branchToUse) {
      setError(branchMode === "new" ? "请输入新分支名称" : "请选择已有分支");
      return;
    }

    setActionLoading(true);
    setError(null);
    setSuccessMsg(null);
    try {
      await addWorktree(
        rootPath,
        newPath.trim(),
        branchToUse,
        branchMode === "new"
      );
      setSuccessMsg(`工作区已成功创建在: ${newPath.trim()}`);
      const targetPath = newPath.trim();
      setNewPath("");
      setNewBranchName("");
      setShowAddForm(false);
      await loadData();

      if (autoSwitch) {
        onOpenRepo(targetPath);
        onClose();
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setActionLoading(false);
    }
  };

  const handlePrune = async () => {
    setActionLoading(true);
    setError(null);
    try {
      await pruneWorktrees(rootPath);
      setSuccessMsg("已成功修剪无效工作区");
      await loadData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setActionLoading(false);
    }
  };

  const handleLock = async () => {
    if (!lockingTarget) return;
    setActionLoading(true);
    setError(null);
    try {
      await lockWorktree(
        rootPath,
        lockingTarget.path,
        lockReason.trim() ? lockReason.trim() : undefined
      );
      setLockingTarget(null);
      setLockReason("");
      setSuccessMsg(`已锁定工作区: ${lockingTarget.name}`);
      await loadData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setActionLoading(false);
    }
  };

  const handleUnlock = async (wt: WorktreeItem) => {
    setActionLoading(true);
    setError(null);
    try {
      await unlockWorktree(rootPath, wt.path);
      setSuccessMsg(`已解锁工作区: ${wt.name}`);
      await loadData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setActionLoading(false);
    }
  };

  const handleRemove = async () => {
    if (!removingTarget) return;
    setActionLoading(true);
    setError(null);
    try {
      await removeWorktree(rootPath, removingTarget.path, forceRemove);
      setRemovingTarget(null);
      setForceRemove(false);
      setSuccessMsg(`已移除工作区: ${removingTarget.name}`);
      await loadData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="管理 Git 工作区"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 select-none backdrop-blur-xs"
    >
      <div className="w-full max-w-2xl max-h-[85vh] rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] shadow-2xl overflow-hidden flex flex-col text-xs text-[var(--color-text)] animate-in fade-in zoom-in-95 duration-100">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)] bg-[var(--color-bg)]">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-md bg-[var(--color-accent)]/10 text-[var(--color-accent)]">
              <WorktreeIcon width={16} height={16} />
            </div>
            <div>
              <div className="font-semibold text-sm">管理 Git 工作区 (Git Worktrees)</div>
              <div className="text-[11px] text-[var(--color-text-muted)]">
                支持为不同分支挂载独立工作目录，实现多分支并行开发与快速切换
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={handlePrune}
              disabled={actionLoading}
              title="修剪并清理已在磁盘移除的失效工作区引用"
              className="px-2 py-1 rounded border border-[var(--color-border)] bg-[var(--color-surface)] hover:bg-[var(--color-surface-raised)] text-[11px] text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors cursor-pointer disabled:opacity-50"
            >
              修剪 (Prune)
            </button>
            <button
              type="button"
              onClick={() => loadData()}
              disabled={loading || actionLoading}
              className="p-1 rounded text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors cursor-pointer"
              title="刷新列表"
            >
              <RefreshIcon width={14} height={14} className={loading ? "animate-spin" : ""} />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors cursor-pointer"
              title="关闭"
            >
              <CloseIcon width={14} height={14} />
            </button>
          </div>
        </div>

        {/* Banners */}
        {error && (
          <div className="px-4 py-2 bg-red-500/10 border-b border-red-500/20 text-red-400 text-xs flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertCircleIcon width={14} height={14} className="shrink-0" />
              <span>{error}</span>
            </div>
            <button
              type="button"
              onClick={() => setError(null)}
              className="hover:opacity-80 cursor-pointer ml-2"
            >
              ✕
            </button>
          </div>
        )}
        {successMsg && (
          <div className="px-4 py-2 bg-emerald-500/10 border-b border-emerald-500/20 text-emerald-400 text-xs flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckIcon width={14} height={14} className="shrink-0" />
              <span>{successMsg}</span>
            </div>
            <button
              type="button"
              onClick={() => setSuccessMsg(null)}
              className="hover:opacity-80 cursor-pointer ml-2"
            >
              ✕
            </button>
          </div>
        )}

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Action bar: Add Worktree toggle */}
          <div className="flex items-center justify-between">
            <span className="font-medium text-[var(--color-text-muted)]">
              工作区列表 ({worktrees.length})
            </span>
            <button
              type="button"
              onClick={() => setShowAddForm((v) => !v)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium transition-colors cursor-pointer ${
                showAddForm
                  ? "bg-[var(--color-surface-raised)] border border-[var(--color-border)] text-[var(--color-text)]"
                  : "bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent)]/90"
              }`}
            >
              <span>{showAddForm ? "取消新建" : "+ 新建工作区"}</span>
            </button>
          </div>

          {/* New Worktree Form */}
          {showAddForm && (
            <form
              onSubmit={handleCreateWorktree}
              className="p-3.5 rounded-lg border border-[var(--color-accent)]/30 bg-[var(--color-accent)]/5 space-y-3"
            >
              <div className="font-semibold text-xs text-[var(--color-text)]">
                新建 Git 工作树 (Worktree)
              </div>

              {/* Target Path */}
              <div>
                <label className="block text-[11px] font-medium text-[var(--color-text-muted)] mb-1">
                  目标工作区目录 (绝对路径或相对路径)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={newPath}
                    onChange={(e) => setNewPath(e.target.value)}
                    placeholder="例如: ../my-feature-wt 或 D:/projects/feature"
                    className="flex-1 px-2.5 py-1.5 rounded border border-[var(--color-border)] bg-[var(--color-bg)] text-xs text-[var(--color-text)] focus:outline-none focus:border-[var(--color-accent)] font-mono"
                    required
                  />
                  <button
                    type="button"
                    onClick={handleSelectFolder}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded border border-[var(--color-border)] bg-[var(--color-surface)] hover:bg-[var(--color-surface-raised)] text-xs cursor-pointer text-[var(--color-text)] shrink-0"
                  >
                    <FolderIcon width={13} height={13} />
                    <span>选择文件夹</span>
                  </button>
                </div>
              </div>

              {/* Branch Option */}
              <div className="space-y-2">
                <label className="block text-[11px] font-medium text-[var(--color-text-muted)]">
                  分支检出方式
                </label>
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name="branchMode"
                      checked={branchMode === "existing"}
                      onChange={() => setBranchMode("existing")}
                      className="accent-[var(--color-accent)]"
                    />
                    <span>检出已有分支</span>
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name="branchMode"
                      checked={branchMode === "new"}
                      onChange={() => setBranchMode("new")}
                      className="accent-[var(--color-accent)]"
                    />
                    <span>创建新分支 (-b)</span>
                  </label>
                </div>

                {branchMode === "existing" ? (
                  <div>
                    <select
                      value={selectedBranch}
                      onChange={(e) => setSelectedBranch(e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded border border-[var(--color-border)] bg-[var(--color-bg)] text-xs text-[var(--color-text)] focus:outline-none focus:border-[var(--color-accent)]"
                    >
                      {branches.map((b) => (
                        <option key={b.name} value={b.name}>
                          {b.name} {b.is_head ? "(当前 HEAD)" : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div>
                    <input
                      type="text"
                      value={newBranchName}
                      onChange={(e) => setNewBranchName(e.target.value)}
                      placeholder="输入新分支名称，如 feature/sidebar"
                      className="w-full px-2.5 py-1.5 rounded border border-[var(--color-border)] bg-[var(--color-bg)] text-xs text-[var(--color-text)] focus:outline-none focus:border-[var(--color-accent)] font-mono"
                    />
                  </div>
                )}
              </div>

              {/* Auto switch option */}
              <label className="flex items-center gap-2 cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={autoSwitch}
                  onChange={(e) => setAutoSwitch(e.target.checked)}
                  className="accent-[var(--color-accent)]"
                />
                <span className="text-[11px] text-[var(--color-text-muted)]">
                  创建成功后立即切换并打开新工作区
                </span>
              </label>

              {/* Submit Buttons */}
              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowAddForm(false)}
                  className="px-3 py-1.5 rounded border border-[var(--color-border)] hover:bg-[var(--color-surface-raised)] cursor-pointer"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-3 py-1.5 rounded bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent)]/90 cursor-pointer disabled:opacity-50 font-medium"
                >
                  {actionLoading ? "创建中..." : "确认创建"}
                </button>
              </div>
            </form>
          )}

          {/* Worktree List */}
          {loading ? (
            <div className="py-8 text-center text-[var(--color-text-muted)] flex items-center justify-center gap-2">
              <RefreshIcon width={14} height={14} className="animate-spin" />
              <span>正在加载工作区列表...</span>
            </div>
          ) : worktrees.length === 0 ? (
            <div className="py-8 text-center text-[var(--color-text-muted)]">
              未找到工作区信息
            </div>
          ) : (
            <div className="space-y-2">
              {worktrees.map((wt) => {
                const isCurrent = normalizePath(wt.path) === normCurrent;
                return (
                  <div
                    key={wt.path}
                    className={`p-3 rounded-lg border transition-colors ${
                      isCurrent
                        ? "border-[var(--color-accent)]/50 bg-[var(--color-accent)]/5 shadow-xs"
                        : "border-[var(--color-border)] bg-[var(--color-bg)] hover:border-[var(--color-border-hover,var(--color-border))]"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      {/* Left: Info */}
                      <div className="space-y-1 min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-xs text-[var(--color-text)]">
                            {wt.name}
                          </span>

                          {/* Branch badge */}
                          {wt.branch ? (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono bg-[var(--color-surface-raised)] border border-[var(--color-border)] text-[var(--color-text)]">
                              <BranchIcon width={10} height={10} className="text-[var(--color-accent)]" />
                              <span>{wt.branch}</span>
                            </span>
                          ) : wt.head_oid ? (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono bg-amber-500/10 text-amber-500 border border-amber-500/20">
                              <span>游离 HEAD ({wt.head_oid.slice(0, 7)})</span>
                            </span>
                          ) : null}

                          {/* Main badge */}
                          {wt.is_main && (
                            <span className="px-1.5 py-0.2 rounded text-[10px] font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20">
                              主工作区
                            </span>
                          )}

                          {/* Active badge */}
                          {isCurrent && (
                            <span className="px-1.5 py-0.2 rounded text-[10px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                              当前已打开
                            </span>
                          )}

                          {/* Locked badge */}
                          {wt.is_locked && (
                            <span
                              className="px-1.5 py-0.2 rounded text-[10px] font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20"
                              title={wt.lock_reason || "已锁定"}
                            >
                              🔒 已锁定 {wt.lock_reason ? `(${wt.lock_reason})` : ""}
                            </span>
                          )}
                        </div>

                        {/* Path */}
                        <div
                          className="font-mono text-[11px] text-[var(--color-text-muted)] truncate"
                          title={wt.path}
                        >
                          {wt.path}
                        </div>
                      </div>

                      {/* Right: Actions */}
                      <div className="flex items-center gap-1.5 shrink-0">
                        {/* Switch / Open button */}
                        {!isCurrent && (
                          <button
                            type="button"
                            onClick={() => {
                              onOpenRepo(wt.path);
                              onClose();
                            }}
                            className="px-2 py-1 rounded bg-[var(--color-surface-raised)] hover:bg-[var(--color-border)] text-[11px] font-medium text-[var(--color-text)] transition-colors cursor-pointer"
                            title="在当前客户端中打开并切换到此工作区"
                          >
                            打开切换
                          </button>
                        )}

                        {/* Lock / Unlock button */}
                        {wt.is_locked ? (
                          <button
                            type="button"
                            onClick={() => handleUnlock(wt)}
                            disabled={actionLoading}
                            className="px-2 py-1 rounded border border-[var(--color-border)] hover:bg-[var(--color-surface-raised)] text-[11px] text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors cursor-pointer disabled:opacity-50"
                            title="解锁此工作区"
                          >
                            解锁
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setLockingTarget(wt)}
                            disabled={actionLoading}
                            className="px-2 py-1 rounded border border-[var(--color-border)] hover:bg-[var(--color-surface-raised)] text-[11px] text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors cursor-pointer disabled:opacity-50"
                            title="锁定工作区以防止误删除或自动修剪"
                          >
                            锁定
                          </button>
                        )}

                        {/* Remove button */}
                        {wt.is_main ? (
                          <span
                            className="px-2 py-1 text-[11px] text-[var(--color-text-muted)] opacity-40 cursor-not-allowed"
                            title="主工作区不可删除"
                          >
                            主库
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setRemovingTarget(wt)}
                            disabled={actionLoading}
                            className="px-2 py-1 rounded border border-red-500/20 text-red-400 hover:bg-red-500/10 text-[11px] transition-colors cursor-pointer disabled:opacity-50"
                            title="移除此工作树"
                          >
                            移除
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Lock Worktree Dialog */}
        {lockingTarget && (
          <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/60 p-4">
            <div className="w-full max-w-sm rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] shadow-2xl p-4 space-y-3 animate-in fade-in zoom-in-95">
              <div className="font-semibold text-sm">锁定工作区: {lockingTarget.name}</div>
              <div className="text-[11px] text-[var(--color-text-muted)]">
                锁定后，Git 不会自动 prune 修剪或删除该工作区。您可以选填锁定原因：
              </div>
              <input
                type="text"
                value={lockReason}
                onChange={(e) => setLockReason(e.target.value)}
                placeholder="例如: 正在进行长期排期开发"
                className="w-full px-2.5 py-1.5 rounded border border-[var(--color-border)] bg-[var(--color-bg)] text-xs text-[var(--color-text)] focus:outline-none focus:border-[var(--color-accent)]"
              />
              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setLockingTarget(null);
                    setLockReason("");
                  }}
                  className="px-3 py-1.5 rounded border border-[var(--color-border)] hover:bg-[var(--color-surface-raised)] cursor-pointer"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={handleLock}
                  disabled={actionLoading}
                  className="px-3 py-1.5 rounded bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent)]/90 cursor-pointer disabled:opacity-50"
                >
                  确认锁定
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Remove Worktree Confirmation Dialog */}
        {removingTarget && (
          <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/60 p-4">
            <div className="w-full max-w-sm rounded-lg border border-red-500/30 bg-[var(--color-surface)] shadow-2xl p-4 space-y-3 animate-in fade-in zoom-in-95">
              <div className="flex items-center gap-2 text-red-400 font-semibold text-sm">
                <AlertCircleIcon width={16} height={16} />
                <span>确认移除工作区？</span>
              </div>
              <div className="text-xs text-[var(--color-text)]">
                即将移除工作区 <span className="font-semibold font-mono">{removingTarget.name}</span>
                <div className="text-[11px] text-[var(--color-text-muted)] mt-1 font-mono break-all">
                  {removingTarget.path}
                </div>
              </div>
              <label className="flex items-center gap-2 cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={forceRemove}
                  onChange={(e) => setForceRemove(e.target.checked)}
                  className="accent-red-500"
                />
                <span className="text-[11px] text-red-400">
                  强制删除（即便工作区含有未提交或未推送的改动）
                </span>
              </label>
              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setRemovingTarget(null);
                    setForceRemove(false);
                  }}
                  className="px-3 py-1.5 rounded border border-[var(--color-border)] hover:bg-[var(--color-surface-raised)] cursor-pointer"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={handleRemove}
                  disabled={actionLoading}
                  className="px-3 py-1.5 rounded bg-red-600 text-white hover:bg-red-700 cursor-pointer disabled:opacity-50"
                >
                  确认移除
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="px-4 py-2.5 border-t border-[var(--color-border)] bg-[var(--color-bg)] flex items-center justify-between text-[11px] text-[var(--color-text-muted)]">
          <span>提示：每个工作区拥有独立暂存区与分支指针，无需 stash 即可任意切换</span>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1 rounded border border-[var(--color-border)] bg-[var(--color-surface)] hover:bg-[var(--color-surface-raised)] text-[var(--color-text)] cursor-pointer"
          >
            完成
          </button>
        </div>
      </div>
    </div>
  );
}
