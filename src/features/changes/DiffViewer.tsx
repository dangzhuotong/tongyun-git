import { useState, useEffect, useRef, useMemo } from "react";
import type { FileDiff, DiffHunk, DiffLine } from "../../lib/host";
import type { DiffLayout } from "./types";
import {
  SplitIcon,
  UnifiedIcon,
  AlertCircleIcon,
} from "../../components/icons";
import { useDiffHighlighter, type HighlightToken } from "./highlighter";
import { computeIntraLineDiff, type TextRange } from "./intraLineDiff";
import { DiffLineContent } from "./DiffLineContent";

interface DiffViewerProps {
  diff: FileDiff | null;
  loading: boolean;
  error?: string | null;
  readOnly?: boolean;
  onDiscardHunkLines?: (hunkIndex: number, indices: number[]) => void;
  onStageHunkLines?: (
    hunkIndex: number,
    lineIndices: number[],
    reverse: boolean
  ) => Promise<void>;
}

export function DiffViewer({
  diff,
  loading,
  error = null,
  readOnly = false,
  onStageHunkLines,
  onDiscardHunkLines,
}: DiffViewerProps) {
  const [layout, setLayout] = useState<DiffLayout>(() => {
    return (localStorage.getItem("tongyun_diff_layout") as DiffLayout) || "unified";
  });
  const [ignoreWhitespace, setIgnoreWhitespace] = useState(false);
  const [forceLoadLarge, setForceLoadLarge] = useState(false);

  // Line selection: (hunkIndex, lineIndices)
  const [activeHunkIndex, setActiveHunkIndex] = useState<number | null>(null);
  const [selectedLineIndices, setSelectedLineIndices] = useState<Set<number>>(new Set());
  const [lastClickedIndex, setLastClickedIndex] = useState<number | null>(null);

  const tokensByHunk = useDiffHighlighter(diff);

  const setAndSaveLayout = (newLayout: DiffLayout) => {
    setLayout(newLayout);
    localStorage.setItem("tongyun_diff_layout", newLayout);
  };

  // Reset selection when diff changes (React recommended pattern)
  const [prevDiff, setPrevDiff] = useState(diff);
  if (prevDiff !== diff) {
    setPrevDiff(diff);
    setActiveHunkIndex(null);
    setSelectedLineIndices(new Set());
    setLastClickedIndex(null);
  }

  // Keyboard shortcut: 'a' selects all change lines in active/first hunk, ' ' stages/unstages selection
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (!diff || !onStageHunkLines || readOnly || diff.is_binary) return;
      const targetTag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (targetTag === "input" || targetTag === "textarea") return;

      // 'a' or 'A': Select all changed lines in active hunk
      if (e.key === "a" || e.key === "A") {
        e.preventDefault();
        const hunkIdx = activeHunkIndex != null ? activeHunkIndex : 0;
        const hunk = diff.hunks[hunkIdx];
        if (hunk) {
          const indices = new Set<number>();
          hunk.lines.forEach((l, idx) => {
            if (l.origin === "+" || l.origin === "-") {
              indices.add(idx);
            }
          });
          setActiveHunkIndex(hunkIdx);
          setSelectedLineIndices(indices);
        }
      }

      if (e.key.toLowerCase() === "d" && !diff.staged && activeHunkIndex != null && onDiscardHunkLines && !diff.is_crlf_change && !diff.old_path) {
        const selected = Array.from(selectedLineIndices).filter(i => ["+", "-"].includes(diff.hunks[activeHunkIndex].lines[i]?.origin));
        if (selected.length) { e.preventDefault(); onDiscardHunkLines(activeHunkIndex, selected); }
      }
      // Space: Stage or Unstage selected lines
      if (e.key === " " && activeHunkIndex != null && selectedLineIndices.size > 0) {
        e.preventDefault();
        onStageHunkLines(
          activeHunkIndex,
          Array.from(selectedLineIndices),
          diff.staged
        );
        setSelectedLineIndices(new Set());
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [diff, activeHunkIndex, selectedLineIndices, onStageHunkLines, onDiscardHunkLines, readOnly]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center p-8 text-xs text-[var(--color-text-muted)] bg-[var(--color-bg)] select-none">
        <p>正在计算 Diff...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center p-8 bg-[var(--color-bg)]">
        <div className="p-4 rounded border border-[var(--color-danger)]/30 bg-[var(--color-danger)]/5 text-xs text-[var(--color-danger)] flex items-center gap-2">
          <AlertCircleIcon width={16} height={16} className="shrink-0" />
          <span>{error}</span>
        </div>
      </div>
    );
  }

  if (!diff) {
    return (
      <div className="flex-1 flex items-center justify-center p-8 text-xs text-[var(--color-text-muted)] bg-[var(--color-bg)] select-none">
        <p>选择一个文件以查看 Diff</p>
      </div>
    );
  }

  const scopeLabel = diff.staged
    ? "已暂存改动 (Index 对比 HEAD)"
    : "未暂存改动 (工作区 对比 Index)";

  const handleLineClick = (hunkIdx: number, lineIdx: number, e: React.MouseEvent) => {
    if (activeHunkIndex !== hunkIdx) {
      setActiveHunkIndex(hunkIdx);
      setSelectedLineIndices(new Set([lineIdx]));
      setLastClickedIndex(lineIdx);
      return;
    }

    if (e.shiftKey && lastClickedIndex != null) {
      // Range selection
      const start = Math.min(lastClickedIndex, lineIdx);
      const end = Math.max(lastClickedIndex, lineIdx);
      const next = new Set(selectedLineIndices);
      for (let i = start; i <= end; i++) {
        next.add(i);
      }
      setSelectedLineIndices(next);
    } else {
      setSelectedLineIndices((prev) => {
        const next = new Set(prev);
        if (next.has(lineIdx)) {
          next.delete(lineIdx);
        } else {
          next.add(lineIdx);
        }
        return next;
      });
      setLastClickedIndex(lineIdx);
    }
  };

  const handleStageSelection = () => {
    if (activeHunkIndex != null && selectedLineIndices.size > 0 && onStageHunkLines) {
      onStageHunkLines(
        activeHunkIndex,
        Array.from(selectedLineIndices),
        diff.staged
      );
      setSelectedLineIndices(new Set());
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-[var(--color-bg)] overflow-hidden select-text">
      {/* Diff Toolbar */}
      <div className="h-[38px] flex items-center justify-between px-3.5 border-b border-[var(--color-border)] bg-[var(--color-surface)] ty-panel-header text-xs select-none">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-mono font-medium text-[var(--color-text)] truncate">
            {diff.old_path ? `${diff.old_path} → ${diff.path}` : diff.path}
          </span>
          <span className="px-2 py-0.5 rounded-md text-[11px] font-medium bg-[var(--ty-surface-sunken)] border border-[var(--color-border)]/70 text-[var(--color-text-muted)] shrink-0 shadow-2xs">
            {scopeLabel}
          </span>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {/* Staging Selection Button */}
          {selectedLineIndices.size > 0 && onStageHunkLines && !diff.is_binary && (
            <button
              type="button"
              onClick={handleStageSelection}
              className="px-3 py-1 rounded-lg bg-[var(--color-accent)] hover:bg-[var(--ty-matcha-hover)] text-white font-semibold transition-all flex items-center gap-1.5 shadow-xs hover:shadow-sm active:scale-[0.98] ty-btn-tactile text-xs cursor-pointer"
            >
              <span>{diff.staged ? "取消暂存所选" : "暂存所选"}</span>
              <span className="bg-white/20 px-1.5 py-0.2 rounded font-mono text-[10px]">
                {selectedLineIndices.size} 行
              </span>
            </button>
          )}

          {!readOnly && !diff.staged && !diff.is_binary && !diff.is_crlf_change && !diff.old_path && activeHunkIndex != null && selectedLineIndices.size > 0 && onDiscardHunkLines && (
            <button
              type="button"
              className="text-[var(--color-danger)] text-xs hover:underline cursor-pointer"
              onClick={() => onDiscardHunkLines(activeHunkIndex, Array.from(selectedLineIndices).filter(i => ["+", "-"].includes(diff.hunks[activeHunkIndex].lines[i]?.origin)))}
            >
              丢弃所选行
            </button>
          )}

          {/* Ignore Whitespace Toggle */}
          <label className="flex items-center gap-1.5 text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)] cursor-pointer select-none">
            <input
              type="checkbox"
              checked={ignoreWhitespace}
              onChange={(e) => setIgnoreWhitespace(e.target.checked)}
              className="rounded border-[var(--color-border)] accent-[var(--color-accent)] cursor-pointer"
            />
            <span>忽略空白</span>
          </label>

          {/* Layout Toggle */}
          <div className="flex items-center bg-[var(--ty-surface-sunken)] p-0.5 rounded-lg border border-[var(--color-border)] shadow-2xs">
            <button
              type="button"
              title="统一视图 (Unified)"
              onClick={() => setAndSaveLayout("unified")}
              className={`p-1 rounded-md transition-all ${
                layout === "unified"
                  ? "bg-[var(--color-surface)] text-[var(--color-text)] font-semibold shadow-xs border border-white/60 dark:border-white/5"
                  : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
              }`}
            >
              <UnifiedIcon width={13} height={13} />
            </button>
            <button
              type="button"
              title="左右分栏对比视图 (Split)"
              onClick={() => setAndSaveLayout("split")}
              className={`p-1 rounded-md transition-all ${
                layout === "split"
                  ? "bg-[var(--color-surface)] text-[var(--color-text)] font-semibold shadow-xs border border-white/60 dark:border-white/5"
                  : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
              }`}
            >
              <SplitIcon width={13} height={13} />
            </button>
          </div>
        </div>
      </div>

      {/* Notice Banners */}
      {diff.is_crlf_change && (
        <div className="px-4 py-2 bg-[var(--ty-honey-tint)] border-b border-[var(--color-border)] text-xs text-[var(--ty-honey)] flex items-center gap-2">
          <AlertCircleIcon width={14} height={14} className="shrink-0" />
          <span>文件仅换行符（CRLF ↔ LF）发生变化。</span>
        </div>
      )}

      {/* Main Diff Content Area */}
      <div
        className={`flex-1 font-mono [tab-size:4] text-[12px] leading-[20px] ${
          layout === "unified" ||
          diff.is_binary ||
          (diff.is_large && !forceLoadLarge) ||
          diff.hunks.length === 0
            ? "overflow-auto"
            : "overflow-hidden flex flex-col min-h-0"
        }`}
      >
        {diff.is_binary ? (
          <div className="p-8 text-center text-[var(--color-text-muted)] space-y-2">
            <p className="font-semibold text-sm text-[var(--color-text)]">二进制文件</p>
            <p className="text-xs">
              大小变化: {diff.old_size != null ? formatFileSize(diff.old_size) : "未知"} →{" "}
              {diff.new_size != null ? formatFileSize(diff.new_size) : "未知"}
            </p>
          </div>
        ) : diff.is_large && !forceLoadLarge ? (
          <div className="p-8 text-center text-[var(--color-text-muted)] space-y-3">
            <p className="font-semibold text-sm text-[var(--color-text)]">超大 Diff 变化</p>
            <p className="text-xs">
              该文件改动超过阈值（大于 1MB 或超过 5000 行），已暂停渲染。
            </p>
            <button
              type="button"
              onClick={() => setForceLoadLarge(true)}
              className="px-3 py-1.5 rounded bg-[var(--color-accent)] text-white text-xs font-medium hover:opacity-90"
            >
              仍然加载
            </button>
          </div>
        ) : diff.hunks.length === 0 ? (
          <div className="p-8 text-center text-[var(--color-text-muted)]">
            <p>该文件无内容改动或改动已被忽略。</p>
          </div>
        ) : layout === "unified" ? (
          <UnifiedDiffView
            hunks={diff.hunks}
            tokensByHunk={tokensByHunk}
            ignoreWhitespace={ignoreWhitespace}
            activeHunkIndex={activeHunkIndex}
            selectedLineIndices={selectedLineIndices}
            onLineClick={handleLineClick}
            onStageHunk={
              readOnly
                ? undefined
                : (hunkIdx) => {
                    if (onStageHunkLines) {
                      onStageHunkLines(hunkIdx, [], diff.staged);
                    }
                  }
            }
            staged={diff.staged}
          />
        ) : (
          <SplitDiffView
            hunks={diff.hunks}
            tokensByHunk={tokensByHunk}
            ignoreWhitespace={ignoreWhitespace}
            activeHunkIndex={activeHunkIndex}
            selectedLineIndices={selectedLineIndices}
            onLineClick={handleLineClick}
            onStageHunk={
              readOnly
                ? undefined
                : (hunkIdx) => {
                    if (onStageHunkLines) {
                      onStageHunkLines(hunkIdx, [], diff.staged);
                    }
                  }
            }
            staged={diff.staged}
          />
        )}
      </div>
    </div>
  );
}

