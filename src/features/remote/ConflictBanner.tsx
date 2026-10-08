import React, { useState } from "react";
import { abortMergeOrRebase, RepoState } from "../../lib/host";

interface ConflictBannerProps {
  rootPath: string;
  repoState?: RepoState;
  onAbortSuccess: () => void;
}

export const ConflictBanner: React.FC<ConflictBannerProps> = ({
  rootPath,
  repoState,
  onAbortSuccess,
}) => {
  const [aborting, setAborting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!repoState || repoState === "Clean") {
    return null;
  }

  const stateLabels: Record<RepoState, { title: string; action: string }> = {
    Clean: { title: "", action: "" },
    Merge: { title: "合并冲突中 (Merge In Progress)", action: "中止合并 (Abort Merge)" },
    Rebase: { title: "变基冲突中 (Rebase In Progress)", action: "中止变基 (Abort Rebase)" },
    CherryPick: {
      title: "挑选提交中 (Cherry-Pick In Progress)",
      action: "中止挑选 (Abort Cherry-Pick)",
    },
    Revert: { title: "回滚中 (Revert In Progress)", action: "中止回滚 (Abort Revert)" },
    Bisect: { title: "二分查找中 (Bisect)", action: "中止二分 (Reset Bisect)" },
    Other: { title: "Git 操作进行中", action: "中止操作 (Abort)" },
  };

  const labelInfo = stateLabels[repoState] || stateLabels.Other;

  const handleAbort = async () => {
    if (!window.confirm(`确定要${labelInfo.action}吗？工作区未保存的冲突改动将被清理回退。`)) {
      return;
    }

    setAborting(true);
    setErrorMsg(null);
    try {
      const res = await abortMergeOrRebase(rootPath);
      if (res.success) {
        onAbortSuccess();
      } else {
        setErrorMsg(res.error_message || "中止操作失败");
      }
    } catch (err) {
      setErrorMsg(typeof err === "string" ? err : String(err));
    } finally {
      setAborting(false);
    }
  };

  return (
    <div className="bg-amber-950/80 border-b border-amber-700/60 px-4 py-2 flex items-center justify-between text-xs text-amber-200">
      <div className="flex items-center gap-2">
        <svg
          className="w-4 h-4 text-amber-400 shrink-0"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
          />
        </svg>
        <span className="font-semibold">{labelInfo.title}</span>
        <span className="text-amber-300/80 hidden sm:inline">
          请在左侧文件列表中解决冲突并暂存提交，或点击右侧安全中止。
        </span>
        {errorMsg && <span className="text-red-400 ml-2 font-medium">({errorMsg})</span>}
      </div>

      <button
        onClick={handleAbort}
        disabled={aborting}
        className="px-3 py-1 rounded bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white font-medium cursor-pointer transition-colors shadow-sm"
      >
        {aborting ? "正在中止..." : labelInfo.action}
      </button>
    </div>
  );
};
