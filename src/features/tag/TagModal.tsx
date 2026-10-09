import { useState, useEffect, useMemo, useCallback } from "react";
import {
  listTags,
  deleteTag,
  pushTag,
  pushAllTags,
  deleteRemoteTag,
  type TagItem,
} from "../../lib/host";
import { CloseIcon, TagIcon, RefreshIcon } from "../../components/icons";
import { useEscapeKey } from "../../hooks/useEscapeKey";
import { CreateTagModal } from "./CreateTagModal";

interface TagModalProps {
  isOpen: boolean;
  onClose: () => void;
  rootPath: string;
  onSelectCommit?: (oid: string) => void;
  onCreateTagClick?: (oid?: string | null) => void;
}

export function TagModal(props: TagModalProps) {
  useEscapeKey(props.onClose, props.isOpen);
  if (!props.isOpen) return null;
  return <TagModalContent {...props} />;
}

function TagModalContent({
  onClose,
  rootPath,
  onSelectCommit,
  onCreateTagClick,
}: TagModalProps) {
  const [tags, setTags] = useState<TagItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterText, setFilterText] = useState("");
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<{
    tag: TagItem;
    includeRemote: boolean;
  } | null>(null);

  const loadTags = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listTags(rootPath);
      setTags(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [rootPath]);

  useEffect(() => {
    let canceled = false;
    listTags(rootPath)
      .then((data) => {
        if (!canceled) {
          setTags(data);
          setLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (!canceled) {
          setError(err instanceof Error ? err.message : String(err));
          setLoading(false);
        }
      });
    return () => {
      canceled = true;
    };
  }, [rootPath]);

  const filteredTags = useMemo(() => {
    if (!filterText.trim()) return tags;
    const q = filterText.toLowerCase();
    return tags.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.short_oid.toLowerCase().includes(q) ||
        (t.message && t.message.toLowerCase().includes(q))
    );
  }, [tags, filterText]);

  const handlePushTag = async (tag: TagItem) => {
    setActionLoading(true);
    try {
      await pushTag(rootPath, tag.name);
      await loadTags();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setActionLoading(false);
    }
  };

  const handlePushAll = async () => {
    setActionLoading(true);
    try {
      await pushAllTags(rootPath);
      await loadTags();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!confirmDelete) return;
    setActionLoading(true);
    try {
      if (confirmDelete.includeRemote) {
        await deleteRemoteTag(rootPath, confirmDelete.tag.name);
      }
      await deleteTag(rootPath, confirmDelete.tag.name);
      setConfirmDelete(null);
      await loadTags();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 select-none">
        <div className="w-full max-w-2xl max-h-[85vh] rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-2xl overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-150">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)] bg-[var(--color-surface-raised)] shrink-0">
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-md bg-[var(--color-accent)]/15 text-[var(--color-accent)]">
                <TagIcon width={16} height={16} />
              </span>
              <div>
                <h2 className="text-sm font-semibold text-[var(--color-text)]">
                  标签管理 (Git Tags)
                </h2>
                <span className="text-[11px] text-[var(--color-text-muted)]">
                  共 {tags.length} 个标签
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={loadTags}
                disabled={loading || actionLoading}
                className="p-1.5 rounded-lg border border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface)] transition-colors cursor-pointer"
                title="刷新列表"
              >
                <RefreshIcon
                  width={14}
                  height={14}
                  className={loading ? "animate-spin" : ""}
                />
              </button>
              <button
                type="button"
                onClick={() =>
                  onCreateTagClick ? onCreateTagClick(null) : setCreateModalOpen(true)
                }
                className="px-3 py-1.5 rounded-lg bg-[var(--color-accent)] text-white text-xs font-medium hover:opacity-90 transition-opacity cursor-pointer flex items-center gap-1.5"
              >
                <TagIcon width={13} height={13} />
                <span>新建标签</span>
              </button>
              <button
                type="button"
                onClick={onClose}
                className="p-1 rounded-md text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface)] transition-colors cursor-pointer ml-1"
              >
                <CloseIcon width={16} height={16} />
              </button>
            </div>
          </div>

          {/* Filter Bar & Quick Push */}
          <div className="px-4 py-2 border-b border-[var(--color-border)] bg-[var(--color-surface)] flex items-center justify-between gap-3 shrink-0">
            <input
              type="text"
              placeholder="搜索标签名称、提交 SHA、附注内容..."
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              className="flex-1 px-3 py-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] text-xs text-[var(--color-text)] focus:outline-hidden focus:border-[var(--color-accent)]"
            />
            {tags.length > 0 && (
              <button
                type="button"
                onClick={handlePushAll}
                disabled={actionLoading}
                className="px-3 py-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-raised)] text-[var(--color-text)] text-xs font-medium hover:bg-[var(--color-bg)] transition-colors cursor-pointer shrink-0"
              >
                推送全部标签 (--tags)
              </button>
            )}
          </div>

          {/* Error Banner */}
          {error && (
            <div className="px-4 py-2 border-b border-[var(--color-danger)]/30 bg-[var(--color-danger)]/10 text-[var(--color-danger)] text-xs shrink-0 flex items-center justify-between">
              <span>{error}</span>
              <button
                type="button"
                onClick={() => setError(null)}
                className="text-[var(--color-danger)] hover:opacity-80 cursor-pointer"
              >
                <CloseIcon width={14} height={14} />
              </button>
            </div>
          )}

          {/* Tag List Body */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {filteredTags.length === 0 ? (
              <div className="py-12 text-center text-xs text-[var(--color-text-muted)]">
                {filterText ? "没有找到匹配的标签" : "当前仓库暂无任何 Git 标签"}
              </div>
            ) : (
              filteredTags.map((tag) => (
                <div
                  key={tag.name}
                  className="p-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-raised)] hover:border-[var(--color-border-hover)] transition-all flex items-start justify-between gap-4"
                >
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-xs text-[var(--color-text)]">
                        {tag.name}
                      </span>
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded-sm border font-medium ${
                          tag.is_annotated
                            ? "bg-amber-500/10 text-amber-500 border-amber-500/30"
                            : "bg-[var(--color-surface)] text-[var(--color-text-muted)] border-[var(--color-border)]"
                        }`}
                      >
                        {tag.is_annotated ? "附注标签" : "轻量标签"}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          if (onSelectCommit) {
                            onSelectCommit(tag.target_oid);
                            onClose();
                          }
                        }}
                        className="text-[11px] font-mono text-[var(--color-accent)] hover:underline cursor-pointer"
                        title="在日志中定位此提交"
                      >
                        {tag.short_oid}
                      </button>
                      {tag.timestamp && (
                        <span className="text-[11px] text-[var(--color-text-muted)]">
                          {new Date(tag.timestamp * 1000).toLocaleDateString()}
                        </span>
                      )}
                    </div>

                    {tag.message && (
                      <p className="text-xs text-[var(--color-text-muted)] line-clamp-2">
                        {tag.message}
                      </p>
                    )}

                    {tag.tagger_name && (
                      <div className="text-[11px] text-[var(--color-text-muted)]">
                        作者: {tag.tagger_name}{" "}
                        {tag.tagger_email ? `<${tag.tagger_email}>` : ""}
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1.5 shrink-0 pt-0.5">
                    <button
                      type="button"
                      onClick={() => handlePushTag(tag)}
                      disabled={actionLoading}
                      className="px-2.5 py-1 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] text-xs font-medium hover:bg-[var(--color-surface-raised)] transition-colors cursor-pointer"
                    >
                      推送
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setConfirmDelete({ tag, includeRemote: false })
                      }
                      disabled={actionLoading}
                      className="px-2.5 py-1 rounded-md border border-[var(--color-danger)]/30 text-[var(--color-danger)] text-xs font-medium hover:bg-[var(--color-danger)]/10 transition-colors cursor-pointer"
                    >
                      删除
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {confirmDelete && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 select-none">
          <div className="w-full max-w-sm rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-2xl p-4 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <h3 className="text-sm font-semibold text-[var(--color-text)]">
              确认删除标签
            </h3>
            <p className="text-xs text-[var(--color-text-muted)]">
              确定要删除标签{" "}
              <strong className="text-[var(--color-text)]">
                {confirmDelete.tag.name}
              </strong>{" "}
              吗？
            </p>

            <div className="flex items-center gap-2 pt-1">
              <input
                id="deleteRemoteTagCheckbox"
                type="checkbox"
                checked={confirmDelete.includeRemote}
                onChange={(e) =>
                  setConfirmDelete({
                    ...confirmDelete,
                    includeRemote: e.target.checked,
                  })
                }
                className="rounded border-[var(--color-border)] text-[var(--color-danger)] focus:ring-0 cursor-pointer"
              />
              <label
                htmlFor="deleteRemoteTagCheckbox"
                className="text-xs text-[var(--color-text)] cursor-pointer select-none"
              >
                同时删除远程仓库上的同名标签
              </label>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--color-border)]">
              <button
                type="button"
                onClick={() => setConfirmDelete(null)}
                className="px-3 py-1.5 rounded-lg border border-[var(--color-border)] text-xs font-medium text-[var(--color-text)] hover:bg-[var(--color-surface-raised)] cursor-pointer"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleDeleteConfirm}
                disabled={actionLoading}
                className="px-3.5 py-1.5 rounded-lg bg-[var(--color-danger)] text-white text-xs font-medium hover:opacity-90 disabled:opacity-50 cursor-pointer"
              >
                {actionLoading ? "删除中..." : "确认删除"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Nested Create Tag Modal */}
      <CreateTagModal
        isOpen={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        rootPath={rootPath}
        onTagCreated={() => {
          loadTags();
        }}
      />
    </>
  );
}
