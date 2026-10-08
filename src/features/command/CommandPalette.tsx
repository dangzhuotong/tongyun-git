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
        className="w-full max-w-xl rounded-xl border border-gray-700 bg-gray-900 shadow-2xl text-gray-100 overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center border-b border-gray-800 px-4 py-3 gap-3">
          <svg
            className="w-5 h-5 text-gray-400 shrink-0"
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
            className="w-full bg-transparent text-sm focus:outline-none placeholder-gray-500 text-gray-100"
          />
          <kbd className="text-[10px] bg-gray-800 border border-gray-700 rounded px-1.5 py-0.5 text-gray-400">
            Esc
          </kbd>
        </div>

        <div className="max-h-80 overflow-y-auto p-2 space-y-1">
          {filtered.length === 0 ? (
            <div className="py-8 text-center text-xs text-gray-500">
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
                      ? "bg-blue-600/30 text-blue-200 border border-blue-500/40"
                      : "text-gray-300 hover:bg-gray-800/60 border border-transparent"
                  }`}
                >
                  <div className="flex flex-col gap-0.5 truncate">
                    <span className="font-medium truncate">{cmd.title}</span>
                    {cmd.description && (
                      <span className="text-[11px] text-gray-400 truncate">
                        {cmd.description}
                      </span>
                    )}
                  </div>
                  {cmd.shortcut && (
                    <kbd className="ml-3 shrink-0 text-[10px] bg-gray-800 border border-gray-700/80 rounded px-1.5 py-0.5 font-mono text-gray-400">
                      {cmd.shortcut}
                    </kbd>
                  )}
                </div>
              );
            })
          )}
        </div>

        <div className="border-t border-gray-800/80 px-4 py-2 bg-gray-950/40 flex justify-between text-[11px] text-gray-500">
          <span>上下键导航</span>
          <span>Enter 确认执行</span>
        </div>
      </div>
    </div>
  );
};
