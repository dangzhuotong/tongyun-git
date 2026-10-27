use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::path::Path;
use std::sync::{Arc, Mutex, OnceLock, RwLock};
use std::thread;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter};

use tg_core::{snapshot, CliRunner, CommitService, ContextPackGenerator, Git2Backend, GitBackend};

static GLOBAL_BRIDGE: OnceLock<Arc<BridgeState>> = OnceLock::new();

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentReviewNote {
    pub file: String,
    pub line: Option<u32>,
    pub level: Option<String>,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentIntent {
    pub agent_name: Option<String>,
    pub task: Option<String>,
    pub commit_message: String,
    pub suggested_stage: Option<Vec<String>>,
    pub review_notes: Option<Vec<AgentReviewNote>>,
    pub timestamp: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ActiveRepoSummary {
    pub root_path: String,
    pub name: String,
    pub branch: Option<String>,
    pub head_oid: Option<String>,
    pub staged_count: usize,
    pub unstaged_count: usize,
    pub untracked_count: usize,
    pub conflicts_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BridgeStatus {
    pub online: bool,
    pub port: u16,
    pub version: String,
    pub active_repo: Option<ActiveRepoSummary>,
}

pub struct BridgeState {
    pub active_repo: RwLock<Option<String>>,
    pub latest_intent: RwLock<Option<AgentIntent>>,
    pub bound_port: Mutex<u16>,
    pub app_handle: Mutex<Option<AppHandle>>,
}

impl BridgeState {
    pub fn new() -> Self {
        Self {
            active_repo: RwLock::new(None),
            latest_intent: RwLock::new(None),
            bound_port: Mutex::new(0),
            app_handle: Mutex::new(None),
        }
    }
}

pub fn get_bridge() -> Option<Arc<BridgeState>> {
    GLOBAL_BRIDGE.get().cloned()
}

pub fn set_active_repo(root_path: &str) {
    if let Some(bridge) = get_bridge() {
        if let Ok(mut lock) = bridge.active_repo.write() {
            *lock = Some(root_path.to_string());
        }
    }
}

pub fn start_bridge_server(app: AppHandle) -> Arc<BridgeState> {
    let state = GLOBAL_BRIDGE
        .get_or_init(|| Arc::new(BridgeState::new()))
        .clone();
    if let Ok(mut handle_lock) = state.app_handle.lock() {
        *handle_lock = Some(app);
    }

    // Try default port 4172, if busy try next ports
    let preferred_ports = [4172, 4173, 4174, 4175];
    let mut bound_listener = None;
    let mut actual_port = 4172;

    for port in preferred_ports {
        match TcpListener::bind(("127.0.0.1", port)) {
            Ok(listener) => {
                actual_port = port;
                bound_listener = Some(listener);
                break;
            }
            Err(_) => continue,
        }
    }

    let listener = match bound_listener {
        Some(l) => l,
        None => {
            eprintln!("[AI Bridge] Failed to bind any local port");
            return state;
        }
    };

    if let Ok(mut port_lock) = state.bound_port.lock() {
        *port_lock = actual_port;
    }

    let state_clone = state.clone();
    thread::spawn(move || {
        println!("[AI Bridge] Listening on http://127.0.0.1:{}", actual_port);
        for stream in listener.incoming().flatten() {
            let st = state_clone.clone();
            thread::spawn(move || {
                handle_client(stream, st);
            });
        }
    });

    state
}

fn handle_client(mut stream: TcpStream, state: Arc<BridgeState>) {
    let mut buffer = [0u8; 16384];
    let bytes_read = match stream.read(&mut buffer) {
        Ok(n) if n > 0 => n,
        _ => return,
    };

    let raw_req = String::from_utf8_lossy(&buffer[..bytes_read]);
    let mut lines = raw_req.lines();
    let request_line = match lines.next() {
        Some(l) => l,
        None => return,
    };

    let mut parts = request_line.split_whitespace();
    let method = parts.next().unwrap_or("GET");
    let full_path = parts.next().unwrap_or("/");

    if method == "OPTIONS" {
        send_response(&mut stream, 204, "No Content", "text/plain", "");
        return;
    }

    let (path, query_map) = parse_path_and_query(full_path);

    // Parse body if present (after \r\n\r\n)
    let body_str = if let Some(idx) = raw_req.find("\r\n\r\n") {
        &raw_req[idx + 4..]
    } else {
        ""
    };

    match (method, path.as_str()) {
        ("GET", "/api/status") => {
            let port = *state.bound_port.lock().unwrap_or_else(|e| e.into_inner());
            let active_repo_opt = state.active_repo.read().ok().and_then(|r| r.clone());

            let summary = active_repo_opt.and_then(|root| {
                let p = Path::new(&root);
                let backend = Git2Backend::open(p).ok()?;
                let head = backend.head().ok()?;
                let files = backend.status().ok()?;

                let mut staged_count = 0;
                let mut unstaged_count = 0;
                let mut untracked_count = 0;
                let mut conflicts_count = 0;

                for f in files {
                    if f.conflicted {
                        conflicts_count += 1;
                    }
                    if f.index.is_some() {
                        staged_count += 1;
                    }
                    if f.worktree.is_some() {
                        unstaged_count += 1;
                    }
                    if f.worktree == Some(tg_core::ChangeKind::Untracked) {
                        untracked_count += 1;
                    }
                }

                let name = backend
                    .repo_root()
                    .file_name()
                    .map(|s| s.to_string_lossy().to_string())
                    .unwrap_or_else(|| root.clone());

                Some(ActiveRepoSummary {
                    root_path: root,
                    name,
                    branch: head.branch,
                    head_oid: head.oid,
                    staged_count,
                    unstaged_count,
                    untracked_count,
                    conflicts_count,
                })
            });

            let res = BridgeStatus {
                online: true,
                port,
                version: "0.1.1".to_string(),
                active_repo: summary,
            };
            send_json(&mut stream, 200, "OK", &json!(res));
        }

        ("GET", "/api/changes") => {
            let repo_path = resolve_repo_path(&query_map, &state);
            let p = match repo_path {
                Some(p) => p,
                None => {
                    send_json(
                        &mut stream,
                        400,
                        "Bad Request",
                        &json!({ "error": "No active repository open" }),
                    );
                    return;
                }
            };

            match Git2Backend::open(Path::new(&p)).and_then(|b| b.status()) {
                Ok(files) => send_json(&mut stream, 200, "OK", &json!(files)),
                Err(e) => send_json(
                    &mut stream,
                    500,
                    "Internal Server Error",
                    &json!({ "error": e.to_string() }),
                ),
            }
        }

        ("GET", "/api/diff") => {
            let repo_path = match resolve_repo_path(&query_map, &state) {
                Some(p) => p,
                None => {
                    send_json(
                        &mut stream,
                        400,
                        "Bad Request",
                        &json!({ "error": "No active repository open" }),
                    );
                    return;
                }
            };
            let file_path = match query_map.get("path") {
                Some(fp) => fp,
                None => {
                    send_json(
                        &mut stream,
                        400,
                        "Bad Request",
                        &json!({ "error": "Missing 'path' query parameter" }),
                    );
                    return;
                }
            };
            let staged = query_map
                .get("staged")
                .map(|s| s == "true" || s == "1")
                .unwrap_or(false);

            match Git2Backend::open(Path::new(&repo_path))
                .and_then(|b| b.diff_file(file_path, staged))
            {
                Ok(diff) => send_json(&mut stream, 200, "OK", &json!(diff)),
                Err(e) => send_json(
                    &mut stream,
                    500,
                    "Internal Server Error",
                    &json!({ "error": e.to_string() }),
                ),
            }
        }

        ("GET", "/api/context-pack") => {
            let repo_path = match resolve_repo_path(&query_map, &state) {
                Some(p) => p,
                None => {
                    send_json(
                        &mut stream,
                        400,
                        "Bad Request",
                        &json!({ "error": "No active repository open" }),
                    );
                    return;
                }
            };
            let max_chars = query_map
                .get("max_chars")
                .and_then(|s| s.parse::<usize>().ok());

            match ContextPackGenerator::generate(Path::new(&repo_path), max_chars) {
                Ok(pack) => send_json(&mut stream, 200, "OK", &json!(pack)),
                Err(e) => send_json(
                    &mut stream,
                    500,
                    "Internal Server Error",
                    &json!({ "error": e.to_string() }),
                ),
            }
        }

        ("POST", "/api/push-intent") => {
            let parsed: Result<AgentIntent, _> = serde_json::from_str(body_str);
            let mut intent = match parsed {
                Ok(i) => i,
                Err(e) => {
                    send_json(
                        &mut stream,
                        400,
                        "Bad Request",
                        &json!({ "error": format!("Invalid JSON: {}", e) }),
                    );
                    return;
                }
            };

            if intent.timestamp == 0 {
                intent.timestamp = SystemTime::now()
                    .duration_since(UNIX_EPOCH)
                    .map(|d| d.as_secs())
                    .unwrap_or(0);
            }

            // Save in state
            if let Ok(mut lock) = state.latest_intent.write() {
                *lock = Some(intent.clone());
            }

            // Also mirror to .git/TONGYUN_COMMIT_MSG
            if let Some(repo) = state.active_repo.read().ok().and_then(|r| r.clone()) {
                let msg_path = Path::new(&repo).join(".git").join("TONGYUN_COMMIT_MSG");
                let _ = std::fs::write(msg_path, &intent.commit_message);
            }

            // Emit event to Tauri frontend window
            if let Some(handle) = state.app_handle.lock().ok().and_then(|h| h.clone()) {
                let _ = handle.emit("bridge_agent_intent", &intent);
            }

            send_json(
                &mut stream,
                200,
                "OK",
                &json!({
                    "success": true,
                    "message": "Agent intent successfully queued in Tongyun Git desktop UI",
                    "intent": intent
                }),
            );
        }

        ("GET", "/api/intent") => {
            let intent = state.latest_intent.read().ok().and_then(|i| i.clone());
            send_json(&mut stream, 200, "OK", &json!(intent));
        }

        ("POST", "/api/clear-intent") => {
            if let Ok(mut lock) = state.latest_intent.write() {
                *lock = None;
            }
            send_json(&mut stream, 200, "OK", &json!({ "success": true }));
        }

        ("POST", "/api/snapshot") => {
            let body_val: Value = serde_json::from_str(body_str).unwrap_or(json!({}));
            let label = body_val
                .get("label")
                .and_then(|l| l.as_str())
                .unwrap_or("AI Agent Snapshot");
            let repo_path = body_val
                .get("repo")
                .and_then(|r| r.as_str())
                .map(|s| s.to_string())
                .or_else(|| state.active_repo.read().ok().and_then(|r| r.clone()));

            let p = match repo_path {
                Some(p) => p,
                None => {
                    send_json(
                        &mut stream,
                        400,
                        "Bad Request",
                        &json!({ "error": "No repository specified" }),
                    );
                    return;
                }
            };

            match crate::workspace::start_manual_session(Path::new(&p), label) {
                Ok(snap) => {
                    send_json(
                        &mut stream,
                        200,
                        "OK",
                        &json!({
                            "success": true,
                            "reference": snap.reference,
                            "label": snap.label,
                            "created_ms": snap.created_ms
                        }),
                    );
                }
                Err(e) => {
                    send_json(
                        &mut stream,
                        500,
                        "Internal Server Error",
                        &json!({ "error": e.to_string() }),
                    );
                }
            }
        }

        ("POST", "/api/rewind") => {
            let body_val: Value = serde_json::from_str(body_str).unwrap_or(json!({}));
            let repo_path = body_val
                .get("repo")
                .and_then(|r| r.as_str())
                .map(|s| s.to_string())
                .or_else(|| state.active_repo.read().ok().and_then(|r| r.clone()));

            let p = match repo_path {
                Some(p) => p,
                None => {
                    send_json(
                        &mut stream,
                        400,
                        "Bad Request",
                        &json!({ "error": "No repository specified" }),
                    );
                    return;
                }
            };

            let repo_p = Path::new(&p);
            let reference_opt = body_val
                .get("reference")
                .and_then(|r| r.as_str())
                .map(|s| s.to_string());

            let target_ref = match reference_opt {
                Some(r) => r,
                None => {
                    // Pick latest
                    match snapshot::list(repo_p) {
                        Ok(list) if !list.is_empty() => list[0].reference.clone(),
                        _ => {
                            send_json(
                                &mut stream,
                                404,
                                "Not Found",
                                &json!({ "error": "No available snapshot to rewind" }),
                            );
                            return;
                        }
                    }
                }
            };

            let changes = match snapshot::changes(repo_p, &target_ref) {
                Ok(c) => c,
                Err(e) => {
                    send_json(
                        &mut stream,
                        500,
                        "Internal Server Error",
                        &json!({ "error": e.to_string() }),
                    );
                    return;
                }
            };

            match snapshot::restore(repo_p, &target_ref, &changes) {
                Ok(res) => {
                    send_json(
                        &mut stream,
                        200,
                        "OK",
                        &json!({
                            "success": true,
                            "reference": target_ref,
                            "restored_files_count": res.restored,
                            "undo_reference": res.undo_ref
                        }),
                    );
                }
                Err(e) => {
                    send_json(
                        &mut stream,
                        500,
                        "Internal Server Error",
                        &json!({ "error": e.to_string() }),
                    );
                }
            }
        }

        ("POST", "/api/stage") => {
            let body_val: Value = serde_json::from_str(body_str).unwrap_or(json!({}));
            let repo_path = body_val
                .get("repo")
                .and_then(|r| r.as_str())
                .map(|s| s.to_string())
                .or_else(|| state.active_repo.read().ok().and_then(|r| r.clone()));

            let p = match repo_path {
                Some(p) => p,
                None => {
                    send_json(
                        &mut stream,
                        400,
                        "Bad Request",
                        &json!({ "error": "No repository specified" }),
                    );
                    return;
                }
            };

            let paths = match body_val.get("paths").and_then(|p| p.as_array()) {
                Some(arr) => arr.iter().filter_map(|v| v.as_str()).collect::<Vec<_>>(),
                None => {
                    send_json(
                        &mut stream,
                        400,
                        "Bad Request",
                        &json!({ "error": "Missing 'paths' array" }),
                    );
                    return;
                }
            };

            match Git2Backend::open(Path::new(&p)).and_then(|b| b.stage_files(&paths)) {
                Ok(_) => send_json(&mut stream, 200, "OK", &json!({ "success": true })),
                Err(e) => send_json(
                    &mut stream,
                    500,
                    "Internal Server Error",
                    &json!({ "error": e.to_string() }),
                ),
            }
        }

        ("POST", "/api/commit") => {
            let body_val: Value = serde_json::from_str(body_str).unwrap_or(json!({}));
            let message = match body_val.get("message").and_then(|m| m.as_str()) {
                Some(m) if !m.trim().is_empty() => m,
                _ => {
                    send_json(
                        &mut stream,
                        400,
                        "Bad Request",
                        &json!({ "error": "Commit message cannot be empty" }),
                    );
                    return;
                }
            };

            let repo_path = body_val
                .get("repo")
                .and_then(|r| r.as_str())
                .map(|s| s.to_string())
                .or_else(|| state.active_repo.read().ok().and_then(|r| r.clone()));

            let p = match repo_path {
                Some(p) => p,
                None => {
                    send_json(
                        &mut stream,
                        400,
                        "Bad Request",
                        &json!({ "error": "No repository specified" }),
                    );
                    return;
                }
            };

            let runner = CliRunner::new("git");
            match CommitService::commit(&runner, Path::new(&p), message, false) {
                Ok(res) => send_json(
                    &mut stream,
                    200,
                    "OK",
                    &json!({ "success": true, "result": res }),
                ),
                Err(e) => send_json(
                    &mut stream,
                    500,
                    "Internal Server Error",
                    &json!({ "error": e.to_string() }),
                ),
            }
        }

        _ => {
            send_json(
                &mut stream,
                404,
                "Not Found",
                &json!({ "error": "Endpoint not found" }),
            );
        }
    }
}

fn parse_path_and_query(full_path: &str) -> (String, std::collections::HashMap<String, String>) {
    let mut parts = full_path.splitn(2, '?');
    let path = parts.next().unwrap_or("/").to_string();
    let mut map = std::collections::HashMap::new();

    if let Some(query) = parts.next() {
        for pair in query.split('&') {
            let mut kv = pair.splitn(2, '=');
            if let Some(k) = kv.next() {
                let v = kv.next().unwrap_or("");
                // decode basic url percent encoding
                let decoded = v
                    .replace("%20", " ")
                    .replace("%2F", "/")
                    .replace("%5C", "\\");
                map.insert(k.to_string(), decoded);
            }
        }
    }
    (path, map)
}

fn resolve_repo_path(
    query_map: &std::collections::HashMap<String, String>,
    state: &Arc<BridgeState>,
) -> Option<String> {
    query_map
        .get("repo")
        .cloned()
        .or_else(|| state.active_repo.read().ok().and_then(|r| r.clone()))
}

fn send_json(stream: &mut TcpStream, status: u16, status_text: &str, body: &Value) {
    let json_bytes = serde_json::to_vec(body).unwrap_or_else(|_| b"{}".to_vec());
    let response = format!(
        "HTTP/1.1 {} {}\r\n\
         Content-Type: application/json; charset=utf-8\r\n\
         Content-Length: {}\r\n\
         Access-Control-Allow-Origin: *\r\n\
         Access-Control-Allow-Methods: GET, POST, OPTIONS\r\n\
         Access-Control-Allow-Headers: Content-Type, Authorization\r\n\
         Connection: close\r\n\r\n",
        status,
        status_text,
        json_bytes.len()
    );

    let _ = stream.write_all(response.as_bytes());
    let _ = stream.write_all(&json_bytes);
    let _ = stream.flush();
}

fn send_response(
    stream: &mut TcpStream,
    status: u16,
    status_text: &str,
    content_type: &str,
    body: &str,
) {
    let response = format!(
        "HTTP/1.1 {} {}\r\n\
         Content-Type: {}\r\n\
         Content-Length: {}\r\n\
         Access-Control-Allow-Origin: *\r\n\
         Access-Control-Allow-Methods: GET, POST, OPTIONS\r\n\
         Access-Control-Allow-Headers: Content-Type, Authorization\r\n\
         Connection: close\r\n\r\n\
         {}",
        status,
        status_text,
        content_type,
        body.len(),
        body
    );

    let _ = stream.write_all(response.as_bytes());
    let _ = stream.flush();
}

#[cfg(test)]
mod tests {
    use super::parse_path_and_query;

    #[test]
    fn test_parse_path_without_query() {
        let (path, query) = parse_path_and_query("/status");
        assert_eq!(path, "/status");
        assert!(query.is_empty());
    }

    #[test]
    fn test_parse_path_with_multiple_query_params() {
        let (path, query) = parse_path_and_query("/open?repo=%2Ftmp%2Frepo&name=my%20repo&flag");
        assert_eq!(path, "/open");
        assert_eq!(query.get("repo").map(String::as_str), Some("/tmp/repo"));
        assert_eq!(query.get("name").map(String::as_str), Some("my repo"));
        assert_eq!(query.get("flag").map(String::as_str), Some(""));
    }

    #[test]
    fn test_parse_query_percent_decoding_of_backslash() {
        let (_, query) = parse_path_and_query("/x?p=a%5Cb");
        assert_eq!(query.get("p").map(String::as_str), Some("a\\b"));
    }

    #[test]
    fn test_parse_empty_and_query_only_inputs() {
        let (path, query) = parse_path_and_query("");
        assert_eq!(path, "");
        assert!(query.is_empty());

        let (path, query) = parse_path_and_query("?repo=/tmp/r");
        assert_eq!(path, "");
        assert_eq!(query.get("repo").map(String::as_str), Some("/tmp/r"));
    }
}
