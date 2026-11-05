#!/usr/bin/env python3
"""
Unit and Integration Tests for Hierarchical RBAC and Container Orchestration Engine.
"""
import os
from pathlib import Path
import unittest
import uuid

from tterm.orchestration.models import (
    ActionEnum, ContainerCreateDTO, EntityTypeEnum, RoleEnum
)
from tterm.orchestration.rbac import RBACRegistry
from tterm.orchestration.worker import (
    ContainerOrchestrator, generate_ssh_keypair
)


class TestRBAC(unittest.TestCase):
    def setUp(self):
        self.rbac = RBACRegistry()
        self.project_admin = uuid.uuid4()
        self.node_admin = uuid.uuid4()
        self.container_dev = uuid.uuid4()
        self.service_operator = uuid.uuid4()

        self.project_id = uuid.uuid4()
        self.node_id = uuid.uuid4()
        self.container_id = uuid.uuid4()
        self.service_id = uuid.uuid4()

        # Register tree hierarchy
        self.rbac.register_relations(
            node_id=self.node_id,
            project_id=self.project_id,
            container_id=self.container_id,
            service_id=self.service_id,
        )

        # Grant roles
        self.rbac.grant(self.project_admin, RoleEnum.PROJECT_ADMIN, EntityTypeEnum.PROJECT, self.project_id, ActionEnum.ALL)
        self.rbac.grant(self.node_admin, RoleEnum.NODE_ADMIN, EntityTypeEnum.NODE, self.node_id, ActionEnum.ALL)
        self.rbac.grant(self.container_dev, RoleEnum.CONTAINER_DEVELOPER, EntityTypeEnum.CONTAINER, self.container_id, ActionEnum.ALL)
        self.rbac.grant(self.service_operator, RoleEnum.SERVICE_OPERATOR, EntityTypeEnum.SERVICE, self.service_id, ActionEnum.CONFIG)

    def test_project_admin_recursive_access(self):
        """Project Admin must have full access down the entire hierarchy."""
        self.assertTrue(self.rbac.has_permission(self.project_admin, EntityTypeEnum.PROJECT, self.project_id, ActionEnum.MANAGE))
        self.assertTrue(self.rbac.has_permission(self.project_admin, EntityTypeEnum.NODE, self.node_id, ActionEnum.MANAGE))
        self.assertTrue(self.rbac.has_permission(self.project_admin, EntityTypeEnum.CONTAINER, self.container_id, ActionEnum.EXEC))
        self.assertTrue(self.rbac.has_permission(self.project_admin, EntityTypeEnum.SERVICE, self.service_id, ActionEnum.CONFIG))

    def test_node_admin_boundary(self):
        """Node Admin has full access to containers on their node, but not to Project settings."""
        self.assertTrue(self.rbac.has_permission(self.node_admin, EntityTypeEnum.NODE, self.node_id, ActionEnum.MANAGE))
        self.assertTrue(self.rbac.has_permission(self.node_admin, EntityTypeEnum.CONTAINER, self.container_id, ActionEnum.EXEC))
        self.assertFalse(self.rbac.has_permission(self.node_admin, EntityTypeEnum.PROJECT, self.project_id, ActionEnum.MANAGE))

    def test_container_developer_isolation(self):
        """Container Developer has SSH/Exec inside their container, but NO access to host node or project."""
        self.assertTrue(self.rbac.has_permission(self.container_dev, EntityTypeEnum.CONTAINER, self.container_id, ActionEnum.EXEC))
        self.assertFalse(self.rbac.has_permission(self.container_dev, EntityTypeEnum.NODE, self.node_id, ActionEnum.MANAGE))
        self.assertFalse(self.rbac.has_permission(self.container_dev, EntityTypeEnum.PROJECT, self.project_id, ActionEnum.MANAGE))

    def test_service_operator_shell_prohibition(self):
        """Service Operator can edit config/ports, but MUST BE BLOCKED from shell execution (exec)."""
        self.assertTrue(self.rbac.has_permission(self.service_operator, EntityTypeEnum.SERVICE, self.service_id, ActionEnum.CONFIG))
        self.assertFalse(self.rbac.has_permission(self.service_operator, EntityTypeEnum.SERVICE, self.service_id, ActionEnum.EXEC))
        self.assertFalse(self.rbac.has_permission(self.service_operator, EntityTypeEnum.CONTAINER, self.container_id, ActionEnum.EXEC))


class TestContainerWorker(unittest.TestCase):
    def setUp(self):
        self.worker = ContainerOrchestrator(host_public_ip="192.168.0.6")

    def test_ssh_keypair_generation(self):
        priv, pub = generate_ssh_keypair()
        self.assertTrue(priv.startswith("-----BEGIN OPENSSH PRIVATE KEY-----"))
        self.assertTrue(pub.startswith("ssh-ed25519 "))

    def test_anti_escape_docker_socket_prohibition(self):
        """Mounting docker.sock must raise ValueError."""
        with self.assertRaises(ValueError):
            self.worker.validate_mount_security({"/var/run/docker.sock": {"bind": "/var/run/docker.sock", "mode": "rw"}})

        with self.assertRaises(ValueError):
            self.worker.validate_mount_security({"/etc": {"bind": "/host_etc", "mode": "ro"}})

    def test_container_provisioning_and_connection_generation(self):
        project_id = uuid.uuid4()
        node_id = uuid.uuid4()
        spec = ContainerCreateDTO(
            node_id=node_id,
            name="web-frontend-dev",
            image="ubuntu:24.04",
            cpus_limit=2.0,
            memory_limit_mb=2048,
            ssh_user="developer",
        )

        container, conn = self.worker.provision_container(project_id, node_id, spec)
        self.assertEqual(container.name, "web-frontend-dev")
        self.assertEqual(container.cpus_limit, 2.0)
        self.assertEqual(container.memory_limit_mb, 2048)
        self.assertFalse(container.mount_docker_socket)

        # Check connection exports
        self.assertEqual(conn.user, "developer")
        self.assertEqual(conn.host, "192.168.0.6")
        self.assertTrue(conn.termius.label.startswith("tTerm /"))
        self.assertIn("Host web-frontend-dev", conn.ssh_config_snippet)
        self.assertIn("ssh -p", conn.ssh_command)


