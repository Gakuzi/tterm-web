"""The machines' side: what servers and agents talk to.

Reachable from outside through the tunnel to connect-dev.tterm.net, and on
the server later as connect.tterm.net. Nothing of the page and none of its
API is here: a person's browser has no business on this address.

    GET  /s/TOKEN   the installer for a server, with the token inside
    POST /enroll    the installer reports back; the core checks over SSH
    GET  /c/TOKEN   the installer for a computer's agent (from 0.0.8)
    WS   /agent     a computer's agent dials in and stays (from 0.0.6)
    GET  /ca.pub    the active CA's public key, to compare by eye
    GET  /health
"""
from __future__ import annotations

import ipaddress
import logging
from pathlib import Path

import asyncpg
from fastapi import FastAPI, Request, WebSocket
from fastapi.responses import FileResponse, JSONResponse, PlainTextResponse, Response
from pydantic import BaseModel, Field
from starlette.requests import HTTPConnection

from .. import __version__
from ..core import agents as agents_mod
from ..core import machines
from ..core.signer_client import SignerClient, SignerRefused, SignerUnavailable
from .security import CONNECT_HEADERS, AddHeaders

log = logging.getLogger("tterm.connect")

LOCAL_PEERS = {"127.0.0.1", "::1"}
SCRIPT_HEADERS = {"content-type": "text/x-shellscript; charset=utf-8",
                  "cache-control": "no-store"}


class EnrollPayload(BaseModel):
    token: str = Field(min_length=1, max_length=64)
    hostname: str = Field(default="", max_length=255)
    os: str = Field(default="", max_length=255)
    ssh_port: int = Field(default=22, ge=1, le=65535)
    ssh_user: str = Field(default="tterm", max_length=64)
    host_keys: list[str] = Field(min_length=1, max_length=8)


def client_ip(request: HTTPConnection) -> str:
    """The address the request, or the WebSocket, really came from.

    Headers are believed only from a proxy on this same machine: cloudflared
    now, nginx on the server later. From anyone else they could be invented.
    """
    peer = request.client.host if request.client else ""
    if peer in LOCAL_PEERS:
        for header in ("cf-connecting-ip", "x-real-ip"):
            value = request.headers.get(header, "").strip()
            if _is_ip(value):
                return value
        forwarded = request.headers.get("x-forwarded-for", "")
        first = forwarded.split(",")[0].strip()
        if _is_ip(first):
            return first
    return peer


def _is_ip(value: str) -> bool:
    try:
        ipaddress.ip_address(value)
        return True
    except ValueError:
        return False


