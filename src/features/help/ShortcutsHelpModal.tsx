import { CloseIcon, KeyboardIcon } from "../../components/icons";
import { useEscapeKey } from "../../hooks/useEscapeKey";

interface ShortcutsHelpModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface ShortcutItem {
  key: string;
  desc: string;
  category: "日常操作" | "暂存与提交" | "导航与视图";
}

export function ShortcutsHelpModal({ isOpen, onClose }: ShortcutsHelpModalProps) {
  useEscapeKey(onClose, isOpen);

  if (!isOpen) return null;

  const isMac = typeof navigator !== "undefined" && /Mac|iPod|iPhone|iPad/.test(navigator.platform);

  const shortcuts: ShortcutItem[] = [
    {
      key: isMac ? "Cmd+K" : "Ctrl+K",
      desc: "聚焦提交信息输入框 / 打开提交区",
      category: "暂存与提交",
    },
    {
      key: isMac ? "Cmd+Enter" : "Ctrl+Enter",
      desc: "在提交信息框内执行提交",
      category: "暂存与提交",
    },
    {
      key: isMac ? "Ctrl+Option+M" : "Alt+M",
      desc: "勾选 / 取消「修改上一次提交 (Amend)」",
      category: "暂存与提交",
    },
    {
      key: isMac ? "Cmd+Option+G" : "Ctrl+Alt+G",
      desc: "触发 AI 智能生成提交信息",
      category: "暂存与提交",
    },
    {
      key: "Space (空格)",
      desc: "暂存或取消暂存所选文件 / hunk / 行",
      category: "暂存与提交",
    },
    {
      key: "a",
      desc: "在 Diff 视图中快速选中当前 hunk",
      category: "暂存与提交",
    },
    {
      key: isMac ? "Cmd+Option+Z" : "Ctrl+Alt+Z",
      desc: "丢弃所选文件的改动 (带安全快照与确认)",
      category: "暂存与提交",
    },
    {
      key: isMac ? "Cmd+Shift+K" : "Ctrl+Shift+K",
      desc: "打开推送弹窗 (Push)",
      category: "日常操作",
    },
    {
      key: isMac ? "Cmd+T" : "Ctrl+T",
      desc: "拉取远程分支 (Pull)",
      category: "日常操作",
    },
    {
      key: isMac ? "Cmd+Shift+`" : "Ctrl+Shift+`",
      desc: "打开分支管理弹窗",
      category: "日常操作",
    },
    {
      key: isMac ? "Cmd+Shift+P" : "Ctrl+Shift+P",
      desc: "打开全局命令面板 (Command Palette)",
      category: "日常操作",
    },
    {
      key: isMac ? "Cmd+0" : "Alt+0",
      desc: "切到工作区改动视图",
      category: "导航与视图",
    },
    {
      key: isMac ? "Cmd+9" : "Alt+9",
      desc: "切到提交历史树图视图",
      category: "导航与视图",
    },
    {
      key: "? / F1",
      desc: "打开快捷键帮助说明",
      category: "导航与视图",
    },
    {
      key: "Esc",
      desc: "关闭当前弹窗 / 取消操作",
      category: "导航与视图",
    },
  ];

  const categories = ["暂存与提交", "日常操作", "导航与视图"] as const;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 select-none">
      <div className="w-full max-w-xl max-h-[85vh] rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-2xl overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)] bg-[var(--color-surface-raised)] shrink-0">
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-md bg-[var(--color-accent)]/15 text-[var(--color-accent)]">
              <KeyboardIcon width={16} height={16} />
            </span>
            <div>
              <h2 className="text-sm font-semibold text-[var(--color-text)]">
                键盘快捷键速查 (Keyboard Shortcuts)
              </h2>
              <span className="text-[11px] text-[var(--color-text-muted)]">
                深度对齐 IntelliJ IDEA 键盘流习惯
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-md text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface)] transition-colors cursor-pointer"
          >
            <CloseIcon width={16} height={16} />
          </button>
        </div>

        {/* Shortcuts Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {categories.map((cat) => {
            const list = shortcuts.filter((s) => s.category === cat);
            return (
              <div key={cat} className="space-y-1.5">
                <h3 className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider px-1">
                  {cat}
                </h3>
                <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-raised)] divide-y divide-[var(--color-border)]/50 overflow-hidden">
                  {list.map((s) => (
                    <div
                      key={s.key}
                      className="px-3 py-2 flex items-center justify-between text-xs"
                    >
                      <span className="text-[var(--color-text)]">{s.desc}</span>
                      <kbd className="px-2 py-0.5 rounded-md bg-[var(--color-bg)] border border-[var(--color-border)] font-mono text-[11px] font-medium text-[var(--color-accent)] shadow-2xs">
                        {s.key}
                      </kbd>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
