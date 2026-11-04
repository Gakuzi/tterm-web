#!/usr/bin/env python3
"""
tTerm MCP Server — Model Context Protocol integration for tTerm Web.

Allows AI coding assistants (Claude Desktop, Cursor, Antigravity) to safely
interact with your remote machines, servers, and terminals managed by tTerm.

Usage:
  python3 mcp_server.py

Environment variables:
  TTERM_URL: Base URL of your tTerm Web instance (default: http://192.168.0.6:8290)
  TTERM_SESSION: __Host-tterm-session cookie or session token for authentication
"""
from __future__ import annotations

import json
import logging
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from typing import Any

logging.basicConfig(level=logging.INFO, stream=sys.stderr, format="[tterm-mcp] %(message)s")
log = logging.getLogger("tterm-mcp")

TTERM_URL = os.environ.get("TTERM_URL", "http://192.168.0.6:8290").rstrip("/")
TTERM_SESSION = os.environ.get("TTERM_SESSION", "")


def _request(method: str, path: str, data: dict[str, Any] | None = None) -> dict[str, Any]:
    url = f"{TTERM_URL}{path}"
    headers = {
        "x-tterm": "1",
        "Accept": "application/json",
        "Origin": TTERM_URL,
        "Referer": f"{TTERM_URL}/",
    }
    if TTERM_SESSION:
        headers["Cookie"] = f"__Host-tterm-session={TTERM_SESSION}; tterm-session={TTERM_SESSION}"

    body = None
    if data is not None:
        headers["Content-Type"] = "application/json"
        body = json.dumps(data).encode("utf-8")

    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=30) as res:
            resp_data = res.read().decode("utf-8")
            return json.loads(resp_data) if resp_data else {}
    except urllib.error.HTTPError as exc:
        err_msg = exc.read().decode("utf-8", "replace")
        raise RuntimeError(f"tTerm API returned {exc.code}: {err_msg}") from exc
    except Exception as exc:
        raise RuntimeError(f"Failed to communicate with tTerm at {url}: {exc}") from exc


def list_machines() -> str:
    """Lists all computers and servers registered in tTerm."""
    state = _request("GET", "/api/state")
    projects = state.get("projects", [])
    result = []
    for proj in projects:
        proj_name = proj.get("name", "Unknown")
        for m in proj.get("machines", []):
            passport = m.get("passport") or {}
            result.append({
                "project": proj_name,
                "id": m.get("id"),
                "name": m.get("name"),
                "online": m.get("online", False),
                "os": m.get("os"),
                "user": passport.get("user"),
                "agent_version": (m.get("agent") or {}).get("version"),
            })
    return json.dumps(result, ensure_ascii=False, indent=2)


def get_machine_info(machine_id: str) -> str:
    """Gets detailed info and passport of a specific machine."""
    machine = _request("GET", f"/api/machines/{machine_id}")
    return json.dumps(machine, ensure_ascii=False, indent=2)


def list_terminals() -> str:
    """Lists all open terminals and running commands."""
    state = _request("GET", "/api/state")
    terminals = state.get("terminals", [])
    summary = []
    for t in terminals:
        summary.append({
            "id": t.get("id"),
            "machine": t.get("machine"),
            "machineId": t.get("machineId"),
            "name": t.get("name"),
            "state": t.get("state"),
            "cwd": t.get("cwd"),
            "running": t.get("running"),
        })
    return json.dumps(summary, ensure_ascii=False, indent=2)


def read_terminal(terminal_id: str) -> str:
    """Reads command blocks and output of a terminal."""
    blocks_data = _request("GET", f"/api/terminals/{terminal_id}/blocks")
    blocks = blocks_data.get("blocks", [])
    output = []
    import base64
    for b in blocks:
        out_b64 = b.get("output", "")
        text_out = base64.b64decode(out_b64).decode("utf-8", "replace") if out_b64 else ""
        output.append({
            "command": b.get("command"),
            "cwd": b.get("cwd"),
            "exitCode": b.get("exitCode"),
            "startedAt": b.get("startedAt"),
            "finishedAt": b.get("finishedAt"),
            "output": text_out,
        })
    return json.dumps(output, ensure_ascii=False, indent=2)


TOOLS = [
    {
        "name": "tterm_list_machines",
        "description": "Lists all remote machines (computers and servers) connected to tTerm with their online status, OS, user, and IDs.",
        "inputSchema": {
            "type": "object",
            "properties": {},
        },
    },
    {
        "name": "tterm_get_machine_info",
        "description": "Retrieves detailed system specs, hardware passport, and agent details for a specific machine ID in tTerm.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "machine_id": {
                    "type": "string",
                    "description": "UUID of the machine to inspect.",
                },
            },
            "required": ["machine_id"],
        },
    },
    {
        "name": "tterm_list_terminals",
        "description": "Lists currently open terminal sessions in tTerm, including active working directories and running commands.",
        "inputSchema": {
            "type": "object",
            "properties": {},
        },
    },
    {
        "name": "tterm_read_terminal",
        "description": "Reads the executed command history, exit codes, and stdout/stderr blocks of a specific terminal in tTerm.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "terminal_id": {
                    "type": "string",
                    "description": "UUID of the terminal to read.",
                },
            },
            "required": ["terminal_id"],
        },
    },
]


def handle_request(req: dict[str, Any]) -> dict[str, Any] | None:
    method = req.get("method")
    msg_id = req.get("id")

    if method == "initialize":
        return {
            "jsonrpc": "2.0",
            "id": msg_id,
            "result": {
                "protocolVersion": "2024-11-05",
                "capabilities": {
                    "tools": {},
                },
                "serverInfo": {
                    "name": "tterm-mcp-server",
                    "version": "0.1.0",
                },
            },
        }

    if method == "notifications/initialized":
        return None

    if method == "tools/list":
        return {
            "jsonrpc": "2.0",
            "id": msg_id,
            "result": {
                "tools": TOOLS,
            },
        }

    if method == "tools/call":
        params = req.get("params", {})
        name = params.get("name")
        args = params.get("arguments", {})

        try:
            if name == "tterm_list_machines":
                content = list_machines()
            elif name == "tterm_get_machine_info":
                content = get_machine_info(args["machine_id"])
            elif name == "tterm_list_terminals":
                content = list_terminals()
            elif name == "tterm_read_terminal":
                content = read_terminal(args["terminal_id"])
            else:
                return {
                    "jsonrpc": "2.0",
                    "id": msg_id,
                    "error": {
                        "code": -32601,
                        "message": f"Tool not found: {name}",
                    },
                }

            return {
                "jsonrpc": "2.0",
                "id": msg_id,
                "result": {
                    "content": [
                        {
                            "type": "text",
                            "text": content,
                        }
                    ],
                },
            }
        except Exception as exc:
            return {
                "jsonrpc": "2.0",
                "id": msg_id,
                "result": {
                    "content": [
                        {
                            "type": "text",
                            "text": f"Error: {exc}",
                        }
                    ],
                    "isError": True,
                },
            }

    if method == "ping":
        return {"jsonrpc": "2.0", "id": msg_id, "result": {}}

    return {
        "jsonrpc": "2.0",
        "id": msg_id,
        "error": {
            "code": -32601,
            "message": f"Method not found: {method}",
        },
    }


def main() -> None:
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            req = json.loads(line)
            res = handle_request(req)
            if res is not None:
                sys.stdout.write(json.dumps(res) + "\n")
                sys.stdout.flush()
        except Exception as exc:
            log.exception("Error processing line: %s", exc)


if __name__ == "__main__":
    main()
