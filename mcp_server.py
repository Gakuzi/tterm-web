#!/Users/evgeniy/Documents/antigravity/tterm-web/.venv/bin/python
"""
tTerm MCP Server — Model Context Protocol for tTerm Web.

Exposes tools for AI assistants (Cursor, Claude Desktop, Antigravity) to:
- Inspect connected machines and servers
- Open new terminals on remote machines
- Execute shell commands inside terminals and get real-time output
- Read terminal history, exit codes, and blocks
"""
from __future__ import annotations

import asyncio
import base64
import json
import logging
import os
import ssl
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from typing import Any

import sys

VENV_SITE = "/Users/evgeniy/Documents/antigravity/tterm-web/.venv/lib/python3.11/site-packages"
if os.path.exists(VENV_SITE) and VENV_SITE not in sys.path:
    sys.path.insert(0, VENV_SITE)

try:
    import certifi
    import websockets
except ImportError:
    pass

logging.basicConfig(level=logging.INFO, stream=sys.stderr, format="[tterm-mcp] %(message)s")
log = logging.getLogger("tterm-mcp")

TTERM_CONFIG_PATH = os.path.expanduser("~/.config/tterm/config.json")
_config = {}
if os.path.exists(TTERM_CONFIG_PATH):
    try:
        with open(TTERM_CONFIG_PATH, "r", encoding="utf-8") as f:
            _config = json.load(f)
    except Exception:
        pass

TTERM_URL = os.environ.get("TTERM_URL", _config.get("url", "http://192.168.0.6:8290")).rstrip("/")
TTERM_SESSION = os.environ.get("TTERM_SESSION", _config.get("session", "6COlOhrpS0FnUDpebkqrHXjTFMauwDYS4xQp17bgKbc"))
TTERM_AI_TOKEN = os.environ.get("TTERM_AI_TOKEN", _config.get("token", _config.get("agent_token", "tt_ai_default_antigravity_mcp_key_2026")))
ALLOWED_TERMINAL = os.environ.get("ALLOWED_TERMINAL", _config.get("allowed_terminal", ""))
MCP_SESSION_ID = os.environ.get("MCP_SESSION_ID", f"sess-ai-mcp-{time.strftime('%H%M%S')}")


def _ping_session(terminal_id: str = "", command: str = "") -> dict[str, Any]:
    """Reports MCP activity and heartbeats the AI agent session in tTerm."""
    try:
        payload = {
            "token": TTERM_AI_TOKEN,
            "session_id": MCP_SESSION_ID,
            "agent_name": "Antigravity AI (MCP)",
            "terminal_id": terminal_id or ALLOWED_TERMINAL,
            "command": command,
        }
        return _request("POST", "/api/orchestration/ai-sessions/ping", payload)
    except Exception:
        return {}


def _request(method: str, path: str, data: dict[str, Any] | None = None) -> dict[str, Any]:
    url = f"{TTERM_URL}{path}"
    headers = {
        "x-tterm": "1",
        "Accept": "application/json",
        "Origin": TTERM_URL,
        "Referer": f"{TTERM_URL}/",
        "X-AI-Token": TTERM_AI_TOKEN,
        "X-AI-Session": MCP_SESSION_ID,
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
                "machine_id": m.get("id"),
                "name": m.get("name"),
                "online": m.get("online", False),
                "os": m.get("os"),
                "user": passport.get("user"),
                "agent_version": (m.get("agent") or {}).get("version"),
            })
    return json.dumps(result, ensure_ascii=False, indent=2)


def get_machine_info(machine_id: str) -> str:
    """Gets detailed hardware and passport info for a machine."""
    machine = _request("GET", f"/api/machines/{machine_id}")
    return json.dumps(machine, ensure_ascii=False, indent=2)


def rename_machine(machine_id: str, new_name: str) -> str:
    """Renames a machine in tTerm."""
    res = _request("PATCH", f"/api/machines/{machine_id}", {"name": new_name})
    return json.dumps(res, ensure_ascii=False, indent=2)


