import { useState, useMemo, type ReactNode } from "react";
import type { FileStatus, ChangeKind } from "../../lib/host";
import type { SelectedFileTarget, ViewMode, TreeNode } from "./types";
import {
  ChevronDownIcon,
  ChevronRightIcon,
  FolderIcon,
  FileIcon,
  TreeIcon,
  ListIcon,
} from "../../components/icons";

interface ChangesListProps {
  files: FileStatus[];
  selectedTarget: SelectedFileTarget | null;
  onSelectTarget: (target: SelectedFileTarget) => void;
}

export function ChangesList({
  files,
  selectedTarget,
  onSelectTarget,
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
          >
            <GroupFileList
              files={conflictedFiles}
              staged={false}
              viewMode={viewMode}
              selectedTarget={selectedTarget}
              onSelect={onSelectTarget}
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
        >
          <GroupFileList
            files={stagedFiles}
            staged={true}
            viewMode={viewMode}
            selectedTarget={selectedTarget}
            onSelect={onSelectTarget}
          />
        </GroupSection>

        {/* Unstaged */}
        <GroupSection
          title="未暂存"
          badgeColor="bg-[var(--color-status-modified)]/15 text-[var(--color-status-modified)]"
          count={unstagedFiles.length}
          expanded={expandedGroups.unstaged}
          onToggle={() => toggleGroup("unstaged")}
        >
          <GroupFileList
            files={unstagedFiles}
            staged={false}
            viewMode={viewMode}
            selectedTarget={selectedTarget}
            onSelect={onSelectTarget}
          />
        </GroupSection>

        {/* Untracked */}
        <GroupSection
          title="未跟踪"
          badgeColor="bg-[var(--color-text-muted)]/15 text-[var(--color-text-muted)]"
          count={untrackedFiles.length}
          expanded={expandedGroups.untracked}
          onToggle={() => toggleGroup("untracked")}
        >
          <GroupFileList
            files={untrackedFiles}
            staged={false}
            viewMode={viewMode}
            selectedTarget={selectedTarget}
            onSelect={onSelectTarget}
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
  children,
}: {
  title: string;
  count: number;
  badgeColor: string;
  expanded: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-[var(--color-surface-raised)] transition-colors text-left font-medium text-[var(--color-text-muted)]"
      >
        <div className="flex items-center gap-1.5">
          {expanded ? (
            <ChevronDownIcon width={12} height={12} />
          ) : (
            <ChevronRightIcon width={12} height={12} />
          )}
          <span className="text-[12px] font-semibold text-[var(--color-text)]">
            {title}
          </span>
        </div>
        <span className={`text-[11px] px-1.5 py-0.2 rounded-full font-mono ${badgeColor}`}>
          {count}
        </span>
      </button>
      {expanded && <div>{children}</div>}
    </div>
  );
}

function GroupFileList({
  files,
  staged,
  viewMode,
  selectedTarget,
  onSelect,
}: {
  files: FileStatus[];
  staged: boolean;
  viewMode: ViewMode;
  selectedTarget: SelectedFileTarget | null;
  onSelect: (target: SelectedFileTarget) => void;
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
          onSelect={onSelect}
          depth={0}
        />
      </div>
    );
  }

  return (
    <div className="py-0.5">
      {files.map((file) => {
        const isSelected =
          selectedTarget?.path === file.path && selectedTarget?.staged === staged;
        return (
          <FileRowItem
            key={`${staged ? "staged" : "unstaged"}-${file.path}`}
            file={file}
            staged={staged}
            isSelected={isSelected}
            onSelect={() => onSelect({ path: file.path, staged, status: file })}
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
  onSelect,
  displayName,
  indent = 0,
}: {
  file: FileStatus;
  staged: boolean;
  isSelected: boolean;
  onSelect: () => void;
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
      style={{ paddingLeft: `${12 + indent * 14}px` }}
      className={`h-[24px] pr-3 flex items-center justify-between cursor-pointer group transition-colors text-[12px] ${
        isSelected
          ? "bg-[var(--color-selection)] text-[var(--color-text)] font-medium"
          : "hover:bg-[var(--color-surface-raised)] text-[var(--color-text)]"
      }`}
    >
      <div className="flex items-center gap-1.5 overflow-hidden">
        <FileIcon width={13} height={13} className="shrink-0 text-[var(--color-text-muted)]" />
        <span
          className={`truncate font-mono ${
            isDeleted ? "line-through text-[var(--color-status-deleted)] opacity-80" : ""
          }`}
          title={
            file.old_path ? `${file.old_path} → ${file.path}` : file.path
          }
        >
          {displayName || (file.old_path ? `${file.old_path} → ${file.path}` : file.path)}
        </span>
      </div>
      <span
        className={`shrink-0 ml-1.5 px-1 py-0.2 rounded text-[10px] font-mono font-bold leading-none ${badge.className}`}
        title={badge.title}
      >
        {badge.label}
      </span>
    </div>
  );
}

function getStatusBadge(kind: ChangeKind, conflicted: boolean) {
  if (conflicted) {
    return {
      label: "!",
      title: "冲突",
      className: "bg-[var(--color-status-conflict)]/20 text-[var(--color-status-conflict)]",
    };
  }
  switch (kind) {
    case "Added":
      return {
        label: "A",
        title: "新增",
        className: "bg-[var(--color-status-added)]/20 text-[var(--color-status-added)]",
      };
    case "Modified":
      return {
        label: "M",
        title: "修改",
        className: "bg-[var(--color-status-modified)]/20 text-[var(--color-status-modified)]",
      };
    case "Deleted":
      return {
        label: "D",
        title: "删除",
        className: "bg-[var(--color-status-deleted)]/20 text-[var(--color-status-deleted)]",
      };
    case "Renamed":
      return {
        label: "R",
        title: "重命名",
        className: "bg-[var(--color-status-renamed)]/20 text-[var(--color-status-renamed)]",
      };
    case "TypeChange":
      return {
        label: "T",
        title: "类型改变",
        className: "bg-[var(--color-accent)]/20 text-[var(--color-accent)]",
      };
    case "Untracked":
      return {
        label: "U",
        title: "未跟踪",
        className: "bg-[var(--color-status-added)]/20 text-[var(--color-status-added)]",
      };
    default:
      return {
        label: "?",
        title: "未知",
        className: "bg-gray-500/20 text-gray-500",
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
  onSelect,
  depth,
}: {
  nodes: TreeNode[];
  staged: boolean;
  selectedTarget: SelectedFileTarget | null;
  onSelect: (target: SelectedFileTarget) => void;
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
                style={{ paddingLeft: `${12 + depth * 14}px` }}
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
                  onSelect={onSelect}
                  depth={depth + 1}
                />
              )}
            </div>
          );
        }

        if (node.fileStatus) {
          const isSelected =
            selectedTarget?.path === node.fileStatus.path &&
            selectedTarget?.staged === staged;
          return (
            <FileRowItem
              key={`${staged ? "staged" : "unstaged"}-${node.fileStatus.path}`}
              file={node.fileStatus}
              staged={staged}
              isSelected={isSelected}
              onSelect={() =>
                onSelect({
                  path: node.fileStatus!.path,
                  staged,
                  status: node.fileStatus!,
                })
              }
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
