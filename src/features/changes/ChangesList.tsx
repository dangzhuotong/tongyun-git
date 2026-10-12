import { useState, useMemo, useEffect, type ReactNode } from "react";
import type { FileStatus, ChangeKind } from "../../lib/host";
import type { SelectedFileTarget, ViewMode, TreeNode } from "./types";
import {
  ChevronDownIcon,
  ChevronRightIcon,
  FolderIcon,
  FileIcon,
  TreeIcon,
  ListIcon,
  HistoryIcon,
  GitMergeIcon,
} from "../../components/icons";
import { FilePathLabel } from "../../components/FilePathLabel";

interface ChangesListProps {
  files: FileStatus[];
  selectedTarget: SelectedFileTarget | null;
  onSelectTarget: (target: SelectedFileTarget) => void;
  onStageFiles: (paths: string[]) => Promise<void>;
  onUnstageFiles: (paths: string[]) => Promise<void>;
  onDiscardFiles: (paths: string[]) => void;
  onOpenFileHistory?: (filePath: string) => void;
  onResolveConflict?: (filePath?: string) => void;
}

export function ChangesList({
  files,
  selectedTarget,
  onSelectTarget,
  onStageFiles,
  onUnstageFiles,
  onDiscardFiles,
  onOpenFileHistory,
  onResolveConflict,
}: ChangesListProps) {
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    return (localStorage.getItem("tongyun_view_mode") as ViewMode) || "flat";
  });

  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({
    conflicted: true,
    staged: true,
    unstaged: true,
    untracked: true,
  });

  // Multiple selection set: strings formatted as "staged:path" or "unstaged:path"
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());

  const toggleGroup = (key: string) => {
    setExpandedGroups((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const setAndSaveViewMode = (mode: ViewMode) => {
    setViewMode(mode);
    localStorage.setItem("tongyun_view_mode", mode);
  };

  // Grouping
  const conflictedFiles = useMemo(
    () => files.filter((f) => f.conflicted),
    [files]
  );

  const stagedFiles = useMemo(
    () => files.filter((f) => f.index != null && !f.conflicted),
    [files]
  );

  const unstagedFiles = useMemo(
    () => files.filter((f) => f.worktree != null && f.worktree !== "Untracked" && !f.conflicted),
    [files]
  );

  const untrackedFiles = useMemo(
    () => files.filter((f) => f.worktree === "Untracked" && !f.conflicted),
    [files]
  );

  // Keyboard shortcut handler (Space to stage/unstage, Ctrl+Alt+Z to discard)
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Don't intercept when focusing inputs or textarea
      const targetTag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (targetTag === "input" || targetTag === "textarea") {
        return;
      }

      // Space: stage or unstage currently selected
      if (e.key === " " && selectedTarget) {
        e.preventDefault();
        if (selectedTarget.staged) {
          onUnstageFiles([selectedTarget.path]);
        } else {
          onStageFiles([selectedTarget.path]);
        }
      }

      // Ctrl+Alt+Z / Cmd+Option+Z: discard currently selected
      if (
        (e.ctrlKey || e.metaKey) &&
        e.altKey &&
        (e.key === "z" || e.key === "Z") &&
        selectedTarget
      ) {
        e.preventDefault();
        onDiscardFiles([selectedTarget.path]);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedTarget, onStageFiles, onUnstageFiles, onDiscardFiles]);

  const handleToggleSelectKey = (key: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const selectedPaths = useMemo(() => {
    const paths: string[] = [];
    for (const key of selectedKeys) {
      const parts = key.split(":");
      if (parts.length >= 2) {
        paths.push(parts.slice(1).join(":"));
      }
    }
    return Array.from(new Set(paths));
  }, [selectedKeys]);

  return (
    <div className="flex flex-col h-full bg-[var(--color-surface)] select-none">
      {/* List Header / View Mode Switcher */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--color-border)] text-xs font-medium text-[var(--color-text-muted)]">
        <span className="font-semibold text-[var(--color-text)]">
          改动 ({files.length})
        </span>
        <div className="flex items-center gap-1 bg-[var(--color-bg)] p-0.5 rounded border border-[var(--color-border)]">
          <button
            type="button"
            title="平铺视图"
            onClick={() => setAndSaveViewMode("flat")}
            className={`p-1 rounded ${
              viewMode === "flat"
                ? "bg-[var(--color-surface-raised)] text-[var(--color-text)] font-semibold shadow-xs"
                : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
            }`}
          >
            <ListIcon width={13} height={13} />
          </button>
          <button
            type="button"
            title="目录树视图"
            onClick={() => setAndSaveViewMode("tree")}
            className={`p-1 rounded ${
              viewMode === "tree"
                ? "bg-[var(--color-surface-raised)] text-[var(--color-text)] font-semibold shadow-xs"
                : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
            }`}
          >
            <TreeIcon width={13} height={13} />
          </button>
        </div>
      </div>

      {/* Batch Action Toolbar when files are multi-selected */}
      {selectedPaths.length > 0 && (
        <div className="px-3 py-1.5 bg-[var(--color-surface-raised)] border-b border-[var(--color-border)] flex items-center justify-between text-[11px]">
          <span className="font-medium text-[var(--color-text-muted)]">
            已勾选 {selectedPaths.length} 个
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => {
                onStageFiles(selectedPaths);
                setSelectedKeys(new Set());
              }}
              className="px-2 py-0.5 rounded bg-[var(--color-accent)] text-white hover:opacity-90 font-medium"
            >
              暂存
            </button>
            <button
              type="button"
              onClick={() => {
                onUnstageFiles(selectedPaths);
                setSelectedKeys(new Set());
              }}
              className="px-2 py-0.5 rounded border border-[var(--color-border)] bg-[var(--color-surface)] hover:bg-[var(--color-border)]"
            >
              取消
            </button>
            <button
              type="button"
              onClick={() => {
                onDiscardFiles(selectedPaths);
              }}
              className="px-2 py-0.5 rounded border border-[var(--color-danger)] text-[var(--color-danger)] hover:bg-[var(--color-danger)]/10"
            >
              丢弃
            </button>
          </div>
        </div>
      )}

      {/* File Groups List */}
      <div className="flex-1 overflow-y-auto divide-y divide-[var(--color-border)]/50 text-xs">
        {/* Conflicted */}
        {conflictedFiles.length > 0 && (
          <GroupSection
            title="冲突"
            badgeColor="bg-[var(--color-status-conflict)]/15 text-[var(--color-status-conflict)]"
            count={conflictedFiles.length}
            expanded={expandedGroups.conflicted}
            onToggle={() => toggleGroup("conflicted")}
            actionLabel={onResolveConflict ? "三方解决" : "全部解决"}
            onAction={
              onResolveConflict
                ? () => onResolveConflict()
                : () => onStageFiles(conflictedFiles.map((f) => f.path))
            }
          >
            <GroupFileList
              files={conflictedFiles}
              staged={false}
              viewMode={viewMode}
              selectedTarget={selectedTarget}
              selectedKeys={selectedKeys}
              onSelect={onSelectTarget}
              onToggleSelectKey={handleToggleSelectKey}
              onStage={(p) => onStageFiles([p])}
              onUnstage={(p) => onUnstageFiles([p])}
              onDiscard={(p) => onDiscardFiles([p])}
              onOpenFileHistory={onOpenFileHistory}
              onResolveConflict={onResolveConflict}
            />
          </GroupSection>
        )}

        {/* Staged */}
        <GroupSection
          title="已暂存"
          badgeColor="bg-[var(--color-status-added)]/15 text-[var(--color-status-added)]"
          count={stagedFiles.length}
          expanded={expandedGroups.staged}
          onToggle={() => toggleGroup("staged")}
          actionLabel="全部取消"
          onAction={() => onUnstageFiles(stagedFiles.map((f) => f.path))}
        >
          <GroupFileList
            files={stagedFiles}
            staged={true}
            viewMode={viewMode}
            selectedTarget={selectedTarget}
            selectedKeys={selectedKeys}
            onSelect={onSelectTarget}
            onToggleSelectKey={handleToggleSelectKey}
            onStage={(p) => onStageFiles([p])}
            onUnstage={(p) => onUnstageFiles([p])}
            onDiscard={(p) => onDiscardFiles([p])}
            onOpenFileHistory={onOpenFileHistory}
          />
        </GroupSection>

        {/* Unstaged */}
        <GroupSection
          title="未暂存"
          badgeColor="bg-[var(--color-status-modified)]/15 text-[var(--color-status-modified)]"
          count={unstagedFiles.length}
          expanded={expandedGroups.unstaged}
          onToggle={() => toggleGroup("unstaged")}
          actionLabel="全部暂存"
          onAction={() => onStageFiles(unstagedFiles.map((f) => f.path))}
        >
          <GroupFileList
            files={unstagedFiles}
            staged={false}
            viewMode={viewMode}
            selectedTarget={selectedTarget}
            selectedKeys={selectedKeys}
            onSelect={onSelectTarget}
            onToggleSelectKey={handleToggleSelectKey}
            onStage={(p) => onStageFiles([p])}
            onUnstage={(p) => onUnstageFiles([p])}
            onDiscard={(p) => onDiscardFiles([p])}
            onOpenFileHistory={onOpenFileHistory}
          />
        </GroupSection>

        {/* Untracked */}
        <GroupSection
          title="未跟踪"
          badgeColor="bg-[var(--color-status-untracked)]/15 text-[var(--color-status-untracked)]"
          count={untrackedFiles.length}
          expanded={expandedGroups.untracked}
          onToggle={() => toggleGroup("untracked")}
          actionLabel="全部暂存"
          onAction={() => onStageFiles(untrackedFiles.map((f) => f.path))}
        >
          <GroupFileList
            files={untrackedFiles}
            staged={false}
            viewMode={viewMode}
            selectedTarget={selectedTarget}
            selectedKeys={selectedKeys}
            onSelect={onSelectTarget}
            onToggleSelectKey={handleToggleSelectKey}
            onStage={(p) => onStageFiles([p])}
            onUnstage={(p) => onUnstageFiles([p])}
            onDiscard={(p) => onDiscardFiles([p])}
            onOpenFileHistory={onOpenFileHistory}
          />
        </GroupSection>
      </div>
    </div>
  );
}

