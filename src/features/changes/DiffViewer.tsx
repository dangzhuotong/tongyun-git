import { useState, useEffect } from "react";
import type { FileDiff, DiffHunk, DiffLine } from "../../lib/host";
import type { DiffLayout } from "./types";
import {
  SplitIcon,
  UnifiedIcon,
  AlertCircleIcon,
} from "../../components/icons";

interface DiffViewerProps {
  diff: FileDiff | null;
  loading: boolean;
  error: string | null;
  onStageHunkLines?: (
    hunkIndex: number,
    lineIndices: number[],
    reverse: boolean
  ) => Promise<void>;
}

export function DiffViewer({
  diff,
  loading,
  error,
  onStageHunkLines,
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
      if (!diff || !onStageHunkLines || diff.is_binary) return;
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
  }, [diff, activeHunkIndex, selectedLineIndices, onStageHunkLines]);

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
      <div className="flex items-center justify-between px-4 py-2 border-b border-[var(--color-border)] bg-[var(--color-surface)] text-xs select-none">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-mono font-medium text-[var(--color-text)] truncate">
            {diff.old_path ? `${diff.old_path} → ${diff.path}` : diff.path}
          </span>
          <span className="px-1.5 py-0.5 rounded text-[11px] font-medium bg-[var(--color-surface-raised)] text-[var(--color-text-muted)] shrink-0">
            {scopeLabel}
          </span>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {/* Staging Selection Button */}
          {selectedLineIndices.size > 0 && onStageHunkLines && !diff.is_binary && (
            <button
              type="button"
              onClick={handleStageSelection}
              className="px-2.5 py-1 rounded bg-[var(--color-accent)] text-white font-medium hover:opacity-90 transition-opacity flex items-center gap-1 shadow-xs text-xs"
            >
              <span>{diff.staged ? "取消暂存所选" : "暂存所选"}</span>
              <span className="bg-white/20 px-1 py-0.2 rounded font-mono text-[10px]">
                {selectedLineIndices.size} 行
              </span>
              <span className="opacity-75 text-[10px] ml-1">(空格)</span>
            </button>
          )}

          {/* Ignore Whitespace Toggle */}
          <label className="flex items-center gap-1.5 text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)] cursor-pointer">
            <input
              type="checkbox"
              checked={ignoreWhitespace}
              onChange={(e) => setIgnoreWhitespace(e.target.checked)}
              className="rounded border-[var(--color-border)] accent-[var(--color-accent)]"
            />
            <span>忽略空白</span>
          </label>

          {/* Layout Toggle */}
          <div className="flex items-center bg-[var(--color-bg)] p-0.5 rounded border border-[var(--color-border)]">
            <button
              type="button"
              title="统一视图 (Unified)"
              onClick={() => setAndSaveLayout("unified")}
              className={`p-1 rounded ${
                layout === "unified"
                  ? "bg-[var(--color-surface-raised)] text-[var(--color-text)] font-semibold shadow-xs"
                  : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
              }`}
            >
              <UnifiedIcon width={13} height={13} />
            </button>
            <button
              type="button"
              title="左右分栏对比视图 (Split)"
              onClick={() => setAndSaveLayout("split")}
              className={`p-1 rounded ${
                layout === "split"
                  ? "bg-[var(--color-surface-raised)] text-[var(--color-text)] font-semibold shadow-xs"
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
        <div className="px-4 py-2 bg-amber-500/10 border-b border-amber-500/20 text-xs text-amber-700 dark:text-amber-300 flex items-center gap-2">
          <AlertCircleIcon width={14} height={14} className="shrink-0" />
          <span>文件仅换行符（CRLF ↔ LF）发生变化。</span>
        </div>
      )}

      {/* Main Diff Content Area */}
      <div className="flex-1 overflow-auto font-mono text-[12px] leading-[20px]">
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
            ignoreWhitespace={ignoreWhitespace}
            activeHunkIndex={activeHunkIndex}
            selectedLineIndices={selectedLineIndices}
            onLineClick={handleLineClick}
            onStageHunk={(hunkIdx) => {
              if (onStageHunkLines) {
                onStageHunkLines(hunkIdx, [], diff.staged);
              }
            }}
            staged={diff.staged}
          />
        ) : (
          <SplitDiffView
            hunks={diff.hunks}
            ignoreWhitespace={ignoreWhitespace}
            activeHunkIndex={activeHunkIndex}
            selectedLineIndices={selectedLineIndices}
            onLineClick={handleLineClick}
            onStageHunk={(hunkIdx) => {
              if (onStageHunkLines) {
                onStageHunkLines(hunkIdx, [], diff.staged);
              }
            }}
            staged={diff.staged}
          />
        )}
      </div>
    </div>
  );
}

function UnifiedDiffView({
  hunks,
  ignoreWhitespace,
  activeHunkIndex,
  selectedLineIndices,
  onLineClick,
  onStageHunk,
  staged,
}: {
  hunks: DiffHunk[];
  ignoreWhitespace: boolean;
  activeHunkIndex: number | null;
  selectedLineIndices: Set<number>;
  onLineClick: (hunkIdx: number, lineIdx: number, e: React.MouseEvent) => void;
  onStageHunk: (hunkIdx: number) => void;
  staged: boolean;
}) {
  return (
    <div className="w-full divide-y divide-[var(--color-border)]/40">
      {hunks.map((hunk, hunkIdx) => (
        <div key={hunkIdx} className="w-full">
          {/* Hunk Header with Quick Hunk Stage Button */}
          <div className="px-3 py-1 bg-[var(--color-surface-raised)] text-[var(--color-text-muted)] text-[11px] font-mono border-y border-[var(--color-border)]/60 select-none flex items-center justify-between group">
            <span>{hunk.header}</span>
            <button
              type="button"
              onClick={() => onStageHunk(hunkIdx)}
              className="opacity-0 group-hover:opacity-100 px-2 py-0.2 rounded hover:bg-[var(--color-border)] text-[var(--color-text)] transition-opacity text-[10px]"
            >
              {staged ? "取消暂存此块" : "暂存此块 (a)"}
            </button>
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
                  className={`flex h-[20px] items-center transition-colors cursor-pointer select-none ${
                    isSelected
                      ? "bg-[var(--color-selection)] ring-1 ring-inset ring-[var(--color-accent)]"
                      : isAdd
                      ? "bg-[var(--color-diff-add-bg)] text-[var(--color-text)]"
                      : isDel
                      ? "bg-[var(--color-diff-del-bg)] text-[var(--color-text)]"
                      : "text-[var(--color-text)]"
                  }`}
                >
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
                  {/* Line Content */}
                  <span className="flex-1 whitespace-pre pl-1 pr-4 overflow-x-hidden truncate">
                    {line.content}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function SplitDiffView({
  hunks,
  ignoreWhitespace,
  activeHunkIndex,
  selectedLineIndices,
  onLineClick,
  onStageHunk,
  staged,
}: {
  hunks: DiffHunk[];
  ignoreWhitespace: boolean;
  activeHunkIndex: number | null;
  selectedLineIndices: Set<number>;
  onLineClick: (hunkIdx: number, lineIdx: number, e: React.MouseEvent) => void;
  onStageHunk: (hunkIdx: number) => void;
  staged: boolean;
}) {
  return (
    <div className="w-full divide-y divide-[var(--color-border)]/40">
      {hunks.map((hunk, hunkIdx) => {
        const rows = alignSplitRows(hunk.lines, ignoreWhitespace);

        return (
          <div key={hunkIdx} className="w-full">
            {/* Hunk Header */}
            <div className="px-3 py-1 bg-[var(--color-surface-raised)] text-[var(--color-text-muted)] text-[11px] font-mono border-y border-[var(--color-border)]/60 select-none flex items-center justify-between group">
              <span>{hunk.header}</span>
              <button
                type="button"
                onClick={() => onStageHunk(hunkIdx)}
                className="opacity-0 group-hover:opacity-100 px-2 py-0.2 rounded hover:bg-[var(--color-border)] text-[var(--color-text)] transition-opacity text-[10px]"
              >
                {staged ? "取消暂存此块" : "暂存此块 (a)"}
              </button>
            </div>

            {/* Split Rows */}
            <div className="w-full">
              {rows.map((row, rowIdx) => {
                const isSelected =
                  activeHunkIndex === hunkIdx &&
                  ((row.leftIdx != null && selectedLineIndices.has(row.leftIdx)) ||
                    (row.rightIdx != null && selectedLineIndices.has(row.rightIdx)));

                return (
                  <div
                    key={rowIdx}
                    className={`flex h-[20px] items-center divide-x divide-[var(--color-border)]/40 cursor-pointer ${
                      isSelected
                        ? "bg-[var(--color-selection)] ring-1 ring-inset ring-[var(--color-accent)]"
                        : ""
                    }`}
                  >
                    {/* Left Column */}
                    <div
                      onClick={(e) => {
                        if (row.leftIdx != null) {
                          onLineClick(hunkIdx, row.leftIdx, e);
                        }
                      }}
                      className={`flex-1 flex h-full items-center overflow-hidden ${
                        row.left?.origin === "-"
                          ? "bg-[var(--color-diff-del-bg)] text-[var(--color-text)]"
                          : ""
                      }`}
                    >
                      <span className="w-10 shrink-0 text-right pr-2 text-[var(--color-text-muted)] text-[11px] select-none opacity-60">
                        {row.left?.old_lineno ?? ""}
                      </span>
                      <span className="w-4 shrink-0 text-center text-[var(--color-text-muted)] select-none">
                        {row.left?.origin ?? ""}
                      </span>
                      <span className="flex-1 whitespace-pre pl-1 pr-2 truncate">
                        {row.left?.content ?? ""}
                      </span>
                    </div>

                    {/* Right Column */}
                    <div
                      onClick={(e) => {
                        if (row.rightIdx != null) {
                          onLineClick(hunkIdx, row.rightIdx, e);
                        }
                      }}
                      className={`flex-1 flex h-full items-center overflow-hidden ${
                        row.right?.origin === "+"
                          ? "bg-[var(--color-diff-add-bg)] text-[var(--color-text)]"
                          : ""
                      }`}
                    >
                      <span className="w-10 shrink-0 text-right pr-2 text-[var(--color-text-muted)] text-[11px] select-none opacity-60">
                        {row.right?.new_lineno ?? ""}
                      </span>
                      <span className="w-4 shrink-0 text-center text-[var(--color-text-muted)] select-none">
                        {row.right?.origin ?? ""}
                      </span>
                      <span className="flex-1 whitespace-pre pl-1 pr-2 truncate">
                        {row.right?.content ?? ""}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
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
