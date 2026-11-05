"""tTerm Web on this computer: python -m tterm.dev

Starts the signer as a separate process, as it will run on the server, and
then the core with the page and the machines' side. Ctrl+C stops everything.
"""
from __future__ import annotations

import asyncio
import contextlib
import logging
import os
import signal
import sys

from . import __version__
from .core import db
from .core.config import ROOT, Settings
from .core.mail import BrevoMailer
from .core.signer_client import SignerClient, SignerUnavailable
from .server import Core, PortBusy

log = logging.getLogger("tterm")


def banner(settings: Settings, core: Core) -> str:
    ca = core.active_ca
    owner = core.owner
    if owner is None:
        you = "no one: everyone signs up with their email"
    elif owner.email:
        you = f"{owner.name}, signs in as {owner.email}"
    else:
        you = (f"{owner.name}, without an address: put TTERM_OWNER_EMAIL=your "
               "email in .env and start again")
    if isinstance(core.mailer, BrevoMailer):
        email = f"through Brevo, from {settings.mail_from}"
    else:
        email = "into this window: the codes for signing in appear here"
    local = settings.page_host in ("127.0.0.1", "localhost", "::1")
    return "\n".join([
        f"tTerm Web {__version__}",
        f"  page       {settings.page_url}"
        f"{'   only on this computer' if local else ''}",
        f"  machines   http://127.0.0.1:{core.connect_port}"
        f"   the tunnel to {settings.connect_url} points here",
        f"  database   {db.describe(settings.database_url)}",
        f"  signer     {ca['id'] + '  ' + ca['fingerprint'] if ca else 'not answering'}",
        f"  email      {email}",
        f"  you        {you}",
        "Ctrl+C stops it.",
        "",
    ])


async def start_signer(settings: Settings) -> asyncio.subprocess.Process:
    """The signer in its own process; waits until it answers."""
    proc = await asyncio.create_subprocess_exec(
        sys.executable, "-m", "tterm.signer", cwd=str(ROOT), env=os.environ)
    client = SignerClient(settings.signer_socket, timeout=1)
    for _ in range(300):
        if proc.returncode is not None:
            raise SignerUnavailable("The signer stopped while starting; its "
                                    "message is above.")
        try:
            await client.call({"op": "ping"})
            return proc
        except SignerUnavailable:
            await asyncio.sleep(0.1)
    proc.terminate()
    raise SignerUnavailable("The signer did not start within 30 seconds.")


async def stop_signer(proc: asyncio.subprocess.Process) -> None:
    if proc.returncode is None:
        with contextlib.suppress(ProcessLookupError):
            proc.terminate()
        try:
            await asyncio.wait_for(proc.wait(), 3)
        except asyncio.TimeoutError:
            with contextlib.suppress(ProcessLookupError):
                proc.kill()
            await proc.wait()


async def run(settings: Settings) -> int:
    try:
        signer_proc = await start_signer(settings)
    except SignerUnavailable as exc:
        print(f"\n{exc}\n", file=sys.stderr)
        return 1

    core = Core(settings)
    try:
        await core.start()
    except (db.DatabaseUnavailable, PortBusy, RuntimeError) as exc:
        print(f"\n{exc}\n", file=sys.stderr)
        await stop_signer(signer_proc)
        return 1

    print(banner(settings, core), flush=True)

    stopping = asyncio.Event()
    loop = asyncio.get_running_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        loop.add_signal_handler(sig, stopping.set)

    waiter = asyncio.create_task(stopping.wait())
    died = asyncio.create_task(core.wait())
    signer_gone = asyncio.create_task(signer_proc.wait())
    await asyncio.wait([waiter, died, signer_gone],
                       return_when=asyncio.FIRST_COMPLETED)
    if not stopping.is_set():
        if signer_gone.done():
            log.error("the signer stopped on its own; stopping everything")
        else:
            log.error("a server stopped on its own; stopping everything")
    print("\nStopping…", flush=True)
    await core.stop()
    await stop_signer(signer_proc)
    for task in (waiter, died, signer_gone):
        task.cancel()
    return 0 if stopping.is_set() else 1


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s",
                        datefmt="%H:%M:%S")
    # asyncssh narrates every channel at INFO; only its problems are news.
    logging.getLogger("asyncssh").setLevel(logging.WARNING)
    settings = Settings.load()
    sys.exit(asyncio.run(run(settings)))


if __name__ == "__main__":
    main()