function GroupSection({
  title,
  count,
  badgeColor,
  expanded,
  onToggle,
  actionLabel,
  onAction,
  children,
}: {
  title: string;
  count: number;
  badgeColor: string;
  expanded: boolean;
  onToggle: () => void;
  actionLabel?: string;
  onAction?: () => void;
  children: ReactNode;
}) {
  return (
    <div>
      <div className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-[var(--color-surface-raised)] transition-colors font-medium text-[var(--color-text-muted)] group">
        <button
          type="button"
          onClick={onToggle}
          className="flex-1 flex items-center gap-1.5 text-left"
        >
          {expanded ? (
            <ChevronDownIcon width={12} height={12} />
          ) : (
            <ChevronRightIcon width={12} height={12} />
          )}
          <span className="text-[12px] font-semibold text-[var(--color-text)]">
            {title}
          </span>
          <span className={`text-[11px] px-1.5 py-0.2 rounded-full font-mono ${badgeColor}`}>
            {count}
          </span>
        </button>

        {count > 0 && actionLabel && onAction && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onAction();
            }}
            className="text-[10px] text-[var(--color-accent)] opacity-0 group-hover:opacity-100 hover:underline px-1 py-0.5 font-medium transition-opacity"
          >
            {actionLabel}
          </button>
        )}
      </div>
      {expanded && <div>{children}</div>}
    </div>
  );
}

