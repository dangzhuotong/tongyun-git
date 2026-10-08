import React, { useState, useEffect } from "react";
import {
  getOperationLogs,
  clearOperationLogs,
  OperationLogEntry,
} from "../../lib/host";

interface OperationLogModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const OperationLogModal: React.FC<OperationLogModalProps> = ({
  isOpen,
  onClose,
}) => {
  if (!isOpen) return null;

  return <OperationLogModalContent onClose={onClose} />;
};

const OperationLogModalContent: React.FC<{ onClose: () => void }> = ({
  onClose,
}) => {
  const [logs, setLogs] = useState<OperationLogEntry[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    let active = true;
    getOperationLogs()
      .then((data) => {
        if (active) {
          setLogs(data);
          setLoading(false);
        }
      })
      .catch(() => {
        if (active) {
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, []);

  const handleRefresh = async () => {
    setLoading(true);
    try {
      const data = await getOperationLogs();
      setLogs(data);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  const handleClear = async () => {
    try {
      await clearOperationLogs();
      setLogs([]);
    } catch {
      // ignore
    }
  };

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    return d.toTimeString().split(" ")[0];
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-3xl rounded-xl border border-gray-700 bg-gray-900 p-6 shadow-2xl text-gray-100 flex flex-col max-h-[85vh]">
        <div className="flex items-center justify-between border-b border-gray-800 pb-3">
          <div className="flex items-center gap-2">
            <svg
              className="w-5 h-5 text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 6h16M4 10h16M4 14h16M4 18h16"
              />
            </svg>
            <h2 className="text-lg font-semibold">Git 命令行操作日志 (Operation Log)</h2>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleRefresh}
              className="px-2.5 py-1 text-xs rounded bg-gray-800 hover:bg-gray-700 text-gray-300 cursor-pointer"
            >
              刷新
            </button>
            <button
              onClick={handleClear}
              className="px-2.5 py-1 text-xs rounded bg-gray-800 hover:bg-red-900/50 hover:text-red-300 text-gray-400 cursor-pointer"
            >
              清空
            </button>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-200 text-xl font-bold cursor-pointer"
            >
              ✕
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto mt-4 space-y-2 pr-1">
          {loading ? (
            <div className="py-12 text-center text-gray-500">正在读取日志...</div>
          ) : logs.length === 0 ? (
            <div className="py-12 text-center text-gray-500">
              暂无 Git 命令行执行记录
            </div>
          ) : (
            logs.map((log) => {
              const isSuccess = log.exit_code === 0;
              return (
                <div
                  key={log.id}
                  className="rounded-lg border border-gray-800/80 bg-gray-950/60 p-3 text-xs font-mono transition-colors hover:border-gray-700"
                >
                  <div className="flex items-center justify-between text-gray-400 mb-1.5">
                    <div className="flex items-center gap-2">
                      <span className="text-gray-500">{formatTime(log.timestamp_ms)}</span>
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                          isSuccess
                            ? "bg-green-950 text-green-400 border border-green-800"
                            : "bg-red-950 text-red-400 border border-red-800"
                        }`}
                      >
                        {isSuccess ? "成功" : `退出码: ${log.exit_code ?? "Err"}`}
                      </span>
                    </div>
                    <span className="text-gray-500">{log.duration_ms} ms</span>
                  </div>

                  <div className="text-blue-300 select-all break-all font-semibold">
                    {log.command_line}
                  </div>

                  {log.error_message && (
                    <div className="mt-1 text-red-400 break-all bg-red-950/30 p-1.5 rounded border border-red-900/40">
                      {log.error_message}
                    </div>
                  )}

                  <div className="mt-1 text-[11px] text-gray-500 truncate">
                    工作目录: {log.cwd}
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="flex justify-end pt-3 border-t border-gray-800 mt-4">
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-sm text-gray-300 cursor-pointer"
          >
            关闭
          </button>
        </div>
      </div>
    </div>
  );
};
