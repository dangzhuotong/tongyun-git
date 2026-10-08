import { useState } from "react";
import type { AppInfo } from "../../lib/host";
import { checkGit, type GitCheckResult } from "../../lib/host";
import { SettingsIcon, CloseIcon, AlertCircleIcon } from "../../components/icons";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  appInfo: AppInfo | null;
  theme: "system" | "light" | "dark";
  onThemeChange: (theme: "system" | "light" | "dark") => void;
  gitPath: string;
  onGitPathChange: (path: string) => void;
}

export function SettingsModal({
  isOpen,
  onClose,
  appInfo,
  theme,
  onThemeChange,
  gitPath,
  onGitPathChange,
}: SettingsModalProps) {
  const [customPath, setCustomPath] = useState(gitPath);
  const [testResult, setTestResult] = useState<GitCheckResult | null>(null);
  const [testing, setTesting] = useState(false);

  if (!isOpen) return null;

  const handleTestGit = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await checkGit(customPath.trim() || undefined);
      setTestResult(res);
      if (res.available) {
        onGitPathChange(customPath.trim());
      }
    } catch (e: any) {
      setTestResult({
        available: false,
        error: e?.message || String(e),
      });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 select-none">
      <div className="w-full max-w-md rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] shadow-lg overflow-hidden flex flex-col text-xs text-[var(--color-text)]">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)]">
          <div className="flex items-center gap-2 font-semibold text-sm">
            <SettingsIcon width={16} height={16} className="text-[var(--color-accent)]" />
            <span>设置</span>
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
        <div className="p-4 space-y-5">
          {/* Theme Option */}
          <div className="space-y-2">
            <label className="block text-xs font-semibold text-[var(--color-text)]">
              界面主题
            </label>
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  { id: "system", label: "跟随系统" },
                  { id: "light", label: "浅色" },
                  { id: "dark", label: "深色" },
                ] as const
              ).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => onThemeChange(t.id)}
                  className={`py-1.5 px-3 rounded border text-center font-medium transition-colors ${
                    theme === t.id
                      ? "border-[var(--color-accent)] bg-[var(--color-accent)]/10 text-[var(--color-accent)]"
                      : "border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Git Executable Path */}
          <div className="space-y-2 pt-2 border-t border-[var(--color-border)]">
            <label className="block text-xs font-semibold text-[var(--color-text)]">
              Git 可执行文件路径
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="默认使用系统 PATH 中的 git"
                value={customPath}
                onChange={(e) => setCustomPath(e.target.value)}
                className="flex-1 px-3 py-1.5 rounded border border-[var(--color-border)] bg-[var(--color-bg)] font-mono text-xs focus:outline-none focus:border-[var(--color-accent)]"
              />
              <button
                type="button"
                onClick={handleTestGit}
                disabled={testing}
                className="px-3 py-1.5 rounded border border-[var(--color-border)] bg-[var(--color-surface-raised)] hover:bg-[var(--color-border)] font-medium text-[var(--color-text)]"
              >
                {testing ? "测试中..." : "测试连接"}
              </button>
            </div>

            {testResult && (
              <div
                className={`p-2 rounded border flex items-center gap-2 text-xs ${
                  testResult.available
                    ? "border-[var(--color-status-added)]/30 bg-[var(--color-status-added)]/10 text-[var(--color-status-added)]"
                    : "border-[var(--color-danger)]/30 bg-[var(--color-danger)]/10 text-[var(--color-danger)]"
                }`}
              >
                <AlertCircleIcon width={14} height={14} className="shrink-0" />
                <span>
                  {testResult.available
                    ? `Git 正常可用: ${testResult.version}`
                    : `Git 检测失败: ${testResult.error || "找不到可执行文件"}`}
                </span>
              </div>
            )}
          </div>

          {/* About / Versions */}
          <div className="space-y-1.5 pt-2 border-t border-[var(--color-border)] text-[11px] text-[var(--color-text-muted)]">
            <div className="flex justify-between">
              <span>应用名称</span>
              <span className="font-medium text-[var(--color-text)]">{appInfo?.name}</span>
            </div>
            <div className="flex justify-between">
              <span>应用版本</span>
              <span className="font-mono">{appInfo?.version}</span>
            </div>
            <div className="flex justify-between">
              <span>libgit2</span>
              <span className="font-mono">{appInfo?.libgit2_version}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
