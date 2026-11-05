"""Unit tests for tTerm MCP server."""
import json
import unittest
from unittest.mock import patch, MagicMock

import mcp_server


class TestTTermMcpServer(unittest.TestCase):
    def test_mcp_initialize(self):
        req = {"jsonrpc": "2.0", "id": 1, "method": "initialize"}
        res = mcp_server.handle_request(req)
        self.assertEqual(res["id"], 1)
        self.assertEqual(res["result"]["serverInfo"]["name"], "tterm-mcp-server")

    def test_mcp_tools_list(self):
        req = {"jsonrpc": "2.0", "id": 2, "method": "tools/list"}
        res = mcp_server.handle_request(req)
        tools = res["result"]["tools"]
        tool_names = [t["name"] for t in tools]
        self.assertIn("tterm_list_machines", tool_names)
        self.assertIn("tterm_list_terminals", tool_names)
        self.assertIn("tterm_run_command", tool_names)
        self.assertIn("tterm_exec", tool_names)
        self.assertIn("tterm_rename_machine", tool_names)

    @patch("mcp_server._request")
    def test_rename_machine(self, mock_request):
        mock_request.return_value = {"id": "m-123", "name": "Custom Server"}
        res_str = mcp_server.rename_machine("m-123", "Custom Server")
        res = json.loads(res_str)
        self.assertEqual(res["name"], "Custom Server")

    @patch("mcp_server._request")
    def test_list_machines(self, mock_request):
        mock_request.return_value = {
            "projects": [
                {
                    "name": "Personal",
                    "machines": [
                        {
                            "id": "test-id-1",
                            "name": "pi-node",
                            "online": True,
                            "os": "Linux",
                            "passport": {"user": "pi"},
                        }
                    ],
                }
            ]
        }
        res_str = mcp_server.list_machines()
        res = json.loads(res_str)
        self.assertEqual(len(res), 1)
        self.assertEqual(res[0]["name"], "pi-node")
        self.assertTrue(res[0]["online"])

    def test_unknown_method(self):
        req = {"jsonrpc": "2.0", "id": 3, "method": "unknown_test_method"}
        res = mcp_server.handle_request(req)
        self.assertIn("error", res)
        self.assertEqual(res["error"]["code"], -32601)

    def test_windows_installer_template(self):
        from pathlib import Path
        template_file = Path(__file__).parent / "tterm" / "templates" / "install_computer.ps1"
        self.assertTrue(template_file.exists())
        content = template_file.read_text(encoding="utf-8")
        self.assertIn("{{HUB}}", content)
        self.assertIn("{{TOKEN}}", content)
        rendered = content.replace("{{HUB}}", "http://127.0.0.1:8291").replace("{{TOKEN}}", "tok_test_123")
        self.assertIn("tok_test_123", rendered)
        self.assertIn("http://127.0.0.1:8291", rendered)
        self.assertIn("tTerm Web: connecting this Windows computer", rendered)


if __name__ == "__main__":
    unittest.main()
