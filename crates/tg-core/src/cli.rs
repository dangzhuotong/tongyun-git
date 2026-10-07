use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

use crate::error::{CoreError, Result};
use crate::redact::redact_url_credentials;

pub const MIN_GIT_VERSION: (u32, u32) = (2, 30);

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CliOutput {
    pub command_line: String,
    pub exit_code: Option<i32>,
    pub stdout: String,
    pub stderr: String,
    pub duration_ms: u64,
}

#[derive(Debug, Clone, Default)]
pub struct RunOptions {
    pub timeout: Option<Duration>,
    pub stdin: Option<String>,
    pub extra_env: Vec<(String, String)>,
}

pub struct CliRunner {
    git_path: PathBuf,
    default_timeout: Duration,
}

impl CliRunner {
    pub fn new(git_path: impl Into<PathBuf>) -> Self {
        Self::with_default_timeout(git_path, Duration::from_secs(30))
    }

    pub fn with_default_timeout(git_path: impl Into<PathBuf>, default_timeout: Duration) -> Self {
        Self {
            git_path: git_path.into(),
            default_timeout,
        }
    }

    pub fn git_path(&self) -> &Path {
        &self.git_path
    }

    pub fn default_timeout(&self) -> Duration {
        self.default_timeout
    }

    pub fn version(&self) -> Result<String> {
        let output = self.run(Path::new("."), &["--version"], RunOptions::default())?;
        if let Some(code) = output.exit_code {
            if code != 0 {
                return Err(CoreError::Cli {
                    exit_code: Some(code),
                    stderr: output.stderr,
                });
            }
        }
        parse_git_version(&output.stdout)
            .ok_or_else(|| CoreError::InvalidVersion(output.stdout.trim().to_string()))
    }

    pub fn run(&self, cwd: &Path, args: &[&str], opts: RunOptions) -> Result<CliOutput> {
        let raw_cmd = format!("{} {}", self.git_path.display(), args.join(" "));
        let command_line = redact_url_credentials(&raw_cmd);

        let mut cmd = Command::new(&self.git_path);
        cmd.current_dir(cwd);
        cmd.args(args);
        cmd.env("LC_ALL", "C")
            .env("GIT_TERMINAL_PROMPT", "0")
            .env("GCM_INTERACTIVE", "never")
            .env("GIT_ASKPASS", "")
            .env("SSH_ASKPASS", "");

        let has_ssh_cmd = opts.extra_env.iter().any(|(k, _)| k == "GIT_SSH_COMMAND")
            || std::env::var_os("GIT_SSH_COMMAND").is_some();
        if !has_ssh_cmd {
            cmd.env("GIT_SSH_COMMAND", "ssh -o BatchMode=yes");
        }

        for (k, v) in &opts.extra_env {
            cmd.env(k, v);
        }

        if opts.stdin.is_some() {
            cmd.stdin(Stdio::piped());
        } else {
            cmd.stdin(Stdio::null());
        }
        cmd.stdout(Stdio::piped());
        cmd.stderr(Stdio::piped());

        #[cfg(unix)]
        {
            use std::os::unix::process::CommandExt;
            cmd.process_group(0);
        }
        #[cfg(windows)]
        {
            // CREATE_NO_WINDOW: GUI 应用调用 git 时不弹出控制台窗口
            use std::os::windows::process::CommandExt;
            cmd.creation_flags(0x0800_0000);
        }

        let mut child = match cmd.spawn() {
            Ok(c) => c,
            Err(e) => {
                if e.kind() == std::io::ErrorKind::NotFound {
                    return Err(CoreError::GitNotFound);
                }
                return Err(CoreError::Io(e));
            }
        };

        if let Some(input) = opts.stdin {
            if let Some(mut stdin) = child.stdin.take() {
                std::thread::spawn(move || {
                    use std::io::Write;
                    let _ = stdin.write_all(input.as_bytes());
                });
            }
        }

        let mut stdout_pipe = child.stdout.take().expect("piped stdout");
        let stdout_thread = std::thread::spawn(move || {
            use std::io::Read;
            let mut buf = Vec::new();
            let _ = stdout_pipe.read_to_end(&mut buf);
            buf
        });

        let mut stderr_pipe = child.stderr.take().expect("piped stderr");
        let stderr_thread = std::thread::spawn(move || {
            use std::io::Read;
            let mut buf = Vec::new();
            let _ = stderr_pipe.read_to_end(&mut buf);
            buf
        });

        let timeout = opts.timeout.unwrap_or(self.default_timeout);
        let start = Instant::now();

        let status = loop {
            match child.try_wait()? {
                Some(status) => {
                    break status;
                }
                None => {
                    if start.elapsed() >= timeout {
                        #[cfg(unix)]
                        {
                            extern "C" {
                                fn kill(pid: i32, sig: i32) -> i32;
                            }
                            let pid = child.id() as i32;
                            unsafe {
                                kill(-pid, 9);
                            }
                        }
                        let _ = child.kill();
                        let _ = child.wait();
                        let _ = stdout_thread.join();
                        let _ = stderr_thread.join();
                        return Err(CoreError::Timeout {
                            command_line,
                            after_ms: timeout.as_millis() as u64,
                        });
                    }
                    let sleep_ms = 5.min(timeout.as_millis() as u64 / 10).max(1);
                    std::thread::sleep(Duration::from_millis(sleep_ms));
                }
            }
        };

        let stdout_bytes = stdout_thread.join().unwrap_or_default();
        let stderr_bytes = stderr_thread.join().unwrap_or_default();
        let duration_ms = start.elapsed().as_millis() as u64;

        let stdout_raw = String::from_utf8_lossy(&stdout_bytes);
        let stderr_raw = String::from_utf8_lossy(&stderr_bytes);

        Ok(CliOutput {
            command_line,
            exit_code: status.code(),
            stdout: redact_url_credentials(&stdout_raw),
            stderr: redact_url_credentials(&stderr_raw),
            duration_ms,
        })
    }
}

