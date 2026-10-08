use git2::{BranchType, Oid, Repository, Sort};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::Path;

use crate::backend::{ChangeKind, DiffHunk, DiffLine, FileDiff};
use crate::error::{CoreError, Result};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub enum RefKind {
    Head,
    LocalBranch,
    RemoteBranch,
    Tag,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct RefBadge {
    pub name: String,
    pub kind: RefKind,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct GraphEdge {
    pub from_col: usize,
    pub to_col: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct LogCommit {
    pub oid: String,
    pub short_oid: String,
    pub parents: Vec<String>,
    pub author_name: String,
    pub author_email: String,
    pub timestamp: i64,
    pub summary: String,
    pub message: String,
    pub refs: Vec<RefBadge>,
    pub col: usize,
    pub edges: Vec<GraphEdge>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LogQuery {
    pub all_branches: bool,
    pub filter_author: Option<String>,
    pub filter_query: Option<String>,
    pub skip: usize,
    pub limit: usize,
}

impl Default for LogQuery {
    fn default() -> Self {
        Self {
            all_branches: true,
            filter_author: None,
            filter_query: None,
            skip: 0,
            limit: 100,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LogResult {
    pub commits: Vec<LogCommit>,
    pub total_matched: usize,
    pub has_more: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct CommitFileChange {
    pub path: String,
    pub old_path: Option<String>,
    pub kind: ChangeKind,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommitDetails {
    pub oid: String,
    pub short_oid: String,
    pub parents: Vec<String>,
    pub author_name: String,
    pub author_email: String,
    pub author_timestamp: i64,
    pub committer_name: String,
    pub committer_email: String,
    pub commit_timestamp: i64,
    pub message: String,
    pub files: Vec<CommitFileChange>,
}

pub struct LogService;

impl LogService {
    /// Retrieve paginated commit logs with graph lane topology (R-10, AT-10a, AT-10b).
    pub fn get_log(repo_path: &Path, query: LogQuery) -> Result<LogResult> {
        let repo = Repository::open(repo_path)?;
        if repo.is_empty()? {
            return Ok(LogResult {
                commits: Vec::new(),
                total_matched: 0,
                has_more: false,
            });
        }

        // 1. Collect all reference badges (HEAD, local branches, remote branches, tags)
        let mut ref_map: HashMap<Oid, Vec<RefBadge>> = HashMap::new();

        if let Ok(head) = repo.head() {
            if let Some(target) = head.target() {
                let name = head.shorthand().unwrap_or("HEAD").to_string();
                ref_map.entry(target).or_default().push(RefBadge {
                    name,
                    kind: RefKind::Head,
                });
            }
        }

        if let Ok(branches) = repo.branches(Some(BranchType::Local)) {
            for entry in branches.flatten() {
                let (branch, _) = entry;
                if let (Ok(Some(name)), Some(target)) = (branch.name(), branch.get().target()) {
                    // Avoid duplicating if head badge already named the branch
                    let badges = ref_map.entry(target).or_default();
                    if !badges.iter().any(|b| b.name == name) {
                        badges.push(RefBadge {
                            name: name.to_string(),
                            kind: RefKind::LocalBranch,
                        });
                    }
                }
            }
        }

        if let Ok(branches) = repo.branches(Some(BranchType::Remote)) {
            for entry in branches.flatten() {
                let (branch, _) = entry;
                if let (Ok(Some(name)), Some(target)) = (branch.name(), branch.get().target()) {
                    if !name.ends_with("/HEAD") {
                        ref_map.entry(target).or_default().push(RefBadge {
                            name: name.to_string(),
                            kind: RefKind::RemoteBranch,
                        });
                    }
                }
            }
        }

        if let Ok(tag_names) = repo.tag_names(None) {
            for tag_name_opt in &tag_names {
                if let Ok(Some(tag_name)) = tag_name_opt {
                    if let Ok(obj) = repo.revparse_single(tag_name) {
                        let target = obj
                            .peel_to_commit()
                            .map(|c| c.id())
                            .unwrap_or_else(|_| obj.id());
                        ref_map.entry(target).or_default().push(RefBadge {
                            name: tag_name.to_string(),
                            kind: RefKind::Tag,
                        });
                    }
                }
            }
        }

        // 2. Configure revwalk
        let mut revwalk = repo.revwalk()?;
        revwalk.set_sorting(Sort::TOPOLOGICAL | Sort::TIME)?;

        if query.all_branches {
            // Push all references
            if let Ok(refs) = repo.references() {
                for r in refs.flatten() {
                    if let Some(oid) = r.target() {
                        let _ = revwalk.push(oid);
                    }
                }
            }
            let _ = revwalk.push_head();
        } else {
            // Push only HEAD
            revwalk.push_head()?;
        }

        // 3. Collect matching commits and calculate graph lanes
        let mut active_lanes: Vec<Option<Oid>> = Vec::new();
        let mut all_matched: Vec<LogCommit> = Vec::new();

        let author_filter = query.filter_author.as_deref().map(|s| s.to_lowercase());
        let text_filter = query.filter_query.as_deref().map(|s| s.to_lowercase());

        for oid_result in revwalk {
            let oid = match oid_result {
                Ok(id) => id,
                Err(_) => continue,
            };

            let commit = match repo.find_commit(oid) {
                Ok(c) => c,
                Err(_) => continue,
            };

            let author = commit.author();
            let author_name = author.name().unwrap_or("").to_string();
            let author_email = author.email().unwrap_or("").to_string();
            let message = commit.message().unwrap_or("").to_string();
            let summary = message.lines().next().unwrap_or("").to_string();
            let timestamp = commit.time().seconds();
            let oid_str = oid.to_string();
            let short_oid = oid_str.chars().take(7).collect::<String>();
            let parents: Vec<Oid> = commit.parent_ids().collect();
            let parent_strs: Vec<String> = parents.iter().map(|p| p.to_string()).collect();

            // Lane Allocation for Graph Topology
            let mut col = 0;
            let mut found_lane = false;
            for (idx, lane) in active_lanes.iter().enumerate() {
                if *lane == Some(oid) {
                    col = idx;
                    found_lane = true;
                    break;
                }
            }

            if !found_lane {
                // Find first free slot or append new lane
                if let Some(free_idx) = active_lanes.iter().position(|l| l.is_none()) {
                    col = free_idx;
                } else {
                    col = active_lanes.len();
                    active_lanes.push(None);
                }
            }

            let mut edges = Vec::new();

            if parents.is_empty() {
                // Root commit
                if col < active_lanes.len() {
                    active_lanes[col] = None;
                }
            } else {
                // First parent takes over current lane, unless it is already tracked in another lane
                let p0 = parents[0];
                let existing_p0_lane = active_lanes.iter().position(|l| *l == Some(p0));

                match existing_p0_lane {
                    Some(p0_col) => {
                        edges.push(GraphEdge {
                            from_col: col,
                            to_col: p0_col,
                        });
                        if p0_col != col {
                            active_lanes[col] = None;
                        }
                    }
                    None => {
                        active_lanes[col] = Some(p0);
                        edges.push(GraphEdge {
                            from_col: col,
                            to_col: col,
                        });
                    }
                }

                // Subsequent parents (merges)
                for &pk in &parents[1..] {
                    if let Some(pk_col) = active_lanes.iter().position(|l| *l == Some(pk)) {
                        edges.push(GraphEdge {
                            from_col: col,
                            to_col: pk_col,
                        });
                    } else {
                        // Allocate lane for new branch parent
                        let new_col =
                            if let Some(free_idx) = active_lanes.iter().position(|l| l.is_none()) {
                                active_lanes[free_idx] = Some(pk);
                                free_idx
                            } else {
                                active_lanes.push(Some(pk));
                                active_lanes.len() - 1
                            };
                        edges.push(GraphEdge {
                            from_col: col,
                            to_col: new_col,
                        });
                    }
                }
            }

            // Clean trailing None lanes
            while let Some(last) = active_lanes.last() {
                if last.is_none() {
                    active_lanes.pop();
                } else {
                    break;
                }
            }

            // Apply Filters (AT-10b)
            if let Some(ref af) = author_filter {
                if !author_name.to_lowercase().contains(af)
                    && !author_email.to_lowercase().contains(af)
                {
                    continue;
                }
            }

            if let Some(ref tf) = text_filter {
                if !oid_str.starts_with(tf)
                    && !short_oid.starts_with(tf)
                    && !summary.to_lowercase().contains(tf)
                    && !message.to_lowercase().contains(tf)
                {
                    continue;
                }
            }

            let refs = ref_map.remove(&oid).unwrap_or_default();

            all_matched.push(LogCommit {
                oid: oid_str,
                short_oid,
                parents: parent_strs,
                author_name,
                author_email,
                timestamp,
                summary,
                message,
                refs,
                col,
                edges,
            });
        }

        let total_matched = all_matched.len();
        let skip = query.skip.min(total_matched);
        let limit = if query.limit == 0 { 100 } else { query.limit };
        let end = (skip + limit).min(total_matched);

        let paged_commits = all_matched[skip..end].to_vec();
        let has_more = end < total_matched;

        Ok(LogResult {
            commits: paged_commits,
            total_matched,
            has_more,
        })
    }

    /// Retrieve full details and changed file list for a specific commit (R-10).
    pub fn get_commit_details(repo_path: &Path, oid_str: &str) -> Result<CommitDetails> {
        let repo = Repository::open(repo_path)?;
        let oid = Oid::from_str(oid_str.trim()).map_err(|e| CoreError::LogError(e.to_string()))?;
        let commit = repo.find_commit(oid)?;

        let author = commit.author();
        let committer = commit.committer();

        let current_tree = commit.tree()?;
        let parent_tree = if commit.parent_count() > 0 {
            Some(commit.parent(0)?.tree()?)
        } else {
            None
        };

        let mut diff_opts = git2::DiffOptions::new();
        let mut diff = repo.diff_tree_to_tree(
            parent_tree.as_ref(),
            Some(&current_tree),
            Some(&mut diff_opts),
        )?;

        let mut find_opts = git2::DiffFindOptions::new();
        find_opts.renames(true);
        let _ = diff.find_similar(Some(&mut find_opts));

        let mut files = Vec::new();
        for delta in diff.deltas() {
            let old_file = delta.old_file();
            let new_file = delta.new_file();
            let path = new_file
                .path()
                .or_else(|| old_file.path())
                .unwrap_or(Path::new(""))
                .to_string_lossy()
                .replace('\\', "/");

            let old_path = if delta.status() == git2::Delta::Renamed {
                old_file
                    .path()
                    .map(|p| p.to_string_lossy().replace('\\', "/"))
            } else {
                None
            };

            let kind = match delta.status() {
                git2::Delta::Added => ChangeKind::Added,
                git2::Delta::Deleted => ChangeKind::Deleted,
                git2::Delta::Modified => ChangeKind::Modified,
                git2::Delta::Renamed => ChangeKind::Renamed,
                _ => ChangeKind::Modified,
            };

            files.push(CommitFileChange {
                path,
                old_path,
                kind,
            });
        }

        files.sort_by(|a, b| a.path.cmp(&b.path));

        let parents: Vec<String> = commit.parent_ids().map(|p| p.to_string()).collect();
        let full_oid = oid.to_string();
        let short_oid = full_oid.chars().take(7).collect();

        Ok(CommitDetails {
            oid: full_oid,
            short_oid,
            parents,
            author_name: author.name().unwrap_or("").to_string(),
            author_email: author.email().unwrap_or("").to_string(),
            author_timestamp: author.when().seconds(),
            committer_name: committer.name().unwrap_or("").to_string(),
            committer_email: committer.email().unwrap_or("").to_string(),
            commit_timestamp: committer.when().seconds(),
            message: commit.message().unwrap_or("").to_string(),
            files,
        })
    }

    /// Retrieve read-only diff for a specific file in a commit compared to its first parent (R-10, AT-10c).
    pub fn get_commit_file_diff(
        repo_path: &Path,
        oid_str: &str,
        file_path: &str,
    ) -> Result<FileDiff> {
        let repo = Repository::open(repo_path)?;
        let oid = Oid::from_str(oid_str.trim()).map_err(|e| CoreError::LogError(e.to_string()))?;
        let commit = repo.find_commit(oid)?;

        let current_tree = commit.tree()?;
        let parent_tree = if commit.parent_count() > 0 {
            Some(commit.parent(0)?.tree()?)
        } else {
            None
        };

        let mut diff_opts = git2::DiffOptions::new();
        diff_opts.pathspec(file_path);

        let mut diff = repo.diff_tree_to_tree(
            parent_tree.as_ref(),
            Some(&current_tree),
            Some(&mut diff_opts),
        )?;

        let mut find_opts = git2::DiffFindOptions::new();
        find_opts.renames(true);
        let _ = diff.find_similar(Some(&mut find_opts));

        let hunks_cell = std::cell::RefCell::new(Vec::new());
        let is_binary_cell = std::cell::Cell::new(false);
        let old_path_cell = std::cell::RefCell::new(None);

        diff.foreach(
            &mut |delta, _progress| {
                if delta.flags().contains(git2::DiffFlags::BINARY) {
                    is_binary_cell.set(true);
                }
                if delta.status() == git2::Delta::Renamed {
                    let old_p = delta
                        .old_file()
                        .path()
                        .map(|p| p.to_string_lossy().replace('\\', "/"));
                    *old_path_cell.borrow_mut() = old_p;
                }
                true
            },
            None,
            Some(&mut |_delta, hunk| {
                hunks_cell.borrow_mut().push(DiffHunk {
                    header: String::from_utf8_lossy(hunk.header())
                        .trim_end()
                        .to_string(),
                    old_start: hunk.old_start(),
                    old_lines: hunk.old_lines(),
                    new_start: hunk.new_start(),
                    new_lines: hunk.new_lines(),
                    lines: Vec::new(),
                });
                true
            }),
            Some(&mut |_delta, _hunk, line| {
                let mut hunks_mut = hunks_cell.borrow_mut();
                if let Some(current_hunk) = hunks_mut.last_mut() {
                    current_hunk.lines.push(DiffLine {
                        origin: line.origin(),
                        old_lineno: line.old_lineno(),
                        new_lineno: line.new_lineno(),
                        content: String::from_utf8_lossy(line.content()).to_string(),
                    });
                }
                true
            }),
        )?;

        let hunks = hunks_cell.into_inner();
        let old_path = old_path_cell.into_inner();
        let is_binary = is_binary_cell.get();

        Ok(FileDiff {
            path: file_path.to_string(),
            old_path,
            staged: false,
            is_binary,
            old_size: None,
            new_size: None,
            is_crlf_change: false,
            is_large: false,
            hunks,
        })
    }
}
