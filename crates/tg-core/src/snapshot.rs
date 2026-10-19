//! Lossless, local-only workspace snapshots. No checkout, reset, or index mutation.
use crate::workspace::safe_path;
use crate::{CoreError, Git2Backend, GitBackend, Result};
use git2::{Oid, Repository, Signature};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};
use std::io::Write;
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};

const LIMIT: u64 = 50 * 1024 * 1024;
const TOTAL: u64 = 200 * 1024 * 1024;
const PREFIX: &str = "refs/tongyun/snapshots/";

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Version {
    pub oid: String,
    pub mode: u32,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Snapshot {
    pub reference: String,
    pub label: String,
    pub kind: String,
    pub root: String,
    pub head: Option<String>,
    pub created_ms: u64,
    pub files: BTreeMap<String, Option<Version>>,
    pub index: BTreeMap<String, Option<Version>>,
    pub baseline: BTreeMap<String, Option<Version>>,
    #[serde(default)]
    pub expected_index: BTreeMap<String, Option<Version>>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SnapshotChange {
    pub path: String,
    pub saved: Option<Version>,
    pub current: Option<Version>,
    pub current_index: Option<Version>,
    pub can_restore: bool,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RestoreResult {
    pub restored: usize,
    pub skipped: Vec<String>,
    pub undo_ref: String,
}

fn error(message: impl Into<String>) -> CoreError {
    CoreError::DiscardError(message.into())
}
fn canonical_root(repo: &Repository) -> Result<String> {
    Ok(repo
        .workdir()
        .ok_or(CoreError::BareRepository)?
        .canonicalize()?
        .to_string_lossy()
        .into())
}
pub fn read_version(repo: &Repository, root: &Path, path: &str) -> Result<Option<Version>> {
    let full = safe_path(root, path)?;
    let metadata = match std::fs::symlink_metadata(&full) {
        Ok(m) => m,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(e) => return Err(e.into()),
    };
    if !metadata.is_file() || metadata.len() > LIMIT {
        return Err(error(format!(
            "无法快照文件（仅支持 50 MB 以内普通文件）：{path}"
        )));
    }
    let bytes = std::fs::read(full)?;
    if bytes.len() as u64 > LIMIT {
        return Err(error("文件超过快照大小上限"));
    }
    #[cfg(unix)]
    let mode = {
        use std::os::unix::fs::PermissionsExt;
        if metadata.permissions().mode() & 0o111 != 0 {
            0o100755
        } else {
            0o100644
        }
    };
    #[cfg(not(unix))]
    let mode = repo
        .index()?
        .get_path(Path::new(path), 0)
        .map_or(0o100644, |e| e.mode);
    Ok(Some(Version {
        oid: repo.blob(&bytes)?.to_string(),
        mode,
    }))
}
pub fn write_version(
    repo: &Repository,
    root: &Path,
    path: &str,
    version: Option<&Version>,
) -> Result<()> {
    let full = safe_path(root, path)?;
    if let Some(v) = version {
        if !matches!(v.mode, 0o100644 | 0o100755) {
            return Err(error("不支持符号链接或子模块恢复"));
        }
        let blob = repo.find_blob(Oid::from_str(&v.oid)?)?;
        let parent = full.parent().ok_or_else(|| error("无效路径"))?;
        std::fs::create_dir_all(parent)?;
        let mut temp = tempfile::NamedTempFile::new_in(parent)?;
        temp.write_all(blob.content())?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            temp.as_file()
                .set_permissions(std::fs::Permissions::from_mode(v.mode & 0o777))?;
        }
        temp.persist(&full).map_err(|e| CoreError::Io(e.error))?;
    } else {
        match std::fs::remove_file(full) {
            Ok(()) => {}
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
            Err(e) => return Err(e.into()),
        }
    }
    Ok(())
}
pub fn index_version(repo: &Repository, path: &str) -> Result<Option<Version>> {
    Ok(repo.index()?.get_path(Path::new(path), 0).map(|e| Version {
        oid: e.id.to_string(),
        mode: e.mode,
    }))
}

/// Materialize Git's index/HEAD version into an isolated directory, applying
/// builtin checkout filters (notably autocrlf/eol) without touching the real index.
pub fn checkout_version(
    repo: &Repository,
    path: &str,
    version: Option<Version>,
) -> Result<Option<Version>> {
    let Some(version) = version else {
        return Ok(None);
    };
    let filter = repo.get_attr(
        Path::new(path),
        "filter",
        git2::AttrCheckFlags::FILE_THEN_INDEX,
    )?;
    if matches!(
        git2::AttrValue::from_string(filter),
        git2::AttrValue::String(_) | git2::AttrValue::Bytes(_) | git2::AttrValue::True
    ) {
        return Err(error(format!(
            "文件使用外部 Git filter，请在终端恢复：{path}"
        )));
    }
    let mut index = git2::Index::new()?;
    index.add(&git2::IndexEntry {
        ctime: git2::IndexTime::new(0, 0),
        mtime: git2::IndexTime::new(0, 0),
        dev: 0,
        ino: 0,
        mode: version.mode,
        uid: 0,
        gid: 0,
        file_size: 0,
        id: Oid::from_str(&version.oid)?,
        flags: 0,
        flags_extended: 0,
        path: path.as_bytes().to_vec(),
    })?;
    let directory = tempfile::tempdir()?;
    repo.checkout_index(
        Some(&mut index),
        Some(
            git2::build::CheckoutBuilder::new()
                .force()
                .update_index(false)
                .target_dir(directory.path())
                .path(path),
        ),
    )?;
    let bytes = std::fs::read(directory.path().join(path))?;
    Ok(Some(Version {
        oid: repo.blob(&bytes)?.to_string(),
        mode: version.mode,
    }))
}
pub fn workspace_paths(repo: &Repository, root: &Path) -> Result<BTreeSet<String>> {
    let mut paths = BTreeSet::new();
    for entry in repo.index()?.iter() {
        if !matches!(entry.mode, 0o100644 | 0o100755) {
            continue;
        }
        paths.insert(
            String::from_utf8(entry.path.clone()).map_err(|_| error("非 UTF-8 路径不支持快照"))?,
        );
    }
    for file in Git2Backend::open(root)?.status()? {
        // Ignored untracked files and submodule contents are never traversed.
        if repo.status_should_ignore(Path::new(&file.path))? {
            continue;
        }
        let full = safe_path(root, &file.path)?;
        if full.is_dir() {
            continue;
        }
        paths.insert(file.path);
    }
    Ok(paths)
}
pub fn capture(root: &Path, label: &str, kind: &str, paths: Option<&[String]>) -> Result<Snapshot> {
    let repo = Repository::open(root)?;
    if repo.index()?.has_conflicts() {
        return Err(error("请先解决暂存区冲突"));
    }
    let paths = match paths {
        Some(p) => p.iter().cloned().collect(),
        None => workspace_paths(&repo, root)?,
    };
    let mut files = BTreeMap::new();
    let mut index = BTreeMap::new();
    let mut total = 0u64;
    for path in paths {
        let version = read_version(&repo, root, &path)?;
        if let Some(v) = &version {
            total += repo.find_blob(Oid::from_str(&v.oid)?)?.size() as u64;
        }
        if total > TOTAL {
            return Err(error("快照超过 200 MB，总操作已取消"));
        }
        index.insert(path.clone(), index_version(&repo, &path)?);
        files.insert(path, version);
    }
    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default();
    let mut snapshot = Snapshot {
        reference: format!("{PREFIX}{:020}", stamp.as_nanos()),
        label: label.into(),
        kind: kind.into(),
        root: canonical_root(&repo)?,
        head: repo
            .head()
            .ok()
            .and_then(|h| h.target())
            .map(|o| o.to_string()),
        created_ms: stamp.as_millis() as u64,
        baseline: index.clone(),
        expected_index: BTreeMap::new(),
        files,
        index,
    };
    // A shelf's base is the index, so taking/returning a shelf never changes staging.
    if kind == "shelf" {
        for (path, version) in &snapshot.index {
            snapshot.baseline.insert(
                path.clone(),
                checkout_version(&repo, path, version.clone())?,
            );
        }
    } else {
        snapshot.baseline.clear();
    }
    save(&repo, &snapshot)?;
    Ok(snapshot)
}
pub fn save(repo: &Repository, snapshot: &Snapshot) -> Result<()> {
    let mut builder = repo.treebuilder(None)?;
    let json = serde_json::to_vec(snapshot).map_err(|e| error(e.to_string()))?;
    builder.insert("manifest.json", repo.blob(&json)?, 0o100644)?;
    // Reachability: every captured blob is a tree entry, safe against git gc.
    for (i, version) in snapshot
        .files
        .values()
        .chain(snapshot.index.values())
        .chain(snapshot.baseline.values())
        .chain(snapshot.expected_index.values())
        .flatten()
        .enumerate()
    {
        builder.insert(
            format!("blob-{i}"),
            Oid::from_str(&version.oid)?,
            version.mode as i32,
        )?;
    }
    let tree = repo.find_tree(builder.write()?)?;
    let sig = Signature::now("tongyun-git", "snapshot@local")?;
    let oid = repo.commit(None, &sig, &sig, &snapshot.label, &tree, &[])?;
    repo.reference(&snapshot.reference, oid, true, "workspace snapshot")?;
    Ok(())
}
pub fn load(root: &Path, reference: &str) -> Result<Snapshot> {
    if !reference.starts_with(PREFIX) || !git2::Reference::is_valid_name(reference) {
        return Err(error("无效快照引用"));
    }
    let repo = Repository::open(root)?;
    let tree = repo.find_reference(reference)?.peel_to_commit()?.tree()?;
    let blob = repo.find_blob(
        tree.get_name("manifest.json")
            .ok_or_else(|| error("快照清单缺失"))?
            .id(),
    )?;
    let snapshot: Snapshot =
        serde_json::from_slice(blob.content()).map_err(|e| error(e.to_string()))?;
    if snapshot.root != canonical_root(&repo)? {
        return Err(error("快照属于另一个工作区"));
    }
    Ok(snapshot)
}
pub fn list(root: &Path) -> Result<Vec<Snapshot>> {
    let repo = Repository::open(root)?;
    let mut snapshots = Vec::new();
    for reference in repo.references_glob(&format!("{PREFIX}*"))? {
        let reference = reference?;
        if let Ok(name) = reference.name() {
            if let Ok(snapshot) = load(root, name) {
                // Rolling pre-session baselines are an implementation detail.
                if snapshot.kind == "auto_baseline" {
                    continue;
                }
                snapshots.push(snapshot);
            }
        }
    }
    snapshots.sort_by(|a, b| b.reference.cmp(&a.reference));
    Ok(snapshots)
}

/// References of hidden rolling `auto_baseline` snapshots. They are skipped by
/// [`list`](Self::list) but must still be enumerable so leaked baselines from a
/// previous process can be reclaimed.
pub fn baseline_refs(root: &Path) -> Result<Vec<String>> {
    let repo = Repository::open(root)?;
    let mut refs = Vec::new();
    for reference in repo.references_glob(&format!("{PREFIX}*"))? {
        let reference = reference?;
        if let Ok(name) = reference.name() {
            if load(root, name).is_ok_and(|snapshot| snapshot.kind == "auto_baseline") {
                refs.push(name.to_string());
            }
        }
    }
    refs.sort();
    Ok(refs)
}
pub fn changes(root: &Path, reference: &str) -> Result<Vec<SnapshotChange>> {
    let repo = Repository::open(root)?;
    let snapshot = load(root, reference)?;
    let mut paths: BTreeSet<String> = snapshot.files.keys().cloned().collect();
    if snapshot.kind == "agent" {
        paths.extend(workspace_paths(&repo, root)?);
    }
    let head = repo
        .head()
        .ok()
        .and_then(|h| h.target())
        .map(|o| o.to_string());
    let mut result = vec![];
    for path in paths {
        let saved = snapshot.files.get(&path).cloned().flatten();
        let current = read_version(&repo, root, &path)?;
        let current_index = index_version(&repo, &path)?;
        if saved != current {
            let can_restore = head == snapshot.head
                && (snapshot.kind != "shelf"
                    || current_index == snapshot.index.get(&path).cloned().flatten())
                && snapshot.kind != "agent"
                && (!matches!(
                    snapshot.kind.as_str(),
                    "shelf" | "agent_finished" | "undo" | "discard"
                ) || current == snapshot.baseline.get(&path).cloned().flatten());
            result.push(SnapshotChange {
                path,
                saved,
                current,
                current_index,
                can_restore,
            });
        }
    }
    Ok(result)
}
pub fn restore(
    root: &Path,
    reference: &str,
    requested: &[SnapshotChange],
) -> Result<RestoreResult> {
    if requested.is_empty() {
        return Err(error("请选择文件"));
    }
    let repo = Repository::open(root)?;
    if repo.state() != git2::RepositoryState::Clean {
        return Err(error("请先结束进行中的 Git 操作"));
    }
    let snapshot = load(root, reference)?;
    let current = changes(root, reference)?;
    let mut selected = vec![];
    let mut skipped = vec![];
    for request in requested {
        let actual = current.iter().find(|c| c.path == request.path);
        if let Some(c) = actual.filter(|c| {
            c.can_restore
                && c.current == request.current
                && c.current_index == request.current_index
                && c.saved == request.saved
        }) {
            selected.push(c.clone());
        } else {
            skipped.push(request.path.clone());
        }
    }
    let paths: Vec<String> = selected.iter().map(|c| c.path.clone()).collect();
    if paths.is_empty() {
        return Err(error("文件或 HEAD 已变化，请刷新预览后重新选择"));
    }
    let mut undo = capture(root, "撤回前快照", "undo", Some(&paths))?;
    for c in &selected {
        undo.baseline.insert(c.path.clone(), c.saved.clone());
    }
    save(&repo, &undo)?;
    let mut restored = 0;
    for c in selected {
        // Recheck immediately before each write, preserving subsequent user edits.
        if read_version(&repo, root, &c.path)? != c.current
            || index_version(&repo, &c.path)? != c.current_index
        {
            skipped.push(c.path);
            continue;
        }
        write_version(
            &repo,
            root,
            &c.path,
            snapshot.files.get(&c.path).and_then(|v| v.as_ref()),
        )?;
        restored += 1;
    }
    Ok(RestoreResult {
        restored,
        skipped,
        undo_ref: undo.reference,
    })
}
pub fn shelve(root: &Path, label: &str, paths: &[String]) -> Result<Snapshot> {
    if paths.is_empty() {
        return Err(error("请选择需要搁置的文件"));
    }
    let repo = Repository::open(root)?;
    if repo.state() != git2::RepositoryState::Clean {
        return Err(error("请先结束进行中的 Git 操作"));
    }
    let snapshot = capture(root, label, "shelf", Some(paths))?;
    for path in paths {
        if read_version(&repo, root, path)? != snapshot.files[path]
            || index_version(&repo, path)? != snapshot.index[path]
        {
            return Err(error("文件已变化，已保留搁置快照但未覆盖新改动"));
        }
    }
    for path in paths {
        write_version(&repo, root, path, snapshot.baseline[path].as_ref())?;
    }
    Ok(snapshot)
}
pub fn delete(root: &Path, reference: &str) -> Result<()> {
    load(root, reference)?;
    Repository::open(root)?
        .find_reference(reference)?
        .delete()?;
    Ok(())
}

pub fn finish(root: &Path, reference: &str) -> Result<Snapshot> {
    let repo = Repository::open(root)?;
    let mut snapshot = load(root, reference)?;
    if snapshot.kind != "agent" {
        return Err(error("会话已经结束"));
    }
    if repo
        .head()
        .ok()
        .and_then(|h| h.target())
        .map(|o| o.to_string())
        != snapshot.head
    {
        return Err(error("会话期间 HEAD 已变化，不能按工作区会话撤回"));
    }
    let mut paths: BTreeSet<String> = snapshot.files.keys().cloned().collect();
    paths.extend(workspace_paths(&repo, root)?);
    for path in paths {
        snapshot
            .baseline
            .insert(path.clone(), read_version(&repo, root, &path)?);
        snapshot.files.entry(path.clone()).or_insert(None);
        snapshot.index.entry(path).or_insert(None);
    }
    snapshot.kind = "agent_finished".into();
    save(&repo, &snapshot)?;
    Ok(snapshot)
}

pub fn discard_lines(
    root: &Path,
    expected: &crate::FileDiff,
    hunk_index: usize,
    selected: &[usize],
) -> Result<Snapshot> {
    if expected.staged
        || expected.is_binary
        || expected.is_crlf_change
        || expected.old_path.is_some()
        || selected.is_empty()
    {
        return Err(error("此文件不支持按行丢弃，请使用整文件丢弃"));
    }
    let repo = Repository::open(root)?;
    if repo.state() != git2::RepositoryState::Clean {
        return Err(error("请先结束进行中的 Git 操作"));
    }
    let current = Git2Backend::open(root)?.diff_file(&expected.path, false)?;
    if &current != expected {
        return Err(error("文件已变化，请重新选择"));
    }
    let hunk = current
        .hunks
        .get(hunk_index)
        .ok_or_else(|| error("Hunk 不存在"))?;
    if selected.iter().any(|i| {
        hunk.lines
            .get(*i)
            .is_none_or(|l| !matches!(l.origin, '+' | '-'))
    }) {
        return Err(error("请选择有改动的行"));
    }
    let before = read_version(&repo, root, &expected.path)?;
    let idx = index_version(&repo, &expected.path)?;
    let work = before
        .as_ref()
        .map(|v| {
            repo.find_blob(Oid::from_str(&v.oid).unwrap())
                .map(|b| b.content().to_vec())
        })
        .transpose()?
        .unwrap_or_default();
    let filtered_index = checkout_version(&repo, &expected.path, idx.clone())?;
    let base = filtered_index
        .as_ref()
        .map(|v| {
            repo.find_blob(Oid::from_str(&v.oid).unwrap())
                .map(|b| b.content().to_vec())
        })
        .transpose()?
        .unwrap_or_default();
    let work_lines: Vec<&[u8]> = work.split_inclusive(|b| *b == b'\n').collect();
    let base_lines: Vec<&[u8]> = base.split_inclusive(|b| *b == b'\n').collect();
    let start = if hunk.new_lines == 0 {
        hunk.new_start as usize
    } else {
        hunk.new_start.saturating_sub(1) as usize
    };
    if start > work_lines.len() {
        return Err(error("行位置已变化"));
    }
    let mut bytes = work_lines[..start].concat();
    let mut cursor = start;
    for (i, line) in hunk.lines.iter().enumerate() {
        match line.origin {
            '+' | ' ' => {
                let raw = work_lines
                    .get(cursor)
                    .ok_or_else(|| error("行位置已变化"))?;
                if line.origin == ' ' || !selected.contains(&i) {
                    bytes.extend_from_slice(raw);
                }
                cursor += 1;
            }
            '-' if selected.contains(&i) => {
                let number = line.old_lineno.ok_or_else(|| error("旧行位置缺失"))?;
                bytes.extend_from_slice(
                    base_lines
                        .get(number.saturating_sub(1) as usize)
                        .ok_or_else(|| error("旧行位置已变化"))?,
                );
            }
            _ => {}
        }
    }
    bytes.extend_from_slice(&work_lines[cursor..].concat());
    let mode = before
        .as_ref()
        .or(idx.as_ref())
        .map_or(0o100644, |v| v.mode);
    let result = Version {
        oid: repo.blob(&bytes)?.to_string(),
        mode,
    };
    let mut snapshot = capture(
        root,
        "按行丢弃前快照",
        "undo",
        Some(std::slice::from_ref(&expected.path)),
    )?;
    snapshot
        .baseline
        .insert(expected.path.clone(), Some(result.clone()));
    save(&repo, &snapshot)?;
    if read_version(&repo, root, &expected.path)? != before
        || index_version(&repo, &expected.path)? != idx
    {
        return Err(error("文件已变化，请重新选择"));
    }
    write_version(&repo, root, &expected.path, Some(&result))?;
    Ok(snapshot)
}
