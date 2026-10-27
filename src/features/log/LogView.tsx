import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  getCommitLog,
  getCommitDetails,
  getCommitFileDiff,
  checkoutCommit,
  resetToCommit,
  aiSearchLog,
  getAiKeyStatus,
  type LogCommit,
  type CommitDetails,
  type FileDiff,
  type RefBadge,
  type AiSettings,
  type AiLogQueryResult,
  type AiLogMatch,
} from "../../lib/host";
import { LogGraphLane } from "./LogGraphLane";
import { computeGraphTopology } from "./graphTopology";
import { DiffViewer } from "../changes/DiffViewer";
import {
  RefreshIcon,
  CloseIcon,
  AlertCircleIcon,
  FileIcon,
  HistoryIcon,
  BranchIcon,
  SparklesIcon,
} from "../../components/icons";
import { FilePathLabel } from "../../components/FilePathLabel";

interface LogViewProps {
  rootPath: string;
  onOpenCreateBranch: (oid: string) => void;
  onOpenCreateTag?: (oid: string) => void;
  onOpenFileHistory?: (filePath: string) => void;
  onOpenInteractiveRebase?: (baseOid: string, baseSummary?: string) => void;
  onRefreshRepo?: () => void;
  initialSelectedOid?: string | null;
  onOpenHistoryTools?: (oid: string) => void;
}

