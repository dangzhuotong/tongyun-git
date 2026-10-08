use crate::error::{CoreError, Result};
use git2::{ObjectType, Repository, Signature};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};

pub const MAX_SINGLE_FILE_SNAPSHOT: u64 = 50 * 1024 * 1024; // 50 MB (R-17)
pub const MAX_TOTAL_SNAPSHOT: u64 = 200 * 1024 * 1024; // 200 MB (R-17)
pub const MAX_SNAPSHOT_COUNT: usize = 20; // AT-17i

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

impl DiscardService {
    /// Inspect files to produce candidate list before discard (for UI confirmation dialog)
    pub fn inspect_candidates(repo_root: &Path, paths: &[&str]) -> Result<Vec<DiscardCandidate>> {
        let repo = Repository::open(repo_root)?;
        let index = repo.index()?;
        let head_tree = match repo.head() {
            Ok(head_ref) => head_ref.peel_to_tree().ok(),
            Err(_) => None,
        };

        let mut candidates = Vec::new();
        let mut total_size = 0u64;

        for &path_str in paths {
            let normalized = path_str.replace('\\', "/");
            let p = Path::new(&normalized);
            let full_path = repo_root.join(p);

            let in_head = head_tree
                .as_ref()
                .is_some_and(|tree| tree.get_path(p).is_ok());
            let in_index = index.get_path(p, 0).is_some();
            let in_workdir = full_path.exists();

            let will_delete = !in_head && (in_workdir || in_index);

            let file_size = if in_workdir {
                fs::metadata(&full_path).map(|m| m.len()).unwrap_or(0)
            } else if in_index {
                index.get_path(p, 0).map_or(0, |e| e.file_size as u64)
            } else {
                0
            };

            let single_exceeded = file_size > MAX_SINGLE_FILE_SNAPSHOT;
            let total_exceeded = total_size + file_size > MAX_TOTAL_SNAPSHOT;
            let unrestorable = single_exceeded || total_exceeded;

            if !unrestorable {
                total_size += file_size;
            }

            candidates.push(DiscardCandidate {
                path: normalized,
                will_delete,
                unrestorable,
                size: file_size,
            });
        }

        Ok(candidates)
    }

    /// Discard changes of the given files after taking an automatic snapshot.
    pub fn discard_files(repo_root: &Path, paths: &[&str]) -> Result<DiscardResult> {
        let repo = Repository::open(repo_root)?;
        let candidates = Self::inspect_candidates(repo_root, paths)?;

        // 1. Create snapshot for restorable files
        let restorable_paths: Vec<&str> = candidates
            .iter()
            .filter(|c| !c.unrestorable)
            .map(|c| c.path.as_str())
            .collect();

        let snapshot_ref = if !restorable_paths.is_empty() {
            Some(Self::create_snapshot(&repo, repo_root, &restorable_paths)?)
        } else {
            None
        };

        // 2. Perform discard on each file
        let head_obj = match repo.head() {
            Ok(head_ref) => head_ref.peel(ObjectType::Commit).ok(),
            Err(_) => None,
        };
        let head_tree = head_obj
            .as_ref()
            .and_then(|c| c.as_commit())
            .and_then(|c| c.tree().ok());
        let mut index = repo.index()?;

        for candidate in &candidates {
            let p = Path::new(&candidate.path);
            let full_path = repo_root.join(p);

            if candidate.will_delete {
                // Untracked or staged new file
                let _ = index.remove_path(p);
                if full_path.exists() {
                    let _ = fs::remove_file(&full_path);
                }
            } else {
                // Modified / Deleted in HEAD: restore from HEAD tree
                if let Some(ref tree) = head_tree {
                    if let Ok(entry) = tree.get_path(p) {
                        if let Ok(blob) = repo.find_blob(entry.id()) {
                            if let Some(parent) = full_path.parent() {
                                fs::create_dir_all(parent)?;
                            }
                            fs::write(&full_path, blob.content())?;
                        }
                    }
                }
                // Reset index entry to match HEAD
                let _ = repo.reset_default(head_obj.as_ref(), [&candidate.path]);
            }
        }

        index.write()?;

        let unrestorable_files: Vec<String> = candidates
            .into_iter()
            .filter(|c| c.unrestorable)
            .map(|c| c.path)
            .collect();

        Ok(DiscardResult {
            snapshot_ref,
            discarded_count: paths.len(),
            unrestorable_files,
        })
    }