function GroupFileList({
  files,
  staged,
  viewMode,
  selectedTarget,
  selectedKeys,
  onSelect,
  onToggleSelectKey,
  onStage,
  onUnstage,
  onDiscard,
  onOpenFileHistory,
  onResolveConflict,
}: {
  files: FileStatus[];
  staged: boolean;
  viewMode: ViewMode;
  selectedTarget: SelectedFileTarget | null;
  selectedKeys: Set<string>;
  onSelect: (target: SelectedFileTarget) => void;
  onToggleSelectKey: (key: string, e: React.MouseEvent) => void;
  onStage: (path: string) => void;
  onUnstage: (path: string) => void;
  onDiscard: (path: string) => void;
  onOpenFileHistory?: (path: string) => void;
  onResolveConflict?: (path: string) => void;
}) {
  if (files.length === 0) {
    return (
      <div className="px-6 py-2 text-[11px] text-[var(--color-text-muted)]/60 italic">
        没有文件
      </div>
    );
  }

  if (viewMode === "tree") {
    const tree = buildFileTree(files, staged);
    return (
      <div className="py-0.5">
        <TreeFolderView
          nodes={tree}
          staged={staged}
          selectedTarget={selectedTarget}
          selectedKeys={selectedKeys}
          onSelect={onSelect}
          onToggleSelectKey={onToggleSelectKey}
          onStage={onStage}
          onUnstage={onUnstage}
          onDiscard={onDiscard}
          onOpenFileHistory={onOpenFileHistory}
          onResolveConflict={onResolveConflict}
          depth={0}
        />
      </div>
    );
  }

  return (
    <div className="py-0.5">
      {files.map((file) => {
        const itemKey = `${staged ? "staged" : "unstaged"}:${file.path}`;
        const isSelected =
          selectedTarget?.path === file.path && selectedTarget?.staged === staged;
        const isChecked = selectedKeys.has(itemKey);

        return (
          <FileRowItem
            key={itemKey}
            file={file}
            staged={staged}
            isSelected={isSelected}
            isChecked={isChecked}
            onSelect={() => onSelect({ path: file.path, staged, status: file })}
            onToggleCheck={(e) => onToggleSelectKey(itemKey, e)}
            onStage={() => onStage(file.path)}
            onUnstage={() => onUnstage(file.path)}
            onDiscard={() => onDiscard(file.path)}
            onOpenFileHistory={onOpenFileHistory}
            onResolveConflict={onResolveConflict}
          />
        );
      })}
    </div>
  );
}