function UnifiedDiffView({
  hunks,
  tokensByHunk,
  ignoreWhitespace,
  activeHunkIndex,
  selectedLineIndices,
  onLineClick,
  onStageHunk,
  staged,
}: {
  hunks: DiffHunk[];
  tokensByHunk: Record<number, HighlightToken[][]>;
  ignoreWhitespace: boolean;
  activeHunkIndex: number | null;
  selectedLineIndices: Set<number>;
  onLineClick: (hunkIdx: number, lineIdx: number, e: React.MouseEvent) => void;
  onStageHunk?: (hunkIdx: number) => void;
  staged: boolean;
}) {
  return (
    <div className="min-w-full w-max divide-y divide-[var(--color-border)]/40">
      {hunks.map((hunk, hunkIdx) => (
        <UnifiedHunkView
          key={hunkIdx}
          hunk={hunk}
          hunkIdx={hunkIdx}
          tokens={tokensByHunk[hunkIdx]}
          ignoreWhitespace={ignoreWhitespace}
          activeHunkIndex={activeHunkIndex}
          selectedLineIndices={selectedLineIndices}
          onLineClick={onLineClick}
          onStageHunk={onStageHunk}
          staged={staged}
        />
      ))}
    </div>
  );
}

function UnifiedHunkView({
  hunk,
  hunkIdx,
  tokens,
  ignoreWhitespace,
  activeHunkIndex,
  selectedLineIndices,
  onLineClick,
  onStageHunk,
  staged,
}: {
  hunk: DiffHunk;
  hunkIdx: number;
  tokens?: HighlightToken[][];
  ignoreWhitespace: boolean;
  activeHunkIndex: number | null;
  selectedLineIndices: Set<number>;
  onLineClick: (hunkIdx: number, lineIdx: number, e: React.MouseEvent) => void;
  onStageHunk?: (hunkIdx: number) => void;
  staged: boolean;
}) {
  const intraLineMap = useMemo(() => {
    const map = new Map<number, TextRange[]>();
    let i = 0;
    while (i < hunk.lines.length) {
      if (hunk.lines[i].origin === "-") {
        const dels: number[] = [];
        while (i < hunk.lines.length && hunk.lines[i].origin === "-") {
          dels.push(i);
          i++;
        }
        const adds: number[] = [];
        while (i < hunk.lines.length && hunk.lines[i].origin === "+") {
          adds.push(i);
          i++;
        }
        const pairCount = Math.min(dels.length, adds.length);
        for (let p = 0; p < pairCount; p++) {
          const dIdx = dels[p];
          const aIdx = adds[p];
          const res = computeIntraLineDiff(
            hunk.lines[dIdx].content,
            hunk.lines[aIdx].content
          );
          if (res.oldRanges.length > 0) map.set(dIdx, res.oldRanges);
          if (res.newRanges.length > 0) map.set(aIdx, res.newRanges);
        }
      } else {
        i++;
      }
    }
    return map;
  }, [hunk.lines]);

  return (
    <div className="w-full">
      {/* Hunk Header with Quick Hunk Stage Button */}
      <div className="h-[26px] w-full px-3.5 bg-[var(--ty-surface-sunken)]/60 text-[var(--color-text-muted)] text-[11px] font-mono border-y border-[var(--color-border)]/60 select-none flex items-center justify-between group">
        <span>{hunk.header}</span>
        {onStageHunk && (
          <button
            type="button"
            onClick={() => onStageHunk(hunkIdx)}
            className="opacity-0 group-hover:opacity-100 px-2 py-0.5 rounded-md bg-[var(--color-surface)] border border-[var(--color-border)]/70 hover:border-[var(--color-border)] text-[var(--color-text)] transition-all text-[10px] ty-btn-tactile shadow-2xs cursor-pointer"
          >
            {staged ? "取消暂存此块" : "暂存此块"}
          </button>
        )}
      </div>

      {/* Hunk Lines */}
      <div className="w-full">
        {hunk.lines.map((line, lineIdx) => {
          if (ignoreWhitespace && line.content.trim().length === 0) {
            return null;
          }

          const isAdd = line.origin === "+";
          const isDel = line.origin === "-";
          const isChangeLine = isAdd || isDel;
          const isSelected =
            activeHunkIndex === hunkIdx && selectedLineIndices.has(lineIdx);

          return (
            <div
              key={lineIdx}
              onClick={(e) => {
                if (isChangeLine) {
                  onLineClick(hunkIdx, lineIdx, e);
                }
              }}
              className={`flex h-[20px] items-center transition-colors cursor-pointer select-none w-full ${
                isSelected
                  ? "bg-[var(--color-selection)] ring-1 ring-inset ring-[var(--color-accent)]"
                  : isAdd
                  ? "bg-[var(--color-diff-add-bg)] text-[var(--color-text)]"
                  : isDel
                  ? "bg-[var(--color-diff-del-bg)] text-[var(--color-text)]"
                  : "bg-[var(--color-bg)] text-[var(--color-text)]"
              }`}
            >
              {/* Sticky Line Number / Gutter */}
              <div className="sticky left-0 flex items-center shrink-0 bg-inherit z-1 select-none">
                {/* Selection Indicator */}
                <span
                  className={`w-3 shrink-0 text-center text-[10px] ${
                    isSelected ? "text-[var(--color-accent)] font-bold" : "opacity-0"
                  }`}
                >
                  ●
                </span>
                {/* Old Line Number */}
                <span className="w-10 shrink-0 text-right pr-2 text-[var(--color-text-muted)] text-[11px] select-none opacity-60">
                  {line.old_lineno ?? ""}
                </span>
                {/* New Line Number */}
                <span className="w-10 shrink-0 text-right pr-2 text-[var(--color-text-muted)] text-[11px] select-none opacity-60">
                  {line.new_lineno ?? ""}
                </span>
                {/* Origin */}
                <span className="w-4 shrink-0 text-center font-bold select-none text-[var(--color-text-muted)]">
                  {line.origin}
                </span>
              </div>

              {/* Line Content */}
              <DiffLineContent
                tokens={tokens?.[lineIdx]}
                content={line.content}
                intraLineRanges={intraLineMap.get(lineIdx)}
                isAdd={isAdd}
                isDel={isDel}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SplitDiffView({
  hunks,
  tokensByHunk,
  ignoreWhitespace,
  activeHunkIndex,
  selectedLineIndices,
  onLineClick,
  onStageHunk,
  staged,
}: {
  hunks: DiffHunk[];
  tokensByHunk: Record<number, HighlightToken[][]>;
  ignoreWhitespace: boolean;
  activeHunkIndex: number | null;
  selectedLineIndices: Set<number>;
  onLineClick: (hunkIdx: number, lineIdx: number, e: React.MouseEvent) => void;
  onStageHunk?: (hunkIdx: number) => void;
  staged: boolean;
}) {
  const leftRef = useRef<HTMLDivElement>(null);
  const rightRef = useRef<HTMLDivElement>(null);
  const activeSide = useRef<"left" | "right" | null>(null);

  const setLeftActive = () => {
    activeSide.current = "left";
  };

  const setRightActive = () => {
    activeSide.current = "right";
  };

  const handleLeftScroll = () => {
    const left = leftRef.current;
    const right = rightRef.current;
    if (!left || !right) return;

    if (activeSide.current !== null && activeSide.current !== "left") {
      return;
    }

    if (right.scrollTop !== left.scrollTop) {
      right.scrollTop = left.scrollTop;
    }
    if (right.scrollLeft !== left.scrollLeft) {
      right.scrollLeft = left.scrollLeft;
    }
  };

  const handleRightScroll = () => {
    const left = leftRef.current;
    const right = rightRef.current;
    if (!left || !right) return;

    if (activeSide.current !== null && activeSide.current !== "right") {
      return;
    }

    if (left.scrollTop !== right.scrollTop) {
      left.scrollTop = right.scrollTop;
    }
    if (left.scrollLeft !== right.scrollLeft) {
      left.scrollLeft = right.scrollLeft;
    }
  };

  const hunkRowsList = useMemo(
    () => hunks.map((h) => alignSplitRows(h.lines, ignoreWhitespace)),
    [hunks, ignoreWhitespace]
  );

  const hunkRowDiffsList = useMemo(() => {
    return hunkRowsList.map((rows) => {
      return rows.map((row) => {
        if (
          row.left?.origin === "-" &&
          row.right?.origin === "+" &&
          row.left.content &&
          row.right.content
        ) {
          return computeIntraLineDiff(row.left.content, row.right.content);
        }
        return null;
      });
    });
  }, [hunkRowsList]);

  return (
    <div className="flex-1 min-h-0 h-full flex divide-x divide-[var(--color-border)]/60">
      {/* Left Column (Old / Base) */}
      <div
        ref={leftRef}
        onScroll={handleLeftScroll}
        onWheel={setLeftActive}
        onPointerDown={setLeftActive}
        onTouchStart={setLeftActive}
        onMouseEnter={setLeftActive}
        onKeyDown={setLeftActive}
        data-testid="diff-split-left"
        className="flex-1 h-full overflow-scroll"
      >
        <div className="min-w-full w-max divide-y divide-[var(--color-border)]/40">
          {hunks.map((hunk, hunkIdx) => {
            const rows = hunkRowsList[hunkIdx];
            const rowDiffs = hunkRowDiffsList[hunkIdx];
            return (
              <div key={hunkIdx} className="w-full">
                {/* Hunk Header (Left) */}
                <div className="h-[26px] w-full px-3.5 bg-[var(--ty-surface-sunken)]/60 text-[var(--color-text-muted)] text-[11px] font-mono border-y border-[var(--color-border)]/60 select-none flex items-center justify-between group">
                  <span>{hunk.header}</span>
                  {onStageHunk && (
                    <button
                      type="button"
                      onClick={() => onStageHunk(hunkIdx)}
                      className="opacity-0 group-hover:opacity-100 px-2 py-0.5 rounded-md bg-[var(--color-surface)] border border-[var(--color-border)]/70 hover:border-[var(--color-border)] text-[var(--color-text)] transition-all text-[10px] ty-btn-tactile shadow-2xs cursor-pointer"
                    >
                      {staged ? "取消暂存此块" : "暂存此块"}
                    </button>
                  )}
                </div>

                {/* Left Rows */}
                <div className="w-full">
                  {rows.map((row, rowIdx) => {
                    const isDel = row.left?.origin === "-";
                    const isSelected =
                      activeHunkIndex === hunkIdx &&
                      row.leftIdx != null &&
                      selectedLineIndices.has(row.leftIdx);

                    return (
                      <div
                        key={rowIdx}
                        onClick={(e) => {
                          if (row.leftIdx != null && isDel) {
                            onLineClick(hunkIdx, row.leftIdx, e);
                          }
                        }}
                        className={`flex h-[20px] items-center transition-colors select-none w-full ${
                          isDel ? "cursor-pointer" : ""
                        } ${
                          isSelected
                            ? "bg-[var(--color-selection)] ring-1 ring-inset ring-[var(--color-accent)]"
                            : isDel
                            ? "bg-[var(--color-diff-del-bg)] text-[var(--color-text)]"
                            : "bg-[var(--color-bg)] text-[var(--color-text)]"
                        }`}
                      >
                        {/* Gutter (Old lineno + Origin) */}
                        <div className="sticky left-0 flex items-center shrink-0 bg-inherit z-1 select-none">
                          <span className="w-10 shrink-0 text-right pr-2 text-[var(--color-text-muted)] text-[11px] select-none opacity-60">
                            {row.left?.old_lineno ?? ""}
                          </span>
                          <span className="w-4 shrink-0 text-center font-bold text-[var(--color-text-muted)] select-none">
                            {row.left?.origin ?? ""}
                          </span>
                        </div>

                        {/* Content */}
                        <DiffLineContent
                          tokens={
                            row.leftIdx != null
                              ? tokensByHunk[hunkIdx]?.[row.leftIdx]
                              : undefined
                          }
                          content={row.left?.content ?? ""}
                          intraLineRanges={rowDiffs?.[rowIdx]?.oldRanges}
                          isDel={isDel}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Right Column (New / Modified) */}
      <div
        ref={rightRef}
        onScroll={handleRightScroll}
        onWheel={setRightActive}
        onPointerDown={setRightActive}
        onTouchStart={setRightActive}
        onMouseEnter={setRightActive}
        onKeyDown={setRightActive}
        data-testid="diff-split-right"
        className="flex-1 h-full overflow-scroll"
      >
        <div className="min-w-full w-max divide-y divide-[var(--color-border)]/40">
          {hunks.map((hunk, hunkIdx) => {
            const rows = hunkRowsList[hunkIdx];
            const rowDiffs = hunkRowDiffsList[hunkIdx];
            return (
              <div key={hunkIdx} className="w-full">
                {/* Hunk Header (Right) */}
                <div className="h-[26px] w-full px-3.5 bg-[var(--ty-surface-sunken)]/60 text-[var(--color-text-muted)] text-[11px] font-mono border-y border-[var(--color-border)]/60 select-none flex items-center">
                  <span>{hunk.header}</span>
                </div>

                {/* Right Rows */}
                <div className="w-full">
                  {rows.map((row, rowIdx) => {
                    const isAdd = row.right?.origin === "+";
                    const isSelected =
                      activeHunkIndex === hunkIdx &&
                      row.rightIdx != null &&
                      selectedLineIndices.has(row.rightIdx);

                    return (
                      <div
                        key={rowIdx}
                        onClick={(e) => {
                          if (row.rightIdx != null && isAdd) {
                            onLineClick(hunkIdx, row.rightIdx, e);
                          }
                        }}
                        className={`flex h-[20px] items-center transition-colors select-none w-full ${
                          isAdd ? "cursor-pointer" : ""
                        } ${
                          isSelected
                            ? "bg-[var(--color-selection)] ring-1 ring-inset ring-[var(--color-accent)]"
                            : isAdd
                            ? "bg-[var(--color-diff-add-bg)] text-[var(--color-text)]"
                            : "bg-[var(--color-bg)] text-[var(--color-text)]"
                        }`}
                      >
                        {/* Gutter (New lineno + Origin) */}
                        <div className="sticky left-0 flex items-center shrink-0 bg-inherit z-1 select-none">
                          <span className="w-10 shrink-0 text-right pr-2 text-[var(--color-text-muted)] text-[11px] select-none opacity-60">
                            {row.right?.new_lineno ?? ""}
                          </span>
                          <span className="w-4 shrink-0 text-center font-bold text-[var(--color-text-muted)] select-none">
                            {row.right?.origin ?? ""}
                          </span>
                        </div>

                        {/* Content */}
                        <DiffLineContent
                          tokens={
                            row.rightIdx != null
                              ? tokensByHunk[hunkIdx]?.[row.rightIdx]
                              : undefined
                          }
                          content={row.right?.content ?? ""}
                          intraLineRanges={rowDiffs?.[rowIdx]?.newRanges}
                          isAdd={isAdd}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

interface SplitRow {
  left?: DiffLine;
  right?: DiffLine;
  leftIdx?: number;
  rightIdx?: number;
}

function alignSplitRows(lines: DiffLine[], ignoreWhitespace: boolean): SplitRow[] {
  const rows: SplitRow[] = [];
  let delBuffer: { line: DiffLine; idx: number }[] = [];
  let addBuffer: { line: DiffLine; idx: number }[] = [];

  const flush = () => {
    const maxLen = Math.max(delBuffer.length, addBuffer.length);
    for (let i = 0; i < maxLen; i++) {
      rows.push({
        left: delBuffer[i]?.line,
        right: addBuffer[i]?.line,
        leftIdx: delBuffer[i]?.idx,
        rightIdx: addBuffer[i]?.idx,
      });
    }
    delBuffer = [];
    addBuffer = [];
  };

  lines.forEach((line, idx) => {
    if (ignoreWhitespace && line.content.trim().length === 0) {
      return;
    }

    if (line.origin === "-") {
      delBuffer.push({ line, idx });
    } else if (line.origin === "+") {
      addBuffer.push({ line, idx });
    } else {
      flush();
      rows.push({ left: line, right: line, leftIdx: idx, rightIdx: idx });
    }
  });
  flush();

  return rows;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
