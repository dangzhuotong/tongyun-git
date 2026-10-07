use regex::Regex;
use std::sync::LazyLock;

static URL_CREDS_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"([a-zA-Z][a-zA-Z0-9+.-]*://)([^/@\s]+)@").expect("valid url credentials regex")
});

/// Redacts credentials in URLs (e.g. `https://user:secret@host` -> `https://user:***@host`,
/// `https://token@host` -> `https://***@host`).
/// Plain text, scp-style SSH addresses (`git@github.com:...`), and `ssh://user@host` without
/// passwords are preserved without modification.
pub fn redact_url_credentials(s: &str) -> String {
    URL_CREDS_RE
        .replace_all(s, |caps: &regex::Captures| {
            let scheme_prefix = &caps[1];
            let userinfo = &caps[2];
            let scheme = scheme_prefix.trim_end_matches("://").to_ascii_lowercase();

            if let Some((user, _secret)) = userinfo.split_once(':') {
                format!("{scheme_prefix}{user}:***@")
            } else if scheme == "http" || scheme == "https" {
                format!("{scheme_prefix}***@")
            } else {
                // E.g. ssh://git@host without password: keep unchanged
                caps[0].to_string()
            }
        })
        .into_owned()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_https_user_and_token() {
        let input = "remote: https://alice:fake-secret-1@github.com/org/repo.git";
        let expected = "remote: https://alice:***@github.com/org/repo.git";
        assert_eq!(redact_url_credentials(input), expected);
    }

    #[test]
    fn test_https_token_only() {
        let input =
            "fatal: repository 'https://fake-token-only@github.com/org/repo.git/' not found";
        let expected = "fatal: repository 'https://***@github.com/org/repo.git/' not found";
        assert_eq!(redact_url_credentials(input), expected);
    }

    #[test]
    fn test_http_url() {
        let input = "git clone http://bob:p%40ssw0rd@gitlab.internal.net:8080/group/project.git";
        let expected = "git clone http://bob:***@gitlab.internal.net:8080/group/project.git";
        assert_eq!(redact_url_credentials(input), expected);
    }

    #[test]
    fn test_ssh_user_without_password_preserved() {
        let input = "Origin URL: ssh://git@github.com/org/repo.git";
        assert_eq!(redact_url_credentials(input), input);

        let input_with_pass = "ssh://git:pass123@custom.host:2222/org/repo.git";
        let expected = "ssh://git:***@custom.host:2222/org/repo.git";
        assert_eq!(redact_url_credentials(input_with_pass), expected);
    }

    #[test]
    fn test_scp_style_unchanged() {
        let input = "git@github.com:user/project.git";
        assert_eq!(redact_url_credentials(input), input);

        let input_in_sentence = "Clone with git clone git@gitlab.com:foo/bar.git here.";
        assert_eq!(redact_url_credentials(input_in_sentence), input_in_sentence);
    }

    #[test]
    fn test_multiple_urls_in_one_line() {
        let input = "Fetch: https://u1:s1@a.com/r.git and push: https://token123@b.com/r.git; scp: git@c.com:d/e.git";
        let expected = "Fetch: https://u1:***@a.com/r.git and push: https://***@b.com/r.git; scp: git@c.com:d/e.git";
        assert_eq!(redact_url_credentials(input), expected);
    }

    #[test]
    fn test_plain_text_without_creds_unchanged() {
        let input = "Regular text with https://github.com/rust-lang/rust and nothing else";
        assert_eq!(redact_url_credentials(input), input);
    }
}