class TestNodeDiscovery(unittest.TestCase):
    def setUp(self):
        from tterm.orchestration.discovery import NodeDiscoveryScanner
        self.scanner = NodeDiscoveryScanner()
        self.node_id = str(uuid.uuid4())

    def test_parse_discovery_output_and_renaming(self):
        raw_output = """===DOCKER_BEGIN===
0e64525d5026\ttterm-server-tterm-1\ttterm-server-tterm\tUp 10 minutes\t0.0.0.0:8290-8291->8290-8291/tcp
7045c1f0de1b\ttterm-postgres-db\tpostgres:16-alpine\tUp 2 hours\t5432/tcp
===DOCKER_END===
===PORTS_BEGIN===
tcp LISTEN 0 128 0.0.0.0:22 0.0.0.0:*
===PORTS_END==="""
        containers = self.scanner.parse_discovery_output(self.node_id, raw_output)
        self.assertEqual(len(containers), 2)

        # Check Postgres container
        pg = next(c for c in containers if c.id == "7045c1f0de1b")
        self.assertEqual(pg.name, "tterm-postgres-db")
        self.assertEqual(len(pg.services), 1)
        self.assertEqual(pg.services[0].port, 5432)

        # Check renaming
        renamed = self.scanner.rename_entity(self.node_id, "container", "7045c1f0de1b", "Главная БД PostgreSQL")
        self.assertTrue(renamed)
        self.assertEqual(pg.custom_name, "Главная БД PostgreSQL")

    def test_scan_connected_machine_with_mock_client(self):
        """Verifies remote machine discovery via client session executing remote probe commands."""
        import asyncio

        class MockSSHClient:
            async def run(self, cmd):
                return type("SSHResult", (), {
                    "stdout": """===DOCKER_BEGIN===
a1b2c3d4e5f6|web-app|my-org/web:v2.1|Up 3 hours|0.0.0.0:3000->3000/tcp, 0.0.0.0:80->80/tcp
f6e5d4c3b2a1|redis-cache|redis:7-alpine|Up 5 days|6379/tcp
===DOCKER_END===
===PORTS_BEGIN===
tcp LISTEN 0 128 0.0.0.0:22 0.0.0.0:* users:(("sshd",pid=712,fd=3))
tcp LISTEN 0 512 0.0.0.0:3000 0.0.0.0:* users:(("node",pid=1420,fd=19))
tcp LISTEN 0 128 0.0.0.0:80 0.0.0.0:*
===PORTS_END===
===SYSTEM_BEGIN===
Linux production-vps-01 6.8.0-31-generic #31-Ubuntu SMP x86_64 GNU/Linux
198.51.100.42 10.0.0.12
===SYSTEM_END===
"""
                })()

        async def _run():
            res = await self.scanner.scan_connected_machine(
                "vps-remote-1",
                host="198.51.100.42",
                login="ubuntu",
                client=MockSSHClient(),
            )
            self.assertTrue(res["ok"])
            self.assertEqual(res["node_id"], "vps-remote-1")
            self.assertEqual(res["method"], "client_session")

            node = res["node"]
            self.assertEqual(node["ip_address"], "198.51.100.42")
            self.assertIn("Linux", node["os_name"])
            self.assertEqual(len(node["containers"]), 2)

            # Check web container and services
            web_c = next(c for c in node["containers"] if c["name"] == "web-app")
            self.assertEqual(len(web_c["services"]), 2)
            svc0 = web_c["services"][0]
            svc0_port = svc0.port if hasattr(svc0, "port") else svc0["port"]
            self.assertEqual(svc0_port, 3000)

            # Check ports
            ports = node["ports"]
            self.assertEqual(len(ports), 3)
            port_nums = [p["port"] for p in ports]
            self.assertIn(22, port_nums)
            self.assertIn(3000, port_nums)
            self.assertIn(80, port_nums)

        asyncio.run(_run())

    def test_scan_connected_machine_cached_fallback(self):
        """Verifies graceful fallback to cached passport when a remote machine is offline/unreachable."""
        import asyncio

        node_id = "offline-machine-99"
        cached_passport = {
            "os": "Ubuntu 22.04 LTS (Jammy Jellyfish)",
            "docker_containers": [
                {
                    "id": "c11223344",
                    "name": "api-gateway",
                    "image": "traefik:v2.10",
                    "status": "Up 2 weeks",
                    "ports": ["0.0.0.0:443->443/tcp"],
                }
            ],
            "listening_ports": [
                "tcp LISTEN 0 128 0.0.0.0:22 0.0.0.0:*",
                "tcp LISTEN 0 4096 0.0.0.0:443 0.0.0.0:*",
            ],
        }

        # Pre-seed node with cached passport
        from tterm.orchestration.discovery import DiscoveredNodeDTO
        self.scanner._nodes[node_id] = DiscoveredNodeDTO(
            id=node_id,
            name="Offline Cloud Node",
            kind="server",
            os_name="Ubuntu 22.04 LTS",
            ip_address="127.0.0.1",
            status="ONLINE",
            host="127.0.0.1",
            ssh_port=59999,
            login="root",
            cached_passport=cached_passport,
        )

        async def _run():
            # Scan with unreachable port
            res = await self.scanner.scan_connected_machine(node_id, host="127.0.0.1", port=59999)
            self.assertTrue(res["ok"])
            self.assertEqual(res["node_id"], node_id)
            self.assertEqual(res["method"], "cached_fallback")

            node = res["node"]
            self.assertEqual(len(node["containers"]), 1)
            self.assertEqual(node["containers"][0]["name"], "api-gateway")
            self.assertEqual(len(node["ports"]), 2)

        asyncio.run(_run())

    def test_get_node_services_and_ports(self):
        """Verifies extracting flattened services and open listening ports for a node."""
        services, ports = self.scanner.get_node_services("klim")
        self.assertGreater(len(services), 0)
        self.assertGreater(len(ports), 0)

        # Ensure services have container_name and node_id attached
        for srv in services:
            self.assertIn("container_name", srv)
            self.assertEqual(srv["node_id"], "klim")
            self.assertIn("port", srv)

    def test_live_or_cached_klim_scan(self):
        """Verifies scanning the klim connected node produces real containers and ports."""
        import asyncio

        async def _run():
            res = await self.scanner.scan_connected_machine("klim")
            self.assertTrue(res["ok"])
            self.assertEqual(res["node_id"], "klim")
            self.assertIn(res["method"], ["remote_ssh", "cached_fallback"])
            self.assertGreaterEqual(len(res["containers"]), 5)
            self.assertGreaterEqual(len(res["ports"]), 5)
            self.assertEqual(res["node"]["ip_address"], "192.168.0.6")

        asyncio.run(_run())

    def test_remote_scan_api_endpoints(self):
        """Verifies FastAPI orchestration endpoints for remote node scanning and service retrieval."""
        import asyncio
        from tterm.orchestration.api import (
            scan_remote_connected_node,
            get_node_services_endpoint,
            scan_all_connected_nodes,
            get_single_node,
            ScanRemoteDTO,
        )

        async def _run():
            # 1. GET /api/orchestration/nodes/{node_id}
            single_res = await get_single_node("klim")
            self.assertTrue(single_res["ok"])
            self.assertEqual(single_res["node"]["id"], "klim")

            # 2. GET /api/orchestration/nodes/{node_id}/services
            srv_res = await get_node_services_endpoint("klim")
            self.assertTrue(srv_res["ok"])
            self.assertEqual(srv_res["node_id"], "klim")
            self.assertGreater(srv_res["total_services"], 0)
            self.assertGreater(srv_res["total_ports"], 0)

            # 3. POST /api/orchestration/nodes/{node_id}/scan-remote with raw output
            test_raw = """===DOCKER_BEGIN===
99aabbcc1122|test-worker|worker:latest|Up 1 hour|0.0.0.0:9090->9090/tcp
===DOCKER_END===
===PORTS_BEGIN===
tcp LISTEN 0 128 0.0.0.0:9090 0.0.0.0:*
===PORTS_END===
===SYSTEM_BEGIN===
Linux worker-node 6.5.0-generic
10.20.30.40
===SYSTEM_END==="""
            scan_res = await scan_remote_connected_node(
                "worker-node-1",
                ScanRemoteDTO(raw_output=test_raw),
            )
            self.assertTrue(scan_res["ok"])
            self.assertEqual(scan_res["node_id"], "worker-node-1")
            self.assertEqual(len(scan_res["containers"]), 1)
            self.assertEqual(scan_res["containers"][0]["name"], "test-worker")

            # 4. POST /api/orchestration/nodes/scan-all
            all_res = await scan_all_connected_nodes()
            self.assertTrue(all_res["ok"])
            self.assertGreaterEqual(all_res["scanned_count"], 2)

        asyncio.run(_run())

    def test_sync_from_machines_db(self):
        """Verifies synchronization of machine records from PostgreSQL into the discovery scanner."""
        import asyncio

        class MockRecord(dict):
            def __getitem__(self, key):
                return super().__getitem__(key)

        class MockPool:
            async def fetch(self, query):
                return [
                    MockRecord({
                        "id": uuid.UUID("33333333-3333-3333-3333-333333333333"),
                        "name": "Cloud DB Replica",
                        "kind": "server",
                        "host": "198.51.100.99",
                        "port": 2222,
                        "passport": {
                            "os": "Debian 12 Bookworm",
                            "docker_containers": [
                                {
                                    "id": "db00112233",
                                    "name": "postgres-replica",
                                    "image": "postgres:16",
                                    "status": "Up 4 days",
                                    "ports": ["5432/tcp"],
                                }
                            ],
                            "listening_ports": ["tcp LISTEN 0 128 0.0.0.0:5432 0.0.0.0:*"],
                        },
                        "last_seen_at": "2026-11-05T10:00:00Z",
                    })
                ]

        async def _run():
            synced = await self.scanner.sync_from_machines_db(MockPool())
            synced_ids = [n.id for n in synced]
            self.assertIn("33333333-3333-3333-3333-333333333333", synced_ids)

            node = self.scanner.get_node("33333333-3333-3333-3333-333333333333")
            self.assertIsNotNone(node)
            self.assertEqual(node.name, "Cloud DB Replica")
            self.assertEqual(node.host, "198.51.100.99")
            self.assertEqual(node.ssh_port, 2222)
            self.assertEqual(len(node.containers), 1)
            self.assertEqual(node.containers[0].name, "postgres-replica")

        asyncio.run(_run())


