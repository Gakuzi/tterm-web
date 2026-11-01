"""SSH to servers: a fresh certificate every time, and the server's own key
checked against what it told us when it registered.

From 0.1.17 the core also signs in to servers the person added themselves,
to a host they typed: with their own key from the vault (the signature made
by their device and relayed over the page's socket, see core/vault.py), or
with a certificate as for Add machine. Those connections go through
`connect_own`, which checks the address first (core/reach.py) and, for a
server behind a bastion, connects through the jump host.
"""
from __future__ import annotations

from typing import Awaitable, Callable

import asyncssh

from . import reach
from .signer_client import SignerClient, SignerRefused, SignerUnavailable

#: How long to wait for a server to answer at all.
CONNECT_TIMEOUT = 12


class HostKeysUnusable(Exception):
    """None of the remembered host keys could be read."""


def key_id(name: str, user_id: str, machine: str) -> str:
    """What the server's own log shows for each sign-in.

    sshd writes the certificate's key id into auth.log, so on the server
    itself one can see who came in: "Denis Gerasimenko via tTerm Web
    (2fe3b3c7) to tterm-lab-01".
    """
    clean = "".join(ch for ch in name if ch.isprintable())[:80] or "someone"
    return f"{clean} via tTerm Web ({user_id[:8]}) to {machine[:40]}"


def known_hosts(host: str, port: int, keys: list[str]) -> bytes:
    """known_hosts lines for exactly this address and these keys.

    For port 22 the address stands bare, otherwise as [address]:port: that
    is how OpenSSH writes it, and asyncssh looks the entry up the same way.
    With [address]:22 nothing would match, which reads as a changed key.
    """
    where = host if port == 22 else f"[{host}]:{port}"
    lines = []
    for key in keys:
        try:
            asyncssh.import_public_key(key)
        except Exception:
            continue
        lines.append(f"{where} {key}")
    if not lines:
        raise HostKeysUnusable("none of the server's keys could be read")
    text = "\n".join(lines) + "\n"
    # Parsed once here, as text, so a bad entry fails now rather than in the
    # middle of connecting; asyncssh.connect itself is handed bytes, the form
    # it documents.
    asyncssh.import_known_hosts(text)
    return text.encode()


async def connect(signer: SignerClient, *, host: str, port: int, login: str,
                  host_keys: list[str], who: str, principal: str,
                  ca: str | None = None) -> asyncssh.SSHClientConnection:
    """Signs in as `login` with a new certificate made out to `principal`,
    the server's own (trust.py); refuses a server whose key changed."""
    pinned = known_hosts(host, port, host_keys)
    key, cert = await signer.credentials(principal, who, ca=ca)
    return await asyncssh.connect(
        host, port=port, username=login,
        client_keys=[(key, cert)],
        known_hosts=pinned,
        # Only our certificate: no keys from ~/.ssh, no ssh-agent, no
        # passwords, nothing the person did not ask for.
        agent_path=None,
        password=None,
        kbdint_auth=False,
        preferred_auth=("publickey",),
        connect_timeout=CONNECT_TIMEOUT,
        keepalive_interval=30,
        keepalive_count_max=3,
    )


#: A client key for one hop: a vault relay keypair, or a (key, cert) pair.
#: Built fresh per hop, since a connection consumes it.
ClientKey = Callable[[], Awaitable[object]]


async def connect_own(*, host: str, port: int, login: str,
                      host_keys: list[str], client_key: ClientKey, who: str,
                      user_id, limiter: reach.Limiter | None = None,
                      jump: dict | None = None) -> asyncssh.SSHClientConnection:
    """Signs in to a server the person added, at a host they typed.

    The address is resolved and checked once (reach.py), and the connection
    goes to that very address with the host keys pinned to it. A server
    behind a bastion is reached through the jump host: the core connects to
    the jump the same way (its own checked address and pinned keys), then the
    target over it (asyncssh `tunnel=`), the jump doing the target's lookup.
    `client_key` builds the client key for the target; `jump["client_key"]`
    the one for the jump.
    """
    if limiter is not None:
        limiter.check(user_id)
    tunnel = None
    try:
        if jump is not None:
            jump_address = await reach.checked_address(jump["host"])
            tunnel = await asyncssh.connect(
                jump_address, port=jump["port"], username=jump["login"],
                client_keys=[await jump["client_key"]()],
                known_hosts=known_hosts(jump_address, jump["port"],
                                        jump["host_keys"]),
                agent_path=None, password=None, kbdint_auth=False,
                preferred_auth=("publickey",), connect_timeout=CONNECT_TIMEOUT,
                keepalive_interval=30, keepalive_count_max=3)
            # Behind the bastion the target is reached by the name the person
            # gave; the jump looks it up, so the core does not dial it itself.
            target, pinned = host, known_hosts(host, port, host_keys)
        else:
            target = await reach.checked_address(host)
            pinned = known_hosts(target, port, host_keys)
        conn = await asyncssh.connect(
            target, port=port, username=login,
            client_keys=[await client_key()], known_hosts=pinned,
            agent_path=None, password=None, kbdint_auth=False,
            preferred_auth=("publickey",), connect_timeout=CONNECT_TIMEOUT,
            keepalive_interval=30, keepalive_count_max=3, tunnel=tunnel)
        # The tunnel is the core's to close: asyncssh does not own one passed
        # in. It goes when the connection that rides it does (SshLink).
        if tunnel is not None:
            conn._tterm_jump = tunnel
        return conn
    except BaseException:
        if tunnel is not None:
            tunnel.close()
        raise


def explain(exc: BaseException, host: str, port: int) -> str:
    """Why connecting failed, in a sentence for the person and for the
    installer's output."""
    where = f"{host}:{port}"
    if isinstance(exc, reach.Blocked):
        return str(exc)
    if isinstance(exc, reach.TooSoon):
        return str(exc)
    if isinstance(exc, (SignerUnavailable, SignerRefused)):
        return f"tTerm Web could not sign a certificate: {exc}"
    if isinstance(exc, HostKeysUnusable):
        return "The server sent no host key we could read."
    if isinstance(exc, asyncssh.HostKeyNotVerifiable):
        return (f"The server at {where} answered with a different host key "
                "than it registered with. Not connecting.")
    if isinstance(exc, asyncssh.PermissionDenied):
        return (f"The server at {where} did not accept our certificate. "
                "Did the script finish without errors?")
    if isinstance(exc, ConnectionRefusedError):
        return (f"Nothing answers on SSH at {where}: connection refused. "
                f"Is SSH listening on port {port}?")
    if isinstance(exc, TimeoutError):
        return (f"No answer from SSH at {where}. If a firewall lets only some "
                "addresses reach SSH, allow tTerm Web's. A machine without a "
                "public address connects as a computer instead.")
    if isinstance(exc, OSError):
        return f"Could not reach SSH at {where}: {exc.strerror or exc}."
    if isinstance(exc, asyncssh.Error):
        return f"SSH to {where} failed: {exc.reason}"
    return f"Connecting to {where} failed: {exc}"
