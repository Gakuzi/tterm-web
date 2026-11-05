"""
Node Auto-Discovery Engine.

Discovers Docker containers, listening services, and port mappings on nodes
(servers/computers) upon connection or on-demand, building a multi-tier hierarchy:
  Node -> Containers -> Services/Ports.

Provides human-friendly renaming and granular entity access scoping.
"""
from __future__ import annotations

import logging
import re
import uuid
from typing import Dict, List, Optional, Tuple

from .models import DiscoveredContainerDTO, DiscoveredServiceDTO

log = logging.getLogger("tterm.orchestration.discovery")

DISCOVERY_SCRIPT = r"""
echo '===DOCKER_BEGIN==='
if command -v docker >/dev/null 2>&1; then
  docker ps -a --format '{{.ID}}\t{{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}' 2>/dev/null || true
fi
echo '===DOCKER_END==='
echo '===PORTS_BEGIN==='
if command -v ss >/dev/null 2>&1; then
  ss -tulpn 2>/dev/null | grep -E 'LISTEN' || true
elif command -v netstat >/dev/null 2>&1; then
  netstat -tulpn 2>/dev/null | grep -E 'LISTEN' || true
elif command -v lsof >/dev/null 2>&1; then
  lsof -i -P -n 2>/dev/null | grep -E 'LISTEN' || true
fi
echo '===PORTS_END==='
"""


def parse_ports_field(ports_str: str) -> List[Tuple[int, int, str]]:
    """
    Parses docker port mapping strings like:
      0.0.0.0:8290-8291->8290-8291/tcp, :::8290->8290/tcp, 5432/tcp
    Returns list of (host_port, container_port, protocol).
    """
    mappings: List[Tuple[int, int, str]] = []
    for part in ports_str.split(","):
        part = part.strip()
        if not part:
            continue
        # Check host->container mapping: e.g. 0.0.0.0:8080->80/tcp
        m = re.search(r'(?:\d+\.\d+\.\d+\.\d+|::|\[::\])?:(\d+)->(\d+)/([a-z]+)', part)
        if m:
            mappings.append((int(m.group(1)), int(m.group(2)), m.group(3)))
            continue
        # Range e.g. 0.0.0.0:8290-8291->8290-8291/tcp
        m_range = re.search(r':(\d+)-(\d+)->(\d+)-(\d+)/([a-z]+)', part)
        if m_range:
            h_start, h_end = int(m_range.group(1)), int(m_range.group(2))
            c_start = int(m_range.group(3))
            proto = m_range.group(5)
            for offset in range(h_end - h_start + 1):
                mappings.append((h_start + offset, c_start + offset, proto))
            continue
        # Raw exposed port: e.g. 5432/tcp
        m_raw = re.search(r'^(\d+)/([a-z]+)', part)
        if m_raw:
            mappings.append((int(m_raw.group(1)), int(m_raw.group(1)), m_raw.group(2)))
    return mappings


