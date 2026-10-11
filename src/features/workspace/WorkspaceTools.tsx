import { useCallback, useEffect, useRef, useState } from "react";
import { workspaceTask, getRepoStatus, type WorkspaceSnapshot, type SnapshotChange, type WorkspaceOverview, type BranchComparison, type BlameLine, type HistoryAction, type WorkspaceRequest } from "../../lib/host";

export type WorkspaceTab = "overview" | "snapshots" | "history" | "blame";
interface Props {
  rootPath: string; initialTab?: WorkspaceTab; initialTarget?: string; initialFile?: string;
  onClose: () => void; onChanged: () => void; onOpenRepo: (path: string) => void;
  onShowCommit: (oid: string) => void;
}
const tabs: [WorkspaceTab, string][] = [["overview", "工作区总览"], ["snapshots", "会话与搁置"], ["history", "提交与分支"], ["blame", "逐行追溯"]];
const labels: Record<string, string> = { agent: "会话进行中", agent_finished: "会话已结束", shelf: "搁置", undo: "撤回备份", discard: "丢弃备份" };

export function WorkspaceTools({ rootPath, initialTab = "overview", initialTarget = "HEAD", initialFile = "", onClose, onChanged, onOpenRepo, onShowCommit }: Props) {
  const [tab, setTab] = useState<WorkspaceTab>(initialTab);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [overview, setOverview] = useState<WorkspaceOverview | null>(null);
  const [snapshots, setSnapshots] = useState<WorkspaceSnapshot[]>([]);
  const [reference, setReference] = useState("");
  const [changes, setChanges] = useState<SnapshotChange[]>([]);
  const [chosen, setChosen] = useState<string[]>([]);
  const [files, setFiles] = useState<string[]>([]);
  const [shelfPaths, setShelfPaths] = useState<string[]>([]);
  const [label, setLabel] = useState("");
  const [from, setFrom] = useState("HEAD");
  const [target, setTarget] = useState(initialTarget);
  const [comparison, setComparison] = useState<BranchComparison | null>(null);
  const [path, setPath] = useState(initialFile);
  const [start, setStart] = useState(1);
  const [blame, setBlame] = useState<BlameLine[]>([]);
  const [hasMoreBlame, setHasMoreBlame] = useState(false);
  const [confirmation, setConfirmation] = useState<{ text: string; action: () => Promise<void> } | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const inFlight = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    const previous = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    return () => { mounted.current = false; previous?.focus(); };
  }, []);
  useEffect(() => { if (confirmation) cancelRef.current?.focus(); }, [confirmation]);
  const load = useCallback(async () => {
    if (tab === "overview") setOverview(await workspaceTask<WorkspaceOverview>(rootPath, { type: "overview" }));
    if (tab === "snapshots") {
      const [items, status] = await Promise.all([workspaceTask<WorkspaceSnapshot[]>(rootPath, { type: "snapshots" }), getRepoStatus(rootPath)]);
      if (!mounted.current) return;
      setSnapshots(items); setFiles(status.files.filter(f => f.worktree && !f.conflicted).map(f => f.path));
    }
  }, [rootPath, tab]);
  const run = useCallback(async (action: () => Promise<void>) => {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setError(""); setMessage("");
    try { await action(); } catch (e) { if (mounted.current) setError(String(e)); }
    finally { inFlight.current = false; if (mounted.current) setBusy(false); }
  }, []);
  useEffect(() => { void run(load); }, [load, run]);
  const mutate = async (request: WorkspaceRequest, success: string) => {
    const output = await workspaceTask<unknown>(rootPath, request);
    onChanged(); await load(); setMessage(typeof output === "string" ? `${success}\n${output}` : success);
    setChanges([]); setChosen([]); setShelfPaths([]);
  };
  const preview = async (ref: string) => {
    setReference(ref); setChanges([]); setChosen([]);
    const result = await workspaceTask<SnapshotChange[]>(rootPath, { type: "changes", reference: ref });
    setChanges(result);
  };
  const ask = (text: string, action: () => Promise<void>) => setConfirmation({ text, action });
  const history = (action: HistoryAction) => ask(
    `${({ cherry_pick: "将目标提交应用到当前分支", revert: "新增一个反向提交，保留原历史", merge: "将目标合并到当前分支", continue: "继续当前 Git 操作", abort: "中止当前 Git 操作" })[action]}：${target || "当前操作"}。请确认。`,
    async () => { try { await mutate({ type: "history", action, target }, "操作完成"); } finally { onChanged(); } },
  );
  const readBlame = async (next: number, append: boolean) => {
    const result = await workspaceTask<BlameLine[]>(rootPath, { type: "blame", path, start: next, count: 200 });
    setBlame(previous => append ? [...previous, ...result] : result);
    setStart(next); setHasMoreBlame(result.length === 200);
  };
  const toggle = (values: string[], value: string, setter: (next: string[]) => void) => setter(values.includes(value) ? values.filter(v => v !== value) : [...values, value]);
  const close = () => { if (!inFlight.current) onClose(); };

  return <div className="fixed inset-0 z-50 bg-black/50 p-4 flex items-center justify-center" onMouseDown={e => { if (e.target === e.currentTarget) close(); }}>
    <div ref={panelRef} role="dialog" aria-modal="true" aria-labelledby="workspace-title" tabIndex={-1} className="workspace-tools" onKeyDown={e => {
      e.stopPropagation();
      if (e.key === "Escape") { if (confirmation) setConfirmation(null); else close(); }
      if (e.key === "Tab") {
        const elements = Array.from(panelRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), [tabindex="0"]') || []);
        const first = elements[0], last = elements[elements.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
      }
    }}>
      <header className="flex justify-between items-center px-4 py-3 border-b border-[var(--color-border)]">
        <div><h2 id="workspace-title" className="font-semibold text-sm">仓库工具</h2><p className="text-[var(--color-text-muted)] text-xs break-all">{rootPath}</p></div>
        <button disabled={busy} onClick={close} aria-label="关闭仓库工具">关闭</button>
      </header>
      <nav aria-label="仓库工具分类" className="flex gap-1 p-2 border-b border-[var(--color-border)]">
        {tabs.map(([id, title]) => <button key={id} disabled={busy || !!confirmation} aria-pressed={tab === id} className={tab === id ? "active" : ""} onClick={() => { setTab(id); setError(""); setMessage(""); }}>{title}</button>)}
        <button disabled={busy || !!confirmation} onClick={() => void run(async () => { await load(); if (reference && tab === "snapshots") await preview(reference); })}>刷新</button>
      </nav>
      <div className="flex-1 overflow-auto p-4 space-y-4" inert={!!confirmation}>
        {busy && <p role="status">正在处理…</p>}
        {error && <p role="alert" className="text-[var(--color-danger)] whitespace-pre-wrap break-all">{error}</p>}
        {message && <p role="status" className="whitespace-pre-wrap break-all">{message}</p>}
        {tab === "overview" && <>
          <p className="text-[var(--color-text-muted)]">并排查看工作区状态。重叠提示表示同名文件有未提交改动，不代表一定冲突。</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">{overview?.worktrees.map(w => <section key={w.path} className="workspace-card">
            <h3 className="font-semibold">{w.branch || "分离 HEAD"} <span className="text-[var(--color-text-muted)]">↑{w.ahead ?? "—"} ↓{w.behind ?? "—"}</span></h3>
            <p className="break-all text-[var(--color-text-muted)]">{w.path}</p>
            {w.error ? <p role="alert">{w.error}</p> : <><p>{w.changed.length} 个改动文件</p><ul className="max-h-40 overflow-auto font-mono">{w.changed.map(f => <li key={f}>{f}</li>)}</ul></>}
            <button disabled={busy || !!w.error} onClick={() => { onOpenRepo(w.path); onClose(); }}>打开工作区</button>
          </section>)}</div>
          <section><h3 className="font-semibold mb-2">重叠改动</h3>{overview && Object.keys(overview.overlaps).length === 0 && <p>暂无重叠文件。</p>}
            {Object.entries(overview?.overlaps || {}).map(([file, paths]) => <div className="workspace-card" key={file}><strong>{file}</strong>{overview?.hunk_overlaps?.includes(file) && <span className="ml-2 text-[var(--color-danger)]">共同祖先行范围重叠，建议先检查</span>}{paths.map(p => <p key={p} className="break-all">{p}</p>)}</div>)}
          </section>
          <div className="flex gap-2 flex-wrap">{([['idea', '在 IDEA 打开'], ['terminal', '在终端打开'], ['folder', '打开文件夹']] as const).map(([application, title]) => <button key={application} disabled={busy} onClick={() => void run(async () => { await workspaceTask(rootPath, { type: "open", application }); setMessage("已请求打开应用"); })}>{title}</button>)}</div>
        </>}
        {tab === "snapshots" && <>
          <p className="text-[var(--color-text-muted)]">开始会话前保存工作区，agent 完成后结束会话。记录的是会话期间变化，无法区分期间的手动编辑。忽略文件、子模块和符号链接不纳入；单文件上限 50 MB，总计 200 MB。</p>
          <div className="flex gap-2"><input aria-label="会话或搁置名称" placeholder="会话或搁置名称" value={label} onChange={e => setLabel(e.target.value)} /><button disabled={busy} onClick={() => void run(() => mutate({ type: "capture", label: label.trim() || "Agent 会话" }, "会话已开始，请在 agent 完成后结束会话"))}>开始会话</button></div>
          <details><summary className="cursor-pointer">搁置选中的未暂存文件（保留暂存区）</summary>
            <div className="workspace-card max-h-48 overflow-auto">{files.length === 0 && <p>没有未暂存文件。</p>}{files.map(f => <label key={f} className="block"><input type="checkbox" checked={shelfPaths.includes(f)} disabled={busy} onChange={() => toggle(shelfPaths, f, setShelfPaths)} /> {f}</label>)}</div>
            <button disabled={busy || shelfPaths.length === 0} onClick={() => ask(`搁置 ${shelfPaths.length} 个文件的未暂存改动，并将工作区恢复至暂存区版本？内容会保存在本地快照中。`, () => mutate({ type: "shelve", label: label.trim() || "搁置改动", paths: shelfPaths }, "已搁置，暂存区未改变"))}>搁置所选文件</button>
          </details>
          <div className="grid grid-cols-1 md:grid-cols-[minmax(220px,1fr)_2fr] gap-3">
            <div className="space-y-2">{snapshots.length === 0 && <p>还没有会话或搁置记录。</p>}{snapshots.map(s => <section className="workspace-card" key={s.reference}>
              <button disabled={busy} aria-pressed={reference === s.reference} onClick={() => void run(() => preview(s.reference))}>{s.label}</button>
              <p>{labels[s.kind] || s.kind} · {new Date(s.created_ms).toLocaleString()}</p>
              <div className="flex gap-2 mt-2">{s.kind === "agent" && <button disabled={busy} onClick={() => void run(() => mutate({ type: "finish", reference: s.reference }, "会话已结束，后续文件修改将受到覆盖保护"))}>结束会话</button>}
                <button disabled={busy} onClick={() => ask(`删除“${s.label}”的快照记录？之后无法从应用恢复该记录。`, () => mutate({ type: "delete", reference: s.reference }, "快照已删除"))}>删除记录</button></div>
            </section>)}</div>
            <section className="workspace-card"><h3 className="font-semibold">恢复预览</h3><p className="text-[var(--color-text-muted)]">选择左侧记录，再选择需要恢复的文件。HEAD 或预览后的文件／暂存区发生变化时拒绝覆盖；结束会话后的手动改动也会跳过。</p>
              {reference && changes.length === 0 && <p>没有可对比的文件变化。</p>}
              {changes.map(c => <label key={c.path} className="block my-2 break-all"><input type="checkbox" disabled={busy || !c.can_restore} checked={chosen.includes(c.path)} onChange={() => toggle(chosen, c.path, setChosen)} /> {c.path} <span className="text-[var(--color-text-muted)]">{!c.saved ? "将删除" : !c.current ? "将恢复删除文件" : "将恢复内容"}{!c.can_restore && " · 已变化或会话未结束，不能覆盖"}</span></label>)}
              <button disabled={busy || chosen.length === 0} onClick={() => ask(`恢复选中的 ${chosen.length} 个文件？执行前会保存撤回备份；HEAD 和暂存区保持不变。`, async () => {
                const result = await workspaceTask<{ restored: number; skipped: string[]; undo_ref: string }>(rootPath, { type: "restore", reference, changes: changes.filter(c => chosen.includes(c.path)) });
                onChanged(); await load(); await preview(reference); setMessage(`已恢复 ${result.restored} 个文件${result.skipped.length ? `；跳过：${result.skipped.join("、")}` : ""}。可从“撤回备份”再恢复。`);
              })}>恢复所选文件</button>
            </section>
          </div>
        </>}
        {tab === "history" && <>
          <p className="text-[var(--color-text-muted)]">输入分支、标签或提交 SHA。应用提交和合并前必须先提交或贮藏工作区改动。</p>
          <div className="flex gap-2 flex-wrap"><input aria-label="比较起点" value={from} onChange={e => { setFrom(e.target.value); setComparison(null); }} placeholder="起点，如 main" /><input aria-label="目标分支或提交" value={target} onChange={e => { setTarget(e.target.value); setComparison(null); }} placeholder="目标分支或提交 SHA" /><button disabled={busy || !from || !target} onClick={() => void run(async () => setComparison(await workspaceTask<BranchComparison>(rootPath, { type: "compare", from, to: target })))}>比较</button></div>
          <div className="flex gap-2 flex-wrap"><button disabled={busy || !target} onClick={() => history("cherry_pick")}>应用目标提交 (cherry-pick)</button><button disabled={busy || !target} onClick={() => history("revert")}>撤销目标提交 (revert)</button><button disabled={busy || !target} onClick={() => history("merge")}>合并目标到当前分支</button><button disabled={busy} onClick={() => history("continue")}>继续当前操作</button><button disabled={busy} onClick={() => history("abort")}>中止当前操作</button></div>
          {comparison && <><p>{comparison.files} 个文件 · +{comparison.additions} −{comparison.deletions}</p><pre className="workspace-code">{comparison.patch || "两个版本内容一致。"}</pre></>}
        </>}
        {tab === "blame" && <>
          <p className="text-[var(--color-text-muted)]">查看 HEAD 中每行最后修改者；未提交内容不纳入。点击提交编号查看该提交详情。</p>
          <div className="flex gap-2"><input aria-label="追溯文件路径" value={path} onChange={e => { setPath(e.target.value); setBlame([]); setHasMoreBlame(false); }} placeholder="仓库内文件路径" /><button disabled={busy || !path} onClick={() => void run(() => readBlame(1, false))}>查看 blame</button></div>
          <div className="overflow-auto"><table className="w-full text-left"><thead><tr><th>行</th><th>提交</th><th>作者</th><th>内容</th></tr></thead><tbody>{blame.map(l => <tr key={l.line}><td>{l.line}</td><td><button disabled={busy} onClick={() => onShowCommit(l.oid)}>{l.oid.slice(0, 8)}</button></td><td className="whitespace-nowrap">{l.author}</td><td><pre>{l.content}</pre></td></tr>)}</tbody></table></div>
          {hasMoreBlame && <button disabled={busy} onClick={() => void run(() => readBlame(start + 200, true))}>继续加载 200 行</button>}
        </>}
      </div>
      {confirmation && <div role="alertdialog" aria-modal="true" aria-label="确认操作" className="p-4 border-t border-[var(--color-border)] bg-[var(--color-surface-raised)] space-y-3"><p>{confirmation.text}</p><div className="flex gap-2"><button ref={cancelRef} disabled={busy} onClick={() => setConfirmation(null)}>取消</button><button disabled={busy} onClick={() => { const action = confirmation.action; setConfirmation(null); void run(action); }}>确认执行</button></div></div>}
    </div>
  </div>;
}