def list_terminals() -> str:
    """Lists currently open terminals and active commands."""
    state = _request("GET", "/api/state")
    terminals = state.get("terminals", [])
    summary = []
    for t in terminals:
        summary.append({
            "terminal_id": t.get("id"),
            "machine": t.get("machine"),
            "machineId": t.get("machineId"),
            "name": t.get("name"),
            "state": t.get("state"),
            "cwd": t.get("cwd"),
            "running": t.get("running"),
        })
    return json.dumps(summary, ensure_ascii=False, indent=2)


def open_terminal(machine_id: str, cwd: str = "", project_id: str = "") -> str:
    """Opens a new terminal on a machine, optionally scoped to a project."""
    payload: dict[str, Any] = {"machineId": machine_id, "cols": 80, "rows": 24}
    if cwd:
        payload["cwd"] = cwd
    if project_id:
        payload["projectId"] = project_id
    res = _request("POST", "/api/terminals", payload)
    return json.dumps(res, ensure_ascii=False, indent=2)


def read_terminal(terminal_id: str) -> str:
    """Reads command blocks and output of a terminal."""
    blocks_data = _request("GET", f"/api/terminals/{terminal_id}/blocks")
    blocks = blocks_data.get("blocks", [])
    output = []
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


async def _run_command_ws(terminal_id: str, command: str, timeout: float = 30.0, author: dict[str, Any] | None = None) -> dict[str, Any]:
    if ALLOWED_TERMINAL and terminal_id != ALLOWED_TERMINAL:
        raise PermissionError(f"Access denied: AI Agent is restricted to terminal {ALLOWED_TERMINAL}")

    _ping_session(terminal_id, command)

    ws_scheme = "wss" if TTERM_URL.startswith("https") else "ws"
    ws_host = TTERM_URL.split("://", 1)[1]
    ws_url = f"{ws_scheme}://{ws_host}/api/ws"

    headers = [
        ("Cookie", f"__Host-tterm-session={TTERM_SESSION}; tterm-session={TTERM_SESSION}"),
        ("Origin", TTERM_URL),
    ]

    ssl_ctx = None
    if ws_scheme == "wss":
        try:
            import certifi
            ssl_ctx = ssl.create_default_context(cafile=certifi.where())
        except Exception:
            ssl_ctx = ssl.create_default_context()

    kwargs: dict[str, Any] = {"additional_headers": headers}
    if ssl_ctx:
        kwargs["ssl"] = ssl_ctx

    async with websockets.connect(ws_url, **kwargs) as ws:
        await ws.send(json.dumps({
            "op": "attach",
            "ch": 1,
            "id": terminal_id,
            "cols": 80,
            "rows": 24,
            "focus": True,
        }))

        # Send command to run with author metadata
        auth_data = author or {"name": "Antigravity (ИИ)", "kind": "agent"}
        await ws.send(json.dumps({
            "op": "run",
            "ch": 1,
            "command": command,
            "author": auth_data,
        }))

        start_time = time.time()
        last_text_output = ""

        # Wait until command block finishes or timeout
        while time.time() - start_time < timeout:
            try:
                msg = await asyncio.wait_for(ws.recv(), timeout=2.0)
            except asyncio.TimeoutError:
                blocks = _request("GET", f"/api/terminals/{terminal_id}/blocks").get("blocks", [])
                if blocks and blocks[-1].get("command") == command and blocks[-1].get("finishedAt"):
                    b = blocks[-1]
                    out_b64 = b.get("output", "")
                    out_text = base64.b64decode(out_b64).decode("utf-8", "replace") if out_b64 else ""
                    return {
                        "exitCode": b.get("exitCode"),
                        "output": out_text,
                        "command": command,
                    }
                continue

            if isinstance(msg, str):
                try:
                    data = json.loads(msg)
                    if data.get("op") == "refused":
                        raise RuntimeError(f"Command refused: {data.get('reason')}")
                    if data.get("op") == "guard_ask":
                        return {
                            "exitCode": None,
                            "output": "[Guard Mode] Команда ожидает подтверждения пользователя в веб-интерфейсе tTerm.",
                            "command": command,
                            "guard": True,
                        }
                except json.JSONDecodeError:
                    pass

            if isinstance(msg, bytes) and len(msg) > 5 and msg[0] == 1:
                last_text_output += msg[5:].decode("utf-8", "replace")

        # Fallback fetch blocks
        blocks = _request("GET", f"/api/terminals/{terminal_id}/blocks").get("blocks", [])
        if blocks:
            b = blocks[-1]
            out_b64 = b.get("output", "")
            out_text = base64.b64decode(out_b64).decode("utf-8", "replace") if out_b64 else ""
            return {
                "exitCode": b.get("exitCode", 0),
                "output": out_text or last_text_output,
                "command": command,
            }

        return {
            "exitCode": 0,
            "output": last_text_output,
            "command": command,
        }


