import { useState, useMemo } from "react";
import type { DiffReviewResult } from "../../lib/host";
import {
  CloseIcon,
  ShieldCheckIcon,
  AlertCircleIcon,
  CheckIcon,
} from "../../components/icons";
import { useEscapeKey } from "../../hooks/useEscapeKey";

interface AiReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  result: DiffReviewResult | null;
  loading: boolean;
  error: string | null;
  onProceedCommit: () => void;
}

export function AiReviewModal(props: AiReviewModalProps) {
  useEscapeKey(props.onClose, props.isOpen);
  if (!props.isOpen) return null;
  return <AiReviewModalContent {...props} />;
}

function AiReviewModalContent({
  onClose,
  result,
  loading,
  error,
  onProceedCommit,
}: AiReviewModalProps) {
  const [selectedFilter, setSelectedFilter] = useState<"all" | "danger" | "warning" | "info">("all");

  const issues = useMemo(() => result?.issues ?? [], [result?.issues]);

  const dangerCount = useMemo(() => issues.filter((i) => i.level === "danger").length, [issues]);
  const warningCount = useMemo(() => issues.filter((i) => i.level === "warning").length, [issues]);
  const infoCount = useMemo(() => issues.filter((i) => i.level === "info").length, [issues]);

  const filteredIssues = useMemo(() => {
    if (selectedFilter === "all") return issues;
    return issues.filter((i) => i.level === selectedFilter);
  }, [issues, selectedFilter]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="AI 提交前代码审查"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 select-none animate-in fade-in duration-100"
    >
      <div className="w-full max-w-2xl max-h-[85vh] rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-2xl overflow-hidden flex flex-col text-xs text-[var(--color-text)] animate-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)] bg-[var(--color-bg)] shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-500">
              <ShieldCheckIcon width={18} height={18} />
            </div>
            <div>
              <div className="font-semibold text-sm">AI 提交前代码审查 (Pre-Commit Review)</div>
              <div className="text-[11px] text-[var(--color-text-muted)]">
                自动审查暂存区改动中的敏感密钥泄露、严重逻辑 Bug 与临时调试遗留
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-md text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors cursor-pointer"
            title="关闭"
          >
            <CloseIcon width={14} height={14} />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3.5">
          {/* Loading State */}
          {loading && (
            <div className="py-12 flex flex-col items-center justify-center gap-3 text-[var(--color-text-muted)]">
              <div className="w-8 h-8 rounded-full border-2 border-[var(--color-accent)] border-t-transparent animate-spin" />
              <div className="font-medium text-xs">AI 正在深度审查暂存区代码...</div>
              <div className="text-[11px] text-gray-500">
                正在排查代码逻辑、潜在边界越界、空引用与凭据泄露
              </div>
            </div>
          )}

          {/* Error State */}
          {!loading && error && (
            <div className="p-3.5 rounded-lg border border-red-500/30 bg-red-500/10 text-red-400 space-y-2">
              <div className="flex items-center gap-2 font-semibold">
                <AlertCircleIcon width={16} height={16} />
                <span>审查失败</span>
              </div>
              <div className="text-xs leading-relaxed">{error}</div>
            </div>
          )}

          {/* Result State */}
          {!loading && !error && result && (
            <div className="space-y-3.5">
              {/* Verdict Status Banner */}
              <div
                className={`p-3 rounded-lg border flex items-start gap-2.5 ${
                  result.passed
                    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                    : "border-red-500/30 bg-red-500/10 text-red-300"
                }`}
              >
                <div className="mt-0.5">
                  {result.passed ? (
                    <CheckIcon width={16} height={16} className="text-emerald-400" />
                  ) : (
                    <AlertCircleIcon width={16} height={16} className="text-red-400" />
                  )}
                </div>
                <div className="flex-1 space-y-1">
                  <div className="font-semibold text-xs">
                    {result.passed
                      ? "审查通过：未发现明显安全隐患或严重阻断性缺陷"
                      : "发现高风险问题：建议在提交前修复"}
                  </div>
                  <div className="text-[11px] opacity-90 leading-relaxed font-sans">
                    {result.summary}
                  </div>
                </div>
              </div>

              {/* Filter Tabs if issues exist */}
              {issues.length > 0 && (
                <div className="flex items-center gap-2 border-b border-[var(--color-border)]/60 pb-2">
                  <button
                    type="button"
                    onClick={() => setSelectedFilter("all")}
                    className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors cursor-pointer ${
                      selectedFilter === "all"
                        ? "bg-[var(--color-surface-raised)] text-[var(--color-text)] shadow-xs"
                        : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
                    }`}
                  >
                    全部 ({issues.length})
                  </button>
                  {dangerCount > 0 && (
                    <button
                      type="button"
                      onClick={() => setSelectedFilter("danger")}
                      className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors cursor-pointer ${
                        selectedFilter === "danger"
                          ? "bg-red-500/20 text-red-400 shadow-xs"
                          : "text-red-400/70 hover:text-red-400"
                      }`}
                    >
                      高危 ({dangerCount})
                    </button>
                  )}
                  {warningCount > 0 && (
                    <button
                      type="button"
                      onClick={() => setSelectedFilter("warning")}
                      className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors cursor-pointer ${
                        selectedFilter === "warning"
                          ? "bg-amber-500/20 text-amber-400 shadow-xs"
                          : "text-amber-400/70 hover:text-amber-400"
                      }`}
                    >
                      警告 ({warningCount})
                    </button>
                  )}
                  {infoCount > 0 && (
                    <button
                      type="button"
                      onClick={() => setSelectedFilter("info")}
                      className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors cursor-pointer ${
                        selectedFilter === "info"
                          ? "bg-blue-500/20 text-blue-400 shadow-xs"
                          : "text-blue-400/70 hover:text-blue-400"
                      }`}
                    >
                      建议 ({infoCount})
                    </button>
                  )}
                </div>
              )}

              {/* Issues List */}
              {issues.length === 0 ? (
                <div className="py-8 text-center text-[var(--color-text-muted)] space-y-1">
                  <div className="text-base">✨</div>
                  <div className="font-medium text-xs text-[var(--color-text)]">代码规范整洁</div>
                  <div className="text-[11px]">暂存区代码未检测到任何安全隐患、敏感密钥或逻辑漏洞。</div>
                </div>
              ) : filteredIssues.length === 0 ? (
                <div className="py-6 text-center text-[var(--color-text-muted)] text-[11px]">
                  该筛选条件下无问题
                </div>
              ) : (
                <div className="space-y-2.5">
                  {filteredIssues.map((issue, idx) => {
                    const isDanger = issue.level === "danger";
                    const isWarning = issue.level === "warning";
                    return (
                      <div
                        key={idx}
                        className={`p-3 rounded-lg border space-y-1.5 transition-colors ${
                          isDanger
                            ? "border-red-500/30 bg-red-500/5"
                            : isWarning
                            ? "border-amber-500/30 bg-amber-500/5"
                            : "border-blue-500/20 bg-blue-500/5"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span
                              className={`px-1.5 py-0.2 rounded text-[10px] font-semibold uppercase ${
                                isDanger
                                  ? "bg-red-500/20 text-red-400 border border-red-500/30"
                                  : isWarning
                                  ? "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                                  : "bg-blue-500/20 text-blue-400 border border-blue-500/30"
                              }`}
                            >
                              {isDanger ? "高危漏洞" : isWarning ? "缺陷警告" : "改进建议"}
                            </span>
                            {issue.file && (
                              <span className="font-mono text-[11px] text-[var(--color-text-muted)] bg-[var(--color-bg)] px-1.5 py-0.5 rounded border border-[var(--color-border)]">
                                {issue.file}
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="text-xs leading-relaxed text-[var(--color-text)] font-sans">
                          {issue.message}
                        </div>

                        {issue.suggestion && (
                          <div className="p-2 rounded bg-[var(--color-bg)]/80 border border-[var(--color-border)]/60 text-[11px] text-[var(--color-text-muted)] space-y-1">
                            <div className="font-medium text-[var(--color-text)] text-[10px]">修复建议：</div>
                            <div className="font-mono leading-relaxed select-text text-emerald-400 dark:text-emerald-300">
                              {issue.suggestion}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-4 py-3 border-t border-[var(--color-border)] bg-[var(--color-bg)] flex items-center justify-between shrink-0">
          <div className="text-[11px] text-[var(--color-text-muted)]">
            审查由本地配置的 AI 模型生成，仅作为提交参考
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded-lg border border-[var(--color-border)] hover:bg-[var(--color-surface-raised)] text-xs text-[var(--color-text)] transition-colors cursor-pointer"
            >
              关闭修改
            </button>
            <button
              type="button"
              onClick={() => {
                onProceedCommit();
                onClose();
              }}
              className="px-3 py-1.5 rounded-lg bg-[var(--color-accent)] text-white text-xs font-medium hover:opacity-90 transition-opacity cursor-pointer shadow-xs"
            >
              知晓并继续提交
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
