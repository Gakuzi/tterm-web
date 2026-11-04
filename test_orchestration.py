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


if __name__ == "__main__":
    unittest.main()