def run_command(terminal_id: str, command: str, timeout: float = 30.0) -> str:
    """Executes a command in an open terminal and returns output and exit code."""
    res = asyncio.run(_run_command_ws(terminal_id, command, timeout))
    return json.dumps(res, ensure_ascii=False, indent=2)


def exec_auto(command: str, machine_name_or_id: str | None = None, timeout: float = 30.0) -> dict[str, Any]:
    """Executes a command on an online machine in tTerm, automatically finding or opening a terminal."""
    state = _request("GET", "/api/state")
    machines = []
    for proj in state.get("projects", []):
        for m in proj.get("machines", []):
            if m.get("online"):
                machines.append(m)

    if not machines:
        raise RuntimeError("No online machines found in tTerm")

    target_machine = None
    if machine_name_or_id:
        for m in machines:
            if m.get("id") == machine_name_or_id or m.get("name") == machine_name_or_id:
                target_machine = m
                break
        if not target_machine:
            raise RuntimeError(f"Machine '{machine_name_or_id}' not found or offline")
    else:
        target_machine = machines[0]

    target_id = target_machine["id"]
    machine_name = target_machine.get("name", target_id)

    # Check for open terminals on this machine
    terminals = state.get("terminals", [])
    open_term = None
    for t in terminals:
        if t.get("machineId") == target_id and t.get("state") == "open":
            open_term = t
            break

    if open_term:
        term_id = open_term["id"]
    else:
        # Open a new terminal
        new_term = _request("POST", "/api/terminals", {"machineId": target_id, "cols": 80, "rows": 24})
        term_id = new_term.get("id")
        if not term_id:
            raise RuntimeError(f"Failed to open terminal on machine {machine_name}: {new_term}")
        time.sleep(1.0)

    result = asyncio.run(_run_command_ws(term_id, command, timeout))
    result["machine"] = machine_name
    result["machineId"] = target_id
    result["terminalId"] = term_id
    return result


