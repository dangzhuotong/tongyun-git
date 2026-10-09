import { useState, useEffect, useCallback } from "react";
import {
  getCommitLog,
  getCommitDetails,
  getCommitFileDiff,
  checkoutCommit,
  resetToCommit,
  type LogCommit,
  type CommitDetails,
  type FileDiff,
  type RefBadge,
} from "../../lib/host";
import { LogGraphLane } from "./LogGraphLane";
import { DiffViewer } from "../changes/DiffViewer";
import {
  RefreshIcon,
  CloseIcon,
  AlertCircleIcon,
  FileIcon,
  HistoryIcon,
  BranchIcon,
} from "../../components/icons";

interface LogViewProps {
  rootPath: string;
  onOpenCreateBranch: (oid: string) => void;
  onOpenCreateTag?: (oid: string) => void;
  onOpenFileHistory?: (filePath: string) => void;
  onOpenInteractiveRebase?: (baseOid: string, baseSummary?: string) => void;
  onRefreshRepo?: () => void;
}

export function LogView({
  rootPath,
  onOpenCreateBranch,
  onOpenCreateTag,
  onOpenFileHistory,
  onOpenInteractiveRebase,
  onRefreshRepo,
}: LogViewProps) {
  // Query state
  const [allBranches, setAllBranches] = useState(true);
  const [filterText, setFilterText] = useState("");
  const [commits, setCommits] = useState<LogCommit[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Selected commit state
  const [selectedOid, setSelectedOid] = useState<string | null>(null);
  const [details, setDetails] = useState<CommitDetails | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);

  // Selected file diff state
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [diff, setDiff] = useState<FileDiff | null>(null);
  const [diffLoading, setDiffLoading] = useState(false);

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    commit: LogCommit;
  } | null>(null);

  // Load file diff for commit
  const loadDiff = useCallback(
    async (oid: string, filePath: string) => {
      setDiffLoading(true);
      try {
        const d = await getCommitFileDiff(rootPath, oid, filePath);
        setDiff(d);
      } catch {
        setDiff(null);
      } finally {
        setDiffLoading(false);
      }
    },
    [rootPath]
  );

  // Fetch initial batch when query parameters change
  useEffect(() => {
    let canceled = false;
    getCommitLog(rootPath, {
      all_branches: allBranches,
      filter_author: null,
      filter_query: filterText.trim() ? filterText.trim() : null,
      skip: 0,
      limit: 100,
    })
      .then((res) => {
        if (canceled) return;
        setCommits(res.commits);
        setHasMore(res.has_more);
        setLoading(false);

        if (res.commits.length > 0) {
          setSelectedOid((prev) => {
            if (prev && res.commits.some((c) => c.oid === prev)) {
              return prev;
            }
            return res.commits[0].oid;
          });
        } else {
          setSelectedOid(null);
          setDetails(null);
          setDiff(null);
          setSelectedFile(null);
        }
      })
      .catch((err: unknown) => {
        if (canceled) return;
        setError(err instanceof Error ? err.message : String(err));
        setLoading(false);
      });

    return () => {
      canceled = true;
    };
  }, [rootPath, allBranches, filterText]);

  // Refresh handler (event-driven)
  const handleRefresh = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getCommitLog(rootPath, {
        all_branches: allBranches,
        filter_author: null,
        filter_query: filterText.trim() ? filterText.trim() : null,
        skip: 0,
        limit: 100,
      });
      setCommits(res.commits);
      setHasMore(res.has_more);
      if (res.commits.length > 0) {
        setSelectedOid((prev) => {
          if (prev && res.commits.some((c) => c.oid === prev)) {
            return prev;
          }
          return res.commits[0].oid;
        });
      } else {
        setSelectedOid(null);
        setDetails(null);
        setDiff(null);
        setSelectedFile(null);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  // Load more commits (infinite scroll / pagination)
  const handleLoadMore = async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const res = await getCommitLog(rootPath, {
        all_branches: allBranches,
        filter_author: null,
        filter_query: filterText.trim() ? filterText.trim() : null,
        skip: commits.length,
        limit: 100,
      });
      setCommits((prev) => [...prev, ...res.commits]);
      setHasMore(res.has_more);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoadingMore(false);
    }
  };

  // Fetch commit details when selectedOid changes
  useEffect(() => {
    if (!selectedOid) return;

    let canceled = false;
    getCommitDetails(rootPath, selectedOid)
      .then((det) => {
        if (canceled) return;
        setDetails(det);
        setDetailsLoading(false);
        if (det.files.length > 0) {
          const first = det.files[0].path;
          setSelectedFile(first);
          loadDiff(selectedOid, first);
        } else {
          setSelectedFile(null);
          setDiff(null);
        }
      })
      .catch((err: unknown) => {
        if (canceled) return;
        setError(err instanceof Error ? err.message : String(err));
        setDetails(null);
        setDetailsLoading(false);
      });

    return () => {
      canceled = true;
    };
  }, [rootPath, selectedOid, loadDiff]);

  const handleSelectCommit = (oid: string) => {
    if (oid === selectedOid) return;
    setSelectedOid(oid);
    setDetailsLoading(true);
  };

  const handleSelectFile = (filePath: string) => {
    setSelectedFile(filePath);
    if (selectedOid) {
      loadDiff(selectedOid, filePath);
    }
  };

  // Calculate max lane column for SVG sizing
  const maxCol = commits.reduce((max, c) => Math.max(max, c.col), 0);

  // Close context menu on outside click
  useEffect(() => {
    const handleClick = () => setContextMenu(null);
    window.addEventListener("click", handleClick);
    return () => window.removeEventListener("click", handleClick);
  }, []);

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-[var(--color-bg)] select-none text-xs text-[var(--color-text)]">
      {/* Top Filter & Scope Toolbar */}
      <div className="h-[38px] px-3 border-b border-[var(--color-border)] bg-[var(--color-surface)] flex items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-2">
          {/* Scope switch: All branches vs Current branch (R-10) */}
          <div className="flex items-center rounded border border-[var(--color-border)] bg-[var(--color-bg)] p-0.5 text-[11px]">
            <button
              type="button"
              onClick={() => setAllBranches(true)}
              className={`px-2 py-0.5 rounded font-medium transition-colors cursor-pointer ${
                allBranches
                  ? "bg-[var(--color-surface)] text-[var(--color-accent)] shadow-2xs"
                  : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
              }`}
            >
              全部分支
            </button>
            <button
              type="button"
              onClick={() => setAllBranches(false)}
              className={`px-2 py-0.5 rounded font-medium transition-colors cursor-pointer ${
                !allBranches
                  ? "bg-[var(--color-surface)] text-[var(--color-accent)] shadow-2xs"
                  : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
              }`}
            >
              当前分支
            </button>
          </div>

          {/* Search Filter (R-10 / AT-10b) */}
          <div className="relative w-64">
            <input
              type="text"
              placeholder="过滤 作者 / 标题 / 哈希..."
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              className="w-full px-2.5 py-1 rounded border border-[var(--color-border)] bg-[var(--color-bg)] text-xs focus:outline-none focus:border-[var(--color-accent)] select-text font-mono"
            />
            {filterText && (
              <button
                type="button"
                onClick={() => setFilterText("")}
                className="absolute right-2 top-1.5 text-[var(--color-text-muted)] hover:text-[var(--color-text)] cursor-pointer"
              >
                <CloseIcon width={12} height={12} />
              </button>
            )}
          </div>
        </div>

        {/* Right Info & Refresh */}
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-[var(--color-text-muted)] font-mono">
            {commits.length} 条提交
          </span>
          <button
            type="button"
            title="刷新历史日志"
            onClick={handleRefresh}
            disabled={loading}
            className="p-1 rounded hover:bg-[var(--color-surface-raised)] text-[var(--color-text-muted)] hover:text-[var(--color-text)] cursor-pointer"
          >
            <RefreshIcon width={13} height={13} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {/* Error alert */}
      {error && (
        <div className="px-3 py-1.5 bg-[var(--color-danger)]/15 border-b border-[var(--color-danger)]/30 text-xs text-[var(--color-danger)] flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <AlertCircleIcon width={13} height={13} />
            <span>{error}</span>
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

      {/* Main Split Content: Log Table (Left) & Details Panel (Right) */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: Commit Graph List */}
        <div className="flex-1 flex flex-col border-r border-[var(--color-border)] overflow-hidden">
          {/* Table Header */}
          <div className="h-7 px-3 border-b border-[var(--color-border)] bg-[var(--color-surface)] text-[11px] font-semibold text-[var(--color-text-muted)] flex items-center shrink-0">
            <div className="w-16">图形</div>
            <div className="flex-1">提交信息</div>
            <div className="w-24 text-right">作者</div>
            <div className="w-24 text-right">日期</div>
            <div className="w-18 text-right font-mono">SHA</div>
          </div>

          {/* Table Rows List */}
          <div className="flex-1 overflow-y-auto">
            {loading && commits.length === 0 ? (
              <div className="py-12 text-center text-[var(--color-text-muted)]">
                加载提交历史中...
              </div>
            ) : commits.length === 0 ? (
              <div className="py-12 text-center text-[var(--color-text-muted)]">
                没有匹配的提交记录
              </div>
            ) : (
              commits.map((commit) => {
                const isSelected = commit.oid === selectedOid;
                const formattedDate = formatDate(commit.timestamp);

                return (
                  <div
                    key={commit.oid}
                    onClick={() => handleSelectCommit(commit.oid)}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      setContextMenu({
                        x: e.clientX,
                        y: e.clientY,
                        commit,
                      });
                    }}
                    className={`h-[28px] px-3 flex items-center border-b border-[var(--color-border)]/30 cursor-pointer font-mono text-[11px] transition-colors ${
                      isSelected
                        ? "bg-[var(--color-accent)]/15 text-[var(--color-text)] font-medium"
                        : "hover:bg-[var(--color-surface-raised)] text-[var(--color-text)]"
                    }`}
                  >
                    {/* Graph Lane Cell */}
                    <div className="w-16 shrink-0 flex items-center overflow-visible">
                      <LogGraphLane
                        col={commit.col}
                        edges={commit.edges}
                        maxCol={maxCol}
                      />
                    </div>

                    {/* Commit summary & Ref Badges */}
                    <div className="flex-1 flex items-center gap-1.5 overflow-hidden pr-2">
                      {/* Ref Badges (HEAD, Branches, Tags) */}
                      {commit.refs.map((r, i) => (
                        <span
                          key={i}
                          className={`px-1.5 py-0.2 rounded text-[10px] font-sans font-medium shrink-0 ${getRefBadgeClass(
                            r
                          )}`}
                        >
                          {r.name}
                        </span>
                      ))}

                      {/* Summary */}
                      <span className="truncate font-sans font-normal text-[11px]">
                        {commit.summary}
                      </span>
                    </div>

                    {/* Author Name */}
                    <div className="w-24 shrink-0 text-right text-[11px] text-[var(--color-text-muted)] truncate font-sans">
                      {commit.author_name}
                    </div>

                    {/* Date */}
                    <div className="w-24 shrink-0 text-right text-[10px] text-[var(--color-text-muted)] font-mono">
                      {formattedDate}
                    </div>

                    {/* Short SHA */}
                    <div className="w-18 shrink-0 text-right text-[11px] font-mono opacity-70">
                      {commit.short_oid}
                    </div>
                  </div>
                );
              })
            )}

            {/* Load More Button / Indicator */}
            {hasMore && (
              <div className="p-3 text-center">
                <button
                  type="button"
                  onClick={handleLoadMore}
                  disabled={loadingMore}
                  className="px-3 py-1 rounded border border-[var(--color-border)] bg-[var(--color-surface)] hover:bg-[var(--color-surface-raised)] text-[11px] cursor-pointer"
                >
                  {loadingMore ? "加载中..." : "加载更多历史提交"}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Right: Commit Details & Read-only Diff (S4 / AT-10c) */}
        <div className="w-[420px] flex flex-col bg-[var(--color-surface)] shrink-0 overflow-hidden">
          {detailsLoading ? (
            <div className="p-6 text-center text-[var(--color-text-muted)]">
              读取提交详情...
            </div>
          ) : details ? (
            <div className="flex-1 flex flex-col h-full overflow-hidden">
              {/* Commit Meta Header */}
              <div className="p-3 border-b border-[var(--color-border)] space-y-2 shrink-0 bg-[var(--color-bg)]/30">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-xs text-[var(--color-text)]">
                      提交 {details.short_oid}
                    </span>
                    {onOpenInteractiveRebase && (
                      <button
                        type="button"
                        onClick={() => {
                          const baseOid =
                            details.parents.length > 0
                              ? details.parents[0]
                              : details.oid;
                          const summary = details.message.split("\n")[0];
                          onOpenInteractiveRebase(baseOid, summary);
                        }}
                        className="px-2 py-0.5 rounded border border-[var(--color-border)] bg-[var(--color-surface-raised)] hover:bg-[var(--color-bg)] text-[10px] text-[var(--color-text)] flex items-center gap-1 cursor-pointer transition-colors"
                        title="从此提交开始交互式变基"
                      >
                        <BranchIcon width={11} height={11} className="text-[var(--color-accent)]" />
                        <span>交互式变基</span>
                      </button>
                    )}
                  </div>
                  <span className="font-mono text-[10px] text-[var(--color-text-muted)]">
                    {formatFullDate(details.author_timestamp)}
                  </span>
                </div>

                <div className="text-[11px] text-[var(--color-text-muted)]">
                  作者：<span className="text-[var(--color-text)]">{details.author_name}</span> &lt;
                  {details.author_email}&gt;
                </div>

                {/* Full Message */}
                <div className="p-2 rounded bg-[var(--color-bg)] border border-[var(--color-border)] font-sans text-[11px] whitespace-pre-wrap max-h-28 overflow-y-auto select-text leading-relaxed">
                  {details.message}
                </div>
              </div>

              {/* Changed Files List */}
              <div className="max-h-40 overflow-y-auto border-b border-[var(--color-border)] shrink-0 p-2 space-y-0.5">
                <div className="px-1 text-[10px] font-semibold text-[var(--color-text-muted)] uppercase">
                  改动文件 ({details.files.length})
                </div>
                {details.files.map((file) => (
                  <div
                    key={file.path}
                    className={`group w-full flex items-center justify-between px-2 py-1 rounded font-mono text-[11px] transition-colors ${
                      selectedFile === file.path
                        ? "bg-[var(--color-accent)]/15 text-[var(--color-accent)] font-semibold"
                        : "hover:bg-[var(--color-surface-raised)] text-[var(--color-text)]"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => handleSelectFile(file.path)}
                      className="flex-1 flex items-center gap-1.5 truncate text-left cursor-pointer"
                    >
                      <FileIcon width={12} height={12} className="shrink-0 text-[var(--color-text-muted)]" />
                      <span className="truncate">{file.path}</span>
                    </button>
                    <div className="flex items-center gap-1 shrink-0">
                      {onOpenFileHistory && (
                        <button
                          type="button"
                          title="查看文件提交历史"
                          onClick={(e) => {
                            e.stopPropagation();
                            onOpenFileHistory(file.path);
                          }}
                          className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-[var(--color-surface)] text-[var(--color-text-muted)] hover:text-[var(--color-accent)] transition-opacity cursor-pointer"
                        >
                          <HistoryIcon width={11} height={11} />
                        </button>
                      )}
                      <span
                        className={`text-[10px] font-bold ${
                          file.kind === "Added"
                            ? "text-[var(--color-status-added)]"
                            : file.kind === "Deleted"
                            ? "text-[var(--color-danger)]"
                            : "text-[var(--color-status-modified)]"
                        }`}
                      >
                        {file.kind === "Added"
                          ? "A"
                          : file.kind === "Deleted"
                          ? "D"
                          : file.kind === "Renamed"
                          ? "R"
                          : "M"}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Read-only Diff View for Selected File */}
              <div className="flex-1 overflow-hidden flex flex-col bg-[var(--color-bg)]">
                {diffLoading ? (
                  <div className="p-6 text-center text-[var(--color-text-muted)]">
                    读取 diff...
                  </div>
                ) : diff ? (
                  <DiffViewer diff={diff} loading={false} error={null} />
                ) : (
                  <div className="flex-1 flex items-center justify-center text-[var(--color-text-muted)] text-[11px]">
                    选择上方文件查看只读 diff
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center text-[var(--color-text-muted)] text-xs">
              在左侧选择一条提交查看详情
            </div>
          )}
        </div>
      </div>

      {/* Right-click Context Menu */}
      {contextMenu && (
        <div
          style={{ top: contextMenu.y, left: contextMenu.x }}
          className="fixed z-50 w-56 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] shadow-lg py-1 text-xs select-none"
        >
          <button
            type="button"
            onClick={() => {
              navigator.clipboard?.writeText(contextMenu.commit.oid);
              setContextMenu(null);
            }}
            className="w-full text-left px-3 py-1.5 hover:bg-[var(--color-surface-raised)] cursor-pointer text-[var(--color-text)]"
          >
            复制哈希 ({contextMenu.commit.short_oid})
          </button>
          <button
            type="button"
            onClick={() => {
              onOpenCreateBranch(contextMenu.commit.oid);
              setContextMenu(null);
            }}
            className="w-full text-left px-3 py-1.5 hover:bg-[var(--color-surface-raised)] cursor-pointer text-[var(--color-text)]"
          >
            从这里新建分支...
          </button>
          {onOpenCreateTag && (
            <button
              type="button"
              onClick={() => {
                onOpenCreateTag(contextMenu.commit.oid);
                setContextMenu(null);
              }}
              className="w-full text-left px-3 py-1.5 hover:bg-[var(--color-surface-raised)] cursor-pointer text-[var(--color-text)]"
            >
              从这里新建标签...
            </button>
          )}
          {onOpenInteractiveRebase && (
            <button
              type="button"
              onClick={() => {
                const baseOid =
                  contextMenu.commit.parents.length > 0
                    ? contextMenu.commit.parents[0]
                    : contextMenu.commit.oid;
                onOpenInteractiveRebase(baseOid, contextMenu.commit.summary);
                setContextMenu(null);
              }}
              className="w-full text-left px-3 py-1.5 hover:bg-[var(--color-surface-raised)] cursor-pointer text-[var(--color-text)] flex items-center gap-1.5"
            >
              <BranchIcon width={13} height={13} className="text-[var(--color-accent)]" />
              <span>从此处交互式变基 (Interactive Rebase)...</span>
            </button>
          )}
          <div className="h-px bg-[var(--color-border)] my-1" />
          <button
            type="button"
            onClick={async () => {
              const oid = contextMenu.commit.oid;
              setContextMenu(null);
              try {
                await checkoutCommit(rootPath, oid);
                onRefreshRepo?.();
              } catch (e) {
                setError(e instanceof Error ? e.message : String(e));
              }
            }}
            className="w-full text-left px-3 py-1.5 hover:bg-[var(--color-surface-raised)] cursor-pointer text-[var(--color-text)]"
          >
            检出此提交 (分离 HEAD)
          </button>
          <button
            type="button"
            onClick={async () => {
              const oid = contextMenu.commit.oid;
              setContextMenu(null);
              try {
                await resetToCommit(rootPath, oid, "soft");
                onRefreshRepo?.();
              } catch (e) {
                setError(e instanceof Error ? e.message : String(e));
              }
            }}
            className="w-full text-left px-3 py-1.5 hover:bg-[var(--color-surface-raised)] cursor-pointer text-[var(--color-text)]"
          >
            重置当前分支到这里 (Soft 保留暂存区)
          </button>
          <button
            type="button"
            onClick={async () => {
              const oid = contextMenu.commit.oid;
              setContextMenu(null);
              try {
                await resetToCommit(rootPath, oid, "mixed");
                onRefreshRepo?.();
              } catch (e) {
                setError(e instanceof Error ? e.message : String(e));
              }
            }}
            className="w-full text-left px-3 py-1.5 hover:bg-[var(--color-surface-raised)] cursor-pointer text-[var(--color-text)]"
          >
            重置当前分支到这里 (Mixed 移出暂存区)
          </button>
        </div>
      )}
    </div>
  );
}

function formatDate(timestamp: number): string {
  const date = new Date(timestamp * 1000);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 3600 * 24));

  if (diffDays === 0) {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } else if (diffDays === 1) {
    return "昨天";
  } else {
    return `${date.getMonth() + 1}-${date.getDate() < 10 ? "0" : ""}${date.getDate()}`;
  }
}

function formatFullDate(timestamp: number): string {
  const d = new Date(timestamp * 1000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(
    d.getMinutes()
  ).padStart(2, "0")}`;
}

function getRefBadgeClass(badge: RefBadge): string {
  switch (badge.kind) {
    case "Head":
      return "bg-[var(--color-status-added)]/15 text-[var(--color-status-added)] border border-[var(--color-status-added)]/30";
    case "LocalBranch":
      return "bg-[var(--color-accent)]/15 text-[var(--color-accent)] border border-[var(--color-accent)]/30";
    case "RemoteBranch":
      return "bg-purple-500/15 text-purple-400 border border-purple-500/30";
    case "Tag":
      return "bg-amber-500/15 text-amber-400 border border-amber-500/30";
    default:
      return "bg-[var(--color-surface-raised)] text-[var(--color-text-muted)]";
  }
}
