import { useEffect, useState } from "react";
import { getName } from "@tauri-apps/api/app";
import { getAppInfo, type AppInfo } from "./lib/host";

export default function App() {
  const [appName, setAppName] = useState<string | null>(null);
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function init() {
      try {
        const [name, info] = await Promise.all([
          getName(),
          getAppInfo(),
        ]);
        if (mounted) {
          setAppName(name);
          setAppInfo(info);
          setLoading(false);
        }
      } catch {
        if (mounted) {
          setError("浏览器预览：宿主接口不可用");
          setLoading(false);
        }
      }
    }

    init();

    return () => {
      mounted = false;
    };
  }, []);

  if (error) {
    return (
      <main className="min-h-screen flex items-center justify-center p-8 bg-[var(--color-bg)] text-[var(--color-text)]">
        <div className="max-w-md w-full p-6 rounded border border-[var(--color-border)] bg-[var(--color-surface)] shadow-sm text-center">
          <p className="text-[var(--color-danger)] font-medium">{error}</p>
        </div>
      </main>
    );
  }

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center p-8 bg-[var(--color-bg)] text-[var(--color-text-muted)]">
        <p>正在加载...</p>
      </main>
    );
  }

  const gitDisplay = appInfo?.git_version ? appInfo.git_version : "没有找到 git";

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-8 bg-[var(--color-bg)] text-[var(--color-text)]">
      <div className="max-w-lg w-full p-6 rounded border border-[var(--color-border)] bg-[var(--color-surface)] shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-[var(--color-border)] pb-3">
          <h1 className="text-xl font-semibold text-[var(--color-text)]">{appName}</h1>
          <span className="text-xs px-2 py-0.5 rounded bg-[var(--color-accent)] text-white">
            v{appInfo?.version}
          </span>
        </div>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-[var(--color-text-muted)]">Git 版本</span>
            <span className="font-mono">{gitDisplay}</span>
          </div>
          {appInfo?.libgit2_version && (
            <div className="flex justify-between">
              <span className="text-[var(--color-text-muted)]">libgit2</span>
              <span className="font-mono">{appInfo.libgit2_version}</span>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