    /// Creates a snapshot commit under refs/tongyun/discard/<timestamp>
    fn create_snapshot(repo: &Repository, repo_root: &Path, paths: &[&str]) -> Result<String> {
        let index = repo.index()?;
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis();

        let mut wt_tree_builder = repo.treebuilder(None)?;
        let mut idx_tree_builder = repo.treebuilder(None)?;

        for &path_str in paths {
            let p = Path::new(path_str);
            let full_path = repo_root.join(p);

            // Worktree blob
            if full_path.exists() {
                if let Ok(bytes) = fs::read(&full_path) {
                    let blob_oid = repo.blob(&bytes)?;
                    let safe_name = path_str.replace(['/', '\\'], "__");
                    wt_tree_builder.insert(&safe_name, blob_oid, 0o100644)?;
                }
            }

            // Staged blob
            if let Some(entry) = index.get_path(p, 0) {
                let safe_name = path_str.replace(['/', '\\'], "__");
                idx_tree_builder.insert(&safe_name, entry.id, 0o100644)?;
            }
        }

        let wt_oid = wt_tree_builder.write()?;
        let idx_oid = idx_tree_builder.write()?;

        let mut root_tree_builder = repo.treebuilder(None)?;
        root_tree_builder.insert("wt", wt_oid, 0o040000)?;
        root_tree_builder.insert("idx", idx_oid, 0o040000)?;
        let root_tree_oid = root_tree_builder.write()?;
        let root_tree = repo.find_tree(root_tree_oid)?;

        let sig = Signature::now("tongyun-git", "tongyun@local").unwrap_or_else(|_| {
            Signature::new("tongyun-git", "tongyun@local", &git2::Time::new(0, 0)).unwrap()
        });

        let commit_msg = format!("discard snapshot: {} files at {}", paths.len(), now);
        let commit_oid = repo.commit(None, &sig, &sig, &commit_msg, &root_tree, &[])?;

        let ref_name = format!("refs/tongyun/discard/{:016}", now);
        repo.reference(&ref_name, commit_oid, true, "tongyun discard snapshot")?;

        // Prune older snapshots if count > MAX_SNAPSHOT_COUNT (AT-17i)
        Self::prune_old_snapshots(repo)?;

        Ok(ref_name)
    }

    /// Prune old snapshots beyond MAX_SNAPSHOT_COUNT
    fn prune_old_snapshots(repo: &Repository) -> Result<()> {
        let mut snapshot_refs = Vec::new();
        if let Ok(glob) = repo.references_glob("refs/tongyun/discard/*") {
            for reference in glob.flatten() {
                if let Ok(name) = reference.name() {
                    snapshot_refs.push(name.to_string());
                }
            }
        }

        snapshot_refs.sort(); // Lexicographical sort on timestamp format :016

        if snapshot_refs.len() > MAX_SNAPSHOT_COUNT {
            let to_remove = snapshot_refs.len() - MAX_SNAPSHOT_COUNT;
            for name in snapshot_refs.iter().take(to_remove) {
                if let Ok(mut r) = repo.find_reference(name) {
                    let _ = r.delete();
                }
            }
        }

        Ok(())
    }

    /// Undo the most recent discard snapshot
    pub fn undo_last_discard(repo_root: &Path, skip_conflict: bool) -> Result<UndoDiscardResult> {
        let repo = Repository::open(repo_root)?;
        let mut snapshot_refs = Vec::new();
        if let Ok(glob) = repo.references_glob("refs/tongyun/discard/*") {
            for reference in glob.flatten() {
                if let Ok(name) = reference.name() {
                    snapshot_refs.push(name.to_string());
                }
            }
        }

        snapshot_refs.sort();
        let latest_ref_name = snapshot_refs
            .last()
            .ok_or_else(|| CoreError::DiscardError("没有可撤销的丢弃快照".to_string()))?;

        let reference = repo.find_reference(latest_ref_name)?;
        let commit = reference.peel_to_commit()?;
        let tree = commit.tree()?;

        let wt_tree = tree
            .get_name("wt")
            .and_then(|e| e.to_object(&repo).ok())
            .and_then(|o| o.into_tree().ok());
        let idx_tree = tree
            .get_name("idx")
            .and_then(|e| e.to_object(&repo).ok())
            .and_then(|o| o.into_tree().ok());

        let mut restored_count = 0;
        let mut skipped_files = Vec::new();
        let mut index = repo.index()?;

        if let Some(wt) = wt_tree {
            for entry in wt.iter() {
                let safe_name = entry.name().unwrap_or_default();
                let original_path = safe_name.replace("__", "/");
                let full_path = repo_root.join(Path::new(&original_path));

                if let Some(blob) = entry.to_object(&repo).ok().and_then(|o| o.into_blob().ok()) {
                    // Check if externally modified
                    if full_path.exists() {
                        let current_bytes = fs::read(&full_path).unwrap_or_default();
                        if current_bytes != blob.content() && skip_conflict {
                            skipped_files.push(original_path.clone());
                            continue;
                        }
                    }

                    if let Some(parent) = full_path.parent() {
                        fs::create_dir_all(parent)?;
                    }
                    fs::write(&full_path, blob.content())?;
                    restored_count += 1;
                }
            }
        }

        // Restore staged files if present
        if let Some(idx) = idx_tree {
            for entry in idx.iter() {
                let safe_name = entry.name().unwrap_or_default();
                let original_path = safe_name.replace("__", "/");
                let p = Path::new(&original_path);
                let _ = index.add_path(p);
            }
            let _ = index.write();
        }

        Ok(UndoDiscardResult {
            restored_count,
            skipped_files,
        })
    }
}
