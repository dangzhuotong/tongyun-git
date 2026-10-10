import type { ReactNode } from "react";
import type { FileHistoryItem } from "../../lib/host";
import { relativeTime } from "./relativeTime";

interface FileHistoryListProps {
  history: FileHistoryItem[];
  selectedOid: string | null;
  onSelect: (oid: string) => void;
  /** 每行右下角的附加操作（例如「跳至提交图」）。 */
  renderAction?: (item: FileHistoryItem) => ReactNode;
}

/** 文件提交历史列表：弹窗和「历史」标签页共用。 */
export function FileHistoryList({ history, selectedOid, onSelect, renderAction }: FileHistoryListProps) {
  return (
    <div className="divide-y divide-[var(--color-border)]/50" role="listbox" aria-label="文件提交历史">
      {history.map((item) => {
        const isSelected = item.oid === selectedOid;
        return (
          <div
            key={item.oid}
            role="option"
            aria-selected={isSelected}
            onClick={() => onSelect(item.oid)}
            className={`px-3 py-2.5 cursor-pointer transition-colors text-xs border-l-2 ${
              isSelected
                ? "bg-[var(--color-selection)] border-[var(--color-accent)]"
                : "border-transparent hover:bg-[var(--color-surface-raised)]"
            }`}
          >
            <div className="flex items-center justify-between gap-1 mb-1">
              <span className="font-mono text-[11px] font-semibold text-[var(--color-accent-text)]">
                {item.short_oid}
              </span>
              <span
                className="text-[10px] text-[var(--color-text-muted)]"
                title={new Date(item.timestamp * 1000).toLocaleString()}
              >
                {relativeTime(item.timestamp)}
              </span>
            </div>
            <p className="font-medium truncate text-xs mb-1 text-[var(--color-text)]" title={item.summary}>
              {item.summary}
            </p>
            <div className="flex items-center justify-between text-[11px] text-[var(--color-text-muted)]">
              <span>{item.author_name}</span>
              {renderAction?.(item)}
            </div>
          </div>
        );
      })}
    </div>
  );
}
