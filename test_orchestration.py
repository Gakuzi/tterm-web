#!/usr/bin/env python3
"""
Unit and Integration Tests for Hierarchical RBAC and Container Orchestration Engine.
"""
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


if __name__ == "__main__":
    unittest.main()