function FileRowItem({
  file,
  staged,
  isSelected,
  isChecked,
  onSelect,
  onToggleCheck,
  onStage,
  onUnstage,
  onDiscard,
  onOpenFileHistory,
  onResolveConflict,
  displayName,
  indent = 0,
}: {
  file: FileStatus;
  staged: boolean;
  isSelected: boolean;
  isChecked: boolean;
  onSelect: () => void;
  onToggleCheck: (e: React.MouseEvent) => void;
  onStage: () => void;
  onUnstage: () => void;
  onDiscard: () => void;
  onOpenFileHistory?: (path: string) => void;
  onResolveConflict?: (path: string) => void;
  displayName?: string;
  indent?: number;
}) {
  const kind: ChangeKind = staged
    ? file.index || "Modified"
    : file.worktree || (file.conflicted ? "Modified" : "Modified");

  const badge = getStatusBadge(kind, file.conflicted);
  const isDeleted = kind === "Deleted";

  return (
    <div
      onClick={onSelect}
      style={{ paddingLeft: `${8 + indent * 14}px` }}
      className={`h-[24px] pr-2 flex items-center justify-between cursor-pointer group transition-colors text-[12px] ${
        isSelected
          ? "bg-[var(--color-selection)] text-[var(--color-text)] font-medium"
          : "hover:bg-[var(--color-surface-raised)] text-[var(--color-text)]"
      }`}
    >
      <div className="flex items-center gap-1.5 overflow-hidden flex-1">
        {/* Checkbox */}
        <input
          type="checkbox"
          checked={isChecked}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => onToggleCheck(e as any)}
          className="rounded border-[var(--color-border)] accent-[var(--color-accent)] w-3.5 h-3.5"
        />

        <FileIcon width={13} height={13} className="shrink-0 text-[var(--color-text-muted)]" />
        <span
          className="truncate font-mono min-w-0 flex items-baseline"
          title={
            file.old_path ? `${file.old_path} → ${file.path}` : file.path
          }
        >
          <FilePathLabel
            path={file.path}
            oldPath={file.old_path}
            displayName={displayName}
            isDeleted={isDeleted}
          />
        </span>
      </div>

      <div className="flex items-center gap-1 shrink-0 ml-1">
        {/* Conflicted Direct Resolve Button */}
        {file.conflicted && onResolveConflict && (
          <button
            type="button"
            title="打开三方合并冲突解决器"
            onClick={(e) => {
              e.stopPropagation();
              onResolveConflict(file.path);
            }}
            className="px-1.5 py-0.5 rounded bg-[var(--color-status-conflict)]/15 hover:bg-[var(--color-status-conflict)]/25 text-[var(--color-status-conflict)] flex items-center gap-1 font-semibold text-[10px] cursor-pointer transition-colors"
          >
            <GitMergeIcon width={11} height={11} />
            <span>解决</span>
          </button>
        )}

        {/* Inline Action Buttons (Hover) */}
        <div className="hidden group-hover:flex items-center gap-0.5">
          {file.conflicted && onResolveConflict && (
            <button
              type="button"
              title="使用三方合并器解决冲突"
              onClick={(e) => {
                e.stopPropagation();
                onResolveConflict(file.path);
              }}
              className="p-0.5 px-1 rounded hover:bg-[var(--color-surface)] text-[var(--color-status-conflict)] cursor-pointer"
            >
              <GitMergeIcon width={12} height={12} />
            </button>
          )}
          {onOpenFileHistory && (
            <button
              type="button"
              title="查看文件提交历史"
              onClick={(e) => {
                e.stopPropagation();
                onOpenFileHistory(file.path);
              }}
              className="p-0.5 px-1 rounded hover:bg-[var(--color-surface)] text-[var(--color-text-muted)] hover:text-[var(--color-accent)] cursor-pointer"
            >
              <HistoryIcon width={12} height={12} />
            </button>
          )}
          {staged ? (
            <button
              type="button"
              title="取消暂存此文件"
              onClick={(e) => {
                e.stopPropagation();
                onUnstage();
              }}
              className="p-0.5 px-1 rounded hover:bg-[var(--color-border)] text-[var(--color-text-muted)] font-mono text-[11px]"
            >
              -
            </button>
          ) : (
            <>
              <button
                type="button"
                title="暂存此文件 (空格)"
                onClick={(e) => {
                  e.stopPropagation();
                  onStage();
                }}
                className="p-0.5 px-1 rounded hover:bg-[var(--color-accent)] hover:text-white text-[var(--color-accent)] font-mono text-[11px] font-bold"
              >
                +
              </button>
              <button
                type="button"
                title="丢弃此文件的改动 (Ctrl+Alt+Z)"
                onClick={(e) => {
                  e.stopPropagation();
                  onDiscard();
                }}
                className="p-0.5 px-1 rounded hover:bg-[var(--color-danger)]/20 text-[var(--color-danger)] font-mono text-[10px]"
              >
                ×
              </button>
            </>
          )}
        </div>

        {/* Status Badge */}
        <span
          className={`px-1.5 py-0.5 rounded-full text-[10px] font-mono font-bold leading-none ${badge.className}`}
          title={badge.title}
        >
          {badge.label}
        </span>
      </div>
    </div>
  );
}