class TestHierarchicalDrainLocks(unittest.TestCase):
    def setUp(self):
        from tterm.orchestration.locks import HierarchicalLockManager
        self.lock_mgr = HierarchicalLockManager()
        self.node_id = "node-1"
        self.container_id = "cont-1"
        self.terminal_id = "term-101"

        self.lock_mgr.register_terminal_hierarchy(
            terminal_id=self.terminal_id,
            node_id=self.node_id,
            container_id=self.container_id,
        )

    def test_active_command_detection_and_impact_assessment(self):
        # Register a running command in terminal
        self.lock_mgr.register_command_start(
            terminal_id=self.terminal_id,
            terminal_name="bash-build",
            user_id="user-dev-1",
            user_name="Иван Разработчик",
            command="npm run build",
        )

        # Admin attempts reboot of node-1
        impact = self.lock_mgr.check_disruptive_impact(
            entity_type="node",
            entity_id=self.node_id,
            entity_name="RPi-Cluster-Node-1",
            action="reboot",
        )
        self.assertTrue(impact["has_active_processes"])
        self.assertEqual(impact["active_processes_count"], 1)
        self.assertEqual(impact["active_processes"][0]["command"], "npm run build")

        # Admin starts Graceful Drain Lock
        drain_lock = self.lock_mgr.initiate_drain_lock(
            initiator_id="admin-evgeny",
            initiator_name="Евгений",
            entity_type="node",
            entity_id=self.node_id,
            entity_name="RPi-Cluster-Node-1",
            action="reboot",
            timeout_seconds=180,
        )
        self.assertEqual(drain_lock.state, "draining")

        # Verify child terminal is locked from new command execution
        is_locked, active_lock = self.lock_mgr.is_locked(self.terminal_id)
        self.assertTrue(is_locked)
        self.assertEqual(active_lock.id, drain_lock.id)

        # Developer submits an appeal requesting extension
        appeal = self.lock_mgr.submit_appeal(
            lock_id=drain_lock.id,
            user_id="user-dev-1",
            user_name="Иван Разработчик",
            terminal_id=self.terminal_id,
            reason="Идет критическая компиляция, нужно еще 3 минуты",
        )
        self.assertEqual(appeal.status, "pending")

        # Admin approves appeal -> timeout extended
        initial_timeout = drain_lock.timeout_seconds
        approved = self.lock_mgr.resolve_appeal(appeal.id, approved=True, extend_seconds=180)
        self.assertTrue(approved)
        self.assertEqual(drain_lock.timeout_seconds, initial_timeout + 180)

        # Command completes -> drain lock transitions to completed
        self.lock_mgr.register_command_end(self.terminal_id, exit_code=0)
        self.assertEqual(drain_lock.state, "completed")

        # Terminal is now unlocked
        is_locked_after, _ = self.lock_mgr.is_locked(self.terminal_id)
        self.assertFalse(is_locked_after)


class TestNotifications(unittest.TestCase):
    def setUp(self):
        from tterm.orchestration.notifications import NotificationHub
        self.hub = NotificationHub()

    def test_command_completion_bell_notification(self):
        terminal_id = "term-42"
        user_id = "user-123"

        # User toggles bell on running command
        active = self.hub.toggle_command_bell(terminal_id, user_id)
        self.assertTrue(active)
        self.assertTrue(self.hub.is_bell_active(terminal_id, user_id))

        # Command completes
        dispatched = self.hub.on_command_completed(
            terminal_id=terminal_id,
            terminal_name="build-worker",
            command="docker build -t app:v1 .",
            duration_sec=142,
            exit_code=0,
        )
        self.assertEqual(len(dispatched), 1)
        self.assertIn("docker build", dispatched[0].title)
        self.assertIn("успешно", dispatched[0].body)

        # Check notification list
        notifs = self.hub.get_notifications(user_id)
        self.assertEqual(len(notifs), 1)
        self.assertFalse(notifs[0].read)

        # Mark read
        marked = self.hub.mark_read(user_id, notifs[0].id)
        self.assertTrue(marked)
        self.assertTrue(notifs[0].read)


class TestProjectMembersAndDiscovery(unittest.TestCase):
    def test_default_discovery_contains_live_raspberry_containers(self):
        from tterm.orchestration.discovery import discovery_scanner
        containers = discovery_scanner.get_containers("klim")
        self.assertTrue(len(containers) >= 6)
        names = [c.name for c in containers]
        self.assertIn("tterm-server-tterm-1", names)
        self.assertIn("homeassistant", names)
        self.assertIn("torrserver", names)
        self.assertIn("qbittorrent", names)
        self.assertIn("mosquitto", names)

    def test_custom_container_rename(self):
        from tterm.orchestration.discovery import discovery_scanner
        ok = discovery_scanner.rename_entity("klim", "container", "homeassistant", "Home Assistant Pro")
        self.assertTrue(ok)
        containers = discovery_scanner.get_containers("klim")
        ha = next(c for c in containers if c.name == "homeassistant")
        self.assertEqual(ha.custom_name, "Home Assistant Pro")