def create_connect_app(pool: asyncpg.Pool, signer: SignerClient,
                       connect_url: str, agents: agents_mod.Agents | None = None):
    app = FastAPI(title="tTerm Web connect", version=__version__,
                  docs_url=None, redoc_url=None, openapi_url=None)

    @app.get("/health")
    async def health() -> Response:
        return JSONResponse({"ok": True, "service": "tterm-web connect",
                             "version": __version__},
                            headers={"cache-control": "no-store"})

    @app.get("/install.sh")
    @app.get("/install_computer.sh")
    async def universal_installer(request: Request) -> Response:
        """Universal onboarding script for connecting computers (macOS, Linux).
        Supports multi-hub dual connection and auto discovery."""
        token = await machines.get_or_create_quick_computer_token(pool)
        host = request.headers.get("host", "localhost:8291").split(":")[0]
        web_url = f"http://{host}:8290"
        script = machines.render_universal_installer(
            token=token,
            connect_url=connect_url,
            web_url=web_url,
        )
        return PlainTextResponse(script, headers=SCRIPT_HEADERS)

    @app.get("/install.ps1")
    @app.get("/install_computer.ps1")
    async def universal_installer_ps1(request: Request) -> Response:
        """Universal PowerShell onboarding script for connecting Windows computers."""
        token = await machines.get_or_create_quick_computer_token(pool)
        script = machines.render_computer_installer_ps1(token=token, connect_url=connect_url)
        return PlainTextResponse(script, headers={"content-type": "text/plain; charset=utf-8",
                                                  "cache-control": "no-store"})

    @app.get("/install.bat")
    @app.get("/install_windows.bat")
    async def universal_installer_bat(request: Request) -> Response:
        """Universal Batch installer for connecting Windows computers in 1 click."""
        token = await machines.get_or_create_quick_computer_token(pool)
        content = machines.render_computer_installer_bat(token=token, connect_url=connect_url)
        return PlainTextResponse(content, headers={"content-type": "text/plain; charset=utf-8",
                                                   "cache-control": "no-store",
                                                   "content-disposition": "attachment; filename=tterm-setup.bat"})

    @app.get("/quick_token")
    async def get_quick_token() -> Response:
        """Returns a valid 24-hour token for seamless 1-click agent onboarding."""
        token = await machines.get_or_create_quick_computer_token(pool)
        return JSONResponse({"ok": True, "token": token})

    @app.get("/tterm-agent.exe")
    @app.get("/install_windows.exe")
    async def universal_installer_exe() -> Response:
        """Native Windows Agent executable for 1-click install and background operation."""
        exe_path = Path(__file__).resolve().parent.parent / "templates" / "tterm-agent.exe"
        if exe_path.is_file():
            return FileResponse(
                exe_path,
                media_type="application/vnd.microsoft.portable-executable",
                filename="tterm-agent.exe",
                headers={"cache-control": "no-store"}
            )
        return PlainTextResponse("Agent binary not found", status_code=404)

    @app.get("/s/{token}")
    async def installer(token: str) -> Response:
        # A dead command says so before touching anything on the server.
        problem = await machines.check_token(pool, token)
        if problem:
            return PlainTextResponse(machines.refusal_script(problem),
                                     headers=SCRIPT_HEADERS)
        try:
            ca = await signer.active_key()
        except (SignerUnavailable, SignerRefused) as exc:
            log.error("cannot serve the installer: %s", exc)
            return PlainTextResponse(machines.refusal_script(
                "tTerm Web cannot sign certificates right now. Try again in "
                "a minute."), headers=SCRIPT_HEADERS)
        script = machines.render_installer(
            token=token, ca_key=ca["public_key"], ca_id=ca["id"],
            principal=await machines.install_principal(pool, token),
            connect_url=connect_url)
        return PlainTextResponse(script, headers=SCRIPT_HEADERS)

    @app.get("/c/{token}.ps1")
    async def computer_installer_ps1(token: str) -> Response:
        """The PowerShell installer for Windows computers."""
        problem = await machines.check_token(pool, token, kind="computer")
        if problem:
            return PlainTextResponse(machines.refusal_ps1(problem),
                                     headers={"content-type": "text/plain; charset=utf-8",
                                              "cache-control": "no-store"})
        script = machines.render_computer_installer_ps1(token=token,
                                                        connect_url=connect_url)
        return PlainTextResponse(script, headers={"content-type": "text/plain; charset=utf-8",
                                                  "cache-control": "no-store"})

    @app.get("/c/{token}.bat")
    async def computer_installer_bat(token: str) -> Response:
        """One-click batch/exe installer for Windows."""
        problem = await machines.check_token(pool, token, kind="computer")
        if problem:
            return PlainTextResponse(f'@echo off\r\necho {problem}\r\npause\r\n',
                                     headers={"content-type": "text/plain; charset=utf-8",
                                              "cache-control": "no-store",
                                              "content-disposition": "attachment; filename=tterm-setup.bat"})
        content = machines.render_computer_installer_bat(token=token, connect_url=connect_url)
        return PlainTextResponse(content, headers={"content-type": "text/plain; charset=utf-8",
                                                   "cache-control": "no-store",
                                                   "content-disposition": "attachment; filename=tterm-setup.bat"})

    @app.get("/c/{token}")
    async def computer_installer(token: str) -> Response:
        """The agent's installer, for a person to run on their computer.
        The token in it lets the computer join once; it does not become
        its key."""
        problem = await machines.check_token(pool, token, kind="computer")
        if problem:
            return PlainTextResponse(machines.refusal_script(problem),
                                     headers=SCRIPT_HEADERS)
        script = machines.render_computer_installer(token=token,
                                                    connect_url=connect_url)
        return PlainTextResponse(script, headers=SCRIPT_HEADERS)

    @app.post("/enroll")
    async def enroll(payload: EnrollPayload, request: Request) -> Response:
        ip = client_ip(request)
        if not ip:
            return PlainTextResponse("Could not tell this server's address.",
                                     status_code=400)
        try:
            ca = await signer.active_key()
            message = await machines.enroll(pool, signer, machines.Enrollment(
                token=payload.token, hostname=payload.hostname,
                os=payload.os, ssh_port=payload.ssh_port,
                ssh_user=payload.ssh_user, host_keys=payload.host_keys,
                ip=ip), ca=ca)
        except machines.EnrollRefused as refused:
            return PlainTextResponse(str(refused), status_code=refused.status)
        except (SignerUnavailable, SignerRefused) as exc:
            log.error("enroll: %s", exc)
            return PlainTextResponse(
                "tTerm Web cannot sign certificates right now. Run the "
                "command again in a minute.", status_code=503)
        return PlainTextResponse(message)

    @app.websocket("/agent")
    async def agent(ws: WebSocket) -> None:
        """Where the agent of a computer connects and stays connected."""
        if agents is None:
            await ws.close(code=1013)
            return
        await agents_mod.session(ws, pool, agents, client_ip(ws))

    @app.get("/ca.pub")
    async def ca_pub() -> Response:
        try:
            keys = await signer.keys()
        except (SignerUnavailable, SignerRefused):
            return PlainTextResponse("The signer is not answering.\n",
                                     status_code=503)
        lines = [f"{ca['public_key'].split()[0]} {ca['public_key'].split()[1]} "
                 f"tterm-web {ca['id']}" for ca in keys]
        return PlainTextResponse("\n".join(lines) + "\n",
                                 headers={"cache-control": "no-store"})

    return AddHeaders(app, CONNECT_HEADERS)
