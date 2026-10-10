import React, { useState } from "react";

export interface CommandItem {
  id: string;
  title: string;
  description?: string;
  shortcut?: string;
  action: () => void;
  category?: string;
}

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  commands: CommandItem[];
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  isOpen,
  onClose,
  commands,
}) => {
  if (!isOpen) return null;

  return <CommandPaletteContent onClose={onClose} commands={commands} />;
};

interface CommandPaletteContentProps {
  onClose: () => void;
  commands: CommandItem[];
}

const CommandPaletteContent: React.FC<CommandPaletteContentProps> = ({
  onClose,
  commands,
}) => {
  const [query, setQuery] = useState<string>("");
  const [selectedIndex, setSelectedIndex] = useState<number>(0);

  const filtered = commands.filter((cmd) => {
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return (
      cmd.title.toLowerCase().includes(q) ||
      (cmd.description && cmd.description.toLowerCase().includes(q)) ||
      (cmd.shortcut && cmd.shortcut.toLowerCase().includes(q))
    );
  });

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1 < filtered.length ? prev + 1 : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 >= 0 ? prev - 1 : filtered.length - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (filtered[selectedIndex]) {
        filtered[selectedIndex].action();
        onClose();
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-24 bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-2xl text-[var(--color-text)] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center border-b border-[var(--color-border)] px-4 py-3 gap-3 bg-[var(--color-bg)]">
          <svg
            className="w-5 h-5 text-[var(--color-text-muted)] shrink-0"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          <input
            autoFocus
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            onKeyDown={handleKeyDown}
            placeholder="搜索命令或操作..."
            className="w-full bg-transparent text-sm focus:outline-none placeholder-[var(--color-text-muted)] text-[var(--color-text)]"
          />
          <kbd className="text-[10px] bg-[var(--color-surface-raised)] border border-[var(--color-border)] rounded px-1.5 py-0.5 text-[var(--color-text-muted)]">
            Esc
          </kbd>
        </div>

        <div className="max-h-80 overflow-y-auto p-2 space-y-1">
          {filtered.length === 0 ? (
            <div className="py-8 text-center text-xs text-[var(--color-text-muted)]">
              未找到匹配的命令
            </div>
          ) : (
            filtered.map((cmd, idx) => {
              const isSelected = idx === selectedIndex;
              return (
                <div
                  key={cmd.id}
                  onClick={() => {
                    cmd.action();
                    onClose();
                  }}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={`flex items-center justify-between px-3 py-2 rounded-lg text-xs cursor-pointer transition-colors ${
                    isSelected
                      ? "bg-[var(--color-selection)] text-[var(--color-text)] border border-[var(--color-border-strong)]"
                      : "text-[var(--color-text)] hover:bg-[var(--color-surface-raised)] border border-transparent"
                  }`}
                >
                  <div className="flex flex-col gap-0.5 truncate">
                    <span className="font-medium truncate">{cmd.title}</span>
                    {cmd.description && (
                      <span className="text-[11px] text-[var(--color-text-muted)] truncate">
                        {cmd.description}
                      </span>
                    )}
                  </div>
                  {cmd.shortcut && (
                    <kbd className="ml-3 shrink-0 text-[10px] bg-[var(--color-surface-raised)] border border-[var(--color-border)] rounded px-1.5 py-0.5 font-mono text-[var(--color-text-muted)]">
                      {cmd.shortcut}
                    </kbd>
                  )}
                </div>
              );
            })
          )}
        </div>

        <div className="border-t border-[var(--color-border)] px-4 py-2 bg-[var(--color-surface-raised)] flex justify-between text-[11px] text-[var(--color-text-muted)]">
          <span>上下键导航</span>
          <span>Enter 确认执行</span>
        </div>
      </div>
    </div>
  );
};