pub fn parse_git_version(output: &str) -> Option<String> {
    let trimmed = output.trim();
    if let Some(pos) = trimmed.find("git version ") {
        let rest = &trimmed[pos + "git version ".len()..];
        let version = rest.split_whitespace().next()?;
        if !version.is_empty() {
            return Some(version.to_string());
        }
    }
    None
}

pub fn version_at_least(v: &str, min: (u32, u32)) -> bool {
    let mut parts = v.split('.').filter_map(|p| {
        let digits: String = p.chars().take_while(|c| c.is_ascii_digit()).collect();
        digits.parse::<u32>().ok()
    });
    let major = parts.next().unwrap_or(0);
    let minor = parts.next().unwrap_or(0);
    (major > min.0) || (major == min.0 && minor >= min.1)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_version_at_least() {
        assert!(version_at_least("2.47.3", (2, 30)));
        assert!(version_at_least("2.30.0", (2, 30)));
        assert!(version_at_least("2.30.1.windows.1", (2, 30)));
        assert!(version_at_least("3.0.0", (2, 30)));
        assert!(!version_at_least("2.29.3", (2, 30)));
        assert!(!version_at_least("1.9.5", (2, 30)));
        assert!(!version_at_least("invalid", (2, 30)));
    }

    #[test]
    fn test_parse_git_version() {
        assert_eq!(
            parse_git_version("git version 2.47.3\n"),
            Some("2.47.3".to_string())
        );
        assert_eq!(
            parse_git_version("git version 2.39.5 (Apple Git-154)"),
            Some("2.39.5".to_string())
        );
        assert_eq!(
            parse_git_version("git version 2.43.0.windows.1"),
            Some("2.43.0.windows.1".to_string())
        );
        assert_eq!(parse_git_version("unknown output"), None);
    }
}
