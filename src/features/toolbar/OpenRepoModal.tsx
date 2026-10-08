import { useState, type FormEvent, useEffect } from "react";
import { FolderIcon, AlertCircleIcon, CloseIcon } from "../../components/icons";
import { selectFolder } from "../../lib/host";
import { getCurrentWebview } from "@tauri-apps/api/webview";

interface OpenRepoModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenRepo: (path: string) => Promise<void>;
  onInitRepo?: (path: string) => Promise<void>;
  onCloneRepo?: (url: string, targetPath: string) => Promise<void>;
  recentRepos: string[];
  onRemoveRecent: (path: string) => void;
  error: string | null;
  loading: boolean;
  initialPath?: string;
  initialTab?: "open" | "clone";
}

export function OpenRepoModal({
  isOpen,
  onClose,
  onOpenRepo,
  onInitRepo,
  onCloneRepo,
  recentRepos,
  onRemoveRecent,
  error,
  loading,
  initialPath = "",
  initialTab = "open",
}: OpenRepoModalProps) {
  const [activeTab, setActiveTab] = useState<"open" | "clone">(initialTab);
  const [prevInitialTab, setPrevInitialTab] = useState(initialTab);
  const [inputPath, setInputPath] = useState(initialPath);
  const [prevInitialPath, setPrevInitialPath] = useState(initialPath);
  const [cloneUrl, setCloneUrl] = useState("");
  const [cloneTargetDir, setCloneTargetDir] = useState("");
  const [isDragOver, setIsDragOver] = useState(false);

  if (initialTab !== prevInitialTab) {
    setPrevInitialTab(initialTab);
    setActiveTab(initialTab);
  }

  if (initialPath !== prevInitialPath) {
    setPrevInitialPath(initialPath);
    setInputPath(initialPath);
  }

  useEffect(() => {
    if (!isOpen) return;
    let unlisten: (() => void) | undefined;
    try {
      getCurrentWebview()
        .onDragDropEvent((event) => {
          if (event.payload.type === "over") {
            setIsDragOver(true);
          } else if (event.payload.type === "drop") {
            setIsDragOver(false);
            if (event.payload.paths.length > 0) {
              const dropped = event.payload.paths[0];
              setInputPath(dropped);
              onOpenRepo(dropped);
            }
          } else {
            setIsDragOver(false);
          }
        })
        .then((fn) => {
          unlisten = fn;
        })
        .catch(() => {});
    } catch {
      // ignore
    }

    return () => {
      unlisten?.();
    };
  }, [isOpen, onOpenRepo]);

  if (!isOpen) return null;

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!inputPath.trim()) return;
    onOpenRepo(inputPath.trim());
  };

  const handleCloneSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!cloneUrl.trim() || !cloneTargetDir.trim() || !onCloneRepo) return;
    onCloneRepo(cloneUrl.trim(), cloneTargetDir.trim());
  };

  const handlePickFolder = async () => {
    try {
      const selected = await selectFolder();
      if (selected) {
        setInputPath(selected);
        onOpenRepo(selected);
      }
    } catch {
      // User canceled or picker error
    }
  };

  const handlePickCloneDir = async () => {
    try {
      const selected = await selectFolder();
      if (selected) {
        let finalPath = selected;
        const trimmedUrl = cloneUrl.trim();
        if (trimmedUrl) {
          const parts = trimmedUrl.replace(/\.git$/, "").split(/[\\/]/);
          const repoName = parts[parts.length - 1];
          if (repoName) {
            finalPath = `${selected}/${repoName}`.replace(/\\/g, "/");
          }
        }
        setCloneTargetDir(finalPath);
      }
    } catch {
      // ignore
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-lg rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-2xl overflow-hidden flex flex-col text-xs text-[var(--color-text)]">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)]">
          <div className="flex items-center gap-2 font-semibold text-sm">
            <FolderIcon width={16} height={16} className="text-[var(--color-accent)]" />
            <span>{activeTab === "open" ? "打开本地 Git 仓库" : "从远程 Git 克隆仓库"}</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded text-[var(--color-text-muted)] hover:text-[var(--color-text)] cursor-pointer"
          >
            <CloseIcon width={14} height={14} />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-[var(--color-border)] bg-[var(--color-bg)]/40 px-4 pt-1 gap-4">
          <button
            type="button"
            onClick={() => setActiveTab("open")}
            className={`pb-2.5 pt-1.5 font-medium text-xs border-b-2 transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === "open"
                ? "border-[var(--color-accent)] text-[var(--color-accent)]"
                : "border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
            }`}
          >
            <FolderIcon width={14} height={14} />
            <span>打开本地仓库</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("clone")}
            className={`pb-2.5 pt-1.5 font-medium text-xs border-b-2 transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === "clone"
                ? "border-[var(--color-accent)] text-[var(--color-accent)]"
                : "border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
            }`}
          >
            <svg
              className="w-3.5 h-3.5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
              />
            </svg>
            <span>从 Git 克隆 (Clone)</span>
          </button>
        </div>

        {/* Form Body */}
        <div className="p-5 space-y-4">
          {activeTab === "open" ? (
            <>
              {/* Drag and Drop Zone */}
              <div
                onClick={handlePickFolder}
                className={`border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-all flex flex-col items-center justify-center gap-2 ${
                  isDragOver
                    ? "border-[var(--color-accent)] bg-[var(--color-accent)]/15 scale-[1.01]"
                    : "border-[var(--color-border)] hover:border-[var(--color-accent)]/60 bg-[var(--color-bg)]/60 hover:bg-[var(--color-surface-raised)]"
                }`}
              >
                <div className="w-10 h-10 rounded-full bg-[var(--color-accent)]/10 text-[var(--color-accent)] flex items-center justify-center">
                  <FolderIcon width={20} height={20} />
                </div>
                <div>
                  <p className="font-semibold text-xs text-[var(--color-text)]">
                    点击选择文件夹，或将本地仓库文件夹拖拽放进此处
                  </p>
                  <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5">
                    支持直接从 Windows 资源管理器将项目目录拖入
                  </p>
                </div>
                <button
                  type="button"
                  disabled={loading}
                  onClick={(e) => {
                    e.stopPropagation();
                    handlePickFolder();
                  }}
                  className="mt-1 px-3.5 py-1.5 rounded-lg bg-[var(--color-accent)] text-white font-medium hover:opacity-90 disabled:opacity-50 transition-opacity cursor-pointer shadow-xs"
                >
                  浏览并选择文件夹...
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">
                    或者直接输入/粘贴路径:
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="例如: D:/TD/projects/my-repo"
                      value={inputPath}
                      onChange={(e) => setInputPath(e.target.value)}
                      className="flex-1 px-3 py-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] font-mono text-xs focus:outline-none focus:border-[var(--color-accent)]"
                    />
                    <button
                      type="submit"
                      disabled={loading || !inputPath.trim()}
                      className="px-4 py-1.5 rounded-lg bg-[var(--color-surface-raised)] border border-[var(--color-border)] hover:bg-[var(--color-bg)] font-medium text-xs text-[var(--color-text)] disabled:opacity-50 transition-colors cursor-pointer"
                    >
                      {loading ? "打开中..." : "打开"}
                    </button>
                  </div>
                </div>

                {error && (
                  <div className="p-2.5 rounded-lg border border-[var(--color-danger)]/30 bg-[var(--color-danger)]/10 text-[var(--color-danger)] flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                      <AlertCircleIcon width={14} height={14} className="shrink-0" />
                      <span>{error}</span>
                    </div>
                    {error.includes("不是 Git 仓库") && onInitRepo && inputPath.trim() && (
                      <button
                        type="button"
                        disabled={loading}
                        onClick={() => onInitRepo(inputPath.trim())}
                        className="self-start px-2.5 py-1 rounded bg-[var(--color-accent)] text-white text-[11px] font-medium hover:opacity-90 disabled:opacity-50 transition-opacity cursor-pointer"
                      >
                        在此初始化 Git 仓库 (git init) 并打开
                      </button>
                    )}
                  </div>
                )}
              </form>
            </>
          ) : (
            /* Clone Tab */
            <form onSubmit={handleCloneSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">
                  Git 仓库 URL (HTTPS / SSH):
                </label>
                <input
                  type="text"
                  placeholder="例如: https://github.com/torvalds/linux.git 或 git@github.com:..."
                  value={cloneUrl}
                  onChange={(e) => {
                    const nextUrl = e.target.value;
                    setCloneUrl(nextUrl);
                    if (!cloneTargetDir && nextUrl.trim()) {
                      const parts = nextUrl.trim().replace(/\.git$/, "").split(/[\\/]/);
                      const name = parts[parts.length - 1];
                      if (name) {
                        setCloneTargetDir(`D:/${name}`);
                      }
                    }
                  }}
                  className="w-full px-3 py-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] font-mono text-xs focus:outline-none focus:border-[var(--color-accent)]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">
                  本地存储目录 (Local Directory):
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="例如: D:/TD/projects/target-repo"
                    value={cloneTargetDir}
                    onChange={(e) => setCloneTargetDir(e.target.value)}
                    className="flex-1 px-3 py-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] font-mono text-xs focus:outline-none focus:border-[var(--color-accent)]"
                  />
                  <button
                    type="button"
                    onClick={handlePickCloneDir}
                    className="px-3 py-1.5 rounded-lg bg-[var(--color-surface-raised)] border border-[var(--color-border)] hover:bg-[var(--color-bg)] font-medium text-xs text-[var(--color-text)] transition-colors cursor-pointer shrink-0"
                  >
                    选择目录...
                  </button>
                </div>
              </div>

              {error && (
                <div className="p-2.5 rounded-lg border border-[var(--color-danger)]/30 bg-[var(--color-danger)]/10 text-[var(--color-danger)] flex items-center gap-2">
                  <AlertCircleIcon width={14} height={14} className="shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2 border-t border-[var(--color-border)]">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-1.5 rounded-lg bg-[var(--color-surface-raised)] border border-[var(--color-border)] text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)] cursor-pointer"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={loading || !cloneUrl.trim() || !cloneTargetDir.trim()}
                  className="px-4 py-1.5 rounded-lg bg-[var(--color-accent)] text-white font-medium text-xs hover:opacity-90 disabled:opacity-50 transition-opacity cursor-pointer shadow-xs flex items-center gap-1.5"
                >
                  {loading ? (
                    <>
                      <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      <span>正在克隆仓库 (git clone)...</span>
                    </>
                  ) : (
                    <span>开始克隆并打开</span>
                  )}
                </button>
              </div>
            </form>
          )}

          {/* Recent Repositories */}
          {recentRepos.length > 0 && (
            <div className="space-y-2 pt-2 border-t border-[var(--color-border)]">
              <span className="text-xs font-semibold text-[var(--color-text-muted)]">
                最近打开的仓库 ({recentRepos.length})
              </span>
              <div className="max-h-40 overflow-y-auto divide-y divide-[var(--color-border)]/40 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)]">
                {recentRepos.map((path) => (
                  <div
                    key={path}
                    className="flex items-center justify-between px-3 py-2 hover:bg-[var(--color-surface-raised)] transition-colors group cursor-pointer"
                    onClick={() => onOpenRepo(path)}
                  >
                    <span className="truncate font-mono text-[11px] text-[var(--color-text)]">
                      {path}
                    </span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onRemoveRecent(path);
                      }}
                      className="opacity-0 group-hover:opacity-100 p-1 text-[var(--color-text-muted)] hover:text-[var(--color-danger)] transition-all cursor-pointer"
                      title="从历史记录移除"
                    >
                      <CloseIcon width={12} height={12} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
