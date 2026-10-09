import { useState, useEffect, useRef, useCallback } from "react";
import {
  checkCommitIdentity,
  inspectAmend,
  createCommit,
  generateAiCommitMessage,
  reviewStagedDiff,
  getAiKeyStatus,
  type AmendStatus,
  type AiSettings,
  type DiffReviewResult,
} from "../../lib/host";
import {
  SparklesIcon,
  ShieldCheckIcon,
  AlertCircleIcon,
  CloseIcon,
} from "../../components/icons";
import { AiConsentModal } from "./AiConsentModal";
import { PushedAmendWarningModal } from "./PushedAmendWarningModal";
import { IdentityModal } from "./IdentityModal";
import { AiReviewModal } from "./AiReviewModal";


interface CommitPanelProps {
  rootPath: string;
  stagedCount: number;
  onCommitSuccess: () => void;
  onOpenSettings: () => void;
  disabled?: boolean;
}

export function CommitPanel({
  rootPath,
  stagedCount,
  onCommitSuccess,
  onOpenSettings,
  disabled = false,
}: CommitPanelProps) {
  // Commit message & draft persistence (R-06 / AT-06d)
  const draftKey = `tongyun_commit_draft_${rootPath}`;
  const [message, setMessage] = useState<string>(() => {
    return localStorage.getItem(draftKey) || "";
  });
  const [isAmend, setIsAmend] = useState(false);
  const [amendStatus, setAmendStatus] = useState<AmendStatus | null>(null);
  const [committing, setCommitting] = useState(false);
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiReviewing, setAiReviewing] = useState(false);
  const [reviewResult, setReviewResult] = useState<DiffReviewResult | null>(null);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showIdentityModal, setShowIdentityModal] = useState(false);
  const [showPushedWarning, setShowPushedWarning] = useState(false);
  const [showConsentModal, setShowConsentModal] = useState(false);

  const pendingAiActionRef = useRef<"generate" | "review">("generate");
  const preAmendDraftRef = useRef<string>("");
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);


  // Sync state if rootPath changes without component unmount
  const [prevRootPath, setPrevRootPath] = useState(rootPath);
  if (prevRootPath !== rootPath) {
    setPrevRootPath(rootPath);
    setMessage(localStorage.getItem(draftKey) || "");
    setIsAmend(false);
    setError(null);
  }

  // Save draft whenever user types
  const handleMessageChange = (newMsg: string) => {
    setMessage(newMsg);
    if (!isAmend) {
      localStorage.setItem(draftKey, newMsg);
    }
  };

  // Inspect amend availability
  const checkAmendStatus = useCallback(async () => {
    try {
      const status = await inspectAmend(rootPath);
      setAmendStatus(status);
    } catch {
      setAmendStatus(null);
    }
  }, [rootPath]);

  useEffect(() => {
    let canceled = false;
    try {
      const p = inspectAmend(rootPath);
      if (p && typeof p.then === "function") {
        p.then((status) => {
          if (!canceled) setAmendStatus(status);
        }).catch(() => {
          if (!canceled) setAmendStatus(null);
        });
      }
    } catch {
      // ignore
    }
    return () => {
      canceled = true;
    };
  }, [rootPath, stagedCount]);

  // Toggle Amend checkbox (AT-06f, AT-06k)
  const handleToggleAmend = (checked: boolean) => {
    if (checked) {
      preAmendDraftRef.current = message;
      setIsAmend(true);
      if (amendStatus?.head_message) {
        setMessage(amendStatus.head_message);
      }
    } else {
      setIsAmend(false);
      // Restore pre-amend draft (AT-06k)
      const restored = preAmendDraftRef.current || localStorage.getItem(draftKey) || "";
      setMessage(restored);
    }
  };

  // First line character count (> 72 char warning) (R-06)
  const firstLine = message.split("\n")[0] || "";
  const firstLineLength = firstLine.length;
  const isTitleOverLimit = firstLineLength > 72;

  // Actual Commit implementation
  const executeCommit = async () => {
    if (!message.trim() || committing || disabled) return;
    if (!isAmend && stagedCount === 0) return;

    setCommitting(true);
    setError(null);

    try {
      // 1. Identity Check (R-06 / AT-06e)
      const identity = await checkCommitIdentity(rootPath);
      if (!identity || !identity.name.trim() || !identity.email.trim()) {
        setShowIdentityModal(true);
        setCommitting(false);
        return;
      }

      // 2. Execute commit via CliRunner
      await createCommit(rootPath, message, isAmend);

      // 3. Clear draft and reset state
      localStorage.removeItem(draftKey);
      setMessage("");
      setIsAmend(false);
      checkAmendStatus();
      onCommitSuccess();
    } catch (err: any) {
      // Hook failure or git commit error (AT-06b, AT-06j)
      const msg = err?.message || String(err);
      setError(msg);
    } finally {
      setCommitting(false);
    }
  };

  // Commit button handler (with pushed amend check)
  const handleCommitClick = async () => {
    if (isAmend && amendStatus?.is_pushed) {
      // PRD R-06: HEAD 包含在远程跟踪分支时，弹确认框
      setShowPushedWarning(true);
      return;
    }
    await executeCommit();
  };

  // Shortcut listener (Ctrl+Enter / Cmd+Enter inside textarea) (R-16)
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      handleCommitClick();
    }
  };

  // Global Ctrl+K / Cmd+K to focus commit textarea (R-16)
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k" && !e.shiftKey) {
        e.preventDefault();
        textareaRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, []);

  // AI Commit generation handler (R-07)
  const getAiSettings = (): AiSettings => {
    try {
      const stored = localStorage.getItem("tongyun_ai_settings");
      if (stored) {
        return JSON.parse(stored);
      }
    } catch {
      // ignore
    }
    return {
      provider: "kie",
      base_url: "https://api.kie.ai",
      model: "kie-default",
      language: "follow",
      conventional: false,
      timeout_seconds: 30,
      max_diff_chars: 20000,
      custom_secret_patterns: [],
      consented: false,
    };
  };

  const handleAiGenerateClick = async () => {
    if (stagedCount === 0 || aiGenerating || disabled) return;
    setError(null);

    const settings = getAiSettings();

    // Check key status first (R-07 / AT-07c)
    try {
      const keyStatus = await getAiKeyStatus();
      if (settings.provider === "kie" && !keyStatus.kie) {
        setError("未配置 KIE 接口 key，请在设置中配置");
        return;
      }
      if (settings.provider === "openai" && !keyStatus.openai) {
        setError("未配置 OpenAI 接口 key，请在设置中配置");
        return;
      }
    } catch (err: any) {
      setError(err?.message || String(err));
      return;
    }

    pendingAiActionRef.current = "generate";
    // First use consent dialog (R-07 / AT-07f / S9)
    if (!settings.consented) {
      setShowConsentModal(true);
      return;
    }

    await doGenerateAiMessage(settings);
  };

  const doGenerateAiMessage = async (settings: AiSettings) => {
    setAiGenerating(true);
    setError(null);

    try {
      const generated = await generateAiCommitMessage(rootPath, settings);
      setMessage(generated);
      if (!isAmend) {
        localStorage.setItem(draftKey, generated);
      }
    } catch (err: any) {
      const msg = err?.message || String(err);
      setError(msg);
    } finally {
      setAiGenerating(false);
    }
  };

  const handleAiReviewClick = async () => {
    setError(null);
    const settings = getAiSettings();

    try {
      const keyStatus = await getAiKeyStatus();
      if (settings.provider === "kie" && !keyStatus.kie) {
        setError("未配置 KIE 接口 key，请在设置中配置");
        return;
      }
      if (settings.provider === "openai" && !keyStatus.openai) {
        setError("未配置 OpenAI 接口 key，请在设置中配置");
        return;
      }
    } catch (err: any) {
      setError(err?.message || String(err));
      return;
    }

    pendingAiActionRef.current = "review";
    if (!settings.consented) {
      setShowConsentModal(true);
      return;
    }

    await doReviewStagedDiff(settings);
  };

  const doReviewStagedDiff = async (settings: AiSettings) => {
    setAiReviewing(true);
    setReviewError(null);
    setReviewResult(null);
    setShowReviewModal(true);

    try {
      const res = await reviewStagedDiff(rootPath, settings);
      setReviewResult(res);
    } catch (err: any) {
      const msg = err?.message || String(err);
      setReviewError(msg);
    } finally {
      setAiReviewing(false);
    }
  };

  const handleConsentConfirm = async () => {
    setShowConsentModal(false);
    const settings = getAiSettings();
    settings.consented = true;
    localStorage.setItem("tongyun_ai_settings", JSON.stringify(settings));
    if (pendingAiActionRef.current === "review") {
      await doReviewStagedDiff(settings);
    } else {
      await doGenerateAiMessage(settings);
    }
  };


  // Button disabled calculation
  const canCommit =
    !committing &&
    !disabled &&
    message.trim().length > 0 &&
    (isAmend || stagedCount > 0);

  const canAiGenerate = !aiGenerating && !disabled && stagedCount > 0;

  return (
    <div className="flex flex-col border-t border-[var(--color-border)] bg-[var(--color-surface)] text-xs select-none">
      {/* Error alert banner */}
      {error && (
        <div className="px-3 py-2 bg-[var(--color-danger)]/15 border-b border-[var(--color-danger)]/30 text-xs text-[var(--color-danger)] flex items-start justify-between gap-2">
          <div className="flex items-start gap-1.5 overflow-hidden">
            <AlertCircleIcon width={14} height={14} className="shrink-0 mt-0.5" />
            <div className="flex-1 break-words font-mono text-[11px] select-text">
              {error}
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {error.includes("未配置") && (
              <button
                type="button"
                onClick={onOpenSettings}
                className="px-1.5 py-0.5 rounded bg-[var(--color-danger)] text-white text-[10px] font-semibold hover:opacity-90 cursor-pointer"
              >
                去设置
              </button>
            )}
            <button
              type="button"
              onClick={() => setError(null)}
              className="p-0.5 hover:opacity-75 cursor-pointer text-[var(--color-danger)]"
            >
              <CloseIcon width={12} height={12} />
            </button>
          </div>
        </div>
      )}

      {/* Header Controls: Amend Checkbox & AI Generate Button */}
      <div className="px-3 py-2 flex items-center justify-between gap-2 border-b border-[var(--color-border)]/50 bg-[var(--color-bg)]/30">
        {/* Amend Checkbox (R-06) */}
        <label
          className={`flex items-center gap-1.5 cursor-pointer select-none text-[11px] ${
            !amendStatus?.can_amend ? "opacity-50 cursor-not-allowed" : ""
          }`}
          title={amendStatus?.disabled_reason || "修改最近一次提交"}
        >
          <input
            type="checkbox"
            checked={isAmend}
            disabled={!amendStatus?.can_amend || disabled || committing}
            onChange={(e) => handleToggleAmend(e.target.checked)}
            className="rounded border-[var(--color-border)] text-[var(--color-accent)] focus:ring-[var(--color-accent)] cursor-pointer"
          />
          <span className="text-[var(--color-text)]">修改上一次提交</span>
          {isAmend && amendStatus?.is_pushed && (
            <span className="text-[9px] px-1 py-0.2 rounded bg-[var(--color-danger)]/20 text-[var(--color-danger)] font-medium">
              已推送
            </span>
          )}
        </label>

        {/* AI Action Buttons */}
        <div className="flex items-center gap-1.5">
          {/* AI Review Button */}
          <button
            type="button"
            onClick={handleAiReviewClick}
            disabled={stagedCount === 0 || aiReviewing || disabled}
            title={
              stagedCount === 0
                ? "没有暂存的改动，暂无法审查"
                : "提交前通过 AI 审查暂存区中的潜在 Bug、密钥泄露与代码质量"
            }
            className="flex items-center gap-1 px-2 py-1 rounded border border-[var(--color-border)] bg-[var(--color-surface)] hover:bg-[var(--color-border)] text-[11px] text-[var(--color-text)] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors shadow-2xs"
          >
            <ShieldCheckIcon
              width={13}
              height={13}
              className={aiReviewing ? "animate-pulse text-emerald-500" : "text-emerald-500"}
            />
            <span>{aiReviewing ? "审查中..." : "AI 审查"}</span>
          </button>

          {/* AI Generate Button (R-07) */}
          <button
            type="button"
            onClick={handleAiGenerateClick}
            disabled={!canAiGenerate}
            title={
              stagedCount === 0
                ? "没有暂存的改动，暂无法生成"
                : "基于暂存区改动通过 AI 生成提交信息"
            }
            className="flex items-center gap-1 px-2 py-1 rounded border border-[var(--color-border)] bg-[var(--color-surface)] hover:bg-[var(--color-border)] text-[11px] text-[var(--color-text)] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors shadow-2xs"
          >
            <SparklesIcon
              width={13}
              height={13}
              className={aiGenerating ? "animate-spin text-[var(--color-accent)]" : "text-[var(--color-accent)]"}
            />
            <span>{aiGenerating ? "生成中..." : "AI 生成"}</span>
          </button>
        </div>
      </div>


      {/* Textarea for Commit Message */}
      <div className="relative p-2 flex flex-col">
        <textarea
          ref={textareaRef}
          value={message}
          onChange={(e) => handleMessageChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="提交信息 (首行标题，空一行输入详细说明，Ctrl+Enter 提交)..."
          rows={4}
          disabled={disabled || committing}
          className="w-full p-2 rounded bg-[var(--color-bg)] border border-[var(--color-border)] text-xs text-[var(--color-text)] placeholder-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-accent)] resize-y font-sans leading-relaxed select-text"
        />

        {/* Footer info: First line length / limit & Commit button */}
        <div className="mt-2 flex items-center justify-between text-[11px]">
          <div className="flex items-center gap-2">
            {isTitleOverLimit && (
              <span className="text-[var(--color-danger)] font-medium text-[10px] flex items-center gap-1">
                <AlertCircleIcon width={11} height={11} />
                标题已超 72 字符 ({firstLineLength})
              </span>
            )}
            {!isTitleOverLimit && firstLineLength > 0 && (
              <span className="text-[var(--color-text-muted)] text-[10px]">
                标题 {firstLineLength} 字符
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCommitClick}
              disabled={!canCommit}
              title={
                !message.trim()
                  ? "请输入提交信息"
                  : !isAmend && stagedCount === 0
                  ? "请先暂存文件"
                  : "Ctrl+Enter 提交"
              }
              className={`px-3 py-1.5 rounded font-medium text-xs text-white shadow-xs cursor-pointer transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
                isAmend
                  ? "bg-[var(--color-status-modified)] hover:opacity-90"
                  : "bg-[var(--color-accent)] hover:opacity-90"
              }`}
            >
              {committing
                ? "提交中..."
                : isAmend
                ? "修改提交"
                : `提交 (${stagedCount})`}
            </button>
          </div>
        </div>
      </div>

      {/* Modals */}
      <IdentityModal
        isOpen={showIdentityModal}
        rootPath={rootPath}
        onClose={() => setShowIdentityModal(false)}
        onConfigured={async () => {
          setShowIdentityModal(false);
          await executeCommit();
        }}
      />

      <PushedAmendWarningModal
        isOpen={showPushedWarning}
        onClose={() => setShowPushedWarning(false)}
        onConfirm={async () => {
          setShowPushedWarning(false);
          await executeCommit();
        }}
        remoteBranches={amendStatus?.pushed_remote_branches || []}
      />

      <AiConsentModal
        isOpen={showConsentModal}
        onClose={() => setShowConsentModal(false)}
        onConfirm={handleConsentConfirm}
        endpointUrl={getAiSettings().base_url || "https://api.kie.ai"}
      />

      <AiReviewModal
        isOpen={showReviewModal}
        onClose={() => setShowReviewModal(false)}
        result={reviewResult}
        loading={aiReviewing}
        error={reviewError}
        onProceedCommit={handleCommitClick}
      />
    </div>
  );
}

