
import unittest
import uuid
from unittest.mock import AsyncMock, MagicMock, patch
import sys

sys.modules["asyncpg"] = MagicMock()

from fastapi import Request
from tterm.orchestration.api import (
    list_projects_for_frontend,
    list_all_nodes,
    get_single_node,
    list_all_project_git_configs,
    get_project_git_config,
    get_vault_data,
)
from tterm.orchestration.discovery import discovery_scanner, DiscoveredNodeDTO
from tterm.orchestration.git_sync import git_sync_manager, ProjectGitConfigDTO
from tterm.core.auth import Person

class TestTenantIsolation(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.owner_id = uuid.uuid4()
        self.new_user_id = uuid.uuid4()
        self.owner_proj_id = uuid.uuid4()
        self.new_user_proj_id = uuid.uuid4()

        self.owner_person = Person(self.owner_id, "Евгений Климов", "dark", "enterprise", "eklimov84@gmail.com")
        self.new_person = Person(self.new_user_id, "Тестовый Клиент", "system", "free", "test@example.com")

        # Mock pool
        self.pool = MagicMock()
        self.mock_conn = AsyncMock()
        self.pool.acquire.return_value.__aenter__.return_value = self.mock_conn

        # Mock git sync manager
        git_sync_manager._configs.clear()
        git_sync_manager.set_config(ProjectGitConfigDTO(
            project_id=str(self.owner_proj_id),
            repo_url="https://github.com/owner/secret-repo.git",
            project_name="Owner Secret Project"
        ))

        # Mock discovery scanner
        discovery_scanner._nodes.clear()
        self.owner_node = DiscoveredNodeDTO(
            id="owner-vps-1",
            name="tterm-vps (Server)",
            kind="server",
            os_name="Ubuntu Linux",
            ip_address="82.148.241.254",
            status="ONLINE",
            project_id=str(self.owner_proj_id),
        )
        discovery_scanner._nodes["owner-vps-1"] = self.owner_node

    async def test_projects_list_isolation(self):
        # 1. When called by new_user, should only return new_user's projects
        self.mock_conn.fetch.return_value = [
            {"id": self.new_user_proj_id, "name": "Personal", "code": "P", "personal": True}
        ]

        req = MagicMock(spec=Request)
        req.cookies = {"tterm-session": "tok_new"}
        req.headers = {}
        req.query_params = {}
        req.app.state.pool = self.pool

        with patch("tterm.orchestration.api._extract_current_user", new=AsyncMock(return_value=self.new_person)):
            res = await list_projects_for_frontend(req)
            self.assertTrue(res["ok"])
            p_ids = [p["id"] for p in res["projects"]]
            self.assertIn(str(self.new_user_proj_id), p_ids)
            self.assertNotIn(str(self.owner_proj_id), p_ids)

    async def test_nodes_isolation(self):
        # When called by new_user whose allowed projects do not include owner_proj_id
        self.mock_conn.fetch.return_value = [{"id": self.new_user_proj_id}]

        req = MagicMock(spec=Request)
        req.cookies = {"tterm-session": "tok_new"}
        req.headers = {}
        req.query_params = {}
        req.app.state.pool = self.pool

        with patch("tterm.orchestration.api._extract_current_user", new=AsyncMock(return_value=self.new_person)):
            # 1. Global /nodes call without project_id
            res = await list_all_nodes(request=req)
            self.assertTrue(res["ok"])
            # Owner's node must NOT be present
            self.assertEqual(len(res["nodes"]), 0)

            # 2. Direct probe of owner's node /nodes/owner-vps-1
            from fastapi import HTTPException
            with self.assertRaises(HTTPException) as cm:
                await get_single_node("owner-vps-1", request=req)
            self.assertEqual(cm.exception.status_code, 404)

    async def test_git_configs_isolation(self):
        # New user only allowed new_user_proj_id
        self.mock_conn.fetch.return_value = [{"id": self.new_user_proj_id}]

        req = MagicMock(spec=Request)
        req.cookies = {"tterm-session": "tok_new"}
        req.headers = {}
        req.query_params = {}
        req.app.state.pool = self.pool

        with patch("tterm.orchestration.api._extract_current_user", new=AsyncMock(return_value=self.new_person)):
            res = await list_all_project_git_configs(request=req)
            self.assertTrue(res["ok"])
            # Owner's git repo must NOT be leaked
            self.assertNotIn(str(self.owner_proj_id), res["configs"])

            # Probe owner's git config directly -> 403 Forbidden
            self.mock_conn.fetchval.return_value = None
            from fastapi import HTTPException
            with self.assertRaises(HTTPException) as cm:
                await get_project_git_config(str(self.owner_proj_id), request=req)
            self.assertEqual(cm.exception.status_code, 403)

    async def test_vault_isolation(self):
        req = MagicMock(spec=Request)
        req.cookies = {"tterm-session": "tok_new"}
        req.headers = {}
        req.query_params = {}
        req.app.state.pool = self.pool

        with patch("tterm.orchestration.api._extract_current_user", new=AsyncMock(return_value=self.new_person)):
            with patch("tterm.orchestration.encrypted_vault.encrypted_vault.load_secrets", new=AsyncMock(return_value={"user_secret": "abc"})) as mock_load:
                res = await get_vault_data(request=req)
                self.assertTrue(res["ok"])
                self.assertEqual(res["user_id"], str(self.new_user_id))
                mock_load.assert_called_with(str(self.new_user_id), pool=self.pool)

if __name__ == "__main__":
    unittest.main()
