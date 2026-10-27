use serde::{Deserialize, Serialize};
use std::path::Path;

use crate::cli::{CliRunner, RunOptions};
use crate::error::{CoreError, Result};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct TagItem {
    pub name: String,
    pub target_oid: String,
    pub short_oid: String,
    pub message: Option<String>,
    pub tagger_name: Option<String>,
    pub tagger_email: Option<String>,
    pub timestamp: Option<i64>,
    pub is_annotated: bool,
}

pub struct TagService;

impl TagService {
    /// List all tags in the repository with target commit and annotation details.
    pub fn list_tags(repo_path: &Path) -> Result<Vec<TagItem>> {
        let repo = git2::Repository::open(repo_path)?;
        let mut tags = Vec::new();

        let tag_names = repo.tag_names(None)?;
        for name_res in &tag_names {
            let tag_name = match name_res {
                Ok(Some(n)) => n,
                _ => continue,
            };

            let obj = match repo.revparse_single(tag_name) {
                Ok(o) => o,
                Err(_) => continue,
            };

            if let Some(tag) = obj.as_tag() {
                // Annotated tag
                let target_oid = tag.target_id().to_string();
                let short_oid = target_oid.chars().take(7).collect();
                let tagger = tag.tagger();

                let tag_display_name = tag.name().ok().unwrap_or(tag_name).to_string();
                let message = tag
                    .message()
                    .ok()
                    .and_then(|m_opt| m_opt)
                    .map(|m| m.trim().to_string())
                    .filter(|m| !m.is_empty());
                let tagger_name = tagger
                    .as_ref()
                    .and_then(|t| t.name().ok().map(String::from));
                let tagger_email = tagger
                    .as_ref()
                    .and_then(|t| t.email().ok().map(String::from));

                tags.push(TagItem {
                    name: tag_display_name,
                    target_oid,
                    short_oid,
                    message,
                    tagger_name,
                    tagger_email,
                    timestamp: tagger.as_ref().map(|t| t.when().seconds()),
                    is_annotated: true,
                });
            } else {
                // Lightweight tag pointing directly to a commit or other object
                let target_oid = obj.id().to_string();
                let short_oid = target_oid.chars().take(7).collect();
                let commit_time = obj.as_commit().map(|c| c.time().seconds());

                tags.push(TagItem {
                    name: tag_name.to_string(),
                    target_oid,
                    short_oid,
                    message: None,
                    tagger_name: None,
                    tagger_email: None,
                    timestamp: commit_time,
                    is_annotated: false,
                });
            }
        }

        // Sort by timestamp descending (newest first), falling back to name
        tags.sort_by(|a, b| {
            b.timestamp
                .cmp(&a.timestamp)
                .then_with(|| a.name.cmp(&b.name))
        });

        Ok(tags)
    }

    /// Create a new lightweight or annotated tag.
    pub fn create_tag(
        runner: &CliRunner,
        repo_path: &Path,
        name: &str,
        target_oid: Option<&str>,
        message: Option<&str>,
    ) -> Result<TagItem> {
        let trimmed_name = name.trim();
        if trimmed_name.is_empty() {
            return Err(CoreError::TagError("标签名称不能为空".to_string()));
        }

        let mut args = vec!["tag"];
        let msg_trimmed = message.map(|m| m.trim()).unwrap_or("");
        let is_annotated = !msg_trimmed.is_empty();

        if is_annotated {
            args.push("-a");
            args.push(trimmed_name);
            args.push("-m");
            args.push(msg_trimmed);
        } else {
            args.push(trimmed_name);
        }

        if let Some(target) = target_oid {
            let t = target.trim();
            if !t.is_empty() {
                args.push(t);
            }
        }

        let res = runner.run(repo_path, &args, RunOptions::default())?;
        if res.exit_code != Some(0) {
            let err_msg = format!("{}\n{}", res.stdout.trim(), res.stderr.trim())
                .trim()
                .to_string();
            return Err(CoreError::TagError(format!("创建标签失败: {}", err_msg)));
        }

        // Retrieve created tag item
        let all_tags = Self::list_tags(repo_path)?;
        all_tags
            .into_iter()
            .find(|t| t.name == trimmed_name)
            .ok_or_else(|| CoreError::TagError("标签创建成功但无法读取标签信息".to_string()))
    }