export function LogView({
  rootPath,
  onOpenCreateBranch,
  onOpenCreateTag,
  onOpenFileHistory,
  onOpenInteractiveRebase,
  onRefreshRepo,
  initialSelectedOid, onOpenHistoryTools,
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
  const [selectedOid, setSelectedOid] = useState<string | null>(initialSelectedOid || null);
  const [details, setDetails] = useState<CommitDetails | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);

  // AI Log Search state
  const [aiSearchOpen, setAiSearchOpen] = useState(false);
  const [aiQuery, setAiQuery] = useState("");
  const [aiSearching, setAiSearching] = useState(false);
  const [aiQueryResult, setAiQueryResult] = useState<AiLogQueryResult | null>(null);
  const [filterMatchedOnly, setFilterMatchedOnly] = useState(false);

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

  // Right details panel sizing (resizable splitter)
  const [detailsWidth, setDetailsWidth] = useState<number>(() => {
    try {
      const saved = localStorage.getItem("tongyun_log_details_width");
      return saved ? Math.max(300, Math.min(1200, parseInt(saved, 10))) : 480;
    } catch {
      return 480;
    }
  });
  const isResizingDetailsRef = useRef(false);
  const [isDraggingSplitter, setIsDraggingSplitter] = useState(false);

  // Table column widths resizing state (persisted)
  const [authorColWidth, setAuthorColWidth] = useState<number>(() => {
    try {
      const saved = localStorage.getItem("tongyun_log_col_author_width");
      return saved ? Math.max(60, Math.min(300, parseInt(saved, 10))) : 100;
    } catch {
      return 100;
    }
  });

  const [dateColWidth, setDateColWidth] = useState<number>(() => {
    try {
      const saved = localStorage.getItem("tongyun_log_col_date_width");
      return saved ? Math.max(60, Math.min(240, parseInt(saved, 10))) : 95;
    } catch {
      return 95;
    }
  });

  const [shaColWidth, setShaColWidth] = useState<number>(() => {
    try {
      const saved = localStorage.getItem("tongyun_log_col_sha_width");
      return saved ? Math.max(55, Math.min(200, parseInt(saved, 10))) : 72;
    } catch {
      return 72;
    }
  });

  // Column resize handler
  const handleStartColResize = (
    colKey: "author" | "date" | "sha",
    e: React.MouseEvent
  ) => {
    e.preventDefault();
    e.stopPropagation();

    const startX = e.clientX;
    const initialWidth =
      colKey === "author"
        ? authorColWidth
        : colKey === "date"
        ? dateColWidth
        : shaColWidth;

    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const delta = moveEvent.clientX - startX;
      if (colKey === "author") {
        const next = Math.max(60, Math.min(300, initialWidth + delta));
        setAuthorColWidth(next);
      } else if (colKey === "date") {
        const next = Math.max(60, Math.min(240, initialWidth + delta));
        setDateColWidth(next);
      } else {
        const next = Math.max(55, Math.min(200, initialWidth + delta));
        setShaColWidth(next);
      }
    };

    const handleMouseUp = (upEvent: MouseEvent) => {
      const delta = upEvent.clientX - startX;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";

      let finalW: number;
      if (colKey === "author") {
        finalW = Math.max(60, Math.min(300, initialWidth + delta));
        setAuthorColWidth(finalW);
      } else if (colKey === "date") {
        finalW = Math.max(60, Math.min(240, initialWidth + delta));
        setDateColWidth(finalW);
      } else {
        finalW = Math.max(55, Math.min(200, initialWidth + delta));
        setShaColWidth(finalW);
      }

      try {
        localStorage.setItem(`tongyun_log_col_${colKey}_width`, finalW.toString());
      } catch {
        // Storage failure ignored
      }

      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  };

  const handleResetColWidth = (colKey: "author" | "date" | "sha") => {
    const defaultW = colKey === "author" ? 100 : colKey === "date" ? 95 : 72;
    if (colKey === "author") setAuthorColWidth(defaultW);
    else if (colKey === "date") setDateColWidth(defaultW);
    else setShaColWidth(defaultW);

    try {
      localStorage.setItem(`tongyun_log_col_${colKey}_width`, defaultW.toString());
    } catch {
      // Storage failure ignored
    }
  };

  // Resize handler for log details panel
  const handleMouseDownResize = (e: React.MouseEvent) => {
    e.preventDefault();
    isResizingDetailsRef.current = true;
    setIsDraggingSplitter(true);
    const startX = e.clientX;
    const startWidth = detailsWidth;

    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!isResizingDetailsRef.current) return;
      const delta = startX - moveEvent.clientX;
      const newWidth = Math.max(280, Math.min(1200, startWidth + delta));
      setDetailsWidth(newWidth);
    };

    const handleMouseUp = (upEvent: MouseEvent) => {
      isResizingDetailsRef.current = false;
      setIsDraggingSplitter(false);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";

      const delta = startX - upEvent.clientX;
      const finalWidth = Math.max(280, Math.min(1200, startWidth + delta));
      try {
        localStorage.setItem("tongyun_log_details_width", finalWidth.toString());
      } catch {
        // Storage failure ignored
      }
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  };

  const handleDoubleClickSplitter = () => {
    setDetailsWidth(480);
    try {
      localStorage.setItem("tongyun_log_details_width", "480");
    } catch {
      // Storage failure ignored
    }
  };

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
            if (prev && (prev === initialSelectedOid || res.commits.some((c) => c.oid === prev))) {
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
  }, [rootPath, allBranches, filterText, initialSelectedOid]);

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
          if (prev && (prev === initialSelectedOid || res.commits.some((c) => c.oid === prev))) {
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

  // AI Settings getter
  const getAiSettings = (): AiSettings => {
    try {
      const stored = localStorage.getItem("tongyun_ai_settings");
      if (stored) {
        return JSON.parse(stored);
      }
    } catch {
      // ignore
    }
    return {
      provider: "kie",
      base_url: "https://api.kie.ai",
      model: "kie-default",
      language: "follow",
      conventional: false,
      timeout_seconds: 30,
      max_diff_chars: 20000,
      custom_secret_patterns: [],
      consented: false,
    };
  };

  // AI log query execution
  const handleAiSearch = async () => {
    const q = aiQuery.trim();
    if (!q) return;

    const settings = getAiSettings();
    try {
      const keyStatus = await getAiKeyStatus();
      if (settings.provider === "kie" && !keyStatus.kie) {
        setError("未配置 KIE 接口 key，请在设置中配置");
        return;
      }
      if (settings.provider === "openai" && !keyStatus.openai) {
        setError("未配置 OpenAI 接口 key，请在设置中配置");
        return;
      }

      setAiSearching(true);
      setError(null);
      const res = await aiSearchLog(rootPath, q, settings);
      setAiQueryResult(res);
      if (res.matched_oids.length > 0) {
        const firstOid = res.matched_oids[0].oid;
        if (commits.some((c) => c.oid === firstOid)) {
          setSelectedOid(firstOid);
          setDetailsLoading(true);
        }
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setAiSearching(false);
    }
  };

  // AI Matches lookup map
  const matchedCommitMap = useMemo(() => {
    if (!aiQueryResult) return new Map<string, AiLogMatch>();
    const map = new Map<string, AiLogMatch>();
    for (const m of aiQueryResult.matched_oids) {
      map.set(m.oid, m);
    }
    return map;
  }, [aiQueryResult]);

  // Filtered commits for display
  const displayCommits = useMemo(() => {
    if (!filterMatchedOnly || !aiQueryResult) return commits;
    return commits.filter((c) => matchedCommitMap.has(c.oid));
  }, [commits, filterMatchedOnly, aiQueryResult, matchedCommitMap]);

  // Calculate continuous graph lane topology
  const graphTopology = useMemo(
    () => computeGraphTopology(displayCommits),
    [displayCommits]
  );

  // Calculate max lane column for SVG sizing
  const maxCol = useMemo(() => {
    return graphTopology.reduce((max, r) => Math.max(max, r.maxCol), 0);
  }, [graphTopology]);

  // Dynamic width for graph column to prevent clipping on multiple branches
  const graphColWidth = Math.max(64, (maxCol + 1) * 14 + 16);

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

          {/* AI 问历史切换按钮 */}
          <button
            type="button"
            onClick={() => {
              setAiSearchOpen((prev) => !prev);
            }}
            className={`px-2.5 py-1 rounded text-[11px] font-medium flex items-center gap-1.5 transition-all cursor-pointer ${
              aiSearchOpen
                ? "bg-[var(--ty-sky-tint)] text-[var(--ty-sky)] border border-[var(--ty-sky)]/40 shadow-xs"
                : "bg-[var(--color-bg)] text-[var(--color-text-muted)] border border-[var(--color-border)] hover:text-[var(--ty-sky)] hover:border-[var(--ty-sky)]/40"
            }`}
            title="使用自然语言向 AI 提问 Git 历史（例如：上次改支付配置是什么时候？）"
          >
            <SparklesIcon width={12} height={12} className={aiSearchOpen ? "text-[var(--ty-sky)] animate-pulse" : ""} />
            <span>AI 问历史</span>
          </button>
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

      {/* AI Log Search Input Bar */}
      {aiSearchOpen && (
        <div className="px-3 py-2 border-b border-[var(--ty-sky)]/30 bg-[var(--ty-sky-tint)]/30 flex items-center gap-2 shrink-0">
          <div className="relative flex-1 flex items-center">
            <SparklesIcon width={14} height={14} className="absolute left-2.5 text-[var(--ty-sky)] shrink-0" />
            <input
              type="text"
              placeholder="用自然语言提问历史，例如：'上次修改支付配置是什么时候谁改的？' 或 '查找关于权限拦截器的提交'..."
              value={aiQuery}
              onChange={(e) => setAiQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !aiSearching) {
                  handleAiSearch();
                }
              }}
              className="w-full pl-8 pr-8 py-1 rounded border border-[var(--ty-sky)]/30 bg-[var(--color-bg)] text-xs focus:outline-none focus:border-[var(--ty-sky)] select-text font-sans placeholder:text-[var(--color-text-muted)]"
            />
            {aiQuery && (
              <button
                type="button"
                onClick={() => setAiQuery("")}
                className="absolute right-2 text-[var(--color-text-muted)] hover:text-[var(--color-text)] cursor-pointer"
              >
                <CloseIcon width={12} height={12} />
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={handleAiSearch}
            disabled={aiSearching || !aiQuery.trim()}
            className="px-3 py-1 rounded bg-[var(--ty-sky)] hover:opacity-90 disabled:opacity-50 text-white font-medium text-xs flex items-center gap-1.5 cursor-pointer shrink-0 transition-opacity shadow-2xs"
          >
            {aiSearching ? (
              <>
                <RefreshIcon width={12} height={12} className="animate-spin" />
                <span>分析提交中...</span>
              </>
            ) : (
              <>
                <SparklesIcon width={12} height={12} />
                <span>提问</span>
              </>
            )}
          </button>
        </div>
      )}

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
          {/* AI 答案横幅卡片 */}
          {aiQueryResult && (
            <div className="p-3 border-b border-[var(--ty-sky)]/30 bg-[var(--ty-sky-tint)]/25 shrink-0 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-1.5 font-semibold text-xs text-[var(--ty-sky)]">
                  <SparklesIcon width={13} height={13} className="text-[var(--ty-sky)]" />
                  <span>AI 历史洞察解答</span>
                </div>
                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-1 text-[11px] text-[var(--color-text-muted)] cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={filterMatchedOnly}
                      onChange={(e) => setFilterMatchedOnly(e.target.checked)}
                      className="rounded border-[var(--color-border)] accent-[var(--ty-sky)] focus:ring-0 cursor-pointer"
                    />
                    <span>仅看匹配提交 ({aiQueryResult.matched_oids.length})</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setAiQueryResult(null);
                      setFilterMatchedOnly(false);
                    }}
                    className="text-[var(--color-text-muted)] hover:text-[var(--color-text)] p-0.5 cursor-pointer"
                    title="关闭 AI 洞察结果"
                  >
                    <CloseIcon width={12} height={12} />
                  </button>
                </div>
              </div>
              <div className="text-[11px] text-[var(--color-text)] leading-relaxed whitespace-pre-wrap select-text bg-[var(--color-bg)]/60 p-2 rounded border border-[var(--ty-sky)]/20">
                {aiQueryResult.answer}
              </div>
              {aiQueryResult.matched_oids.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                  <span className="text-[10px] text-[var(--color-text-muted)]">相关提交：</span>
                  {aiQueryResult.matched_oids.map((m) => {
                    const isSelected = selectedOid === m.oid;
                    return (
                      <button
                        key={m.oid}
                        type="button"
                        onClick={() => handleSelectCommit(m.oid)}
                        className={`px-2 py-0.5 rounded text-[10px] font-mono flex items-center gap-1 cursor-pointer transition-colors ${
                          isSelected
                            ? "bg-[var(--ty-sky)] text-white font-semibold"
                            : "bg-[var(--color-bg)] border border-[var(--ty-sky)]/30 text-[var(--ty-sky)] hover:bg-[var(--ty-sky-tint)]"
                        }`}
                        title={m.reason}
                      >
                        <span>{m.oid.slice(0, 7)}</span>
                        <span className="text-[9px] opacity-75">✨</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Table Header */}
          <div className="h-7 px-3 border-b border-[var(--color-border)] bg-[var(--color-surface)] text-[11px] font-semibold text-[var(--color-text-muted)] flex items-center shrink-0 select-none">
            <div style={{ width: `${graphColWidth}px` }} className="shrink-0">
              图形
            </div>
            <div className="flex-1 overflow-hidden pr-2">
              提交信息
            </div>

            {/* Author Header */}
            <div
              style={{ width: `${authorColWidth}px` }}
              className="relative shrink-0 text-right pr-2 group/col"
            >
              <span>作者</span>
              <div
                onMouseDown={(e) => handleStartColResize("author", e)}
                onDoubleClick={() => handleResetColWidth("author")}
                title="按住拖拽调整作者列宽（双击恢复默认 100px）"
                className="absolute -right-1 top-0 bottom-0 w-2.5 cursor-col-resize hover:bg-[var(--color-accent)]/50 active:bg-[var(--color-accent)] flex items-center justify-center z-10 select-none group-hover/col:opacity-100 opacity-0 transition-opacity"
              >
                <div className="w-[1px] h-3.5 bg-[var(--color-border-strong)]" />
              </div>
            </div>

            {/* Date Header */}
            <div
              style={{ width: `${dateColWidth}px` }}
              className="relative shrink-0 text-right pr-2 group/col"
            >
              <span>日期</span>
              <div
                onMouseDown={(e) => handleStartColResize("date", e)}
                onDoubleClick={() => handleResetColWidth("date")}
                title="按住拖拽调整日期列宽（双击恢复默认 95px）"
                className="absolute -right-1 top-0 bottom-0 w-2.5 cursor-col-resize hover:bg-[var(--color-accent)]/50 active:bg-[var(--color-accent)] flex items-center justify-center z-10 select-none group-hover/col:opacity-100 opacity-0 transition-opacity"
              >
                <div className="w-[1px] h-3.5 bg-[var(--color-border-strong)]" />
              </div>
            </div>

            {/* SHA Header */}
            <div
              style={{ width: `${shaColWidth}px` }}
              className="relative shrink-0 text-right font-mono pr-1 group/col"
            >
              <span>SHA</span>
              <div
                onMouseDown={(e) => handleStartColResize("sha", e)}
                onDoubleClick={() => handleResetColWidth("sha")}
                title="按住拖拽调整 SHA 列宽（双击恢复默认 72px）"
                className="absolute -right-1 top-0 bottom-0 w-2.5 cursor-col-resize hover:bg-[var(--color-accent)]/50 active:bg-[var(--color-accent)] flex items-center justify-center z-10 select-none group-hover/col:opacity-100 opacity-0 transition-opacity"
              >
                <div className="w-[1px] h-3.5 bg-[var(--color-border-strong)]" />
              </div>
            </div>
          </div>

          {/* Table Rows List */}
          <div className="flex-1 overflow-y-auto">
            {loading && displayCommits.length === 0 ? (
              <div className="py-12 text-center text-[var(--color-text-muted)]">
                加载提交历史中...
              </div>
            ) : displayCommits.length === 0 ? (
              <div className="py-12 text-center text-[var(--color-text-muted)]">
                {filterMatchedOnly ? "没有匹配 AI 查询的提交记录" : "没有匹配的提交记录"}
              </div>
            ) : (
              displayCommits.map((commit, index) => {
                const isSelected = commit.oid === selectedOid;
                const formattedDate = formatDate(commit.timestamp);
                const matchInfo = matchedCommitMap.get(commit.oid);
                const rowInfo = graphTopology[index];

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
                        : matchInfo
                        ? "bg-[var(--ty-sky-tint)]/40 hover:bg-[var(--ty-sky-tint)]/60 text-[var(--color-text)]"
                        : "hover:bg-[var(--color-surface-raised)] text-[var(--color-text)]"
                    }`}
                  >
                    {/* Graph Lane Cell */}
                    <div
                      style={{ width: `${graphColWidth}px` }}
                      className="shrink-0 flex items-center overflow-hidden"
                    >
                      <LogGraphLane
                        col={commit.col}
                        edges={commit.edges}
                        maxCol={maxCol}
                        rowInfo={rowInfo}
                      />
                    </div>

                    {/* Commit summary & Ref Badges */}
                    <div className="flex-1 flex items-center gap-1.5 overflow-hidden pr-2">
                      {/* Ref Badges (Cleaned & Grouped to remove noise) */}
                      {(() => {
                        const badges = cleanRefBadges(commit.refs);
                        const visibleBadges = badges.slice(0, 2);
                        const hiddenCount = badges.length - visibleBadges.length;

                        return (
                          <>
                            {visibleBadges.map((b, i) => (
                              <span
                                key={i}
                                title={b.fullTitle}
                                className={`px-1.5 py-0.2 rounded text-[10px] font-sans font-medium shrink-0 max-w-[150px] truncate ${getRefBadgeClass(
                                  b.kind
                                )}`}
                              >
                                {b.label}
                              </span>
                            ))}
                            {hiddenCount > 0 && (
                              <span
                                title={badges.map((b) => b.fullTitle).join("\n")}
                                className="px-1 py-0.2 rounded text-[9px] font-sans font-medium shrink-0 bg-[var(--color-surface-raised)] border border-[var(--color-border)] text-[var(--color-text-muted)] cursor-help"
                              >
                                +{hiddenCount}
                              </span>
                            )}
                          </>
                        );
                      })()}

                      {/* AI Match Badge */}
                      {matchInfo && (
                        <span
                          className="px-1.5 py-0.2 rounded text-[10px] font-medium shrink-0 bg-[var(--ty-sky-tint)] text-[var(--ty-sky)] border border-[var(--ty-sky)]/30"
                          title={`AI匹配原因: ${matchInfo.reason}`}
                        >
                          ✨ AI匹配
                        </span>
                      )}

                      {/* Summary */}
                      <span className="truncate font-sans font-normal text-[11px]">
                        {commit.summary}
                      </span>
                    </div>

                    {/* Author Name */}
                    <div
                      style={{ width: `${authorColWidth}px` }}
                      className="shrink-0 text-right text-[11px] text-[var(--color-text-muted)] truncate font-sans pr-2"
                      title={commit.author_name}
                    >
                      {commit.author_name}
                    </div>

                    {/* Date */}
                    <div
                      style={{ width: `${dateColWidth}px` }}
                      className="shrink-0 text-right text-[10px] text-[var(--color-text-muted)] font-mono pr-2"
                      title={formattedDate}
                    >
                      {formattedDate}
                    </div>

                    {/* Short SHA */}
                    <div
                      style={{ width: `${shaColWidth}px` }}
                      className="shrink-0 text-right text-[11px] font-mono opacity-70 pr-1"
                      title={commit.oid}
                    >
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

        {/* Splitter Resize Handle */}
        <div
          onMouseDown={handleMouseDownResize}
          onDoubleClick={handleDoubleClickSplitter}
          title="拖动调整日志列表与代码详情宽度（双击恢复默认 480px）"
          className={`w-2 -ml-1 h-full cursor-col-resize z-20 shrink-0 select-none group relative transition-colors flex items-center justify-center ${
            isDraggingSplitter
              ? "bg-[var(--color-accent)]/40"
              : "hover:bg-[var(--color-accent)]/20"
          }`}
        >
          {/* 1px 细分割线 */}
          <div className="w-[1px] h-full bg-[var(--color-border)] group-hover:bg-[var(--color-accent)] transition-colors" />

          {/* 居中把手图标（3 个小抓手圆点） */}
          <div className="absolute top-1/2 -translate-y-1/2 w-1.5 h-7 rounded-full bg-[var(--color-surface-raised)] border border-[var(--color-border)] group-hover:border-[var(--color-accent)] group-hover:bg-[var(--color-accent)] flex flex-col items-center justify-center gap-0.5 opacity-80 group-hover:opacity-100 transition-all shadow-2xs">
            <div className="w-0.5 h-0.5 rounded-full bg-[var(--color-text-muted)] group-hover:bg-white" />
            <div className="w-0.5 h-0.5 rounded-full bg-[var(--color-text-muted)] group-hover:bg-white" />
            <div className="w-0.5 h-0.5 rounded-full bg-[var(--color-text-muted)] group-hover:bg-white" />
          </div>
        </div>

        {/* Right: Commit Details & Read-only Diff (S4 / AT-10c) */}
        <div
          style={{ width: `${detailsWidth}px` }}
          className="flex flex-col bg-[var(--color-surface)] shrink-0 overflow-hidden"
        >
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
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        const nextWidth = detailsWidth > 600 ? 480 : 800;
                        setDetailsWidth(nextWidth);
                        try {
                          localStorage.setItem("tongyun_log_details_width", nextWidth.toString());
                        } catch {
                          // Storage failure ignored
                        }
                      }}
                      className="px-1.5 py-0.5 rounded border border-[var(--color-border)] bg-[var(--color-surface)] hover:bg-[var(--color-surface-raised)] text-[10px] text-[var(--color-text-muted)] hover:text-[var(--color-text)] cursor-pointer transition-colors"
                      title={detailsWidth > 600 ? "恢复标准宽度 (480px)" : "宽屏模式查看代码 (800px)"}
                    >
                      {detailsWidth > 600 ? "标准宽度" : "宽屏看代码"}
                    </button>
                    <span className="font-mono text-[10px] text-[var(--color-text-muted)]">
                      {formatFullDate(details.author_timestamp)}
                    </span>
                  </div>
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
                      className="flex-1 flex items-center gap-1.5 truncate text-left cursor-pointer min-w-0"
                      title={file.old_path ? `${file.old_path} → ${file.path}` : file.path}
                    >
                      <FileIcon width={12} height={12} className="shrink-0 text-[var(--color-text-muted)]" />
                      <FilePathLabel
                        path={file.path}
                        oldPath={file.old_path}
                        isDeleted={file.kind === "Deleted"}
                      />
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
                        className={`text-[10px] font-bold px-1.5 py-0.2 rounded-full leading-none ${
                          file.kind === "Added"
                            ? "bg-[var(--color-status-added)]/12 text-[var(--color-status-added)]"
                            : file.kind === "Deleted"
                            ? "bg-[var(--color-status-deleted)]/12 text-[var(--color-status-deleted)]"
                            : file.kind === "Renamed"
                            ? "bg-[var(--color-status-renamed)]/12 text-[var(--color-status-renamed)]"
                            : "bg-[var(--color-status-modified)]/12 text-[var(--color-status-modified)]"
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
                  <DiffViewer diff={diff} loading={false} error={null} readOnly={true} />
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
          {onOpenHistoryTools && <button type="button" className="block w-full text-left px-3 py-2 hover:bg-[var(--color-surface-raised)] text-xs" onClick={() => { onOpenHistoryTools(contextMenu.commit.oid); setContextMenu(null); }}>应用、撤销或比较此提交…</button>}
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

export interface CleanedRefBadge {
  label: string;
  fullTitle: string;
  kind: "Head" | "LocalBranch" | "RemoteBranch" | "Tag" | "Other";
}

export function cleanRefBadges(refs: RefBadge[]): CleanedRefBadge[] {
  if (!refs || refs.length === 0) return [];

  const localBranches = new Set(
    refs.filter((r) => r.kind === "LocalBranch").map((r) => r.name)
  );

  const cleaned: CleanedRefBadge[] = [];

  for (const r of refs) {
    if (r.kind === "Head") {
      cleaned.push({
        label: "HEAD",
        fullTitle: "HEAD 检出指针",
        kind: "Head",
      });
    } else if (r.kind === "LocalBranch") {
      cleaned.push({
        label: r.name,
        fullTitle: `本地分支: ${r.name}`,
        kind: "LocalBranch",
      });
    } else if (r.kind === "RemoteBranch") {
      // 过滤与本地同名的冗余远程分支（如本地已显示 main，不再重复显示 origin/main）
      const shortName = r.name.replace(/^origin\//, "");
      if (localBranches.has(shortName)) {
        continue;
      }
      cleaned.push({
        label: r.name,
        fullTitle: `远程分支: ${r.name}`,
        kind: "RemoteBranch",
      });
    } else if (r.kind === "Tag") {
      cleaned.push({
        label: r.name,
        fullTitle: `标签: ${r.name}`,
        kind: "Tag",
      });
    } else {
      cleaned.push({
        label: r.name,
        fullTitle: r.name,
        kind: "Other",
      });
    }
  }

  return cleaned;
}

function getRefBadgeClass(badgeKind: string): string {
  switch (badgeKind) {
    case "Head":
      return "bg-[var(--color-status-added)]/15 text-[var(--color-status-added)] border border-[var(--color-status-added)]/30";
    case "LocalBranch":
      return "bg-[var(--color-accent)]/15 text-[var(--color-accent)] border border-[var(--color-accent)]/30";
    case "RemoteBranch":
      return "bg-[var(--ty-sky-tint)] text-[var(--ty-sky)] border border-[var(--ty-sky)]/30";
    case "Tag":
      return "bg-[var(--ty-honey-tint)] text-[var(--ty-honey)] border border-[var(--ty-honey)]/30";
    default:
      return "bg-[var(--color-surface-raised)] text-[var(--color-text-muted)]";
  }
}
