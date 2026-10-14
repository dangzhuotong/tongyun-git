mod common;

use std::fs;
use tg_core::ContextPackGenerator;

#[test]
fn test_context_pack_generator() {
    let repo = common::basic();

    // Modify a file (unstaged)
    let a_java = repo.path().join("a.java");
    fs::write(&a_java, "public class A {\n    // modified by AI\n}\n").unwrap();

    // Add a new file and stage it
    let staged_file = repo.path().join("new_feature.txt");
    fs::write(&staged_file, "this is a staged new feature line\n").unwrap();
    repo.git(&["add", "new_feature.txt"]);

    // Generate context pack
    let pack = ContextPackGenerator::generate(repo.path(), None)
        .expect("generate context pack should succeed");

    assert!(!pack.repo_name.is_empty());
    assert!(pack.summary.total_changed_files >= 2);
    assert!(pack.summary.staged_count >= 1);
    assert!(pack.summary.additions >= 1);
    assert!(pack.prompt_context.contains("Git Working Context:"));
    assert!(pack.prompt_context.contains("Changed Files Inventory"));
    assert!(pack.prompt_context.contains("new_feature.txt"));
    assert!(pack.prompt_context.contains("Code Changes Digest"));
}