class TestGitSyncAndTerminalBranches(unittest.TestCase):
    def setUp(self):
        from tterm.orchestration.git_sync import GitSyncManager, ProjectGitConfigDTO
        self.mgr = GitSyncManager()

    def test_project_git_binding(self):
        from tterm.orchestration.git_sync import ProjectGitConfigDTO
        cfg = ProjectGitConfigDTO(
            project_id="proj-42",
            repo_url="https://github.com/myorg/custom-repo.git",
            provider="github",
            default_branch="main",
            auto_branch_per_terminal=True,
            auto_commit_actions=True,
        )
        saved = self.mgr.set_config(cfg)
        self.assertEqual(saved.repo_url, "https://github.com/myorg/custom-repo.git")
        self.assertTrue(saved.auto_branch_per_terminal)

    def test_terminal_branch_generation_and_auto_commit(self):
        branch_dto = self.mgr.get_or_create_terminal_branch(
            project_id="proj-42",
            terminal_id="term-xyz-123",
            terminal_label="BuildWorker",
            user_name="Evgeny",
        )
        self.assertEqual(branch_dto.branch_name, "term/buildworker-evgeny")
        self.assertTrue(branch_dto.auto_commit)

        # Check setup script
        setup_cmd = self.mgr.build_branch_setup_script(branch_dto.branch_name, "main")
        self.assertIn("term/buildworker-evgeny", setup_cmd)
        self.assertIn("git switch", setup_cmd)

        # Check commit script
        commit_cmd = self.mgr.build_action_commit_command("npm install", "Evgeny", exit_code=0)
        self.assertIn("npm install", commit_cmd)
        self.assertIn("git commit -m", commit_cmd)

        # Record commit
        updated = self.mgr.record_commit("term-xyz-123", "npm install")
        self.assertEqual(updated.commits_count, 1)

    def test_git_create(self):
        res = self.mgr.create_repository("proj-99", "alpha-service", "private", "project")
        self.assertTrue(res["ok"])
        self.assertIn("alpha-service", res["repo_url"])
        self.assertIn("Gakuzi", res["repo_url"])
        self.assertEqual(res["repo_name"], "alpha-service")
        self.assertEqual(res["scope"], "project")

        # Test with terminal binding
        term_res = self.mgr.create_repository("proj-99", "feature-x", "public", "terminal", terminal_id="term-feat-1")
        self.assertTrue(term_res["ok"])
        self.assertIsNotNone(term_res["branch"])
        self.assertIn("term/featurex", term_res["branch"].branch_name)


