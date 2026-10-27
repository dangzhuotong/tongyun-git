#!/usr/bin/env python3
"""
tongyun_git_bridge.py
External AI Agent Bridge CLI for Tongyun Git (橦云 Git 桌面客户端).

Allows external AI agents (Claude Code, Cursor, Antigravity, scripts) to:
- Inspect active Git repository state, working tree changes, and diffs.
- Extract high-density, LLM-ready Context Packs.
- Push agent tasks, commit messages, and review notes into the open Desktop UI.
- Create instant safety snapshots and guaranteed rewind points before modifying code.
"""

import argparse
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request

DEFAULT_PORT = int(os.environ.get("TONGYUN_GIT_PORT", "4172"))
BASE_URL = f"http://127.0.0.1:{DEFAULT_PORT}"


def request_api(endpoint: str, method: str = "GET", data: dict = None, port: int = DEFAULT_PORT):
    url = f"http://127.0.0.1:{port}{endpoint}"
    headers = {"Content-Type": "application/json; charset=utf-8"}
    req_body = json.dumps(data).encode("utf-8") if data is not None else None

    req = urllib.request.Request(url, data=req_body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            content = resp.read().decode("utf-8")
            if not content.strip():
                return {}
            return json.loads(content)
    except urllib.error.URLError as e:
        print(f"[Error] Failed to connect to Tongyun Git Bridge on port {port}: {e}", file=sys.stderr)
        print("Ensure Tongyun Git desktop client is running (`npm run tauri dev`).", file=sys.stderr)
        sys.exit(1)


def cmd_status(args):
    res = request_api("/api/status", port=args.port)
    if args.json:
        print(json.dumps(res, indent=2, ensure_ascii=False))
        return

    print("=== Tongyun Git AI Bridge Status ===")
    print(f"Bridge Port : {res.get('port')}")
    print(f"Status      : {'🟢 Online' if res.get('online') else '🔴 Offline'}")
    active = res.get("active_repo")
    if active:
        print(f"Repository  : {active.get('name')} ({active.get('root_path')})")
        print(f"Branch      : {active.get('branch') or 'HEAD (detached)'}")
        print(f"Head Commit : {active.get('head_oid', '')[:8]}")
        print(f"Changes     : {active.get('staged_count')} staged, {active.get('unstaged_count')} unstaged, {active.get('untracked_count')} untracked, {active.get('conflicts_count')} conflicts")
    else:
        print("Repository  : (No active repository opened in desktop UI)")


def cmd_changes(args):
    qs = f"?repo={urllib.parse.quote(args.repo)}" if args.repo else ""
    res = request_api(f"/api/changes{qs}", port=args.port)
    if args.json:
        print(json.dumps(res, indent=2, ensure_ascii=False))
        return

    print("=== Working Tree Changes ===")
    if not res:
        print("No changes detected (working tree clean).")
        return

    for item in res:
        staged = item.get("index") or "-"
        worktree = item.get("worktree") or "-"
        conflicted = " [CONFLICT]" if item.get("conflicted") else ""
        print(f"  {staged:<9} {worktree:<9} {item.get('path')}{conflicted}")


def cmd_diff(args):
    qs_parts = [f"path={urllib.parse.quote(args.path)}"]
    if args.staged:
        qs_parts.append("staged=true")
    if args.repo:
        qs_parts.append(f"repo={urllib.parse.quote(args.repo)}")

    qs = "&".join(qs_parts)
    res = request_api(f"/api/diff?{qs}", port=args.port)
    if args.json:
        print(json.dumps(res, indent=2, ensure_ascii=False))
        return

    hunks = res.get("hunks", [])
    if not hunks:
        print(f"No diff for {args.path}")
        return

    print(f"diff --git a/{res.get('path')} b/{res.get('path')}")
    for h in hunks:
        print(h.get("header", ""))
        for l in h.get("lines", []):
            print(f"{l.get('origin', '')}{l.get('content', '').rstrip()}")


def cmd_context_pack(args):
    qs_parts = []
    if args.repo:
        qs_parts.append(f"repo={urllib.parse.quote(args.repo)}")
    if args.max_chars:
        qs_parts.append(f"max_chars={args.max_chars}")

    qs = ("?" + "&".join(qs_parts)) if qs_parts else ""
    res = request_api(f"/api/context-pack{qs}", port=args.port)

    if args.json:
        print(json.dumps(res, indent=2, ensure_ascii=False))
    else:
        print(res.get("prompt_context", ""))


def cmd_push_intent(args):
    payload = {
        "agent_name": args.agent,
        "task": args.task,
        "commit_message": args.msg,
        "suggested_stage": args.stage if args.stage else None,
    }
    res = request_api("/api/push-intent", method="POST", data=payload, port=args.port)
    print("✅ Successfully pushed Agent intent to Tongyun Git Desktop UI!")
    print(f"   Agent  : {args.agent}")
    if args.task:
        print(f"   Task   : {args.task}")
    print(f"   Message: {args.msg}")


def cmd_snapshot(args):
    payload = {"label": args.label or "AI Safety Checkpoint"}
    if args.repo:
        payload["repo"] = args.repo
    res = request_api("/api/snapshot", method="POST", data=payload, port=args.port)
    print("🛡️  Safety snapshot created!")
    print(f"   Reference: {res.get('reference')}")
    print(f"   Label    : {res.get('label')}")


def cmd_rewind(args):
    payload = {}
    if args.ref:
        payload["reference"] = args.ref
    if args.repo:
        payload["repo"] = args.repo
    res = request_api("/api/rewind", method="POST", data=payload, port=args.port)
    print("⏪ Successfully rewound working tree to snapshot!")
    print(f"   Restored files: {res.get('restored_files_count')}")
    print(f"   Reference     : {res.get('reference')}")
    if res.get("undo_reference"):
        print(f"   Undo reference: {res.get('undo_reference')} (can undo rewind)")


def cmd_stage(args):
    payload = {"paths": args.paths}
    if args.repo:
        payload["repo"] = args.repo
    res = request_api("/api/stage", method="POST", data=payload, port=args.port)
    print(f"✅ Staged {len(args.paths)} file(s).")


def cmd_commit(args):
    payload = {"message": args.msg}
    if args.repo:
        payload["repo"] = args.repo
    res = request_api("/api/commit", method="POST", data=payload, port=args.port)
    print("✅ Commit succeeded!")
    print(json.dumps(res, indent=2, ensure_ascii=False))


def main():
    parser = argparse.ArgumentParser(description="Tongyun Git External AI Bridge CLI")
    parser.add_argument("--port", type=int, default=DEFAULT_PORT, help="Bridge server port (default 4172)")
    subparsers = parser.add_subparsers(dest="subcommand", required=True)

    # status
    p_status = subparsers.add_parser("status", help="Check bridge and active repository status")
    p_status.add_argument("--json", action="store_true", help="Output raw JSON")
    p_status.set_defaults(func=cmd_status)

    # changes
    p_changes = subparsers.add_parser("changes", help="List changed files in working tree")
    p_changes.add_argument("--repo", help="Optional repository path")
    p_changes.add_argument("--json", action="store_true", help="Output raw JSON")
    p_changes.set_defaults(func=cmd_changes)

    # diff
    p_diff = subparsers.add_parser("diff", help="View file diff")
    p_diff.add_argument("path", help="File path")
    p_diff.add_argument("--staged", action="store_true", help="View staged diff (vs HEAD)")
    p_diff.add_argument("--repo", help="Optional repository path")
    p_diff.add_argument("--json", action="store_true", help="Output raw JSON")
    p_diff.set_defaults(func=cmd_diff)

    # context-pack
    p_cp = subparsers.add_parser("context-pack", help="Generate LLM-optimized context pack")
    p_cp.add_argument("--repo", help="Optional repository path")
    p_cp.add_argument("--max-chars", type=int, help="Maximum characters before diff truncation")
    p_cp.add_argument("--json", action="store_true", help="Output raw JSON")
    p_cp.set_defaults(func=cmd_context_pack)

    # push-intent
    p_intent = subparsers.add_parser("push-intent", help="Push agent task and commit message into UI")
    p_intent.add_argument("--msg", required=True, help="Proposed commit message")
    p_intent.add_argument("--task", help="Task description or goal")
    p_intent.add_argument("--agent", default="AI Agent", help="Agent name (e.g. Claude Code, Cursor)")
    p_intent.add_argument("--stage", nargs="*", help="Suggested files to stage")
    p_intent.set_defaults(func=cmd_push_intent)

    # snapshot
    p_snap = subparsers.add_parser("snapshot", help="Create a safety snapshot before modifying code")
    p_snap.add_argument("--label", help="Snapshot label or goal description")
    p_snap.add_argument("--repo", help="Optional repository path")
    p_snap.set_defaults(func=cmd_snapshot)

    # rewind
    p_rewind = subparsers.add_parser("rewind", help="Rewind working tree to latest (or specified) snapshot")
    p_rewind.add_argument("--ref", help="Specific snapshot reference to restore")
    p_rewind.add_argument("--repo", help="Optional repository path")
    p_rewind.set_defaults(func=cmd_rewind)

    # stage
    p_stage = subparsers.add_parser("stage", help="Stage files")
    p_stage.add_argument("paths", nargs="+", help="File paths to stage")
    p_stage.add_argument("--repo", help="Optional repository path")
    p_stage.set_defaults(func=cmd_stage)

    # commit
    p_commit = subparsers.add_parser("commit", help="Execute commit via CliRunner")
    p_commit.add_argument("--msg", required=True, help="Commit message")
    p_commit.add_argument("--repo", help="Optional repository path")
    p_commit.set_defaults(func=cmd_commit)

    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
