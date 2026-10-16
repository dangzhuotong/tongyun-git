use std::path::Path;
use tg_core::{Git2Backend, GitBackend};

#[tauri::command]
pub fn stage_files(root_path: String, paths: Vec<String>) -> std::result::Result<(), String> {
    crate::journal_cmd::run("stage_files", &root_path, || {
        let p = Path::new(&root_path);
        let backend = Git2Backend::open(p).map_err(|e| e.to_string())?;
        let path_slices: Vec<&str> = paths.iter().map(|s| s.as_str()).collect();
        backend
            .stage_files(&path_slices)
            .map_err(|e| e.to_string())?;
        Ok(())
    })
}

#[tauri::command]
pub fn unstage_files(root_path: String, paths: Vec<String>) -> std::result::Result<(), String> {
    crate::journal_cmd::run("unstage_files", &root_path, || {
        let p = Path::new(&root_path);
        let backend = Git2Backend::open(p).map_err(|e| e.to_string())?;
        let path_slices: Vec<&str> = paths.iter().map(|s| s.as_str()).collect();
        backend
            .unstage_files(&path_slices)
            .map_err(|e| e.to_string())?;
        Ok(())
    })
}

#[tauri::command]
pub fn stage_lines(
    root_path: String,
    path: String,
    hunk_index: usize,
    selected_line_indices: Vec<usize>,
    reverse: bool,
    is_new_file: bool,
) -> std::result::Result<(), String> {
    crate::journal_cmd::run("stage_lines", &root_path, || {
        let p = Path::new(&root_path);
        let backend = Git2Backend::open(p).map_err(|e| e.to_string())?;
        let diff = backend
            .diff_file(&path, reverse)
            .map_err(|e| e.to_string())?;
        let hunk = diff
            .hunks
            .get(hunk_index)
            .ok_or_else(|| "未找到对应的 Hunk".to_string())?;

        let patch = tg_core::build_selected_patch(
            &path,
            hunk,
            &selected_line_indices,
            reverse,
            is_new_file,
        )
        .map_err(|e| e.to_string())?;

        tg_core::apply_patch_to_index(p, &patch).map_err(|e| e.to_string())?;
        Ok(())
    })
}

#[tauri::command]
pub fn inspect_discard(
    root_path: String,
    paths: Vec<String>,
) -> std::result::Result<Vec<tg_core::DiscardCandidate>, String> {
    let p = Path::new(&root_path);
    let path_slices: Vec<&str> = paths.iter().map(|s| s.as_str()).collect();
    tg_core::DiscardService::inspect_candidates(p, &path_slices).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn discard_files(
    root_path: String,
    paths: Vec<String>,
) -> std::result::Result<tg_core::DiscardResult, String> {
    crate::journal_cmd::run("discard_files", &root_path, || {
        let p = Path::new(&root_path);
        let path_slices: Vec<&str> = paths.iter().map(|s| s.as_str()).collect();
        tg_core::DiscardService::discard_files(p, &path_slices).map_err(|e| e.to_string())
    })
}

#[tauri::command]
pub fn undo_discard(
    root_path: String,
    skip_conflict: bool,
) -> std::result::Result<tg_core::UndoDiscardResult, String> {
    crate::journal_cmd::run("undo_discard", &root_path, || {
        let p = Path::new(&root_path);
        tg_core::DiscardService::undo_last_discard(p, skip_conflict).map_err(|e| e.to_string())
    })
}