class TestMultiNodeAndApprovals(unittest.TestCase):
    def test_multi_node_discovery_and_permissions(self):
        from tterm.orchestration.discovery import discovery_scanner
        nodes = discovery_scanner.get_all_nodes()
        self.assertGreaterEqual(len(nodes), 2)
        node_ids = [n["id"] for n in nodes]
        self.assertIn("klim", node_ids)
        self.assertIn("macbook-air", node_ids)

        # Check containers on klim
        klim = next(n for n in nodes if n["id"] == "klim")
        self.assertGreaterEqual(len(klim["containers"]), 6)
        self.assertGreaterEqual(len(klim["ports"]), 5)

        # Set permissions for node
        discovery_scanner.set_node_permissions("macbook-air", ["dev-1", "admin"])
        filtered = discovery_scanner.get_all_nodes(member_id="guest-99")
        self.assertFalse(any(n["id"] == "macbook-air" for n in filtered))

    def test_dangerous_command_interception_and_approval(self):
        from tterm.orchestration.approvals import approval_manager

        # 1. Safe command by subordinate -> allowed immediately
        safe_res = approval_manager.evaluate_command(
            project_id="proj-1",
            terminal_id="term-1",
            terminal_label="Web Shell",
            node_id="klim",
            requester_id="dev-1",
            requester_name="Алексей",
            requester_role="Разработчик",
            command="ls -la /app",
        )
        self.assertTrue(safe_res["allowed"])
        self.assertFalse(safe_res["requires_approval"])

        # 2. Dangerous command by subordinate -> intercepted, requires approval
        danger_res = approval_manager.evaluate_command(
            project_id="proj-1",
            terminal_id="term-1",
            terminal_label="Web Shell",
            node_id="klim",
            requester_id="dev-1",
            requester_name="Алексей",
            requester_role="Разработчик",
            command="rm -rf /var/data",
        )
        self.assertFalse(danger_res["allowed"])
        self.assertTrue(danger_res["requires_approval"])
        self.assertEqual(danger_res["risk_level"], "CRITICAL")
        req_id = danger_res["request_id"]

        # Check pending list
        pending = approval_manager.list_requests("proj-1", status="pending")
        self.assertTrue(any(r["id"] == req_id for r in pending))

        # 3. Manager approves
        res = approval_manager.resolve_request(req_id, "me", "Руководитель", approved=True, comment="Согласовано")
        self.assertEqual(res["status"], "approved")
        self.assertEqual(res["reviewed_by"], "Руководитель")

        # 4. Dangerous command executed by manager directly -> allowed immediately
        admin_res = approval_manager.evaluate_command(
            project_id="proj-1",
            terminal_id="term-1",
            terminal_label="Admin Shell",
            node_id="klim",
            requester_id="me",
            requester_name="Руководитель",
            requester_role="Руководитель проекта",
            command="docker compose down",
        )
        self.assertTrue(admin_res["allowed"])
        self.assertFalse(admin_res["requires_approval"])

    def test_aeza_client_plans_and_pricing(self):
        from tterm.orchestration.aeza_cloud import aeza_client
        try:
            acc = aeza_client.get_account_info()
            self.assertIn("email", acc)
            self.assertEqual(acc["currency"], "RUB")
            self.assertGreater(acc["balance_rub"], 0)

            # Check SSH keys
            keys = aeza_client.list_ssh_keys()
            self.assertGreaterEqual(len(keys), 2)
            key_names = [k.get("name") for k in keys]
            self.assertTrue(any("MacBook" in str(n) for n in key_names))

            # Check hourly plans
            plans = aeza_client.list_vps_plans(hourly_only=True)
            self.assertGreater(len(plans), 0)
            cheapest = plans[0]
            self.assertIsNotNone(cheapest["hour_price_rub"])
            self.assertLessEqual(cheapest["hour_price_rub"], 5.0)
        except RuntimeError as e:
            # Aeza API live endpoint may be rate-limited or blip over SSL
            self.assertIn("Aeza", str(e))

    def test_aeza_user_vault_isolation_and_api(self):
        """Verifies that Aeza credentials are strictly isolated per user and APIs behave safely."""
        from tterm.orchestration.aeza_cloud import (
            AezaKeyStore,
            get_user_key,
            save_user_key,
            delete_user_key,
            get_aeza_client,
            mask_api_key,
        )
        from tterm.orchestration.api import (
            get_aeza_config,
            save_aeza_config,
            delete_aeza_config,
            get_aeza_account,
            get_aeza_vps_plans,
            order_aeza_test_vps,
            list_aeza_services,
            AezaConfigDTO,
            AezaOrderDTO,
        )

        user_alice = "alice-vault-1"
        user_bob = "bob-vault-2"

        # Clean any preexisting keys
        delete_user_key(user_alice)
        delete_user_key(user_bob)

        # 1. Initially Alice has no key
        self.assertIsNone(get_user_key(user_alice))
        client_alice = get_aeza_client(user_id=user_alice)
        self.assertFalse(client_alice.is_configured)
        with self.assertRaises(RuntimeError) as ctx:
            client_alice.get_account_info()
        self.assertIn("Aeza API key is not configured", str(ctx.exception))

        # 2. Save Alice's key
        save_user_key(user_alice, "1404_mock_alice_key_secret_12345")
        self.assertEqual(get_user_key(user_alice), "1404_mock_alice_key_secret_12345")
        self.assertEqual(mask_api_key("1404_mock_alice_key_secret_12345"), "1404_m...2345")

        # 3. Bob STILL has no key (Strict user isolation!)
        self.assertIsNone(get_user_key(user_bob))
        client_bob = get_aeza_client(user_id=user_bob)
        self.assertFalse(client_bob.is_configured)

        # 4. Delete Alice's key
        deleted = delete_user_key(user_alice)
        self.assertTrue(deleted)
        self.assertIsNone(get_user_key(user_alice))

        # 5. Test Router Endpoints
        import asyncio
        async def _test_endpoints():
            # GET config when not configured
            cfg_res = await get_aeza_config(user_id=user_bob)
            self.assertTrue(cfg_res["ok"])
            self.assertFalse(cfg_res["configured"])
            self.assertIsNone(cfg_res["masked_key"])

            # Account request without key returns error without 500
            acc_res = await get_aeza_account(user_id=user_bob)
            self.assertFalse(acc_res["ok"])
            self.assertFalse(acc_res["configured"])
            self.assertIn("API-ключ", acc_res["error"])

            # Plans request without key returns empty list and error
            plans_res = await get_aeza_vps_plans(user_id=user_bob)
            self.assertFalse(plans_res["ok"])
            self.assertEqual(plans_res["plans"], [])

            # Services request without key returns empty list
            srv_res = await list_aeza_services(user_id=user_bob)
            self.assertFalse(srv_res["ok"])
            self.assertEqual(srv_res["services"], [])

            # Order request without key fails gracefully
            order_res = await order_aeza_test_vps(AezaOrderDTO(user_id=user_bob))
            self.assertFalse(order_res["ok"])
            self.assertIn("API-ключ", order_res["error"])

            # DELETE config
            del_res = await delete_aeza_config(user_id=user_bob)
            self.assertTrue(del_res["ok"])

        asyncio.run(_test_endpoints())

    def test_github_app_auth_and_management(self):
        from tterm.orchestration.github_app import github_manager
        # Initially not authenticated
        github_manager.disconnect()
        status = github_manager.get_auth_status()
        self.assertFalse(status["is_authenticated"])

        # Configure OAuth App
        github_manager.configure_oauth_app("test_client_id_123", "test_secret_456")
        url = github_manager.get_auth_url("http://192.168.0.6:8290/oauth/callback")
        self.assertIn("client_id=test_client_id_123", url)
        self.assertIn("scope=repo", url)

        # Connect with mock token / session
        github_manager._auth = {
            "is_authenticated": True,
            "auth_type": "oauth_token",
            "username": "EvgenyKlimov",
            "name": "Евгений Климов",
            "email": "eklimov84@gmail.com",
            "avatar_url": "https://avatars.githubusercontent.com/u/12345",
            "html_url": "https://github.com/EvgenyKlimov",
            "public_repos": 14,
            "scopes": ["repo", "user", "workflow"],
            "access_token": "ghp_MockSecretTokenForTesting1234567890",
            "connected_at": "2026-11-05T09:00:00Z",
        }
        st = github_manager.get_auth_status()
        self.assertTrue(st["is_authenticated"])
        self.assertEqual(st["username"], "EvgenyKlimov")
        self.assertEqual(st["masked_token"], "ghp_...7890")

        # Test terminal git setup script generation
        setup_script = github_manager.get_terminal_git_setup()
        self.assertIn("user.name \"Евгений Климов\"", setup_script)
        self.assertIn("user.email \"eklimov84@gmail.com\"", setup_script)
        self.assertIn("EvgenyKlimov", setup_script)

        # Test GitSyncManager auto-identity
        from tterm.orchestration.git_sync import git_sync_manager
        commit_cmd = git_sync_manager.build_action_commit_command("cargo build --release")
        self.assertIn("Евгений Климов", commit_cmd)

        user_repo_res = git_sync_manager.create_repository("proj-user", "my-service", "private", "project")
        self.assertIn("EvgenyKlimov/my-service.git", user_repo_res["repo_url"])

        # Disconnect and verify clean state
        github_manager.disconnect()
        self.assertFalse(github_manager.is_authenticated())

    def test_ai_agent_sessions_and_scoped_keys(self):
        from tterm.orchestration.ai_sessions import ai_agent_manager

        # 1. Generate Key for AI Agent restricted to 1 terminal
        key_res = ai_agent_manager.generate_agent_key(
            project_id="default-project",
            allowed_terminals=["c56de979-35aa-4828-9056-3dbaab629e0d"],
            agent_name="Antigravity Test Agent",
            role="container_developer",
            ai_mode="guard",
        )
        self.assertTrue(key_res["ok"])
        token = key_res["key"]["token"]
        self.assertTrue(token.startswith("tt_ai_"))
        self.assertEqual(key_res["connection_json"]["allowed_terminal"], "c56de979-35aa-4828-9056-3dbaab629e0d")
        self.assertIn("mcpServers", key_res["mcp_config"])

        # 2. Agent connects via MCP and registers session
        sess = ai_agent_manager.register_or_ping(
            token=token,
            session_id="sess-test-ai-1",
            agent_name="Antigravity Test Agent",
            terminal_id="c56de979-35aa-4828-9056-3dbaab629e0d",
            command="ls -la",
        )
        self.assertEqual(sess["status"], "ONLINE")
        self.assertEqual(sess["current_command"], "ls -la")

        # 3. Validate access to allowed terminal -> OK
        ok, err = ai_agent_manager.validate_action(token, "sess-test-ai-1", "c56de979-35aa-4828-9056-3dbaab629e0d", "git status")
        self.assertTrue(ok)

        # 4. Validate access to forbidden terminal -> DENIED
        ok_bad, err_bad = ai_agent_manager.validate_action(token, "sess-test-ai-1", "forbidden-term-999", "git status")
        self.assertFalse(ok_bad)
        self.assertIn("c56de979-35aa-4828-9056-3dbaab629e0d", err_bad)

        # 5. Dangerous command in guard mode -> INTERCEPTED
        ok_danger, err_danger = ai_agent_manager.validate_action(token, "sess-test-ai-1", "c56de979-35aa-4828-9056-3dbaab629e0d", "rm -rf /")
        self.assertFalse(ok_danger)
        self.assertIn("Опасная команда", err_danger)

        # 6. Admin blocks agent session dynamically
        upd = ai_agent_manager.update_session_permissions("sess-test-ai-1", blocked=True)
        self.assertTrue(upd["blocked"])
        ok_block, err_block = ai_agent_manager.validate_action(token, "sess-test-ai-1", "c56de979-35aa-4828-9056-3dbaab629e0d", "uptime")
        self.assertFalse(ok_block)
        self.assertIn("заблокирован", err_block)