function getStatusBadge(kind: ChangeKind, conflicted: boolean) {
  if (conflicted) {
    return {
      label: "!",
      title: "冲突",
      className: "bg-[var(--color-status-conflict)]/12 text-[var(--color-status-conflict)]",
    };
  }
  switch (kind) {
    case "Added":
      return {
        label: "A",
        title: "新增",
        className: "bg-[var(--color-status-added)]/12 text-[var(--color-status-added)]",
      };
    case "Modified":
      return {
        label: "M",
        title: "修改",
        className: "bg-[var(--color-status-modified)]/12 text-[var(--color-status-modified)]",
      };
    case "Deleted":
      return {
        label: "D",
        title: "删除",
        className: "bg-[var(--color-status-deleted)]/12 text-[var(--color-status-deleted)]",
      };
    case "Renamed":
      return {
        label: "R",
        title: "重命名",
        className: "bg-[var(--color-status-renamed)]/12 text-[var(--color-status-renamed)]",
      };
    case "TypeChange":
      return {
        label: "T",
        title: "类型改变",
        className: "bg-[var(--color-accent)]/12 text-[var(--color-accent)]",
      };
    case "Untracked":
      return {
        label: "U",
        title: "未跟踪",
        className: "bg-[var(--color-status-untracked)]/12 text-[var(--color-status-untracked)]",
      };
    default:
      return {
        label: "?",
        title: "未知",
        className: "bg-[var(--color-text-muted)]/12 text-[var(--color-text-muted)]",
      };
  }
}

