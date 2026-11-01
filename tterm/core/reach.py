"""Reaching a host the person typed, safely.

For a machine the person added themselves (their own key, or a jump host),
the core dials an address the person gave. A name could resolve to the
loopback, a private network, the link-local metadata address
(169.254.169.254) or another address that is not a real server out on the
internet: the core refuses those, so it cannot be turned into a way to reach
whatever sits next to it. The name is resolved once, the address is checked,
and the core connects to that very address — no second lookup that could
answer differently.

Each person may dial only so often (POST /api/machines/reachable, and the
hosts their own machines and jump hosts point at), so this cannot be used to
scan from the core at speed.

ALLOW_PRIVATE lets the checks through for the loopback and private networks;
it is off, and only the tests turn it on, where the servers are on
127.0.0.1. It never loosens anything in a running tTerm Web.
"""
from __future__ import annotations

import asyncio
import ipaddress
import socket
import time
import uuid

#: Resolving a name, and a plain TCP connect for the reachable check.
RESOLVE_TIMEOUT = 5.0
CONNECT_TIMEOUT = 5.0
#: Dials and reachable checks one person may make a minute.
PER_MINUTE = 30
#: Off in a running tTerm Web; the tests set it, their servers being local.
ALLOW_PRIVATE = False


class Blocked(Exception):
    """The address cannot be dialed: not a name, or not a real server on the
    internet. `status` is the HTTP answer where this reaches the page."""
    status = 400


class TooSoon(Exception):
    status = 429

    def __init__(self, message: str = "Too many connections. Try again in a "
                 "minute.") -> None:
        super().__init__(message)


#: NAT64's well-known prefix (RFC 6052): a gateway turns 64:ff9b::a.b.c.d
#: into a connection to a.b.c.d, so the IPv4 inside is what is dialled.
NAT64 = ipaddress.IPv6Network("64:ff9b::/96")


def _forbidden(ip: ipaddress._BaseAddress) -> bool:
    """Whether an address is one the core will not dial: the loopback, a
    private or link-local network (169.254.169.254 among them), multicast,
    reserved or the unspecified address, and anything else that is not a
    global address (shared/CGNAT space 100.64.0.0/10, the IETF block
    192.0.0.0/24 but for its two anycast addresses 192.0.0.9 and 192.0.0.10,
    which are global, the benchmarking and documentation networks, unique
    local IPv6…). An IPv6
    address that carries an IPv4 one (IPv4-mapped, NAT64, 6to4) is judged by
    the IPv4 inside it too, so ::ffff:127.0.0.1 is refused."""
    if isinstance(ip, ipaddress.IPv6Address):
        if ip.ipv4_mapped is not None:
            ip = ip.ipv4_mapped
        else:
            inner = None
            if ip in NAT64:
                inner = ipaddress.IPv4Address(int(ip) & 0xFFFFFFFF)
            elif ip.sixtofour is not None:
                inner = ip.sixtofour
            if inner is not None and _forbidden(inner):
                return True
    return (ip.is_loopback or ip.is_private or ip.is_link_local
            or ip.is_multicast or ip.is_reserved or ip.is_unspecified
            or not ip.is_global)


def allowed_ip(value: str) -> str | None:
    """The address if the core may dial it, else None. A literal address the
    person typed goes through here too."""
    try:
        ip = ipaddress.ip_address(value)
    except ValueError:
        return None
    if _forbidden(ip) and not ALLOW_PRIVATE:
        return None
    return str(ip)


async def resolve(host: str) -> list[str]:
    """Every address a name has now, in order. A literal address resolves to
    itself. Raises Blocked when it cannot be resolved."""
    host = (host or "").strip().strip("[]")
    if not host:
        raise Blocked("No address given.")
    try:
        ipaddress.ip_address(host)
        return [host]
    except ValueError:
        pass
    loop = asyncio.get_running_loop()
    try:
        infos = await asyncio.wait_for(
            loop.getaddrinfo(host, None, type=socket.SOCK_STREAM),
            RESOLVE_TIMEOUT)
    except (socket.gaierror, OSError, asyncio.TimeoutError):
        raise Blocked(f"Could not find {host}.") from None
    seen: list[str] = []
    for info in infos:
        address = info[4][0]
        if address not in seen:
            seen.append(address)
    if not seen:
        raise Blocked(f"Could not find {host}.")
    return seen


async def checked_address(host: str) -> str:
    """The one address the core will dial for a name: resolved, checked, and
    returned so the connection goes to it with no second lookup. Raises
    Blocked when the name does not resolve or every address it has is one the
    core refuses."""
    for address in await resolve(host):
        allowed = allowed_ip(address)
        if allowed is not None:
            return allowed
    raise Blocked(f"{host} is not a public address tTerm Web will connect to.")


async def reachable(host: str, port: int) -> bool:
    """Whether a plain TCP connection to the checked address of `host` opens
    within the timeout. A blocked or unresolvable address is not reachable."""
    try:
        address = await checked_address(host)
    except Blocked:
        return False
    try:
        reader, writer = await asyncio.wait_for(
            asyncio.open_connection(address, port), CONNECT_TIMEOUT)
    except (OSError, asyncio.TimeoutError):
        return False
    writer.close()
    try:
        await writer.wait_closed()
    except (OSError, Exception):        # noqa: BLE001 - only closing
        pass
    return True


class Limiter:
    """A simple per-person rate limit, in memory: at most PER_MINUTE dials or
    checks a minute. Kept small so a flood of people cannot fill it."""

    def __init__(self, per_minute: int = PER_MINUTE) -> None:
        self.per_minute = per_minute
        self._hits: dict[uuid.UUID, list[float]] = {}

    def check(self, user_id: uuid.UUID) -> None:
        """Counts one; raises TooSoon when the person is over the limit."""
        now = time.monotonic()
        if len(self._hits) > 4096:
            for key in [k for k, v in self._hits.items()
                        if not v or v[-1] < now - 60]:
                del self._hits[key]
        hits = [t for t in self._hits.get(user_id, ()) if t > now - 60]
        if len(hits) >= self.per_minute:
            self._hits[user_id] = hits
            raise TooSoon()
        hits.append(now)
        self._hits[user_id] = hits