class TestFileUploadAndSFTP(unittest.TestCase):
    def setUp(self):
        from tterm.orchestration.file_upload import FileUploadGateway
        import tempfile
        self.temp_root = tempfile.mkdtemp()
        self.gateway = FileUploadGateway(default_upload_root=self.temp_root)

    def tearDown(self):
        import shutil
        shutil.rmtree(self.temp_root, ignore_errors=True)

    def test_save_uploaded_file_default_path(self):
        res = self.gateway.save_uploaded_file(
            terminal_id="term-123",
            filename="test_script.sh",
            content_bytes=b"echo hello world\n",
        )
        self.assertEqual(res["filename"], "test_script.sh")
        self.assertEqual(res["size"], 17)
        self.assertTrue(os.path.exists(res["path"]))
        with open(res["path"], "rb") as f:
            self.assertEqual(f.read(), b"echo hello world\n")

    def test_save_uploaded_file_custom_dir(self):
        import tempfile
        custom_dir = tempfile.mkdtemp()
        try:
            res = self.gateway.save_uploaded_file(
                terminal_id="term-123",
                filename="../malicious/../../config.json",
                content_bytes=b'{"key": 42}',
                target_dir=custom_dir,
            )
            # Path traversal must be stripped to basename
            self.assertEqual(res["filename"], "config.json")
            self.assertEqual(res["target_dir"], str(Path(custom_dir).resolve()))
            self.assertTrue(os.path.exists(res["path"]))
        finally:
            import shutil
            shutil.rmtree(custom_dir, ignore_errors=True)

    def test_get_sftp_credentials(self):
        creds = self.gateway.get_sftp_credentials("term-456", "node-pi-1")
        self.assertEqual(creds["host"], "192.168.0.6")
        self.assertEqual(creds["port"], 22)
        self.assertEqual(creds["sftp_url"], "sftp://pi@192.168.0.6:22")
        self.assertEqual(creds["default_dir"], "/home/pi/tterm-server")
        self.assertIn("web_dav_hint", creds)


