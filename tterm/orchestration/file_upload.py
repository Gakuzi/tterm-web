"""
File Upload Gateway and SFTP/FTP Integration for tTerm Orchestration.
Supports drag-and-drop file ingestion into terminal project environments
and exposes SFTP/FTP connection details.
"""
from __future__ import annotations

import logging
import os
import shutil
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

log = logging.getLogger("tterm.orchestration.file_upload")


class FileUploadGateway:
    """Manages file uploads to terminal working directories and SFTP credentials."""

    def __init__(self, default_upload_root: str = "/tmp/tterm_uploads"):
        self.default_upload_root = Path(default_upload_root)
        self.default_upload_root.mkdir(parents=True, exist_ok=True)
        self._upload_history: List[Dict[str, Any]] = []

    def save_uploaded_file(
        self,
        terminal_id: str,
        filename: str,
        content_bytes: bytes,
        target_dir: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Saves uploaded file content to target_dir if provided,
        or to /tmp/tterm_uploads/<terminal_id>/<filename>.
        Logs the upload operation and returns metadata.
        """
        clean_name = os.path.basename(filename.strip().replace("\\", "/"))
        if not clean_name:
            clean_name = f"upload_{uuid.uuid4().hex[:8]}"

        if target_dir and target_dir.strip():
            dest_dir = Path(os.path.expanduser(target_dir.strip())).resolve()
        else:
            dest_dir = (self.default_upload_root / terminal_id).resolve()

        dest_dir.mkdir(parents=True, exist_ok=True)
        dest_path = dest_dir / clean_name

        dest_path.write_bytes(content_bytes)

        record = {
            "id": uuid.uuid4().hex,
            "terminal_id": terminal_id,
            "filename": clean_name,
            "size": len(content_bytes),
            "path": str(dest_path),
            "target_dir": str(dest_dir),
            "uploaded_at": datetime.now(timezone.utc).isoformat(),
        }

        self._upload_history.append(record)
        log.info(
            "Saved uploaded file '%s' (%d bytes) to '%s' for terminal %s",
            clean_name,
            len(content_bytes),
            dest_path,
            terminal_id,
        )

        return record

    def get_sftp_credentials(
        self,
        terminal_id: str,
        machine_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Returns parameters for direct SFTP/FTP connection to the terminal development environment.
        """
        host = os.environ.get("TTERM_SFTP_HOST", "192.168.0.6")
        port = int(os.environ.get("TTERM_SFTP_PORT", "22"))
        username = os.environ.get("TTERM_SFTP_USER", "pi")
        default_dir = os.environ.get("TTERM_SFTP_DIR", "/home/pi/tterm-server")

        sftp_url = f"sftp://{username}@{host}:{port}"
        web_dav_hint = "Доступно через SSH/SFTP и Web-загрузку"

        return {
            "host": host,
            "port": port,
            "username": username,
            "sftp_url": sftp_url,
            "web_dav_hint": web_dav_hint,
            "default_dir": default_dir,
            "terminal_id": terminal_id,
            "machine_id": machine_id,
            "auth_methods": ["ssh_key", "password"],
            "command_hint": f"sftp -P {port} {username}@{host}",
            "ftp_command_hint": f"ftp {host}",
        }

    def list_uploads(self, terminal_id: Optional[str] = None) -> List[Dict[str, Any]]:
        """Returns upload history, optionally filtered by terminal_id."""
        if terminal_id:
            return [u for u in self._upload_history if u["terminal_id"] == terminal_id]
        return list(self._upload_history)


file_upload_gateway = FileUploadGateway()
