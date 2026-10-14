#!/usr/bin/env python3
"""
tongyun_mcp_server.py
Model Context Protocol (MCP) Server for Tongyun Git (橦云 Git).

Implements standard MCP JSON-RPC 2.0 protocol over stdio.
Connects external LLM agents (Claude Code, Cursor, Windsurf, Antigravity)
to the Tongyun Git Desktop Host (port 4172).
"""

import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request

DEFAULT_PORT = int(os.environ.get("TONGYUN_GIT_PORT", "4172"))


def request_bridge(endpoint: str, method: str = "GET", data: dict = None) -> dict:
    url = f"http://127.0.0.1:{DEFAULT_PORT}{endpoint}"
    headers = {"Content-Type": "application/json; charset=utf-8"}
    req_body = json.dumps(data).encode("utf-8") if data is not None else None
    req = urllib.request.Request(url, data=req_body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            content = resp.read().decode("utf-8")
            return json.loads(content) if content.strip() else {}
    except Exception as e:
        return {"error": f"Bridge connection failed (ensure Tongyun Git desktop is running): {e}"}


TOOLS = [
    {
        "name": "tg_get_repo_status",
        "description": "Inspect the active Git repository status, current branch, HEAD commit OID, and count of staged/unstaged/untracked/conflicted files from Tongyun Git desktop.",
        "inputSchema": {
            "type": "object",
            "properties": {},
        },
    },
    {
        "name": "tg_get_context_pack",
        "description": "Extract a high-density, LLM-ready Context Pack containing a clean summary of all working tree changes, additions/deletions, and code diffs formatted for AI reasoning.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "max_chars": {
                    "type": "integer",
                    "description": "Maximum characters before diff truncation (default: 32000)",
                },
                "repo": {
                    "type": "string",
                    "description": "Optional repository path if inspecting a specific repo",
                },
            },
        },
    },
    {
        "name": "tg_get_file_diff",
        "description": "Get structured diff hunks and line changes for a specific file.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "path": {
                    "type": "string",
                    "description": "Relative file path within repository",
                },
                "staged": {
                    "type": "boolean",
                    "description": "If true, diff index vs HEAD; if false, diff worktree vs index",
                },
                "repo": {
                    "type": "string",
                    "description": "Optional repository path",
                },
            },
            "required": ["path"],
        },
    },
    {
        "name": "tg_push_agent_intent",
        "description": "Push your code changes intent, task description, and proposed Conventional Commit message directly into the open Tongyun Git Desktop UI for human review and one-click commit.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "commit_message": {
                    "type": "string",
                    "description": "Proposed commit message (following Conventional Commits)",
                },
                "task": {
                    "type": "string",
                    "description": "Short description of the task or user request you worked on",
                },
                "agent_name": {
                    "type": "string",
                    "description": "Your agent name (e.g. Claude Code, Cursor, Antigravity)",
                },
                "suggested_stage": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "List of file paths you suggest staging",
                },
            },
            "required": ["commit_message"],
        },
    },
    {
        "name": "tg_create_safety_snapshot",
        "description": "Create an instant, lossless safety snapshot of the working tree before executing risky or large-scale code changes. Allows guaranteed rewind if tests fail.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "label": {
                    "type": "string",
                    "description": "Label describing what change is about to be attempted",
                },
                "repo": {
                    "type": "string",
                    "description": "Optional repository path",
                },
            },
        },
    },
    {
        "name": "tg_rewind_to_snapshot",
        "description": "100% restore the working tree to the latest safety snapshot, cleanly recovering deleted files and cleaning untracked files generated during failed refactor.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "reference": {
                    "type": "string",
                    "description": "Optional snapshot reference (if omitted, rewinds to the latest snapshot)",
                },
                "repo": {
                    "type": "string",
                    "description": "Optional repository path",
                },
            },
        },
    },
    {
        "name": "tg_stage_files",
        "description": "Stage specific files in the Git index.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "paths": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "File paths to stage",
                },
                "repo": {
                    "type": "string",
                    "description": "Optional repository path",
                },
            },
            "required": ["paths"],
        },
    },
]


def handle_tool_call(name: str, arguments: dict) -> dict:
    if name == "tg_get_repo_status":
        return request_bridge("/api/status")

    elif name == "tg_get_context_pack":
        qs_parts = []
        if "repo" in arguments and arguments["repo"]:
            qs_parts.append(f"repo={urllib.parse.quote(arguments['repo'])}")
        if "max_chars" in arguments and arguments["max_chars"]:
            qs_parts.append(f"max_chars={arguments['max_chars']}")
        qs = ("?" + "&".join(qs_parts)) if qs_parts else ""
        return request_bridge(f"/api/context-pack{qs}")

    elif name == "tg_get_file_diff":
        qs_parts = [f"path={urllib.parse.quote(arguments['path'])}"]
        if arguments.get("staged"):
            qs_parts.append("staged=true")
        if arguments.get("repo"):
            qs_parts.append(f"repo={urllib.parse.quote(arguments['repo'])}")
        qs = "&".join(qs_parts)
        return request_bridge(f"/api/diff?{qs}")

    elif name == "tg_push_agent_intent":
        return request_bridge("/api/push-intent", method="POST", data=arguments)

    elif name == "tg_create_safety_snapshot":
        return request_bridge("/api/snapshot", method="POST", data=arguments)

    elif name == "tg_rewind_to_snapshot":
        return request_bridge("/api/rewind", method="POST", data=arguments)

    elif name == "tg_stage_files":
        return request_bridge("/api/stage", method="POST", data=arguments)

    else:
        return {"error": f"Unknown tool: {name}"}


def main():
    while True:
        line = sys.stdin.readline()
        if not line:
            break
        try:
            req = json.loads(line)
        except json.JSONDecodeError:
            continue

        req_id = req.get("id")
        method = req.get("method")
        params = req.get("params", {})

        if method == "initialize":
            res = {
                "jsonrpc": "2.0",
                "id": req_id,
                "result": {
                    "protocolVersion": "2024-11-05",
                    "capabilities": {"tools": {}},
                    "serverInfo": {"name": "tongyun-git-mcp", "version": "1.0.0"},
                },
            }
            sys.stdout.write(json.dumps(res) + "\n")
            sys.stdout.flush()

        elif method == "notifications/initialized":
            pass

        elif method == "tools/list":
            res = {
                "jsonrpc": "2.0",
                "id": req_id,
                "result": {"tools": TOOLS},
            }
            sys.stdout.write(json.dumps(res) + "\n")
            sys.stdout.flush()

        elif method == "tools/call":
            tool_name = params.get("name")
            arguments = params.get("arguments", {})
            call_res = handle_tool_call(tool_name, arguments)

            # Format tool response
            content_text = json.dumps(call_res, indent=2, ensure_ascii=False)
            res = {
                "jsonrpc": "2.0",
                "id": req_id,
                "result": {
                    "content": [{"type": "text", "text": content_text}],
                    "isError": "error" in call_res,
                },
            }
            sys.stdout.write(json.dumps(res) + "\n")
            sys.stdout.flush()

        else:
            if req_id is not None:
                res = {
                    "jsonrpc": "2.0",
                    "id": req_id,
                    "error": {"code": -32601, "message": f"Method not found: {method}"},
                }
                sys.stdout.write(json.dumps(res) + "\n")
                sys.stdout.flush()


if __name__ == "__main__":
    main()