class TestNotificationsBot(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        from tterm.orchestration.notifications_bot import NotificationsBot
        self.bot = NotificationsBot()

    async def test_device_registration_and_list(self):
        dev1 = self.bot.register_device("dev-mac-1", "MacBook Pro", "user_1")
        dev2 = self.bot.register_device("dev-iphone-1", "iPhone 15 Safari", "user_1")
        self.assertEqual(dev1.device_id, "dev-mac-1")
        self.assertEqual(dev2.name, "iPhone 15 Safari")

        devices = self.bot.list_devices("user_1")
        self.assertEqual(len(devices), 2)
        dev_ids = {d.device_id for d in devices}
        self.assertIn("dev-mac-1", dev_ids)
        self.assertIn("dev-iphone-1", dev_ids)

    async def test_watch_process_and_completion_broadcast(self):
        # Subscribe an SSE client queue (simulating mobile client)
        sse_queue = self.bot.subscribe()

        # Watch a process
        watch = self.bot.watch_process(
            terminal_id="term-101",
            command="docker build -t app:latest .",
            user_id="user_1",
            block_id="s105",
            initiator_device_id="dev-mac-1",
        )
        self.assertEqual(watch.terminal_id, "term-101")
        self.assertEqual(watch.block_id, "s105")
        self.assertEqual(watch.status, "running")

        # Active watches check
        active = self.bot.get_active_watches("user_1")
        self.assertEqual(len(active), 1)
        self.assertEqual(active[0].id, watch.id)

        # Broadcast completion
        resolved = await self.bot.broadcast_command_completed(
            terminal_id="term-101",
            command="docker build -t app:latest .",
            exit_code=0,
            duration_sec=42.5,
            block_id="s105",
            user_id="user_1",
            initiator_device_id="dev-mac-1",
        )
        self.assertEqual(len(resolved), 1)
        self.assertEqual(resolved[0].status, "completed")
        self.assertEqual(resolved[0].duration_sec, 42.5)

        # Active watches should now be empty
        active_after = self.bot.get_active_watches("user_1")
        self.assertEqual(len(active_after), 0)

        # The SSE subscriber queue should have received both watch_started and command_completed
        events = []
        while not sse_queue.empty():
            events.append(sse_queue.get_nowait())
        self.assertGreaterEqual(len(events), 2)
        event_types = [e["type"] for e in events]
        self.assertIn("watch_started", event_types)
        self.assertIn("command_completed", event_types)

        completion_ev = next(e for e in events if e["type"] == "command_completed")
        self.assertEqual(completion_ev["data"]["terminal_id"], "term-101")
        self.assertEqual(completion_ev["data"]["command"], "docker build -t app:latest .")
        self.assertEqual(completion_ev["data"]["duration_sec"], 42.5)
        self.assertEqual(completion_ev["data"]["exit_code"], 0)

        # Cleanup
        self.bot.unsubscribe(sse_queue)




class TestMachineProjectsAndTerminalEnvironments(unittest.TestCase):
    def setUp(self):
        from tterm.orchestration.machines_projects import MachineProjectManager
        self.mgr = MachineProjectManager()

    def test_preload_defaults(self):
        """Verifies klim and macbook-air are preloaded and bound to default-project."""
        klim_projects = self.mgr.get_projects_for_machine("klim")
        self.assertGreaterEqual(len(klim_projects), 1)
        self.assertTrue(any(p["project_id"] == "default-project" for p in klim_projects))

        mac_projects = self.mgr.get_projects_for_machine("macbook-air")
        self.assertGreaterEqual(len(mac_projects), 1)
        self.assertTrue(any(p["project_id"] == "default-project" for p in mac_projects))

        default_machines = self.mgr.get_machines_for_project("default-project")
        self.assertIn("klim", default_machines)
        self.assertIn("macbook-air", default_machines)

    def test_bind_machine_to_multiple_projects(self):
        """Verifies a single machine (klim) can be bound to multiple projects (Many-to-Many)."""
        # Bind klim to project-alpha and project-beta
        self.mgr.bind_machine_to_project("klim", "project-alpha", "Alpha Backend")
        self.mgr.bind_machine_to_project("klim", "project-beta", "Beta Frontend")

        projects = self.mgr.get_projects_for_machine("klim")
        project_ids = [p["project_id"] for p in projects]
        self.assertIn("project-alpha", project_ids)
        self.assertIn("project-beta", project_ids)
        self.assertIn("default-project", project_ids)

        alpha_machines = self.mgr.get_machines_for_project("project-alpha")
        self.assertIn("klim", alpha_machines)

        beta_machines = self.mgr.get_machines_for_project("project-beta")
        self.assertIn("klim", beta_machines)

        # Unbind klim from default-project
        removed = self.mgr.unbind_machine_from_project("klim", "default-project")
        self.assertTrue(removed)
        remaining = [p["project_id"] for p in self.mgr.get_projects_for_machine("klim")]
        self.assertNotIn("default-project", remaining)
        self.assertIn("project-alpha", remaining)
        self.assertIn("project-beta", remaining)

    def test_terminal_isolation_and_branches(self):
        """
        Verifies terminal isolation:
        Terminal 1 is bound to project-alpha with branch feat/alpha-term1.
        Terminal 2 is bound to project-beta with branch feat/beta-term2.
        """
        # Ensure machine klim is bound to both projects
        self.mgr.bind_machine_to_project("klim", "project-alpha", "Project Alpha")
        self.mgr.bind_machine_to_project("klim", "project-beta", "Project Beta")

        # 1. Bind Terminal 1 to project-alpha
        ctx1 = self.mgr.set_terminal_project(
            terminal_id="term-alpha-1",
            project_id="project-alpha",
            branch_name="feat/alpha-term1",
            machine_id="klim",
        )
        self.assertEqual(ctx1["project_id"], "project-alpha")
        self.assertEqual(ctx1["branch_name"], "feat/alpha-term1")
        self.assertEqual(ctx1["machine_id"], "klim")
        self.assertTrue(ctx1["auto_commit"])
        self.assertIn("sftp://klim:22/projects/project-alpha", ctx1["ftp_sftp_endpoint"])

        # 2. Bind Terminal 2 to project-beta
        ctx2 = self.mgr.set_terminal_project(
            terminal_id="term-beta-2",
            project_id="project-beta",
            branch_name="feat/beta-term2",
            machine_id="klim",
        )
        self.assertEqual(ctx2["project_id"], "project-beta")
        self.assertEqual(ctx2["branch_name"], "feat/beta-term2")
        self.assertEqual(ctx2["machine_id"], "klim")
        self.assertTrue(ctx2["auto_commit"])
        self.assertIn("sftp://klim:22/projects/project-beta", ctx2["ftp_sftp_endpoint"])

        # 3. Retrieve terminal project context via getter
        read_ctx1 = self.mgr.get_terminal_project_context("term-alpha-1")
        self.assertEqual(read_ctx1["project_id"], "project-alpha")
        self.assertEqual(read_ctx1["branch_name"], "feat/alpha-term1")
        self.assertEqual(read_ctx1["machine_id"], "klim")
        self.assertTrue(read_ctx1["auto_commit"])

        read_ctx2 = self.mgr.get_terminal_project_context("term-beta-2")
        self.assertEqual(read_ctx2["project_id"], "project-beta")
        self.assertEqual(read_ctx2["branch_name"], "feat/beta-term2")
        self.assertEqual(read_ctx2["machine_id"], "klim")
        self.assertTrue(read_ctx2["auto_commit"])

        # 4. Strict isolation: list_terminals_by_project must not cross-contaminate
        alpha_terminals = self.mgr.list_terminals_by_project("project-alpha")
        alpha_ids = [t["terminal_id"] for t in alpha_terminals]
        self.assertIn("term-alpha-1", alpha_ids)
        self.assertNotIn("term-beta-2", alpha_ids)

        beta_terminals = self.mgr.list_terminals_by_project("project-beta")
        beta_ids = [t["terminal_id"] for t in beta_terminals]
        self.assertIn("term-beta-2", beta_ids)
        self.assertNotIn("term-alpha-1", beta_ids)

    def test_default_branch_generation(self):
        """Verifies default branch name generation when branch_name is not provided."""
        ctx = self.mgr.set_terminal_project("c56de979-35aa-4828-9056-3dbaab629e0d", "project-alpha")
        self.assertTrue(ctx["branch_name"].startswith("terminal/"))
        self.assertIn(ctx["branch_name"], ["terminal/c56de979", "terminal/c56de979-"])

    def test_api_routes_integration(self):
        """Verifies FastAPI route handlers for machines and terminals."""
        import asyncio
        from tterm.orchestration.api import (
            get_machine_projects,
            bind_machine_to_project_endpoint,
            unbind_machine_from_project_endpoint,
            get_terminal_project_context_endpoint,
            set_terminal_project_context_endpoint,
            get_project_terminal_branches_endpoint,
            MachineProjectBindDTO,
            TerminalProjectContextDTO,
        )
        from tterm.orchestration.machines_projects import machine_project_manager

        async def _run():
            machine_project_manager.reset()

            # 1. GET /api/orchestration/machines/{machine_id}/projects
            res1 = await get_machine_projects("klim")
            self.assertTrue(res1["ok"])
            self.assertTrue(any(p["project_id"] == "default-project" for p in res1["projects"]))

            # 2. POST /api/orchestration/machines/{machine_id}/projects
            bind_res = await bind_machine_to_project_endpoint(
                "klim",
                MachineProjectBindDTO(project_id="project-alpha", project_name="Alpha Service"),
            )
            self.assertTrue(bind_res["ok"])
            p_ids = [p["project_id"] for p in bind_res["projects"]]
            self.assertIn("project-alpha", p_ids)

            # 3. POST /api/orchestration/terminals/{terminal_id}/project-context
            set_ctx = await set_terminal_project_context_endpoint(
                "term-api-101",
                TerminalProjectContextDTO(project_id="project-alpha", branch_name="feat/alpha-api"),
            )
            self.assertTrue(set_ctx["ok"])
            self.assertEqual(set_ctx["branch_name"], "feat/alpha-api")
            self.assertEqual(set_ctx["project_id"], "project-alpha")

            # 4. GET /api/orchestration/terminals/{terminal_id}/project-context
            get_ctx = await get_terminal_project_context_endpoint("term-api-101")
            self.assertTrue(get_ctx["ok"])
            self.assertEqual(get_ctx["branch_name"], "feat/alpha-api")
            self.assertEqual(get_ctx["project_id"], "project-alpha")
            self.assertEqual(get_ctx["machine_id"], "klim")
            self.assertTrue(get_ctx["auto_commit"])

            # 5. GET /api/orchestration/projects/{project_id}/terminal-branches
            branches_res = await get_project_terminal_branches_endpoint("project-alpha")
            self.assertTrue(branches_res["ok"])
            self.assertEqual(branches_res["project_id"], "project-alpha")
            self.assertTrue(any(t["terminal_id"] == "term-api-101" for t in branches_res["terminals"]))

            # 6. DELETE /api/orchestration/machines/{machine_id}/projects/{project_id}
            del_res = await unbind_machine_from_project_endpoint("klim", "project-alpha")
            self.assertTrue(del_res["ok"])
            self.assertTrue(del_res["removed"])

        asyncio.run(_run())


class TestCloudDeploy(unittest.TestCase):
    """Unit and Integration Tests for One-Click VPS Deploy & Migration Engine."""

    def test_vps_deploy_engine_simulation_pipeline(self):
        """Verifies full 7-step deployment lifecycle in simulation/dry-run mode."""
        import asyncio
        from tterm.orchestration.cloud_deploy import VpsDeployEngine

        engine = VpsDeployEngine(
            host="192.168.10.50",
            port=22,
            user="root",
            admin_email="superadmin@tterm.cloud",
            branch="feature/mcp-ai-orchestration-v1",
            simulation_mode=True,
        )

        self.assertEqual(engine.status, "pending")
        self.assertEqual(engine.progress_pct, 0)
        self.assertEqual(engine.current_step, 1)

        # Run pipeline
        res = asyncio.run(engine.run_pipeline())

        self.assertEqual(res["status"], "completed")
        self.assertEqual(res["progress_pct"], 100)
        self.assertEqual(res["current_step"], 7)
        self.assertEqual(res["result_url"], "http://192.168.10.50:8290")
        self.assertIsNotNone(res["verification_code"])
        self.assertEqual(len(res["verification_code"]), 6)
        self.assertTrue(res["verification_code"].isdigit())
        self.assertGreaterEqual(len(res["logs"]), 10)

        # Check all 7 steps completed
        steps = res["steps_summary"]
        self.assertEqual(len(steps), 7)
        for s in range(1, 8):
            self.assertIn(s, steps)
            self.assertEqual(steps[s]["status"], "completed", f"Step {s} should be completed")
            self.assertTrue(bool(steps[s]["details"]))

    def test_vps_deploy_engine_failure_handling(self):
        """Verifies graceful error capture and status update on unreachable host."""
        import asyncio
        from tterm.orchestration.cloud_deploy import VpsDeployEngine

        engine = VpsDeployEngine(
            host="192.0.2.1",  # Non-routable TEST-NET-1 IP
            port=2222,
            user="root",
            simulation_mode=False,
        )

        res = asyncio.run(engine.run_pipeline())
        self.assertEqual(res["status"], "failed")
        self.assertIsNotNone(res["error"])
        self.assertEqual(res["steps_summary"][1]["status"], "failed")
        self.assertTrue(any("❌ ОШИБКА" in log for log in res["logs"]))

    def test_cloud_deploy_manager_and_email(self):
        """Verifies CloudDeployManager tracking and test email generation."""
        import asyncio
        from tterm.orchestration.cloud_deploy import cloud_deploy_manager

        engine = cloud_deploy_manager.create_deployment(
            host="10.20.30.40",
            admin_email="devops@corp.local",
            simulation_mode=True,
        )
        task_id = engine.task_id

        # Verify task registration
        retrieved = cloud_deploy_manager.get_task(task_id)
        self.assertIsNotNone(retrieved)
        self.assertEqual(retrieved.host, "10.20.30.40")

        all_tasks = cloud_deploy_manager.list_tasks()
        self.assertTrue(any(t["task_id"] == task_id for t in all_tasks))

        # Test verification email dispatch
        email_res = asyncio.run(cloud_deploy_manager.test_email("admin@test.ru", host="10.20.30.40"))
        self.assertTrue(email_res["ok"])
        self.assertEqual(email_res["email"], "admin@test.ru")
        self.assertEqual(len(email_res["code"]), 6)
        self.assertTrue(email_res["code"].isdigit())

    def test_cloud_deploy_api_routes(self):
        """Verifies FastAPI endpoints for cloud deploy orchestration."""
        import asyncio
        from tterm.orchestration.api import (
            start_cloud_deploy,
            get_cloud_deploy_status,
            list_cloud_deploy_tasks,
            test_cloud_deploy_email,
            CloudDeployStartDTO,
            CloudDeployTestEmailDTO,
        )

        async def _run():
            # 1. Start Deploy
            payload = CloudDeployStartDTO(
                host="172.16.0.99",
                admin_email="api-test@tterm.local",
                branch="main",
                simulation_mode=True,
            )
            start_res = await start_cloud_deploy(payload)
            self.assertTrue(start_res["ok"])
            task_id = start_res["task_id"]
            self.assertTrue(bool(task_id))

            # Allow simulation pipeline to progress
            await asyncio.sleep(0.5)

            # 2. Get Status
            status_res = await get_cloud_deploy_status(task_id)
            self.assertTrue(status_res["ok"])
            task = status_res["task"]
            self.assertEqual(task["task_id"], task_id)
            self.assertEqual(task["host"], "172.16.0.99")
            self.assertIn(task["status"], ["running", "completed"])

            # 3. List Tasks
            list_res = await list_cloud_deploy_tasks()
            self.assertTrue(list_res["ok"])
            self.assertTrue(any(t["task_id"] == task_id for t in list_res["tasks"]))

            # 4. Test Email Endpoint
            email_payload = CloudDeployTestEmailDTO(email="security@cloud.net", host="172.16.0.99")
            email_res = await test_cloud_deploy_email(email_payload)
            self.assertTrue(email_res["ok"])
            self.assertEqual(email_res["email"], "security@cloud.net")
            self.assertEqual(len(email_res["code"]), 6)

        asyncio.run(_run())


class TestEncryptedVaultAndTelegram(unittest.TestCase):
    def test_encrypted_vault_aes_gcm(self):
        """Verifies AES-256-GCM encryption, decryption, and masking in EncryptedUserVault."""
        import asyncio
        from tterm.orchestration.encrypted_vault import EncryptedUserVault, mask_secret

        vault = EncryptedUserVault()

        async def _run():
            secrets_data = {
                "github_token": "ghp_secureSecretToken123456789",
                "aeza_api_key": "1404_abc123xyz987654",
                "telegram_bot_token": "123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11",
                "telegram_chat_id": "987654321",
                "telegram_enabled": True,
            }
            saved = await vault.save_secrets("test-user-vault", secrets_data)
            self.assertEqual(saved["github_token"], "ghp_secureSecretToken123456789")

            loaded = await vault.load_secrets("test-user-vault")
            self.assertEqual(loaded["aeza_api_key"], "1404_abc123xyz987654")
            self.assertEqual(loaded["telegram_chat_id"], "987654321")

            overview = await vault.get_masked_overview("test-user-vault")
            self.assertTrue(overview["ok"])
            self.assertTrue(overview["github"]["configured"])
            self.assertTrue(overview["github"]["masked_token"].startswith("ghp_"))
            self.assertTrue(overview["aeza"]["configured"])
            self.assertTrue(overview["telegram"]["configured"])
            self.assertEqual(overview["telegram"]["chat_id"], "987654321")

        asyncio.run(_run())

    def test_cloud_deploy_cancel(self):
        """Verifies cancelling a running deployment task."""
        from tterm.orchestration.cloud_deploy import cloud_deploy_manager
        engine = cloud_deploy_manager.create_deployment(host="10.0.0.1", simulation_mode=True)
        engine.status = "running"
        ok = cloud_deploy_manager.cancel_task(engine.task_id)
        self.assertTrue(ok)
        self.assertEqual(engine.status, "failed")
        self.assertIn("прервано", engine.error)


if __name__ == "__main__":
    unittest.main()
