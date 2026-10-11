import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { listRepoFiles, type FileStatus, type TreeFile } from "../../lib/host";
import {
  ChevronDownIcon,
  ChevronRightIcon,
  CloseIcon,
  FileIcon,
  FolderIcon,
} from "../../components/icons";
import {
  STATUS_COLOR_VAR,
  STATUS_LABEL,
  STATUS_LETTER,
  buildFileTree,
  flattenVisible,
  parentDirs,
  type FileTreeNode,
} from "./buildTree";

export interface FileTreePanelProps {
  rootPath: string;
  /** get_repo_status 的结果，App 里已有，不重复请求。 */
  statusFiles: FileStatus[];
  /** 变化时重新拉文件列表（App 刷新状态时 +1）。 */
  refreshKey?: number;
  selectedPath: string | null;
  onOpenFile: (node: FileTreeNode) => void;
  onHide?: () => void;
}

const expandedKey = (root: string) => `tongyun_tree_expanded:${root}`;

function loadExpanded(root: string): Set<string> {
  try {
    const raw = localStorage.getItem(expandedKey(root));
    if (raw) {
      const arr = JSON.parse(raw) as unknown;
      if (Array.isArray(arr)) return new Set(arr.filter((x): x is string => typeof x === "string"));
    }
  } catch {
    // 忽略损坏的本地存储
  }
  return new Set();
}

function HighlightName({ name, query }: { name: string; query: string }) {
  const q = query.trim().toLowerCase();
  if (!q) return <>{name}</>;
  const idx = name.toLowerCase().indexOf(q);
  if (idx < 0) return <>{name}</>;
  return (
    <>
      {name.slice(0, idx)}
      <mark className="tree-match">{name.slice(idx, idx + q.length)}</mark>
      {name.slice(idx + q.length)}
    </>
  );
}

function CollapseAllIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m7 20 5-5 5 5" />
      <path d="m7 4 5 5 5-5" />
    </svg>
  );
}

function ChangedOnlyIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 5h18l-7 8v6l-4 2v-8z" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

function SidebarHideIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="4" width="18" height="16" rx="3" />
      <path d="M9 4v16" />
      <path d="m15 10-2 2 2 2" />
    </svg>
  );
}

