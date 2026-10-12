import type { ReactNode } from "react";
import { splitPath } from "./splitPath";

export interface FilePathLabelProps {
  path: string;
  oldPath?: string | null;
  /** 树模式或外部显式指定展示名（已是文件名时直接显示，不再补目录） */
  displayName?: string;
  isDeleted?: boolean;
  className?: string;
}

/**
 * 类似 IntelliJ IDEA 的文件路径显示组件：
 * 平铺模式先显示文件名（正常色），后跟灰色小字所在目录（根目录文件不显示目录）。
 * 重命名显示为 `新文件名 ← 旧文件名`。
 * 删除状态的删除线保留在文件名上。
 */
export function FilePathLabel({
  path,
  oldPath,
  displayName,
  isDeleted = false,
  className = "",
}: FilePathLabelProps): ReactNode {
  if (displayName) {
    return (
      <span
        className={`truncate font-mono ${
          isDeleted ? "line-through text-[var(--color-status-deleted)] opacity-80" : ""
        } ${className}`}
      >
        {displayName}
      </span>
    );
  }

  const { fileName, dirPath } = splitPath(path);
  const oldSplit = oldPath ? splitPath(oldPath) : null;
  const fileLabel = oldSplit ? `${fileName} ← ${oldSplit.fileName}` : fileName;

  return (
    <span className={`inline-flex items-baseline min-w-0 font-mono ${className}`}>
      <span
        className={`shrink-0 ${
          isDeleted ? "line-through text-[var(--color-status-deleted)] opacity-80" : ""
        }`}
      >
        {fileLabel}
      </span>
      {dirPath ? (
        <span className="text-[var(--color-text-muted)] text-[11px] ml-1.5 truncate opacity-70">
          {dirPath}
        </span>
      ) : null}
    </span>
  );
}
