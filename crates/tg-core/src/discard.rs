use crate::error::{CoreError, Result};
use crate::snapshot::{self, Version};
use crate::workspace::safe_path;
use git2::{Oid, Repository};
use serde::{Deserialize, Serialize};
use std::path::Path;

pub const MAX_SINGLE_FILE_SNAPSHOT: u64 = 50 * 1024 * 1024;
pub const MAX_TOTAL_SNAPSHOT: u64 = 200 * 1024 * 1024;
pub const MAX_SNAPSHOT_COUNT: usize = 20;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiscardCandidate {
    pub path: String,
    pub will_delete: bool,
    pub unrestorable: bool,
    pub size: u64,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiscardResult {
    pub snapshot_ref: Option<String>,
    pub discarded_count: usize,
    pub unrestorable_files: Vec<String>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UndoDiscardResult {
    pub restored_count: usize,
    pub skipped_files: Vec<String>,
}

pub struct DiscardService;
fn head_version(repo: &Repository, path: &str) -> Option<Version> {
    let entry = repo
        .head()
        .ok()?
        .peel_to_tree()
        .ok()?
        .get_path(Path::new(path))
        .ok()?;
    Some(Version {
        oid: entry.id().to_string(),
        mode: entry.filemode() as u32,
    })
}
fn set_index(repo: &Repository, path: &str, version: Option<&Version>) -> Result<()> {
    let mut index = repo.index()?;
    if let Some(v) = version {
        let entry = git2::IndexEntry {
            ctime: git2::IndexTime::new(0, 0),
            mtime: git2::IndexTime::new(0, 0),
            dev: 0,
            ino: 0,
            mode: v.mode,
            uid: 0,
            gid: 0,
            file_size: 0,
            id: Oid::from_str(&v.oid)?,
            flags: 0,
            flags_extended: 0,
            path: path.as_bytes().to_vec(),
        };
        index.add(&entry)?;
    } else if index.get_path(Path::new(path), 0).is_some() {
        index.remove_path(Path::new(path))?;
    }
    index.write()?;
    Ok(())
}
impl DiscardService {
    pub fn inspect_candidates(root: &Path, paths: &[&str]) -> Result<Vec<DiscardCandidate>> {
        let repo = Repository::open(root)?;
        if repo.index()?.has_conflicts() {
            return Err(CoreError::DiscardError("请先解决冲突".into()));
        }
        let mut total = 0;
        let mut result = vec![];
        for path in paths {
            let full = safe_path(root, path)?;
            let version = head_version(&repo, path);
            if version
                .as_ref()
                .is_some_and(|v| !matches!(v.mode, 0o100644 | 0o100755))
            {
                return Err(CoreError::DiscardError("子模块和符号链接不支持丢弃".into()));
            }
            let size = match std::fs::metadata(full) {
                Ok(m) if m.is_file() => m.len(),
                Ok(_) => return Err(CoreError::DiscardError("不能丢弃目录".into())),
                Err(e) if e.kind() == std::io::ErrorKind::NotFound => 0,
                Err(e) => return Err(e.into()),
            };
            let index_size = snapshot::index_version(&repo, path)?
                .map(|v| {
                    repo.find_blob(Oid::from_str(&v.oid).unwrap())
                        .map(|b| b.size() as u64)
                })
                .transpose()?
                .unwrap_or(0);
            let unrestorable = size > MAX_SINGLE_FILE_SNAPSHOT
                || index_size > MAX_SINGLE_FILE_SNAPSHOT
                || total + size + index_size > MAX_TOTAL_SNAPSHOT;
            if !unrestorable {
                total += size + index_size;
            }
            result.push(DiscardCandidate {
                path: (*path).into(),
                will_delete: version.is_none(),
                unrestorable,
                size,
            });
        }
        Ok(result)
    }
    pub fn discard_files(root: &Path, paths: &[&str]) -> Result<DiscardResult> {
        let repo = Repository::open(root)?;
        let candidates = Self::inspect_candidates(root, paths)?;
        let restorable: Vec<String> = candidates
            .iter()
            .filter(|c| !c.unrestorable)
            .map(|c| c.path.clone())
            .collect();
        let saved = if restorable.is_empty() {
            None
        } else {
            let mut s = snapshot::capture(root, "丢弃前快照", "discard", Some(&restorable))?;
            for path in &restorable {
                let head = head_version(&repo, path);
                s.baseline.insert(
                    path.clone(),
                    snapshot::checkout_version(&repo, path, head.clone())?,
                );
                s.expected_index.insert(path.clone(), head);
            }
            snapshot::save(&repo, &s)?;
            Some(s)
        };
        for c in &candidates {
            if let Some(s) = &saved {
                if !c.unrestorable
                    && (snapshot::read_version(&repo, root, &c.path)? != s.files[&c.path]
                        || snapshot::index_version(&repo, &c.path)? != s.index[&c.path])
                {
                    return Err(CoreError::DiscardError("文件已变化，请重新确认".into()));
                }
            }
        }
        let targets: Vec<_> = candidates
            .iter()
            .map(|c| {
                let target = head_version(&repo, &c.path);
                Ok((
                    target.clone(),
                    snapshot::checkout_version(&repo, &c.path, target)?,
                ))
            })
            .collect::<Result<_>>()?;
        for (c, (target, workdir)) in candidates.iter().zip(targets) {
            snapshot::write_version(&repo, root, &c.path, workdir.as_ref())?;
            set_index(&repo, &c.path, target.as_ref())?;
        }
        // Keep the original public ref namespace for existing recovery tooling.
        let snapshot_ref = if let Some(s) = saved {
            let reference = s
                .reference
                .replace("refs/tongyun/snapshots/", "refs/tongyun/discard/");
            let oid = repo
                .find_reference(&s.reference)?
                .target()
                .ok_or(CoreError::NotARepository)?;
            repo.reference(&reference, oid, false, "discard snapshot")?;
            let mut refs: Vec<String> = repo
                .references_glob("refs/tongyun/discard/*")?
                .filter_map(|r| r.ok()?.name().ok().map(str::to_string))
                .collect();
            refs.sort();
            for old in refs
                .iter()
                .take(refs.len().saturating_sub(MAX_SNAPSHOT_COUNT))
            {
                repo.find_reference(old)?.delete()?;
                let source = old.replace("refs/tongyun/discard/", "refs/tongyun/snapshots/");
                if let Ok(mut r) = repo.find_reference(&source) {
                    r.delete()?;
                }
            }
            Some(reference)
        } else {
            None
        };
        Ok(DiscardResult {
            snapshot_ref,
            discarded_count: candidates.len(),
            unrestorable_files: candidates
                .into_iter()
                .filter(|c| c.unrestorable)
                .map(|c| c.path)
                .collect(),
        })
    }
    pub fn undo_last_discard(root: &Path, skip_conflict: bool) -> Result<UndoDiscardResult> {
        let repo = Repository::open(root)?;
        let mut refs: Vec<String> = repo
            .references_glob("refs/tongyun/discard/*")?
            .filter_map(|r| r.ok()?.name().ok().map(str::to_string))
            .collect();
        refs.sort();
        let reference = refs
            .last()
            .ok_or_else(|| CoreError::DiscardError("没有可撤销的丢弃快照".into()))?;
        let source = reference.replace("refs/tongyun/discard/", "refs/tongyun/snapshots/");
        let s = snapshot::load(root, &source).map_err(|_| {
            CoreError::DiscardError("旧格式快照无法自动恢复，请保留引用并在终端检查".into())
        })?;
        if repo
            .head()
            .ok()
            .and_then(|h| h.target())
            .map(|o| o.to_string())
            != s.head
        {
            return Err(CoreError::DiscardError("HEAD 已变化，不能撤销丢弃".into()));
        }
        let mut restored_count = 0;
        let mut skipped_files = vec![];
        for (path, version) in &s.files {
            let expected = s.baseline.get(path).cloned().flatten();
            if skip_conflict
                && (snapshot::read_version(&repo, root, path)? != expected
                    || snapshot::index_version(&repo, path)?
                        != s.expected_index.get(path).cloned().flatten())
            {
                skipped_files.push(path.clone());
                continue;
            }
            snapshot::write_version(&repo, root, path, version.as_ref())?;
            set_index(&repo, path, s.index.get(path).and_then(|v| v.as_ref()))?;
            restored_count += 1;
        }
        Ok(UndoDiscardResult {
            restored_count,
            skipped_files,
        })
    }
}
