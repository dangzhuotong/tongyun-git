import { useEffect, useState } from "react";
import { getCommitFileDiff, getFileHistory, type FileDiff, type FileHistoryItem } from "../../lib/host";
import { DiffViewer } from "../changes/DiffViewer";
import { FileHistoryList } from "./FileHistoryList";

interface FileHistoryPanelProps {
  rootPath: string;
  filePath: string;
}

/** 主区域「历史」标签页：左边提交列表，右边所选提交里这个文件的 diff。 */
export function FileHistoryPanel({ rootPath, filePath }: FileHistoryPanelProps) {
  const [state, setState] = useState<{
    key: string;
    history: FileHistoryItem[];
    loading: boolean;
    error: string | null;
  }>({ key: "", history: [], loading: true, error: null });
  const [selected, setSelected] = useState<{ key: string; oid: string | null }>({ key: "", oid: null });
  const [diffState, setDiffState] = useState<{ oid: string | null; diff: FileDiff | null; error: string | null }>({
    oid: null,
    diff: null,
    error: null,
  });

  const key = `${rootPath}\n${filePath}`;
  const current = state.key === key ? state : { key, history: [], loading: true, error: null };
  const selectedOid =
    selected.key === key ? selected.oid : (current.history[0]?.oid ?? null);

  useEffect(() => {
    let canceled = false;
    getFileHistory(rootPath, filePath, 50)
      .then((items) => {
        if (canceled) return;
        setState({ key, history: items ?? [], loading: false, error: null });
      })
      .catch((err: unknown) => {
        if (canceled) return;
        setState({ key, history: [], loading: false, error: err instanceof Error ? err.message : String(err) });
      });
    return () => {
      canceled = true;
    };
  }, [rootPath, filePath, key]);

  useEffect(() => {
    if (!selectedOid) return;
    let canceled = false;
    getCommitFileDiff(rootPath, selectedOid, filePath)
      .then((d) => {
        if (!canceled) setDiffState({ oid: selectedOid, diff: d, error: null });
      })
      .catch((err: unknown) => {
        if (!canceled)
          setDiffState({ oid: selectedOid, diff: null, error: err instanceof Error ? err.message : String(err) });
      });
    return () => {
      canceled = true;
    };
  }, [rootPath, filePath, selectedOid]);

  const diffLoading = Boolean(selectedOid && diffState.oid !== selectedOid);

  return (
    <div className="flex-1 flex overflow-hidden" data-testid="file-history-panel">
      <div className="w-72 border-r border-[var(--color-border)] bg-[var(--color-surface)] overflow-y-auto shrink-0">
        <div className="px-3 py-2 text-[11px] text-[var(--color-text-muted)] border-b border-[var(--color-border)]">
          {current.loading ? "正在加载…" : `共 ${current.history.length} 次提交改过这个文件`}
        </div>
        {current.error ? (
          <div className="p-4 text-xs text-[var(--color-danger)]">{current.error}</div>
        ) : !current.loading && current.history.length === 0 ? (
          <div className="p-6 text-center text-xs text-[var(--color-text-muted)]">还没有提交过（新文件）</div>
        ) : (
          <FileHistoryList
            history={current.history}
            selectedOid={selectedOid}
            onSelect={(oid) => setSelected({ key, oid })}
          />
        )}
      </div>
      <div className="flex-1 flex flex-col overflow-hidden bg-[var(--color-bg)]">
        {selectedOid ? (
          <DiffViewer
            diff={diffState.oid === selectedOid ? diffState.diff : null}
            loading={diffLoading}
            error={diffState.oid === selectedOid ? diffState.error : null}
            readOnly={true}
          />
        ) : (
          <div className="flex-1 flex items-center justify-center text-xs text-[var(--color-text-muted)]">
            在左侧选择一次提交查看这个文件的改动
          </div>
        )}
      </div>
    </div>
  );
}