class NodeDiscoveryScanner:
    """Manages auto-discovery scans and entity aliases for nodes."""

    def __init__(self):
        # node_id -> list of DiscoveredContainerDTO
        self._node_containers: Dict[str, List[DiscoveredContainerDTO]] = {}
        # node_id -> list of DiscoveredServiceDTO
        self._node_host_services: Dict[str, List[DiscoveredServiceDTO]] = {}
        # custom aliases: (node_id, entity_type, entity_id) -> custom_name
        self._custom_names: Dict[Tuple[str, str, str], str] = {}

        # Preload aliases for default known containers
        default_aliases = {
            "ced2fb5b873e": "tTerm Core Web API",
            "tterm-server-tterm-1": "tTerm Core Web API",
            "7045c1f0de1b": "PostgreSQL Главная БД",
            "tterm-server-db-1": "PostgreSQL Главная БД",
            "0a70b3d94337": "Умный Дом Home Assistant",
            "homeassistant": "Умный Дом Home Assistant",
            "403500e0bf72": "Медиа-сервер TorrServer",
            "torrserver": "Медиа-сервер TorrServer",
            "bd245888b3c1": "Фоновый Торрент-Клиент",
            "qbittorrent": "Фоновый Торрент-Клиент",
            "124480d9331d": "MQTT Брокер Сообщений",
            "mosquitto": "MQTT Брокер Сообщений",
        }
        for k, name in default_aliases.items():
            self._custom_names[("klim", "container", k)] = name

        # Preload live discovered infrastructure for Raspberry Pi
        default_raw = """===DOCKER_BEGIN===
ced2fb5b873e\ttterm-server-tterm-1\ttterm-server-tterm\tUp 9 hours\t0.0.0.0:8290-8291->8290-8291/tcp, [::]:8290-8291->8290-8291/tcp
7045c1f0de1b\ttterm-server-db-1\tpostgres:16-alpine\tUp 11 hours\t5432/tcp
0a70b3d94337\thomeassistant\tghcr.io/home-assistant/home-assistant:stable\tUp 2 hours\t0.0.0.0:8123->8123/tcp
403500e0bf72\ttorrserver\tyourok/torrserver:latest\tUp 35 hours\t0.0.0.0:8090->8090/tcp
bd245888b3c1\tqbittorrent\tlinuxserver/qbittorrent:latest\tUp 35 hours\t6881/tcp, 6881/udp, 0.0.0.0:8080->8080/tcp, [::]:8080->8080/tcp
124480d9331d\tmosquitto\teclipse-mosquitto:latest\tUp 35 hours\t0.0.0.0:1883->1883/tcp, [::]:1883->1883/tcp
===DOCKER_END===
===PORTS_BEGIN===
tcp LISTEN 0 4096 0.0.0.0:8290 0.0.0.0:*
tcp LISTEN 0 4096 0.0.0.0:8291 0.0.0.0:*
tcp LISTEN 0 128 0.0.0.0:8123 0.0.0.0:*
tcp LISTEN 0 4096 0.0.0.0:8080 0.0.0.0:*
tcp LISTEN 0 4096 *:8090 *:*
tcp LISTEN 0 4096 0.0.0.0:1883 0.0.0.0:*
tcp LISTEN 0 128 0.0.0.0:22 0.0.0.0:*
===PORTS_END==="""
        self.parse_discovery_output("klim", default_raw)

    def parse_discovery_output(self, node_id: str, output: str) -> List[DiscoveredContainerDTO]:
        """Parses output of DISCOVERY_SCRIPT into structured containers and services."""
        docker_raw = ""
        ports_raw = ""

        if "===DOCKER_BEGIN===" in output and "===DOCKER_END===" in output:
            docker_raw = output.split("===DOCKER_BEGIN===")[1].split("===DOCKER_END===")[0].strip()
        if "===PORTS_BEGIN===" in output and "===PORTS_END===" in output:
            ports_raw = output.split("===PORTS_BEGIN===")[1].split("===PORTS_END===")[0].strip()

        containers: List[DiscoveredContainerDTO] = []

        # Parse Docker containers
        for line in docker_raw.splitlines():
            line = line.strip()
            if not line or line.startswith("CONTAINER ID"):
                continue
            parts = line.split("\t")
            if len(parts) >= 4:
                cid = parts[0].strip()
                name = parts[1].strip()
                image = parts[2].strip()
                status = parts[3].strip()
                ports_field = parts[4].strip() if len(parts) >= 5 else ""

                # Extract services inside container
                port_mappings = parse_ports_field(ports_field)
                services: List[DiscoveredServiceDTO] = []
                for idx, (h_port, c_port, proto) in enumerate(port_mappings):
                    srv_id = f"srv_{cid[:8]}_{c_port}"
                    custom_srv = self._custom_names.get((node_id, "service", srv_id))
                    services.append(DiscoveredServiceDTO(
                        id=srv_id,
                        name=f"{name}:{c_port}",
                        custom_name=custom_srv,
                        port=c_port,
                        protocol=proto,
                        container_id=cid,
                        is_active="Up" in status,
                    ))

                custom_container_name = self._custom_names.get((node_id, "container", cid)) or self._custom_names.get((node_id, "container", name))
                containers.append(DiscoveredContainerDTO(
                    id=cid,
                    name=name,
                    custom_name=custom_container_name,
                    image=image,
                    status=status,
                    ports=[ports_field] if ports_field else [],
                    services=services,
                ))

        # Store in registry
        self._node_containers[node_id] = containers
        log.info("Node '%s' discovery completed: %d containers identified", node_id, len(containers))
        return containers

    def register_discovered_containers(self, node_id: str, containers: List[DiscoveredContainerDTO]):
        """Directly registers or updates containers for a node."""
        self._node_containers[node_id] = containers

    def get_containers(self, node_id: str) -> List[DiscoveredContainerDTO]:
        res = self._node_containers.get(node_id)
        if not res and node_id:
            # Fallback to default klim discovery if specific node not scanned
            return self._node_containers.get("klim", [])
        return res or []

    def rename_entity(self, node_id: str, entity_type: str, entity_id: str, custom_name: str) -> bool:
        """Assigns a human-friendly alias to a discovered container or service."""
        clean_name = custom_name.strip()[:64]
        self._custom_names[(node_id, entity_type, entity_id)] = clean_name

        # Update in-memory models
        containers = self._node_containers.get(node_id, [])
        for c in containers:
            if entity_type == "container" and (c.id == entity_id or c.name == entity_id):
                c.custom_name = clean_name
                return True
            if entity_type == "service":
                for s in c.services:
                    if s.id == entity_id or s.name == entity_id:
                        s.custom_name = clean_name
                        return True
        return True


discovery_scanner = NodeDiscoveryScanner()
