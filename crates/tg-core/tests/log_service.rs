mod common;

use std::fs;
use tg_core::{ChangeKind, LogQuery, LogService};

#[test]
fn test_log_graph_merge_and_details_at_10() {
    let repo = common::basic();

    // 1. Create a branch and a commit
    repo.git(&["checkout", "-b", "feature-branch"]);
    fs::write(
        repo.path().join("feat.txt"),
        "feature line 1\nfeature line 2\n",
    )
    .unwrap();
    repo.git(&["add", "feat.txt"]);
    repo.git(&["commit", "-m", "feat: add feature file"]);

    // 2. Switch back to main and commit another change
    repo.git(&["checkout", "main"]);
    fs::write(repo.path().join("main.txt"), "main branch content\n").unwrap();
    repo.git(&["add", "main.txt"]);
    repo.git(&["commit", "-m", "chore: main branch update"]);

    // 3. AT-10a: Merge feature-branch into main (creating merge commit with 2 parents)
    repo.git(&[
        "merge",
        "feature-branch",
        "-m",
        "merge: join feature-branch into main",
    ]);

    // 4. Retrieve log with graph lanes
    let query = LogQuery {
        all_branches: true,
        filter_author: None,
        filter_query: None,
        skip: 0,
        limit: 50,
    };
    let log_res = LogService::get_log(repo.path(), query).expect("get_log");
    assert!(!log_res.commits.is_empty());

    // The head commit should be the merge commit
    let merge_commit = &log_res.commits[0];
    assert!(merge_commit.summary.contains("merge: join feature-branch"));
    assert_eq!(
        merge_commit.parents.len(),
        2,
        "merge commit must have 2 parents"
    );

    // Edges must connect to two parent lanes
    assert!(merge_commit.edges.len() >= 2);

    // Verify lanes exist in graph
    let max_col = log_res.commits.iter().map(|c| c.col).max().unwrap_or(0);
    assert!(
        max_col >= 1,
        "graph should show at least 2 columns during fork/merge"
    );

    // 5. AT-10c: Retrieve commit details and diff
    let feat_commit = log_res
        .commits
        .iter()
        .find(|c| c.summary.contains("feat: add feature file"))
        .expect("find feat commit");

    let details =
        LogService::get_commit_details(repo.path(), &feat_commit.oid).expect("get_commit_details");
    assert_eq!(details.files.len(), 1);
    assert_eq!(details.files[0].path, "feat.txt");
    assert_eq!(details.files[0].kind, ChangeKind::Added);

    // Retrieve file diff for feat.txt in feat_commit
    let file_diff = LogService::get_commit_file_diff(repo.path(), &feat_commit.oid, "feat.txt")
        .expect("get_commit_file_diff");
    assert_eq!(file_diff.path, "feat.txt");
    assert!(!file_diff.hunks.is_empty());
    assert_eq!(file_diff.hunks[0].lines.len(), 2);
    assert_eq!(file_diff.hunks[0].lines[0].origin, '+');
}

#[test]
fn test_log_filtering_and_pagination_at_10b() {
    let repo = common::basic();

    // Repo has at least 3 commits by default
    let total_query = LogQuery {
        all_branches: true,
        filter_author: None,
        filter_query: None,
        skip: 0,
        limit: 10,
    };
    let full_log = LogService::get_log(repo.path(), total_query).expect("get_log");
    assert!(full_log.total_matched >= 3);

    // 1. Author Filter
    let author_query = LogQuery {
        all_branches: true,
        filter_author: Some("Test Runner".to_string()),
        filter_query: None,
        skip: 0,
        limit: 10,
    };
    let author_log = LogService::get_log(repo.path(), author_query).expect("get_log with author");
    assert!(!author_log.commits.is_empty());

    let non_matching_author = LogQuery {
        all_branches: true,
        filter_author: Some("NonExistentAuthorName".to_string()),
        filter_query: None,
        skip: 0,
        limit: 10,
    };
    let empty_log =
        LogService::get_log(repo.path(), non_matching_author).expect("get_log non-matching");
    assert_eq!(empty_log.commits.len(), 0);

    // 2. Text / Hash Filter
    let first_commit = &full_log.commits[0];
    let query_by_hash = LogQuery {
        all_branches: true,
        filter_author: None,
        filter_query: Some(first_commit.short_oid.clone()),
        skip: 0,
        limit: 10,
    };
    let hash_log = LogService::get_log(repo.path(), query_by_hash).expect("get_log with hash");
    assert_eq!(hash_log.commits.len(), 1);
    assert_eq!(hash_log.commits[0].oid, first_commit.oid);

    // 3. Pagination (skip and limit)
    let paged_query = LogQuery {
        all_branches: true,
        filter_author: None,
        filter_query: None,
        skip: 1,
        limit: 1,
    };
    let paged_log = LogService::get_log(repo.path(), paged_query).expect("get_log paged");
    assert_eq!(paged_log.commits.len(), 1);
    assert_eq!(paged_log.commits[0].oid, full_log.commits[1].oid);
    assert!(paged_log.has_more);
}