    /// Delete a local tag.
    pub fn delete_tag(runner: &CliRunner, repo_path: &Path, name: &str) -> Result<()> {
        let trimmed_name = name.trim();
        if trimmed_name.is_empty() {
            return Err(CoreError::TagError("标签名称不能为空".to_string()));
        }

        let res = runner.run(
            repo_path,
            &["tag", "-d", trimmed_name],
            RunOptions::default(),
        )?;
        if res.exit_code != Some(0) {
            let err_msg = format!("{}\n{}", res.stdout.trim(), res.stderr.trim())
                .trim()
                .to_string();
            return Err(CoreError::TagError(format!("删除标签失败: {}", err_msg)));
        }

        Ok(())
    }

    /// Push a tag to a remote repository.
    pub fn push_tag(
        runner: &CliRunner,
        repo_path: &Path,
        name: &str,
        remote: Option<&str>,
    ) -> Result<()> {
        let trimmed_name = name.trim();
        let remote_name = remote.unwrap_or("origin");

        let res = runner.run(
            repo_path,
            &["push", remote_name, trimmed_name],
            RunOptions::default(),
        )?;
        if res.exit_code != Some(0) {
            let err_msg = format!("{}\n{}", res.stdout.trim(), res.stderr.trim())
                .trim()
                .to_string();
            return Err(CoreError::TagError(format!("推送标签失败: {}", err_msg)));
        }

        Ok(())
    }

    /// Push all tags to a remote repository.
    pub fn push_all_tags(runner: &CliRunner, repo_path: &Path, remote: Option<&str>) -> Result<()> {
        let remote_name = remote.unwrap_or("origin");

        let res = runner.run(
            repo_path,
            &["push", remote_name, "--tags"],
            RunOptions::default(),
        )?;
        if res.exit_code != Some(0) {
            let err_msg = format!("{}\n{}", res.stdout.trim(), res.stderr.trim())
                .trim()
                .to_string();
            return Err(CoreError::TagError(format!(
                "推送所有标签失败: {}",
                err_msg
            )));
        }

        Ok(())
    }

