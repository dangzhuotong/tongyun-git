use serde::Serialize;
use std::path::Path;
use std::time::Instant;
use tg_core::{libgit2_version, CliRunner, Git2Backend, GitBackend};

#[derive(Serialize)]
struct BaselineOutput {
    repo: String,
    files_in_index: usize,
    open_ms: f64,
    status_ms: f64,
    status_entries: usize,
    revwalk_n: usize,
    revwalk_ms: f64,
    git_version: String,
    libgit2_version: String,
}

fn round_ms(v: f64) -> f64 {
    if v < 0.01 && v > 0.0 {
        (v * 1000.0).round() / 1000.0
    } else {
        (v * 100.0).round() / 100.0
    }
}

fn median(mut vals: Vec<f64>) -> f64 {
    vals.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
    vals[vals.len() / 2]
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<String> = std::env::args().collect();
    if args.len() < 2 {
        eprintln!("Usage: baseline <repo_path> [revwalk_n, default 10000]");
        std::process::exit(1);
    }

    let repo_arg = &args[1];
    let repo_path = Path::new(repo_arg);
    let target_revwalk_n: usize = if args.len() >= 3 {
        args[2].parse().unwrap_or(10000)
    } else {
        10000
    };

    let repo_git2 = git2::Repository::open(repo_path)?;
    let files_in_index = repo_git2.index()?.len();

    let git_version = CliRunner::new("git")
        .version()
        .unwrap_or_else(|_| "unknown".to_string());
    let libgit2_ver = libgit2_version();

    let mut open_runs = Vec::with_capacity(3);
    let mut status_runs = Vec::with_capacity(3);
    let mut revwalk_runs = Vec::with_capacity(3);

    let mut status_entries = 0;
    let mut actual_revwalk_n = 0;

    for i in 0..3 {
        // 1. open_ms: Git2Backend::open
        let t_open = Instant::now();
        let backend = Git2Backend::open(repo_path)?;
        let open_ms = t_open.elapsed().as_secs_f64() * 1000.0;
        open_runs.push(open_ms);

        // 2. status_ms: first status()
        let t_status = Instant::now();
        let statuses = backend.status()?;
        let status_ms = t_status.elapsed().as_secs_f64() * 1000.0;
        status_runs.push(status_ms);
        status_entries = statuses.len();

        // 3. revwalk_ms: git2 revwalk (Sort::TOPOLOGICAL | Sort::TIME)
        let t_revwalk = Instant::now();
        let mut revwalk = repo_git2.revwalk()?;
        revwalk.set_sorting(git2::Sort::TOPOLOGICAL | git2::Sort::TIME)?;
        let mut walked = 0;
        if repo_git2.head().is_ok() {
            let _ = revwalk.push_head();
            for oid_res in revwalk {
                if walked >= target_revwalk_n {
                    break;
                }
                if let Ok(oid) = oid_res {
                    if let Ok(commit) = repo_git2.find_commit(oid) {
                        let _title = commit.summary();
                        let author = commit.author();
                        let _name = author.name();
                        let _time = commit.time().seconds();
                        walked += 1;
                    }
                }
            }
        }
        let revwalk_ms = t_revwalk.elapsed().as_secs_f64() * 1000.0;
        revwalk_runs.push(revwalk_ms);
        actual_revwalk_n = walked;

        eprintln!(
            "run {}: open={:.2}ms, status={:.2}ms, revwalk={:.2}ms",
            i + 1,
            open_ms,
            status_ms,
            revwalk_ms
        );
    }

    let output = BaselineOutput {
        repo: repo_arg.clone(),
        files_in_index,
        open_ms: round_ms(median(open_runs)),
        status_ms: round_ms(median(status_runs)),
        status_entries,
        revwalk_n: actual_revwalk_n,
        revwalk_ms: round_ms(median(revwalk_runs)),
        git_version,
        libgit2_version: libgit2_ver,
    };

    println!("{}", serde_json::to_string(&output)?);

    Ok(())
}
