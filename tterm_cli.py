#!/usr/bin/env python3
"""
tterm-cli — CLI client for tTerm Web.
Enables AI agents and command-line scripts to interact with specific terminals,
inspect status, and execute commands with full author attribution and RBAC compliance.
"""
import argparse
import asyncio
import json
import os
import sys

# Try importing mcp_server helpers
try:
    import mcp_server
except ImportError:
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    import mcp_server


def main():
    parser = argparse.ArgumentParser(description="tTerm Web Command-Line Interface")
    parser.add_argument("--terminal", "-t", help="Target terminal ID (UUID)", default="")
    parser.add_argument("--author", "-a", help="Author name (default: Antigravity)", default="Antigravity (ИИ)")
    parser.add_argument("--author-kind", choices=["agent", "user", "guest"], default="agent", help="Author kind")
    parser.add_argument("--list-terminals", action="store_true", help="List open terminals")
    parser.add_argument("--list-machines", action="store_true", help="List computers and servers")
    parser.add_argument("--timeout", type=float, default=60.0, help="Execution timeout in seconds")
    parser.add_argument("command", nargs="*", help="Command string to execute in the terminal")

    args = parser.parse_args()

    if args.list_machines:
        print(mcp_server.list_machines())
        return

    if args.list_terminals:
        print(mcp_server.list_terminals())
        return

    cmd = " ".join(args.command).strip()
    if not cmd:
        parser.print_help()
        sys.exit(1)

    term_id = args.terminal
    if not term_id:
        # Check config allowed_terminal
        cfg_term = mcp_server._config.get("allowed_terminal")
        if cfg_term:
            term_id = cfg_term
        else:
            # Pick first open terminal
            terms = json.loads(mcp_server.list_terminals())
            if not terms:
                print("Error: No open terminals found. Open a terminal in tTerm Web first.", file=sys.stderr)
                sys.exit(1)
            term_id = terms[0].get("terminal_id")
            print(f"[tterm-cli] No terminal specified. Using active terminal: {terms[0].get('machine')} ({term_id})", file=sys.stderr)

    author_payload = {
        "name": args.author,
        "kind": args.author_kind,
    }

    try:
        res = asyncio.run(mcp_server._run_command_ws(term_id, cmd, timeout=args.timeout, author=author_payload))
        out = res.get("output", "")
        if out:
            print(out, end="")
        exit_code = res.get("exitCode", 0)
        sys.exit(exit_code or 0)
    except Exception as exc:
        print(f"Error executing command: {exc}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
