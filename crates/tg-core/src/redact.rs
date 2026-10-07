/// Redacts credentials in URLs (`https://user:secret@host` → `https://user:***@host`,
/// `https://token@host` → `https://***@host`).
///
/// The userinfo separator is the last `@` in the authority, so a password that itself
/// contains `@` is not left in the log. Plain text, scp-style SSH addresses
/// (`git@github.com:...`), and `ssh://user@host` without a password are unchanged.
pub fn redact_url_credentials(s: &str) -> String {
    let bytes = s.as_bytes();
    let mut out = String::with_capacity(s.len());
    let mut i = 0;
    while i < bytes.len() {
        match find_scheme(bytes, i) {
            Some((scheme_at, auth_at)) => {
                out.push_str(&s[i..scheme_at]);
                let auth_end = authority_end(bytes, auth_at);
                redact_authority(&s[scheme_at..auth_at], &s[auth_at..auth_end], &mut out);
                i = auth_end;
            }
            None => {
                out.push_str(&s[i..]);
                break;
            }
        }
    }
    out
}

fn redact_authority(scheme_prefix: &str, authority: &str, out: &mut String) {
    let Some(at) = authority.rfind('@') else {
        out.push_str(scheme_prefix);
        out.push_str(authority);
        return;
    };
    let userinfo = &authority[..at];
    let host = &authority[at + 1..];
    let scheme = scheme_prefix.trim_end_matches("://").to_ascii_lowercase();
    out.push_str(scheme_prefix);
    if let Some((user, _)) = userinfo.split_once(':') {
        out.push_str(user);
        out.push_str(":***@");
    } else if scheme == "http" || scheme == "https" {
        out.push_str("***@");
    } else {
        out.push_str(userinfo);
        out.push('@');
    }
    out.push_str(host);
}

/// `(scheme_start, authority_start)` where `authority_start` is the index just after `://`.
fn find_scheme(bytes: &[u8], from: usize) -> Option<(usize, usize)> {
    let mut j = from;
    while j + 2 < bytes.len() {
        if bytes[j] == b':' && bytes[j + 1] == b'/' && bytes[j + 2] == b'/' {
            let mut k = j;
            while k > 0 && is_scheme_byte(bytes[k - 1]) {
                k -= 1;
            }
            if k < j && bytes[k].is_ascii_alphabetic() {
                return Some((k, j + 3));
            }
        }
        j += 1;
    }
    None
}

fn is_scheme_byte(b: u8) -> bool {
    b.is_ascii_alphanumeric() || b == b'+' || b == b'-' || b == b'.'
}

fn authority_end(bytes: &[u8], auth_at: usize) -> usize {
    let mut i = auth_at;
    while i < bytes.len() {
        match bytes[i] {
            b'/' | b'?' | b'#' | b' ' | b'\t' | b'\n' | b'\r' => break,
            _ => i += 1,
        }
    }
    i
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

    #[test]
    fn password_containing_at_is_fully_redacted() {
        let input = "https://user:p@ss@github.com/org/repo.git";
        let out = redact_url_credentials(input);
        assert_eq!(out, "https://user:***@github.com/org/repo.git");
        assert!(!out.contains("p@ss"), "{out}");
    }

    #[test]
    fn ipv6_authority_keeps_host() {
        let input = "https://user:secret@[::1]:8080/repo.git";
        assert_eq!(
            redact_url_credentials(input),
            "https://user:***@[::1]:8080/repo.git"
        );
    }
}