    /// Delete a tag from a remote repository.
    pub fn delete_remote_tag(
        runner: &CliRunner,
        repo_path: &Path,
        name: &str,
        remote: Option<&str>,
    ) -> Result<()> {
        let trimmed_name = name.trim();
        let remote_name = remote.unwrap_or("origin");

        let res = runner.run(
            repo_path,
            &["push", remote_name, "--delete", trimmed_name],
            RunOptions::default(),
        )?;
        if res.exit_code != Some(0) {
            let err_msg = format!("{}\n{}", res.stdout.trim(), res.stderr.trim())
                .trim()
                .to_string();
            return Err(CoreError::TagError(format!(
                "删除远程标签失败: {}",
                err_msg
            )));
        }

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_commit(repo: &git2::Repository, message: &str, secs: i64) -> git2::Oid {
        let time = git2::Time::new(secs, 0);
        let sig = git2::Signature::new("Tester", "tester@example.com", &time).unwrap();
        let mut index = repo.index().unwrap();
        let tree_id = index.write_tree().unwrap();
        let tree = repo.find_tree(tree_id).unwrap();
        let parents: Vec<git2::Commit> = match repo.head() {
            Ok(head) => vec![head.peel_to_commit().unwrap()],
            Err(_) => Vec::new(),
        };
        let parent_refs: Vec<&git2::Commit> = parents.iter().collect();
        repo.commit(Some("HEAD"), &sig, &sig, message, &tree, &parent_refs)
            .unwrap()
    }

    #[test]
    fn test_tag_item_serde_roundtrip() {
        let item = TagItem {
            name: "v1.0.0".to_string(),
            target_oid: "b".repeat(40),
            short_oid: "bbbbbbb".to_string(),
            message: Some("release\nnotes".to_string()),
            tagger_name: Some("Tester".to_string()),
            tagger_email: Some("tester@example.com".to_string()),
            timestamp: Some(1_700_000_000),
            is_annotated: true,
        };
        let json = serde_json::to_string(&item).unwrap();
        let de: TagItem = serde_json::from_str(&json).unwrap();
        assert_eq!(item, de);
    }

    #[test]
    fn test_tag_item_serde_lightweight_nulls() {
        let item = TagItem {
            name: "v0.1.0".to_string(),
            target_oid: "c".repeat(40),
            short_oid: "ccccccc".to_string(),
            message: None,
            tagger_name: None,
            tagger_email: None,
            timestamp: None,
            is_annotated: false,
        };
        let json = serde_json::to_string(&item).unwrap();
        let de: TagItem = serde_json::from_str(&json).unwrap();
        assert_eq!(item, de);
        assert!(!de.is_annotated);
        assert!(de.message.is_none());
    }

    #[test]
    fn test_create_tag_rejects_blank_name() {
        let runner = CliRunner::new("git");
        let dir = tempfile::tempdir().unwrap();
        let err = TagService::create_tag(&runner, dir.path(), "   \n", None, None);
        assert!(matches!(err, Err(CoreError::TagError(_))));
    }

    #[test]
    fn test_delete_tag_rejects_blank_name() {
        let runner = CliRunner::new("git");
        let dir = tempfile::tempdir().unwrap();
        let err = TagService::delete_tag(&runner, dir.path(), "  ");
        assert!(matches!(err, Err(CoreError::TagError(_))));
    }

    #[test]
    fn test_list_tags_lightweight_and_annotated_formatting() {
        let dir = tempfile::tempdir().unwrap();
        let repo = git2::Repository::init(dir.path()).unwrap();

        let old_oid = make_commit(&repo, "first", 1_000_000);
        let new_oid = make_commit(&repo, "second", 2_000_000);

        repo.tag_lightweight("v-old", &repo.find_object(old_oid, None).unwrap(), false)
            .unwrap();

        let tagger = git2::Signature::new(
            "Tagger",
            "tagger@example.com",
            &git2::Time::new(3_000_000, 0),
        )
        .unwrap();
        repo.tag(
            "v-new",
            &repo.find_object(new_oid, None).unwrap(),
            &tagger,
            "  release notes  \n",
            false,
        )
        .unwrap();

        let tags = TagService::list_tags(dir.path()).unwrap();
        assert_eq!(tags.len(), 2);

        // Newest timestamp first.
        assert_eq!(tags[0].name, "v-new");
        assert_eq!(tags[1].name, "v-old");

        // Annotated tag records target commit, tagger and trimmed message.
        assert!(tags[0].is_annotated);
        assert_eq!(tags[0].target_oid, new_oid.to_string());
        assert_eq!(tags[0].short_oid, &new_oid.to_string()[..7]);
        assert_eq!(tags[0].short_oid.len(), 7);
        assert_eq!(tags[0].message.as_deref(), Some("release notes"));
        assert_eq!(tags[0].tagger_name.as_deref(), Some("Tagger"));
        assert_eq!(tags[0].tagger_email.as_deref(), Some("tagger@example.com"));
        assert_eq!(tags[0].timestamp, Some(3_000_000));

        // Lightweight tag points directly at the commit and has no tagger/message.
        assert!(!tags[1].is_annotated);
        assert_eq!(tags[1].target_oid, old_oid.to_string());
        assert_eq!(tags[1].short_oid, &old_oid.to_string()[..7]);
        assert_eq!(tags[1].short_oid.len(), 7);
        assert!(tags[1].message.is_none());
        assert!(tags[1].tagger_name.is_none());
        assert!(tags[1].tagger_email.is_none());
        assert_eq!(tags[1].timestamp, Some(1_000_000));
    }
}