export function FileTreePanel({
  rootPath,
  statusFiles,
  refreshKey = 0,
  selectedPath,
  onOpenFile,
  onHide,
}: FileTreePanelProps) {
  const [treeFiles, setTreeFiles] = useState<TreeFile[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedState, setExpandedState] = useState<{ root: string; set: Set<string> }>(() => ({
    root: rootPath,
    set: loadExpanded(rootPath),
  }));
  const [query, setQuery] = useState("");
  const [changedOnly, setChangedOnly] = useState(false);
  const [focusedPath, setFocusedPath] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // 切换仓库时换成该仓库自己的展开状态
  const expanded =
    expandedState.root === rootPath ? expandedState.set : loadExpanded(rootPath);

  // 拉文件列表（防抖，状态频繁刷新时只请求一次）
  useEffect(() => {
    let canceled = false;
    const timer = window.setTimeout(() => {
      listRepoFiles(rootPath)
        .then((list) => {
          if (canceled) return;
          setTreeFiles(Array.isArray(list) ? list : []);
          setLoadError(null);
          setLoading(false);
        })
        .catch((err: unknown) => {
          if (canceled) return;
          setLoadError(typeof err === "string" ? err : (err as Error)?.message || "读取文件列表失败");
          setLoading(false);
        });
    }, 150);
    return () => {
      canceled = true;
      window.clearTimeout(timer);
    };
  }, [rootPath, refreshKey]);

  const setExpanded = useCallback(
    (updater: (prev: Set<string>) => Set<string>) => {
      setExpandedState((prev) => {
        const base = prev.root === rootPath ? prev.set : loadExpanded(rootPath);
        const next = updater(base);
        try {
          localStorage.setItem(expandedKey(rootPath), JSON.stringify([...next]));
        } catch {
          // 存储满了就不记
        }
        return { root: rootPath, set: next };
      });
    },
    [rootPath]
  );

  const tree = useMemo(
    () => buildFileTree(treeFiles, statusFiles, { changedOnly, query }),
    [treeFiles, statusFiles, changedOnly, query]
  );
  const searching = query.trim().length > 0;
  const rows = useMemo(
    () => flattenVisible(tree, expanded, searching || changedOnly),
    [tree, expanded, searching, changedOnly]
  );
  const changedCount = useMemo(
    () => buildFileTree(treeFiles, statusFiles, { changedOnly: true }),
    [treeFiles, statusFiles]
  );
  const totalChanged = useMemo(() => {
    let n = 0;
    const walk = (node: FileTreeNode) => {
      for (const c of node.children) {
        if (c.isDir) walk(c);
        else n++;
      }
    };
    walk(changedCount);
    return n;
  }, [changedCount]);

  // 选中的文件在树里自动展开父目录（选中变化时做一次，之后用户仍可手动折叠）
  const [revealedPath, setRevealedPath] = useState<string | null>(null);
  if (selectedPath !== revealedPath) {
    setRevealedPath(selectedPath);
    if (selectedPath) {
      const parents = parentDirs(selectedPath);
      if (!parents.every((p) => expanded.has(p))) {
        setExpanded((prev) => {
          const next = new Set(prev);
          for (const p of parents) next.add(p);
          return next;
        });
      }
    }
  }

  const toggleDir = (path: string, open?: boolean) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      const shouldOpen = open ?? !next.has(path);
      if (shouldOpen) next.add(path);
      else next.delete(path);
      return next;
    });
  };

  const activate = (node: FileTreeNode) => {
    setFocusedPath(node.path);
    if (node.isDir) toggleDir(node.path);
    else onOpenFile(node);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (rows.length === 0) return;
    const current = focusedPath ?? selectedPath;
    let idx = rows.findIndex((r) => r.node.path === current);
    const row = idx >= 0 ? rows[idx] : null;
    switch (e.key) {
      case "ArrowDown":
        idx = Math.min(rows.length - 1, idx + 1);
        setFocusedPath(rows[idx].node.path);
        break;
      case "ArrowUp":
        idx = Math.max(0, idx < 0 ? 0 : idx - 1);
        setFocusedPath(rows[idx].node.path);
        break;
      case "ArrowRight":
        if (row?.node.isDir) toggleDir(row.node.path, true);
        break;
      case "ArrowLeft":
        if (row?.node.isDir && row.expanded) toggleDir(row.node.path, false);
        else if (row) {
          const parents = parentDirs(row.node.path);
          if (parents.length) setFocusedPath(parents[parents.length - 1]);
        }
        break;
      case "Enter":
        if (row) activate(row.node);
        break;
      default:
        return;
    }
    e.preventDefault();
  };

  // 键盘移动时保持可见
  useEffect(() => {
    if (!focusedPath || !listRef.current) return;
    const el = Array.from(listRef.current.children).find(
      (c) => (c as HTMLElement).dataset.path === focusedPath
    ) as HTMLElement | undefined;
    el?.scrollIntoView?.({ block: "nearest" });
  }, [focusedPath]);

  return (
    <div className="file-tree h-full flex flex-col bg-[var(--color-surface)] select-none" aria-label="项目文件树">
      {/* 标题栏 */}
      <div className="h-9 px-3 flex items-center justify-between border-b border-[var(--color-border)] shrink-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-xs font-semibold text-[var(--color-text)]">项目</span>
          {totalChanged > 0 && (
            <span
              className="tree-count"
              title={`${totalChanged} 个文件有改动`}
            >
              {totalChanged}
            </span>
          )}
        </div>
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            className={`tree-tool ${changedOnly ? "is-on" : ""}`}
            title="只看有改动的文件"
            aria-label="只看有改动的文件"
            aria-pressed={changedOnly}
            onClick={() => setChangedOnly((v) => !v)}
          >
            <ChangedOnlyIcon />
          </button>
          <button
            type="button"
            className="tree-tool"
            title="全部折叠"
            aria-label="全部折叠"
            onClick={() => setExpanded(() => new Set())}
          >
            <CollapseAllIcon />
          </button>
          {onHide && (
            <button
              type="button"
              className="tree-tool"
              title="收起文件树"
              aria-label="收起文件树"
              onClick={onHide}
            >
              <SidebarHideIcon />
            </button>
          )}
        </div>
      </div>

      {/* 搜索 */}
      <div className="px-2 py-2 border-b border-[var(--color-border)] shrink-0">
        <label className="tree-search">
          <SearchIcon />
          <input
            type="text"
            value={query}
            placeholder="搜索文件…"
            aria-label="搜索文件"
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setQuery("");
                e.stopPropagation();
              } else if (e.key === "ArrowDown") {
                listRef.current?.focus();
                if (rows[0]) setFocusedPath(rows[0].node.path);
                e.preventDefault();
              }
            }}
          />
          {query && (
            <button
              type="button"
              className="tree-search-clear"
              aria-label="清空搜索"
              onClick={() => setQuery("")}
            >
              <CloseIcon width={12} height={12} />
            </button>
          )}
        </label>
      </div>

      {/* 树 */}
      <div
        ref={listRef}
        role="tree"
        tabIndex={0}
        onKeyDown={onKeyDown}
        className="flex-1 overflow-auto py-1 outline-none"
      >
        {loadError ? (
          <div className="px-3 py-4 text-xs text-[var(--color-danger)]">{loadError}</div>
        ) : loading && treeFiles.length === 0 && statusFiles.length === 0 ? (
          <div className="px-3 py-4 text-xs text-[var(--color-text-muted)]">正在读取文件…</div>
        ) : rows.length === 0 ? (
          <div className="px-3 py-6 text-xs text-center text-[var(--color-text-muted)]">
            {searching ? "没有匹配的文件" : changedOnly ? "没有改动的文件" : "仓库里还没有文件"}
          </div>
        ) : (
          rows.map(({ node, depth, expanded: isOpen }) => {
            const status = node.isDir ? null : node.status;
            const color = status ? STATUS_COLOR_VAR[status] : undefined;
            const isSelected = !node.isDir && node.path === selectedPath;
            const isFocused = node.path === focusedPath;
            return (
              <div
                key={node.path}
                role="treeitem"
                aria-level={depth + 1}
                aria-expanded={node.isDir ? isOpen : undefined}
                aria-selected={isSelected}
                data-path={node.path}
                data-status={status ?? node.aggregate ?? undefined}
                title={node.path + (status ? ` · ${STATUS_LABEL[status]}` : "")}
                onClick={() => activate(node)}
                className={`tree-row ${isSelected ? "is-selected" : ""} ${isFocused ? "is-focused" : ""}`}
                style={{ paddingLeft: 6 + depth * 12 }}
              >
                <span className="tree-chevron">
                  {node.isDir ? (
                    isOpen ? (
                      <ChevronDownIcon width={12} height={12} />
                    ) : (
                      <ChevronRightIcon width={12} height={12} />
                    )
                  ) : null}
                </span>
                {node.isDir ? (
                  <FolderIcon width={14} height={14} className="tree-folder-icon" />
                ) : (
                  <FileIcon width={13} height={13} className="tree-file-icon" />
                )}
                <span
                  className={`tree-name ${status === "deleted" ? "line-through" : ""}`}
                  style={{
                    color: color ?? (node.isDir && node.aggregate ? "var(--color-status-modified)" : undefined),
                  }}
                >
                  <HighlightName name={node.name} query={query} />
                </span>
                {node.isDir && node.aggregate && (
                  <span
                    className="tree-dot"
                    data-testid="tree-dir-dot"
                    style={{ background: STATUS_COLOR_VAR[node.aggregate] }}
                    title={`包含改动（${STATUS_LABEL[node.aggregate]}）`}
                  />
                )}
                {status && (
                  <span
                    className="tree-badge"
                    style={{ color, ["--badge-color" as string]: color }}
                    aria-label={STATUS_LABEL[status]}
                  >
                    {STATUS_LETTER[status]}
                  </span>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
