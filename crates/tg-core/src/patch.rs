use crate::error::Result;
use git2::{ApplyLocation, Diff, Repository};
use std::path::Path;

pub fn apply_patch_to_index(repo_root: &Path, patch_text: &str) -> Result<()> {
    let repo = Repository::open(repo_root)?;
    let diff = Diff::from_buffer(patch_text.as_bytes())?;
    repo.apply(&diff, ApplyLocation::Index, None)?;
    Ok(())
}