// Build nested file tree
function buildFileTree(files: FileStatus[], staged: boolean): TreeNode[] {
  const root: TreeNode[] = [];

  for (const file of files) {
    const parts = file.path.split("/");
    let currentLevel = root;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isLeaf = i === parts.length - 1;
      const currentPath = parts.slice(0, i + 1).join("/");

      let existing = currentLevel.find((node) => node.name === part);
      if (!existing) {
        existing = {
          name: part,
          path: currentPath,
          isFolder: !isLeaf,
          children: [],
          fileStatus: isLeaf ? file : undefined,
          staged,
        };
        currentLevel.push(existing);
      }
      currentLevel = existing.children;
    }
  }

  // Sort folders first, then files
  const sortNodes = (nodes: TreeNode[]) => {
    nodes.sort((a, b) => {
      if (a.isFolder === b.isFolder) {
        return a.name.localeCompare(b.name);
      }
      return a.isFolder ? -1 : 1;
    });
    for (const node of nodes) {
      if (node.isFolder) {
        sortNodes(node.children);
      }
    }
  };
  sortNodes(root);

  return root;
}

function TreeFolderView({
  nodes,
  staged,
  selectedTarget,
  selectedKeys,
  onSelect,
  onToggleSelectKey,
  onStage,
  onUnstage,
  onDiscard,
  onOpenFileHistory,
  onResolveConflict,
  depth,
}: {
  nodes: TreeNode[];
  staged: boolean;
  selectedTarget: SelectedFileTarget | null;
  selectedKeys: Set<string>;
  onSelect: (target: SelectedFileTarget) => void;
  onToggleSelectKey: (key: string, e: React.MouseEvent) => void;
  onStage: (path: string) => void;
  onUnstage: (path: string) => void;
  onDiscard: (path: string) => void;
  onOpenFileHistory?: (path: string) => void;
  onResolveConflict?: (path: string) => void;
  depth: number;
}) {
  const [collapsedFolders, setCollapsedFolders] = useState<Record<string, boolean>>({});

  const toggleFolder = (path: string) => {
    setCollapsedFolders((prev) => ({ ...prev, [path]: !prev[path] }));
  };

  return (
    <>
      {nodes.map((node) => {
        if (node.isFolder) {
          const isCollapsed = collapsedFolders[node.path];
          return (
            <div key={node.path}>
              <div
                onClick={() => toggleFolder(node.path)}
                style={{ paddingLeft: `${8 + depth * 14}px` }}
                className="h-[24px] pr-3 flex items-center gap-1.5 cursor-pointer hover:bg-[var(--color-surface-raised)] text-[12px] text-[var(--color-text-muted)] font-medium"
              >
                {isCollapsed ? (
                  <ChevronRightIcon width={12} height={12} />
                ) : (
                  <ChevronDownIcon width={12} height={12} />
                )}
                <FolderIcon width={13} height={13} className="text-[var(--color-accent)]" />
                <span className="truncate">{node.name}</span>
              </div>
              {!isCollapsed && (
                <TreeFolderView
                  nodes={node.children}
                  staged={staged}
                  selectedTarget={selectedTarget}
                  selectedKeys={selectedKeys}
                  onSelect={onSelect}
                  onToggleSelectKey={onToggleSelectKey}
                  onStage={onStage}
                  onUnstage={onUnstage}
                  onDiscard={onDiscard}
                  onOpenFileHistory={onOpenFileHistory}
                  onResolveConflict={onResolveConflict}
                  depth={depth + 1}
                />
              )}
            </div>
          );
        }

        if (node.fileStatus) {
          const itemKey = `${staged ? "staged" : "unstaged"}:${node.fileStatus.path}`;
          const isSelected =
            selectedTarget?.path === node.fileStatus.path &&
            selectedTarget?.staged === staged;
          const isChecked = selectedKeys.has(itemKey);

          return (
            <FileRowItem
              key={itemKey}
              file={node.fileStatus}
              staged={staged}
              isSelected={isSelected}
              isChecked={isChecked}
              onSelect={() =>
                onSelect({
                  path: node.fileStatus!.path,
                  staged,
                  status: node.fileStatus!,
                })
              }
              onToggleCheck={(e) => onToggleSelectKey(itemKey, e)}
              onStage={() => onStage(node.fileStatus!.path)}
              onUnstage={() => onUnstage(node.fileStatus!.path)}
              onDiscard={() => onDiscard(node.fileStatus!.path)}
              onOpenFileHistory={onOpenFileHistory}
              onResolveConflict={onResolveConflict}
              displayName={node.name}
              indent={depth}
            />
          );
        }

        return null;
      })}
    </>
  );
}
