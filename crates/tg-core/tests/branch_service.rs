mod common;

use std::fs;
use tg_core::{BranchService, CliRunner};

#[test]
fn test_branch_list_create_and_switch_at_08_09() {
    let repo = common::basic();
    let runner = CliRunner::new("git");
    let service = BranchService::new(&runner);

    // 1. Initial branches list
    let branches = service.list_branches(repo.path()).expect("list_branches");
    assert!(!branches.is_empty());
    let main_branch = branches
        .iter()
        .find(|b| b.name == "main")
        .expect("main branch");
    assert!(main_branch.is_head);
    assert!(!main_branch.is_remote);

    // 2. AT-09b: Validate branch names
    let bad_val = service
        .validate_branch_name(repo.path(), "bad..name")
        .expect("validate bad");
    assert!(!bad_val.valid);
    assert!(bad_val.error_message.is_some());

    let existing_val = service
        .validate_branch_name(repo.path(), "main")
        .expect("validate existing");
    assert!(!existing_val.valid);
    assert!(existing_val
        .error_message
        .as_ref()
        .unwrap()
        .contains("已存在"));

    let good_val = service
        .validate_branch_name(repo.path(), "feature/login")
        .expect("validate good");
    assert!(good_val.valid);
    assert!(good_val.error_message.is_none());

    // 3. AT-09a: Create new branch and checkout
    service
        .create_branch(repo.path(), "feature/login", None, true)
        .expect("create and checkout branch");

    let updated_branches = service
        .list_branches(repo.path())
        .expect("list_branches after create");
    let feat_branch = updated_branches
        .iter()
        .find(|b| b.name == "feature/login")
        .expect("feature/login branch exists");
    assert!(feat_branch.is_head);

    // Verify via CLI
    let current_branch_out = repo.git(&["branch", "--show-current"]);
    assert_eq!(
        String::from_utf8_lossy(&current_branch_out.stdout).trim(),
        "feature/login"
    );

    // 4. AT-08a: Switch back to main branch
    let switch_res = service
        .switch_branch(repo.path(), "main", false)
        .expect("switch to main");
    assert!(switch_res.success);
    assert_eq!(switch_res.current_branch, "main");

    let current_branch_out2 = repo.git(&["branch", "--show-current"]);
    assert_eq!(
        String::from_utf8_lossy(&current_branch_out2.stdout).trim(),
        "main"
    );
}

#[test]
fn test_switch_remote_tracking_branch_at_08b() {
    let fixture = common::remote();
    let runner = CliRunner::new("git");
    let service = BranchService::new(&runner);

    // Create a new branch in other repo and push to bare remote
    common::git_cmd(
        &fixture.other_path,
        fixture.dir.path(),
        &["checkout", "-b", "feature-x"],
    );
    fs::write(
        fixture.other_path.join("feature_x.txt"),
        "feature x content\n",
    )
    .unwrap();
    common::git_cmd(
        &fixture.other_path,
        fixture.dir.path(),
        &["add", "feature_x.txt"],
    );
    common::git_cmd(
        &fixture.other_path,
        fixture.dir.path(),
        &["commit", "-m", "add feature x"],
    );
    common::git_cmd(
        &fixture.other_path,
        fixture.dir.path(),
        &["push", "-u", "origin", "feature-x"],
    );

    // In main repo, fetch from origin so origin/feature-x is visible
    common::git_cmd(&fixture.main_path, fixture.dir.path(), &["fetch", "origin"]);

    // Verify remote branch origin/feature-x appears in list_branches
    let branches = service
        .list_branches(&fixture.main_path)
        .expect("list_branches");
    assert!(branches
        .iter()
        .any(|b| b.name == "origin/feature-x" && b.is_remote));

    // AT-08b: Switch to origin/feature-x when no local feature-x exists
    let switch_res = service
        .switch_branch(&fixture.main_path, "origin/feature-x", true)
        .expect("switch to origin/feature-x");

    assert!(switch_res.success);
    assert_eq!(switch_res.current_branch, "feature-x");

    // Verify local tracking branch was created
    let show_current = common::git_cmd(
        &fixture.main_path,
        fixture.dir.path(),
        &["branch", "--show-current"],
    );
    assert_eq!(
        String::from_utf8_lossy(&show_current.stdout).trim(),
        "feature-x"
    );
}

#[test]
fn test_switch_conflict_prevented_at_08c() {
    let repo = common::basic();
    let runner = CliRunner::new("git");
    let service = BranchService::new(&runner);

    // Create a new branch `branch-b` and commit a change to `README.md`
    service
        .create_branch(repo.path(), "branch-b", None, true)
        .expect("create branch-b");
    let readme_path = repo.path().join("README.md");
    fs::write(&readme_path, "branch-b unique modification\n").unwrap();
    repo.git(&["add", "README.md"]);
    repo.git(&["commit", "-m", "branch-b modified readme"]);

    // Switch back to `main`
    service
        .switch_branch(repo.path(), "main", false)
        .expect("switch to main");

    // Modify `README.md` in working directory on `main` without committing
    fs::write(&readme_path, "uncommitted local change on main\n").unwrap();

    // AT-08c: Try switching to `branch-b` where README.md has different content
    let switch_res = service
        .switch_branch(repo.path(), "branch-b", false)
        .expect("switch should return blocked result");

    assert!(!switch_res.success);
    assert_eq!(switch_res.current_branch, "main");
    assert!(switch_res
        .conflicting_files
        .contains(&"README.md".to_string()));
    assert!(switch_res
        .error_message
        .as_ref()
        .unwrap()
        .contains("README.md"));

    // Working directory change is not lost
    let content = fs::read_to_string(&readme_path).unwrap();
    assert_eq!(content, "uncommitted local change on main\n");
}
