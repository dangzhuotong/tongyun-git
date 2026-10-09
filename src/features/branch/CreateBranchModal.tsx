import { useState } from "react";
import { validateBranchName, createBranch } from "../../lib/host";
import { BranchIcon, CloseIcon, AlertCircleIcon } from "../../components/icons";
import { useEscapeKey } from "../../hooks/useEscapeKey";

interface CreateBranchModalProps {
  isOpen: boolean;
  onClose: () => void;
  rootPath: string;
  startPoint?: string | null;
  onBranchCreated: () => void;
}

export function CreateBranchModal(props: CreateBranchModalProps) {
  useEscapeKey(props.onClose, props.isOpen);
  if (!props.isOpen) return null;
  return <CreateBranchModalContent {...props} />;
}

function CreateBranchModalContent({
  onClose,
  rootPath,
  startPoint,
  onBranchCreated,
}: Omit<CreateBranchModalProps, "isOpen">) {
  const [name, setName] = useState("");
  const [checkout, setCheckout] = useState(true);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [generalError, setGeneralError] = useState<string | null>(null);

  // Real-time branch name validation (R-09 / AT-09b)
  const handleNameChange = async (val: string) => {
    setName(val);
    setGeneralError(null);
    if (!val.trim()) {
      setValidationError(null);
      return;
    }

    try {
      const res = await validateBranchName(rootPath, val.trim());
      if (!res.valid) {
        setValidationError(res.error_message || "分支名不合法");
      } else {
        setValidationError(null);
      }
    } catch {
      // ignore
    }
  };

  const handleCreate = async () => {
    const trimmed = name.trim();
    if (!trimmed || validationError || creating) return;

    setCreating(true);
    setGeneralError(null);

    try {
      await createBranch(rootPath, trimmed, startPoint, checkout);
      onBranchCreated();
      onClose();
    } catch (err: any) {
      setGeneralError(err?.message || String(err));
    } finally {
      setCreating(false);
    }
  };

  const startPointDisplay = startPoint
    ? startPoint.length > 8
      ? startPoint.slice(0, 7)
      : startPoint
    : "HEAD";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 select-none">
      <div className="w-full max-w-sm rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] shadow-lg overflow-hidden flex flex-col text-xs text-[var(--color-text)]">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)]">
          <div className="flex items-center gap-2 font-semibold text-sm">
            <BranchIcon width={16} height={16} className="text-[var(--color-accent)]" />
            <span>新建分支</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded text-[var(--color-text-muted)] hover:text-[var(--color-text)] cursor-pointer"
          >
            <CloseIcon width={14} height={14} />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-3.5">
          {/* Start Point Display */}
          <div className="text-[11px] text-[var(--color-text-muted)] flex items-center gap-1.5">
            <span>起点：</span>
            <span className="font-mono px-1.5 py-0.5 rounded bg-[var(--color-bg)] border border-[var(--color-border)] text-[var(--color-text)]">
              {startPointDisplay}
            </span>
          </div>

          {/* Branch Name Input */}
          <div className="space-y-1">
            <label className="block text-xs font-semibold text-[var(--color-text)]">
              分支名称
            </label>
            <input
              type="text"
              autoFocus
              placeholder="例如: feature/login"
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !validationError && name.trim()) {
                  handleCreate();
                }
              }}
              className={`w-full px-3 py-1.5 rounded border bg-[var(--color-bg)] text-xs font-mono focus:outline-none select-text ${
                validationError
                  ? "border-[var(--color-danger)] focus:border-[var(--color-danger)]"
                  : "border-[var(--color-border)] focus:border-[var(--color-accent)]"
              }`}
            />

            {/* Validation Error Hint (AT-09b) */}
            {validationError && (
              <div className="text-[11px] text-[var(--color-danger)] flex items-center gap-1 pt-0.5">
                <AlertCircleIcon width={12} height={12} className="shrink-0" />
                <span>{validationError}</span>
              </div>
            )}
          </div>

          {/* Checkout Checkbox */}
          <label className="flex items-center gap-2 cursor-pointer select-none text-xs text-[var(--color-text)] pt-1">
            <input
              type="checkbox"
              checked={checkout}
              onChange={(e) => setCheckout(e.target.checked)}
              className="rounded border-[var(--color-border)] text-[var(--color-accent)] focus:ring-[var(--color-accent)] cursor-pointer"
            />
            <span>创建后切换到该分支</span>
          </label>

          {generalError && (
            <div className="p-2 rounded border border-[var(--color-danger)]/30 bg-[var(--color-danger)]/10 text-[var(--color-danger)] text-[11px] flex gap-1.5">
              <AlertCircleIcon width={13} height={13} className="shrink-0 mt-0.5" />
              <span className="break-words select-text">{generalError}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-[var(--color-border)] bg-[var(--color-bg)]/40">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded border border-[var(--color-border)] bg-[var(--color-surface)] hover:bg-[var(--color-border)] text-xs font-medium cursor-pointer"
          >
            取消
          </button>
          <button
            type="button"
            onClick={handleCreate}
            disabled={!name.trim() || Boolean(validationError) || creating}
            className="px-3.5 py-1.5 rounded bg-[var(--color-accent)] hover:opacity-90 disabled:opacity-40 text-white text-xs font-medium cursor-pointer shadow-xs"
          >
            {creating ? "创建中..." : "创建"}
          </button>
        </div>
      </div>
    </div>
  );
}
