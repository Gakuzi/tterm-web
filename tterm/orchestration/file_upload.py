"""
File Upload Gateway and SFTP/FTP Integration for tTerm Orchestration.
Uploads files directly onto the target machine where the terminal is running
(via active SSH link/SFTP or Agent link), rather than only saving to local server host.
Exposes real SFTP/FTP connection details for the target machine environment.
"""
from __future__ import annotations

import asyncio
import base64
import logging
import os
import shlex
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

log = logging.getLogger("tterm.orchestration.file_upload")


class FileUploadGateway:
    """Manages file uploads to terminal working directories on target machines."""

    def __init__(self, default_upload_root: str = "/tmp/tterm_uploads"):
        self.default_upload_root = Path(default_upload_root)
        self.default_upload_root.mkdir(parents=True, exist_ok=True)
        self._upload_history: List[Dict[str, Any]] = []

    async def upload_file(
        self,
        terminal_id: str,
        filename: str,
        content_bytes: bytes,
        target_dir: Optional[str] = None,
        request: Any = None,
    ) -> Dict[str, Any]:
        """
        Transfers the uploaded file directly to the machine running the specified terminal.
        If the terminal is live, uses the terminal's transport link (SshLink SFTP or AgentLink script)
        to write the file into target_dir (or terminal.cwd / terminal.home).
        Falls back to local /tmp staging if machine is unreachable.
        """
        clean_name = os.path.basename(filename.strip().replace("\\", "/"))
        if not clean_name:
            clean_name = f"upload_{uuid.uuid4().hex[:8]}"

        terminals_registry = getattr(getattr(request, "app", None), "state", None)
        terminals = getattr(terminals_registry, "terminals", None) if terminals_registry else None
        pool = getattr(terminals_registry, "pool", None) if terminals_registry else None

        term = None
        if terminals and hasattr(terminals, "_live"):
            try:
                term_uuid = uuid.UUID(terminal_id)
                term = terminals._live.get(term_uuid)
            except Exception:
                pass
            if term is None:
                for t in terminals._live.values():
                    if str(t.id) == terminal_id:
                        term = t
                        break

        machine_name = "Local Host"
        machine_id = "local"
        machine_host = "127.0.0.1"
        machine_login = "user"
        machine_kind = "server"
        transfer_method = "local_storage"
        dest_path = ""
        resolved_target_dir = ""

        if term is not None:
            machine = getattr(term, "machine", None)
            if machine:
                machine_name = getattr(machine, "name", "Machine")
                machine_id = str(getattr(machine, "id", "unknown"))
                machine_host = getattr(machine, "host", "") or "127.0.0.1"
                machine_login = getattr(machine, "login", "") or "root"
                machine_kind = getattr(machine, "kind", "server")

            cwd = getattr(term, "cwd", "") or getattr(term, "home", "")
            if target_dir and target_dir.strip():
                resolved_target_dir = target_dir.strip()
            elif cwd and cwd.strip():
                resolved_target_dir = cwd.strip()
            else:
                resolved_target_dir = "/tmp"

            # Expand ~ or relative paths
            home = getattr(term, "home", "")
            if resolved_target_dir.startswith("~/") and home:
                resolved_target_dir = f"{home}/{resolved_target_dir[2:]}"
            elif resolved_target_dir == "~" and home:
                resolved_target_dir = home

            link = getattr(term, "_link", None)
            is_windows = bool(
                (machine and getattr(machine, "os", "").lower().startswith("win"))
                or (link and getattr(link, "os", "").lower().startswith("win"))
                or (len(resolved_target_dir) >= 2 and resolved_target_dir[1] == ":")
                or "\\" in resolved_target_dir
            )

            if is_windows:
                clean_target = resolved_target_dir.replace("/", "\\").rstrip("\\")
                dest_path = f"{clean_target}\\{clean_name}"
            else:
                clean_target = resolved_target_dir.rstrip("/")
                dest_path = f"{clean_target}/{clean_name}"

            uploaded_to_machine = False

            # Method 1: SshLink with live SSH connection & SFTP
            if link is not None and hasattr(link, "conn") and link.conn is not None:
                try:
                    # Ensure directory exists on target machine
                    await link.conn.run(f"mkdir -p {shlex.quote(resolved_target_dir)}")
                    # Upload via asyncssh SFTP client
                    async with link.conn.start_sftp_client() as sftp:
                        async with sftp.open(dest_path, "wb") as remote_file:
                            await remote_file.write(content_bytes)
                    uploaded_to_machine = True
                    transfer_method = "sftp_direct"
                    log.info("Uploaded %s (%d bytes) to %s via SFTP on machine %s", clean_name, len(content_bytes), dest_path, machine_name)
                except Exception as sftp_err:
                    log.warning("SFTP direct upload failed on %s: %s, falling back to script", machine_name, sftp_err)

            # Method 2: Script execution via Link (works for AgentLink on Windows/macOS/Linux & SshLink)
            if not uploaded_to_machine and link is not None and hasattr(link, "script"):
                try:
                    b64_content = base64.b64encode(content_bytes).decode("ascii")
                    if is_windows:
                        # PowerShell script for Windows agent
                        t_dir_json = json.dumps(clean_target)
                        d_path_json = json.dumps(dest_path)
                        script = f"""
$tDir = {t_dir_json}
$dPath = {d_path_json}
if (-not (Test-Path -Path $tDir)) {{ New-Item -ItemType Directory -Path $tDir -Force | Out-Null }}
$bytes = [System.Convert]::FromBase64String("{b64_content}")
[System.IO.File]::WriteAllBytes($dPath, $bytes)
if (Test-Path -Path $dPath) {{ exit 0 }} else {{ exit 1 }}
"""
                    else:
                        # Bash / sh script for Linux & macOS
                        script = f"""
mkdir -p {shlex.quote(resolved_target_dir)}
cat << 'EOF_TTERM_UPLOAD' | (base64 -d 2>/dev/null || base64 -D 2>/dev/null || openssl base64 -d 2>/dev/null || python3 -m base64 -d 2>/dev/null) > {shlex.quote(dest_path)}
{b64_content}
EOF_TTERM_UPLOAD
chmod 644 {shlex.quote(dest_path)} 2>/dev/null || true
ls -l {shlex.quote(dest_path)}
"""
                    exit_code, stdout, stderr = await link.script(script, timeout=60)
                    if exit_code == 0:
                        uploaded_to_machine = True
                        transfer_method = "agent_transport_stream"
                        log.info("Uploaded %s to machine %s at %s via link script", clean_name, machine_name, dest_path)
                    else:
                        log.warning("Link script upload failed with code %s: %s", exit_code, stderr)
                except Exception as script_err:
                    log.warning("Link script upload error on %s: %s", machine_name, script_err)

            # Method 3: Local machine write if running on same host
            if not uploaded_to_machine and (machine_host in ("127.0.0.1", "localhost")):
                try:
                    local_dir = Path(os.path.expanduser(resolved_target_dir)).resolve()
                    local_dir.mkdir(parents=True, exist_ok=True)
                    local_file = local_dir / clean_name
                    local_file.write_bytes(content_bytes)
                    dest_path = str(local_file)
                    uploaded_to_machine = True
                    transfer_method = "local_filesystem"
                    log.info("Uploaded %s to local filesystem at %s", clean_name, dest_path)
                except Exception as loc_err:
                    log.warning("Local write failed: %s", loc_err)

        # Fallback if terminal was not found or transfers failed: save to stage dir
        if not dest_path or transfer_method == "local_storage":
            dest_dir = (self.default_upload_root / terminal_id).resolve()
            dest_dir.mkdir(parents=True, exist_ok=True)
            local_dest = dest_dir / clean_name
            local_dest.write_bytes(content_bytes)
            dest_path = str(local_dest)
            resolved_target_dir = str(dest_dir)
            transfer_method = "local_staging_fallback"

        record = {
            "id": uuid.uuid4().hex,
            "terminal_id": terminal_id,
            "filename": clean_name,
            "size": len(content_bytes),
            "dest_path": dest_path,
            "path": dest_path,
            "target_dir": resolved_target_dir,
            "machine_id": machine_id,
            "machine_name": machine_name,
            "machine_host": machine_host,
            "machine_login": machine_login,
            "machine_kind": machine_kind,
            "transfer_method": transfer_method,
            "uploaded_at": datetime.now(timezone.utc).isoformat(),
        }

        self._upload_history.append(record)
        return record

    def save_uploaded_file(
        self,
        terminal_id: str,
        filename: str,
        content_bytes: bytes,
        target_dir: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Synchronous wrapper for backward compatibility."""
        clean_name = os.path.basename(filename.strip().replace("\\", "/")) or f"upload_{uuid.uuid4().hex[:8]}"
        dest_dir = Path(target_dir).resolve() if target_dir else (self.default_upload_root / terminal_id).resolve()
        dest_dir.mkdir(parents=True, exist_ok=True)
        dest_path = dest_dir / clean_name
        dest_path.write_bytes(content_bytes)

        record = {
            "id": uuid.uuid4().hex,
            "terminal_id": terminal_id,
            "filename": clean_name,
            "size": len(content_bytes),
            "dest_path": str(dest_path),
            "path": str(dest_path),
            "target_dir": str(dest_dir),
            "machine_name": "Target Machine",
            "transfer_method": "local_storage",
            "uploaded_at": datetime.now(timezone.utc).isoformat(),
        }
        self._upload_history.append(record)
        return record

    def get_sftp_credentials(
        self,
        terminal_id: str,
        machine_id: Optional[str] = None,
        request: Any = None,
    ) -> Dict[str, Any]:
        """
        Returns parameters for direct SFTP/FTP connection to the target machine running the terminal.
        """
        terminals_registry = getattr(getattr(request, "app", None), "state", None)
        terminals = getattr(terminals_registry, "terminals", None) if terminals_registry else None

        term = None
        if terminals and hasattr(terminals, "_live"):
            try:
                term_uuid = uuid.UUID(terminal_id)
                term = terminals._live.get(term_uuid)
            except Exception:
                pass
            if term is None:
                for t in terminals._live.values():
                    if str(t.id) == terminal_id:
                        term = t
                        break

        host = "localhost"
        port = 22
        username = "developer"
        machine_name = "Server"
        default_dir = "/tmp"

        if term is not None:
            machine = getattr(term, "machine", None)
            if machine:
                machine_name = getattr(machine, "name", "Machine")
                host = getattr(machine, "host", "") or "localhost"
                port = int(getattr(machine, "port", 22) or 22)
                username = getattr(machine, "login", "") or "developer"
            cwd = getattr(term, "cwd", "") or getattr(term, "home", "")
            if cwd:
                default_dir = cwd

        sftp_url = f"sftp://{username}@{host}:{port}"
        web_dav_hint = f"Подключение к машине '{machine_name}' ({host}:{port})"

        return {
            "host": host,
            "port": port,
            "username": username,
            "machine_name": machine_name,
            "sftp_url": sftp_url,
            "web_dav_hint": web_dav_hint,
            "default_dir": default_dir,
            "terminal_id": terminal_id,
            "machine_id": machine_id,
            "auth_methods": ["ssh_key", "password"],
            "command_hint": f"sftp -P {port} {username}@{host}",
            "ftp_command_hint": f"ftp {host}",
            "cyberduck_hint": f"Host: {host}, Port: {port}, User: {username}, Path: {default_dir}",
        }

    def list_uploads(self, terminal_id: Optional[str] = None) -> List[Dict[str, Any]]:
        """Returns upload history, optionally filtered by terminal_id."""
        if terminal_id:
            return [u for u in self._upload_history if u["terminal_id"] == terminal_id]
        return list(self._upload_history)


file_upload_gateway = FileUploadGateway()
