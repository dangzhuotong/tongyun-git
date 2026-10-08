import React, { useState, useEffect } from "react";
import {
  inspectPush,
  pushRemote,
  pushMultipleRemotes,
  pullRemote,
  PushInspection,
  MultiPushItemResult,
} from "../../lib/host";

interface PushModalProps {
  isOpen: boolean;
  rootPath: string;
  onClose: () => void;
  onSuccess: () => void;
}

export const PushModal: React.FC<PushModalProps> = ({
  isOpen,
  rootPath,
  onClose,
  onSuccess,
}) => {
  if (!isOpen) return null;

  return (
    <PushModalContent
      rootPath={rootPath}
      onClose={onClose}
      onSuccess={onSuccess}
    />
  );
};

interface PushModalContentProps {
  rootPath: string;
  onClose: () => void;
  onSuccess: () => void;
}

const PushModalContent: React.FC<PushModalContentProps> = ({
  rootPath,
  onClose,
  onSuccess,
}) => {
  const [loading, setLoading] = useState<boolean>(true);
  const [pushing, setPushing] = useState<boolean>(false);
  const [pulling, setPulling] = useState<boolean>(false);
  const [inspection, setInspection] = useState<PushInspection | null>(null);
  const [remoteName, setRemoteName] = useState<string>("origin");
  const [targetBranch, setTargetBranch] = useState<string>("");
  const [setUpstream, setSetUpstream] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isRejected, setIsRejected] = useState<boolean>(false);

  // Multi-remote sync state
  const [syncAllRemotes, setSyncAllRemotes] = useState<boolean>(false);
  const [selectedRemotes, setSelectedRemotes] = useState<string[]>([]);
  const [multiResults, setMultiResults] = useState<MultiPushItemResult[] | null>(null);

  useEffect(() => {
    let active = true;
    inspectPush(rootPath)
      .then((data) => {
        if (!active) return;
        setInspection(data);
        setRemoteName(data.default_remote || "origin");
        setTargetBranch(data.default_target_branch || data.current_branch);
        setSetUpstream(data.needs_upstream_setup);
        const remotes = data.available_remotes || [];
        if (remotes.length > 1) {
          setSelectedRemotes(remotes.map((r) => r.name));
          setSyncAllRemotes(true);
        } else {
          setSelectedRemotes([data.default_remote || "origin"]);
        }
        setLoading(false);
      })
      .catch((err) => {
        if (!active) return;
        setErrorMessage(typeof err === "string" ? err : String(err));
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [rootPath]);

  const handlePush = async () => {
    if (!targetBranch) return;
    setPushing(true);
    setErrorMessage(null);
    setIsRejected(false);
    setMultiResults(null);

    try {
      if (syncAllRemotes && (inspection?.available_remotes?.length || 0) > 1) {
        if (selectedRemotes.length === 0) {
          setErrorMessage("请至少选择一个远程仓库");
          setPushing(false);
          return;
        }
        const results = await pushMultipleRemotes(
          rootPath,
          selectedRemotes,
          targetBranch,
          setUpstream
        );
        setMultiResults(results);
        const allSuccess = results.every((r) => r.success);
        if (allSuccess) {
          onSuccess();
          onClose();
        } else {
          const anyRejected = results.some((r) => r.rejected);
          if (anyRejected) {
            setIsRejected(true);
          }
          setErrorMessage("部分远程仓库推送未成功，请查看下方明细");
        }
      } else {
        if (!remoteName) return;
        const res = await pushRemote(rootPath, remoteName, targetBranch, setUpstream);
        if (res.success) {
          onSuccess();
          onClose();
        } else if (res.rejected) {
          setIsRejected(true);
          setErrorMessage(
            res.error_message || "远程包含您本地没有的新提交，请先拉取更新。"
          );
        } else {
          setErrorMessage(res.error_message || "推送失败");
        }
      }
    } catch (err) {
      setErrorMessage(typeof err === "string" ? err : String(err));
    } finally {
      setPushing(false);
    }
  };

  const handlePullFirst = async () => {
    setPulling(true);
    setErrorMessage(null);
    try {
      const res = await pullRemote(rootPath, remoteName, targetBranch, "Merge");
      if (res.success) {
        setIsRejected(false);
        // Refresh inspection
        const nextInspect = await inspectPush(rootPath);
        setInspection(nextInspect);
      } else if (res.has_conflict) {
        setErrorMessage("拉取产生冲突，已切换到冲突解决状态。");
        onSuccess(); // triggers repo refresh
        onClose();
      } else {
        setErrorMessage(res.error_message || "拉取失败");
      }
    } catch (err) {
      setErrorMessage(typeof err === "string" ? err : String(err));
    } finally {
      setPulling(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg rounded-xl border border-gray-700 bg-gray-900 p-6 shadow-2xl text-gray-100">
        <div className="flex items-center justify-between border-b border-gray-800 pb-3">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <svg
              className="w-5 h-5 text-blue-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
              />
            </svg>
            推送提交到远程 (Push)
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-200 text-xl font-bold cursor-pointer"
          >
            ✕
          </button>
        </div>

        {loading ? (
          <div className="py-12 text-center text-gray-400">正在检查远程状态...</div>
        ) : (
          <div className="mt-4 space-y-4">
            {errorMessage && (
              <div className="rounded-lg bg-red-950/70 border border-red-800 p-3 text-sm text-red-200">
                <p className="font-medium">{errorMessage}</p>
                {isRejected && (
                  <div className="mt-2">
                    <button
                      onClick={handlePullFirst}
                      disabled={pulling}
                      className="px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium cursor-pointer transition-colors"
                    >
                      {pulling ? "正在拉取..." : "立即拉取更新 (Pull)"}
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Multi-remote or Single Remote Selection */}
            {inspection?.available_remotes && inspection.available_remotes.length > 1 ? (
              <div className="space-y-3 p-3 rounded-lg border border-gray-800 bg-gray-950/40">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-gray-300">
                    检测到多个远程仓库 ({inspection.available_remotes.length})
                  </span>
                  <label className="flex items-center gap-1.5 text-xs text-blue-400 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={syncAllRemotes}
                      onChange={(e) => setSyncAllRemotes(e.target.checked)}
                      className="rounded border-gray-700 text-blue-600 focus:ring-0"
                    />
                    <span>多远程同步推送</span>
                  </label>
                </div>

                {syncAllRemotes ? (
                  <div className="space-y-1.5 pt-1">
                    <div className="text-[11px] text-gray-400">
                      选择要同步推送的目标远程仓库：
                    </div>
                    <div className="space-y-1.5">
                      {inspection.available_remotes.map((rem) => {
                        const checked = selectedRemotes.includes(rem.name);
                        return (
                          <label
                            key={rem.name}
                            className={`flex items-center justify-between p-2 rounded border cursor-pointer transition-colors ${
                              checked
                                ? "border-blue-700/60 bg-blue-950/20 text-gray-200"
                                : "border-gray-800 bg-gray-900/60 text-gray-400 hover:border-gray-700"
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setSelectedRemotes((prev) => [...prev, rem.name]);
                                  } else {
                                    setSelectedRemotes((prev) =>
                                      prev.filter((n) => n !== rem.name)
                                    );
                                  }
                                }}
                                className="rounded border-gray-700 text-blue-600 focus:ring-0"
                              />
                              <span className="font-semibold text-xs text-gray-200">
                                {rem.name}
                              </span>
                            </div>
                            <span className="font-mono text-[11px] text-gray-500 truncate max-w-[240px]">
                              {rem.push_url || rem.url || "无地址"}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div>
                    <label className="block text-xs font-medium text-gray-400 mb-1">
                      选择单个远程仓库
                    </label>
                    <select
                      value={remoteName}
                      onChange={(e) => setRemoteName(e.target.value)}
                      className="w-full px-3 py-1.5 rounded-lg bg-gray-800 border border-gray-700 text-sm focus:border-blue-500 focus:outline-none"
                    >
                      {inspection.available_remotes.map((rem) => (
                        <option key={rem.name} value={rem.name}>
                          {rem.name} ({rem.push_url || rem.url || "无地址"})
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1">
                    目标分支 (Target Branch)
                  </label>
                  <input
                    type="text"
                    value={targetBranch}
                    onChange={(e) => setTargetBranch(e.target.value)}
                    className="w-full px-3 py-1.5 rounded-lg bg-gray-800 border border-gray-700 text-sm focus:border-blue-500 focus:outline-none"
                  />
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1">
                    远程仓库 (Remote)
                  </label>
                  <input
                    type="text"
                    value={remoteName}
                    onChange={(e) => setRemoteName(e.target.value)}
                    className="w-full px-3 py-1.5 rounded-lg bg-gray-800 border border-gray-700 text-sm focus:border-blue-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1">
                    目标分支 (Target Branch)
                  </label>
                  <input
                    type="text"
                    value={targetBranch}
                    onChange={(e) => setTargetBranch(e.target.value)}
                    className="w-full px-3 py-1.5 rounded-lg bg-gray-800 border border-gray-700 text-sm focus:border-blue-500 focus:outline-none"
                  />
                </div>
              </div>
            )}

            {/* Multi-push item results */}
            {multiResults && (
              <div className="space-y-1.5 rounded-lg border border-gray-800 bg-gray-950/60 p-3">
                <div className="text-xs font-semibold text-gray-300 mb-1">
                  推送执行结果:
                </div>
                {multiResults.map((r) => (
                  <div
                    key={r.remote}
                    className="flex items-center justify-between py-1 border-b border-gray-800/40 last:border-0 text-xs"
                  >
                    <span className="font-semibold text-gray-200">{r.remote}</span>
                    {r.success ? (
                      <span className="text-emerald-400 flex items-center gap-1">
                        <span>✓</span> 成功
                      </span>
                    ) : r.rejected ? (
                      <span className="text-amber-400 flex items-center gap-1">
                        <span>⚠</span> 被远程拒绝 (需先拉取)
                      </span>
                    ) : (
                      <span className="text-red-400 flex items-center gap-1 truncate max-w-[200px]" title={r.error_message || r.output}>
                        <span>✕</span> {r.error_message || "失败"}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}

            {inspection?.needs_upstream_setup && (
              <label className="flex items-center gap-2 text-xs text-amber-300 bg-amber-950/40 p-2.5 rounded-lg border border-amber-900 cursor-pointer">
                <input
                  type="checkbox"
                  checked={setUpstream}
                  onChange={(e) => setSetUpstream(e.target.checked)}
                  className="rounded border-gray-700 text-blue-600 focus:ring-0"
                />
                分支尚未关联上游，推送时自动设置跟踪分支 (-u / --set-upstream)
              </label>
            )}

            <div>
              <div className="text-xs font-medium text-gray-400 mb-1.5 flex justify-between">
                <span>将要推送的提交</span>
                <span className="text-blue-400">
                  {inspection?.ahead_count || 0} 个提交领先
                </span>
              </div>
              <div className="max-h-40 overflow-y-auto rounded-lg border border-gray-800 bg-gray-950/50 p-2 divide-y divide-gray-800/60 text-xs">
                {inspection?.ahead_commits && inspection.ahead_commits.length > 0 ? (
                  inspection.ahead_commits.map((c) => (
                    <div key={c.oid} className="py-1.5 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 truncate">
                        <span className="font-mono text-blue-400">{c.short_oid}</span>
                        <span className="text-gray-200 truncate">{c.summary}</span>
                      </div>
                      <span className="text-gray-500 text-[11px] shrink-0">{c.author_name}</span>
                    </div>
                  ))
                ) : (
                  <div className="py-4 text-center text-gray-500">
                    本地当前没有领先于远程的提交
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-3 border-t border-gray-800">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-sm text-gray-300 cursor-pointer"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handlePush}
                disabled={
                  pushing ||
                  !targetBranch ||
                  (syncAllRemotes && (inspection?.available_remotes?.length || 0) > 1
                    ? selectedRemotes.length === 0
                    : !remoteName)
                }
                className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-sm font-medium text-white cursor-pointer transition-colors"
              >
                {pushing
                  ? "正在推送..."
                  : syncAllRemotes && (inspection?.available_remotes?.length || 0) > 1
                  ? `同步推送到 ${selectedRemotes.length} 个远程`
                  : "确定推送 (Push)"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
