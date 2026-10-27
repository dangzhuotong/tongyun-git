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
    assert!(pack
        .prompt_context
        .contains("this is a staged new feature line"));
    assert!(pack.prompt_context.contains("Code Changes Digest"));
}

#[test]
fn context_pack_omits_secret_file_contents() {
    let repo = common::basic();
    let env_file = repo.path().join(".env");
    fs::write(&env_file, "API_TOKEN=super-secret-value\n").unwrap();
    repo.git(&["add", ".env"]);

    let pack = ContextPackGenerator::generate(repo.path(), None).expect("context pack");
    assert!(pack.prompt_context.contains(".env"));
    assert!(pack.prompt_context.contains("敏感文件：内容已排除"));
    assert!(
        !pack.prompt_context.contains("super-secret-value"),
        "{}",
        pack.prompt_context
    );
}

#[test]
fn context_pack_truncation_budget_is_characters() {
    let repo = common::basic();
    let notes = repo.path().join("notes.txt");
    fs::write(&notes, "中文改动行\n").unwrap();
    repo.git(&["add", "notes.txt"]);

    let full = ContextPackGenerator::generate(repo.path(), None).expect("full pack");
    assert!(full.prompt_context.contains("中文改动行"));
    let chars = full.prompt_context.chars().count();
    assert!(
        full.prompt_context.len() > chars,
        "fixture must be wider in bytes than in characters"
    );

    let kept = ContextPackGenerator::generate(repo.path(), Some(chars)).expect("char budget");
    assert!(
        kept.prompt_context.contains("中文改动行"),
        "character budget equal to the prompt dropped the diff:\n{}",
        kept.prompt_context
    );
}
