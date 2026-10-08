import { CloseIcon, AlertCircleIcon, SparklesIcon } from "../../components/icons";

interface AiConsentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  endpointUrl: string;
}

export function AiConsentModal({
  isOpen,
  onClose,
  onConfirm,
  endpointUrl,
}: AiConsentModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 select-none">
      <div className="w-full max-w-md rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] shadow-lg overflow-hidden flex flex-col text-xs text-[var(--color-text)]">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)]">
          <div className="flex items-center gap-2 font-semibold text-sm">
            <SparklesIcon width={16} height={16} className="text-[var(--color-accent)]" />
            <span>AI 生成提交信息授权</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
          >
            <CloseIcon width={14} height={14} />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          <p className="text-xs text-[var(--color-text)] leading-relaxed">
            tongyun-git 将根据您当前<strong>已暂存的代码改动</strong>生成提交说明。请确认发送目标与内容范围：
          </p>

          <div className="p-2.5 rounded bg-[var(--color-bg)] border border-[var(--color-border)] space-y-1.5 font-mono text-[11px]">
            <div className="text-[var(--color-text-muted)]">发送目标接口：</div>
            <div className="text-[var(--color-accent)] break-all">{endpointUrl}</div>
          </div>

          <div className="space-y-2 text-[11px] text-[var(--color-text-muted)]">
            <div className="font-semibold text-[var(--color-text)]">发送内容包括：</div>
            <ul className="list-disc list-inside space-y-1">
              <li>已暂存的代码改动（diff，受最大字符截断保护）</li>
              <li>改动文件路径列表与当前分支名</li>
              <li>最近 10 条提交标题（仅用于对齐格式与历史风格）</li>
            </ul>
          </div>

          <div className="p-2.5 rounded border border-[var(--color-status-added)]/30 bg-[var(--color-status-added)]/10 text-[var(--color-text)] text-[11px] flex gap-2">
            <AlertCircleIcon width={14} height={14} className="text-[var(--color-status-added)] shrink-0 mt-0.5" />
            <div>
              <strong>敏感文件保护：</strong>应用已内置安全过滤机制，包括 <code>.env*</code>、<code>*.pem</code>、<code>*.key</code>、<code>id_rsa*</code> 等敏感文件，只会发送文件路径，绝不发送其内容。
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-[var(--color-border)] bg-[var(--color-bg)]/50">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded border border-[var(--color-border)] bg-[var(--color-surface)] hover:bg-[var(--color-border)] text-xs font-medium cursor-pointer"
          >
            取消
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="px-3 py-1.5 rounded bg-[var(--color-accent)] hover:opacity-90 text-white text-xs font-medium cursor-pointer shadow-xs"
          >
            同意并生成
          </button>
        </div>
      </div>
    </div>
  );
}