TOOLS = [
    {
        "name": "tterm_list_machines",
        "description": "Lists all remote machines (computers and servers) connected to tTerm with their online status, OS, user, and machine IDs.",
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
        "name": "tterm_rename_machine",
        "description": "Renames a machine in tTerm to a custom, user-friendly name.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "machine_id": {
                    "type": "string",
                    "description": "UUID of the machine to rename.",
                },
                "name": {
                    "type": "string",
                    "description": "New friendly display name for the machine.",
                },
            },
            "required": ["machine_id", "name"],
        },
    },
    {
        "name": "tterm_list_terminals",
        "description": "Lists currently open terminal sessions in tTerm, including machine name, working directory, and running commands.",
        "inputSchema": {
            "type": "object",
            "properties": {},
        },
    },
    {
        "name": "tterm_open_terminal",
        "description": "Opens a new terminal session on a specific remote machine.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "machine_id": {
                    "type": "string",
                    "description": "UUID of the machine to open the terminal on.",
                },
                "cwd": {
                    "type": "string",
                    "description": "Optional initial working directory for the terminal session.",
                },
            },
            "required": ["machine_id"],
        },
    },
    {
        "name": "tterm_rename_machine",
        "description": "Renames a machine in tTerm to a custom, user-friendly name.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "machine_id": {
                    "type": "string",
                    "description": "UUID of the machine to rename.",
                },
                "name": {
                    "type": "string",
                    "description": "New friendly display name for the machine.",
                },
            },
            "required": ["machine_id", "name"],
        },
    },
    {
        "name": "tterm_run_command",
        "description": "Executes a shell command inside an open tTerm terminal session, waits for execution, and returns exitCode and stdout/stderr output.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "terminal_id": {
                    "type": "string",
                    "description": "UUID of the terminal session.",
                },
                "command": {
                    "type": "string",
                    "description": "Shell command to execute.",
                },
                "timeout": {
                    "type": "number",
                    "description": "Maximum seconds to wait for command execution (default: 30).",
                },
            },
            "required": ["terminal_id", "command"],
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
    {
        "name": "tterm_exec",
        "description": "High-level execution: runs a shell command directly on an online tTerm machine (auto-picks or opens terminal if needed) and returns output, exitCode, and terminal info.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "command": {
                    "type": "string",
                    "description": "Shell command to execute on remote machine.",
                },
                "machine": {
                    "type": "string",
                    "description": "Optional machine name or ID (defaults to first online machine).",
                },
                "timeout": {
                    "type": "number",
                    "description": "Timeout in seconds (default: 30).",
                },
            },
            "required": ["command"],
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
                    "version": "0.2.0",
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
            elif name == "tterm_open_terminal":
                content = open_terminal(args["machine_id"], args.get("cwd", ""), args.get("project_id", ""))
            elif name == "tterm_run_command":
                content = run_command(args["terminal_id"], args["command"], args.get("timeout", 30.0))
            elif name == "tterm_read_terminal":
                content = read_terminal(args["terminal_id"])
            elif name == "tterm_rename_machine":
                content = rename_machine(args["machine_id"], args["name"])
            elif name == "tterm_exec":
                content = json.dumps(exec_auto(args["command"], args.get("machine"), args.get("timeout", 30.0)), ensure_ascii=False, indent=2)
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
    if len(sys.argv) > 1:
        cmd = sys.argv[1]
        if cmd in ("--help", "-h"):
            print("tTerm CLI & MCP Bridge")
            print("Usage:")
            print("  mcp_server.py --list                 List connected machines")
            print("  mcp_server.py --terminals            List open terminals")
            print("  mcp_server.py --rename <id> <name>   Rename machine")
            print("  mcp_server.py --open <machine_id>    Open new terminal")
            print("  mcp_server.py --run <term_id> <cmd>  Run command in terminal")
            print("  mcp_server.py --exec <cmd>           Auto-run command on active machine")
            print("  mcp_server.py --call <tool> <args>   Invoke MCP tool directly")
            print("  mcp_server.py                        Run as MCP stdio server")
            sys.exit(0)
        if cmd in ("--list", "-l"):
            print(list_machines())
            sys.exit(0)
        if cmd in ("--terminals", "-t"):
            print(list_terminals())
            sys.exit(0)
        if cmd == "--open":
            m_id = sys.argv[2]
            print(open_terminal(m_id))
            sys.exit(0)
        if cmd == "--rename":
            m_id = sys.argv[2]
            new_name = sys.argv[3]
            print(rename_machine(m_id, new_name))
            sys.exit(0)
        if cmd == "--run":
            t_id = sys.argv[2]
            command = sys.argv[3]
            print(run_command(t_id, command))
            sys.exit(0)
        if cmd == "--exec":
            command = " ".join(sys.argv[2:])
            res = exec_auto(command)
            print(json.dumps(res, ensure_ascii=False, indent=2))
            sys.exit(0)
        if cmd == "--call":
            tool_name = sys.argv[2]
            args = json.loads(sys.argv[3]) if len(sys.argv) > 3 else {}
            req = {"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": tool_name, "arguments": args}}
            res = handle_request(req)
            print(json.dumps(res, ensure_ascii=False, indent=2))
            sys.exit(0)

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
