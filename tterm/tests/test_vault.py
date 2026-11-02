"""The vault: its API, the pairing state machine, the signing relay on the
test sshd, the address checks, and the migration on an existing database.

The crypto the core checks is exercised with the shared test vectors
(vault-vectors.json): the pairing commit, and the raw signature → SSH
signature blob and its verification. The core never sees a private key or
the vault key in the clear, so the tests feed it what the page and the
device would, and hold the private key themselves to stand in for the
device over the socket. The vault password (0.1.26) is fed from the same
file as the page and the engine read it (web/tests/vault-vectors.json,
"password"): what a client derives from the password, and the check the
core keeps.
"""
from __future__ import annotations

import asyncio
import base64
import datetime as dt
import hashlib
import json
import os
import shutil
import uuid
from pathlib import Path

import asyncpg
import asyncssh
from asyncssh.packet import SSHPacket

from ..core import db, reach, ssh, vault
from ..core.machines import remember_cas
from .harness import page_socket, request, shell_server, sign_in_as, ssh_server
from .test_auth import CHROME_MAC, Browser, sign_in
from .test_terminals import _ca_public, _home, _login_shell, _until

CHANGE = {"x-tterm": "1", "content-type": "application/json"}
LAST_LOCK = "That is the last lock of your vault: it stays."
#: The parts of the shared test vectors (vault-vectors.json) the core
#: computes itself: the pairing commit and SAS, and the raw signature with
#: the public key it verifies against. Kept here so the check always runs.
VEC = {
    "pub_a": "pOCSkrZRwni5dyxWn1-puxPZBrRqtoyd-dwrRAn4ogk",
    "pub_b": "zo060cy2M-x7cMF4FKXHbs0CloUFDTRHRboFhw5YfVk",
    "commit": "wWepxcftmSvHKdkjEuVp6LOXqL-orNGyCDwfZ964lxM",
    "sas": "517 230",
    "sig_data": "c2Vzc2lvbi1pZC1hbmQtdXNlcmF1dGgtcmVxdWVzdA",
    "sig_raw": "61ca-LF5ORwc8UnOqmY5zTl1v8qTGzfzZUZXZO3T5bvGczN56xrEgeoyNY7onxsQBjv8Jy-J1MscgixTB2hKCw",
    "public": "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIP0XJDhaoMdbZPt4zWAvodmR/ev3axPFjtcC6sg16fYY denis@mac",
}


def b64u(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def b64u_dec(text: str) -> bytes:
    return base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))


def _lock(kind: str = "app") -> dict:
    """A lock as the page would send it: a wrap is the 60-byte box of the
    32-byte vault key. A passkey lock carries a credential id."""
    out = {"id": str(uuid.uuid4()), "kind": kind, "wrap": b64u(b"w" * 60)}
    if kind == "passkey":
        out["credentialId"] = b64u(b"cred-id")
    return out


def _create_body(lock: dict | None = None) -> dict:
    return {"id": str(uuid.uuid4()), "recoverySalt": b64u(b"s" * 16),
            "recoveryWrap": b64u(b"r" * 60), "lock": lock or _lock()}


def _key_body(priv: asyncssh.SSHKey | None = None, name: str = "id_ed25519",
              sealed: bytes = b"sealed-key-bytes") -> tuple[dict, asyncssh.SSHKey]:
    priv = priv or asyncssh.generate_private_key("ssh-ed25519",
                                                 comment="me@mac")
    public = priv.export_public_key().decode().strip()
    pub = asyncssh.import_public_key(public)
    body = {"id": str(uuid.uuid4()), "name": name, "type": "ssh-ed25519",
            "publicKey": public, "fingerprint": pub.get_fingerprint(),
            "sealed": b64u(sealed), "source": "mac", "sourceLabel": "~/.ssh"}
    return body, priv


# ---------------------------------------------------------- the vectors

def test_the_shared_vectors_check_out():
    """The core's crypto matches the contract's vectors: the pairing commit
    and SAS, and the raw signature → blob and its verify."""
    assert vault.b64u(vault.commit_of(b64u_dec(VEC["pub_b"]))) == VEC["commit"]
    assert vault.sas_of(b64u_dec(VEC["pub_a"]),
                        b64u_dec(VEC["pub_b"])) == VEC["sas"]
    data, raw = b64u_dec(VEC["sig_data"]), b64u_dec(VEC["sig_raw"])
    blob = vault.verify_ssh_signature(VEC["public"], data, b"ssh-ed25519", raw)
    assert blob.startswith(b"\x00\x00\x00\x0bssh-ed25519")
    # A wrong signature does not verify.
    bad = bytearray(raw)
    bad[0] ^= 1
    try:
        vault.verify_ssh_signature(VEC["public"], data, b"ssh-ed25519",
                                   bytes(bad))
    except ValueError:
        pass
    else:
        raise AssertionError("a wrong signature verified")


def test_base64url_is_strict():
    assert vault.decode_b64u(b64u(b"hi")) == b"hi"
    for bad in ("has pad=", "not base64!", "++//", "a"):
        try:
            vault.decode_b64u(bad)
        except vault.Refused:
            continue
        raise AssertionError(f"accepted {bad!r}")
    # Sizes are checked on the bytes.
    try:
        vault.decode_b64u(b64u(b"x" * 59), exact=60)
    except vault.Refused:
        pass
    else:
        raise AssertionError("a wrong-size wrap was accepted")


# --------------------------------------------------------------- the API

async def test_a_vault_is_made_once(h):
    async with h.core() as core:
        r = await request(core.page_port, "GET", "/api/vault")
        assert r.json() == {"vault": None}
        r = await request(core.page_port, "POST", "/api/vault", headers=CHANGE,
                          body=json.dumps(_create_body()).encode())
        assert r.status == 201, r.text
        v = r.json()["vault"]
        assert v["prfSalt"] and len(v["locks"]) == 1 and v["keys"] == []
        assert v["locks"][0]["kind"] == "app"
        # prf_salt is the server's, 32 bytes.
        assert len(b64u_dec(v["prfSalt"])) == 32
        # Only one vault.
        r = await request(core.page_port, "POST", "/api/vault", headers=CHANGE,
                          body=json.dumps(_create_body()).encode())
        assert r.status == 409, r.text
        # The journal recorded it.
        kinds = [row["kind"] for row in await core.pool.fetch(
            "SELECT kind FROM journal WHERE kind = 'vault.created'")]
        assert kinds == ["vault.created"]


async def test_a_browser_makes_a_vault_without_a_lock_first(h):
    """A browser makes the vault with its recovery code only, then adds its
    passkey lock, whose PRF input is the prfSalt the core made; a browser
    without PRF keeps none (the page, 0.1.17)."""
    async with h.core() as core:
        body = _create_body()
        del body["lock"]
        r = await request(core.page_port, "POST", "/api/vault", headers=CHANGE,
                          body=json.dumps(body).encode())
        assert r.status == 201, r.text
        v = r.json()["vault"]
        assert v["locks"] == [] and v["keys"] == [] and v["id"] == body["id"]
        assert len(b64u_dec(v["prfSalt"])) == 32
        # Its recovery wrap is there for the code.
        r = await request(core.page_port, "GET", "/api/vault/recovery")
        assert r.json()["recoveryWrap"] == body["recoveryWrap"], r.text
        # The passkey lock, after.
        r = await request(core.page_port, "POST", "/api/vault/locks",
                          headers=CHANGE,
                          body=json.dumps(_lock("passkey")).encode())
        assert r.status == 201, r.text
        assert [lk["kind"] for lk in r.json()["vault"]["locks"]] == ["passkey"]
        details = await core.pool.fetchval(
            "SELECT details FROM journal WHERE kind = 'vault.created'")
        details = json.loads(details) if isinstance(details, str) else details
        assert details == {"lock": None}, details
        # A lock that is there must still be whole.
        other = await sign_in_as(core, "lockless@example.com")
        bad = _create_body({"kind": "passkey", "id": str(uuid.uuid4()),
                            "wrap": b64u(b"w" * 60)})
        r = await request(core.page_port, "POST", "/api/vault", headers={
            **CHANGE, "cookie": other}, body=json.dumps(bad).encode())
        assert r.status == 422 and "credential" in r.json()["error"], r.text


async def test_the_sidebar_knows_how_each_server_opens(h):
    """/api/state's machines carry their way in (0.1.17): 'cert' for those
    of Add machine, 'key' for the person's own key, 'mac' with the Mac they
    go through."""
    async with h.core() as core:
        project = await core.pool.fetchval(
            "SELECT id FROM projects WHERE owner_id = $1", core.owner.id)
        mac_id = await core.pool.fetchval(
            "INSERT INTO machines (project_id, kind, name, created_by) "
            "VALUES ($1, 'computer', 'MacBook-Pro-Denis', $2) RETURNING id",
            project, core.owner.id)
        priv = asyncssh.generate_private_key("ssh-ed25519")
        key_id = await _vault_with_key(core, core.owner.id, priv)
        await core.pool.execute(
            "INSERT INTO machines (project_id, kind, name, host, port, login, "
            "host_keys, created_by, login_method, vault_key_id, own_line) "
            "VALUES ($1, 'server', 'droplet', '203.0.113.7', 22, 'root', "
            "'{}', $2, 'key', $3, true)", project, core.owner.id, key_id)
        await core.pool.execute(
            "INSERT INTO machines (project_id, kind, name, created_by, "
            "login_method, via_machine_id, ssh_target, own_line) VALUES "
            "($1, 'server', 'db-internal', $2, 'mac', $3, 'db-internal', true)",
            project, core.owner.id, mac_id)
        state = (await request(core.page_port, "GET", "/api/state")).json()
        listed = {m["name"]: m for m in state["projects"][0]["machines"]}
        assert listed["droplet"]["method"] == "key"
        assert listed["droplet"]["via"] is None
        assert listed["db-internal"]["method"] == "mac"
        assert listed["db-internal"]["via"] == {"id": str(mac_id),
                                                "name": "MacBook-Pro-Denis"}
        assert listed["MacBook-Pro-Denis"]["method"] == "cert"
        assert listed["MacBook-Pro-Denis"]["via"] is None


async def test_locks_come_and_go(h):
    async with h.core() as core:
        await request(core.page_port, "POST", "/api/vault", headers=CHANGE,
                      body=json.dumps(_create_body()).encode())
        sent = _lock("passkey")
        sent["wrap"] = b64u(b"p" * 60)
        r = await request(core.page_port, "POST", "/api/vault/locks",
                          headers=CHANGE, body=json.dumps(sent).encode())
        assert r.status == 201, r.text
        v = r.json()["vault"]
        assert len(v["locks"]) == 2
        passkey = next(lk for lk in v["locks"] if lk["kind"] == "passkey")
        assert passkey["credentialId"] is not None
        # Each lock comes with its wrap: the device with its KEK opens VK
        # with it (a browser's passkey; the app's lock from the keychain).
        assert passkey["wrap"] == sent["wrap"], passkey
        app = next(lk for lk in v["locks"] if lk["kind"] == "app")
        assert app["wrap"] == b64u(b"w" * 60), app
        # Remove it.
        r = await request(core.page_port, "DELETE",
                          f"/api/vault/locks/{passkey['id']}", headers=CHANGE)
        assert r.status == 204, r.text
        v = (await request(core.page_port, "GET", "/api/vault")).json()["vault"]
        assert len(v["locks"]) == 1
        # The last lock stays: a vault with none could not be opened.
        last = v["locks"][0]["id"]
        r = await request(core.page_port, "DELETE",
                          f"/api/vault/locks/{last}", headers=CHANGE)
        assert r.status == 422 and r.json() == {"error": LAST_LOCK}, r.text
        # Last used.
        r = await request(core.page_port, "POST",
                          f"/api/vault/locks/{last}/used", headers=CHANGE)
        assert r.status == 204, r.text


async def test_keys_are_checked_against_their_public_half(h):
    async with h.core() as core:
        await request(core.page_port, "POST", "/api/vault", headers=CHANGE,
                      body=json.dumps(_create_body()).encode())
        body, _ = _key_body()
        r = await request(core.page_port, "POST", "/api/vault/keys",
                          headers=CHANGE, body=json.dumps(body).encode())
        assert r.status == 201, r.text
        assert len(r.json()["vault"]["keys"]) == 1
        # The same key again: refused.
        again = dict(body, id=str(uuid.uuid4()))
        r = await request(core.page_port, "POST", "/api/vault/keys",
                          headers=CHANGE, body=json.dumps(again).encode())
        assert r.status == 409, r.text
        # A wrong fingerprint.
        bad = dict(_key_body()[0], fingerprint="SHA256:not-this-key")
        r = await request(core.page_port, "POST", "/api/vault/keys",
                          headers=CHANGE, body=json.dumps(bad).encode())
        assert r.status == 422 and "fingerprint" in r.json()["error"], r.text
        # A type that does not match the key.
        bad = dict(_key_body()[0], type="ssh-rsa")
        r = await request(core.page_port, "POST", "/api/vault/keys",
                          headers=CHANGE, body=json.dumps(bad).encode())
        assert r.status == 422, r.text
        # A sealed blob that is too big.
        bad = _key_body(sealed=b"x" * (16 * 1024 + 1))[0]
        r = await request(core.page_port, "POST", "/api/vault/keys",
                          headers=CHANGE, body=json.dumps(bad).encode())
        assert r.status in (413, 422), r.text
        # Remove a key.
        key_id = (await request(core.page_port, "GET", "/api/vault")).json()[
            "vault"]["keys"][0]["id"]
        r = await request(core.page_port, "DELETE",
                          f"/api/vault/keys/{key_id}", headers=CHANGE)
        assert r.status == 204, r.text
        assert (await request(core.page_port, "GET", "/api/vault")).json()[
            "vault"]["keys"] == []


async def test_recovery_can_be_made_anew(h):
    async with h.core() as core:
        await request(core.page_port, "POST", "/api/vault", headers=CHANGE,
                      body=json.dumps(_create_body()).encode())
        r = await request(core.page_port, "GET", "/api/vault/recovery")
        assert r.status == 200 and len(b64u_dec(r.json()["recoverySalt"])) == 16
        before = (await request(core.page_port, "GET", "/api/vault")).json()[
            "vault"]["recoveryAt"]
        await asyncio.sleep(0.01)
        r = await request(core.page_port, "PUT", "/api/vault/recovery",
                          headers=CHANGE, body=json.dumps(
                              {"recoverySalt": b64u(b"n" * 16),
                               "recoveryWrap": b64u(b"m" * 60)}).encode())
        assert r.status == 204, r.text
        got = (await request(core.page_port, "GET", "/api/vault/recovery")).json()
        assert b64u_dec(got["recoverySalt"]) == b"n" * 16
        after = (await request(core.page_port, "GET", "/api/vault")).json()[
            "vault"]["recoveryAt"]
        assert after >= before


async def test_two_people_cannot_see_each_others_vaults(h):
    async with h.core() as core:
        # The owner makes a vault with a key.
        await request(core.page_port, "POST", "/api/vault", headers=CHANGE,
                      body=json.dumps(_create_body()).encode())
        body, _ = _key_body(name="owner-key")
        await request(core.page_port, "POST", "/api/vault/keys", headers=CHANGE,
                      body=json.dumps(body).encode())
        # Anna signs in; her vault is her own.
        anna = await sign_in_as(core, "anna@example.com")
        r = await request(core.page_port, "GET", "/api/vault",
                          headers={"cookie": anna})
        assert r.json() == {"vault": None}, "Anna sees nothing of the owner's"
        r = await request(core.page_port, "POST", "/api/vault",
                          headers={**CHANGE, "cookie": anna},
                          body=json.dumps(_create_body()).encode())
        assert r.status == 201, r.text
        # Anna cannot touch the owner's key by its id.
        owner_key = (await request(core.page_port, "GET", "/api/vault")).json()[
            "vault"]["keys"][0]["id"]
        r = await request(core.page_port, "DELETE",
                          f"/api/vault/keys/{owner_key}",
                          headers={**CHANGE, "cookie": anna})
        assert r.status == 404, r.text
        # The owner's key is still there.
        assert len((await request(core.page_port, "GET", "/api/vault")).json()[
            "vault"]["keys"]) == 1


# ------------------------------------------------------ the pairing

def _x25519():
    """An X25519 key pair as the browser and the Mac make: the 32-byte raw
    public key, and the private for the shared secret (unused here; the core
    only checks the commit)."""
    from cryptography.hazmat.primitives.asymmetric.x25519 import X25519PrivateKey
    from cryptography.hazmat.primitives import serialization
    priv = X25519PrivateKey.generate()
    pub = priv.public_key().public_bytes(
        serialization.Encoding.Raw, serialization.PublicFormat.Raw)
    return priv, pub


async def test_the_pairing_state_machine(h):
    async with h.core() as core:
        # The new browser (B) signs in and posts the commit.
        browser_b = Browser(core.page_port)
        await sign_in(core, browser_b, "pair@example.com")
        _, pub_b = _x25519()
        r = await browser_b.call("POST", "/api/vault/pairings",
                                 {"commit": b64u(vault.commit_of(pub_b))})
        assert r.status == 201, r.text
        pid = r.json()["id"]
        # Out of order: reveal before the Mac answered.
        r = await browser_b.call("POST", f"/api/vault/pairings/{pid}/reveal",
                                 {"pubB": b64u(pub_b)})
        assert r.status == 409, r.text
        # The Mac (A, the same account, another session) answers once.
        _, pub_a = _x25519()
        r = await browser_b.call("POST", f"/api/vault/pairings/{pid}/answer",
                                 {"pubA": b64u(pub_a)})
        assert r.status == 204, r.text
        r = await browser_b.call("POST", f"/api/vault/pairings/{pid}/answer",
                                 {"pubA": b64u(pub_a)})
        assert r.status == 409, "only one answer"
        # B reveals a key that does not match the commit: denied.
        _, other = _x25519()
        r = await browser_b.call("POST", f"/api/vault/pairings/{pid}/reveal",
                                 {"pubB": b64u(other)})
        assert r.status == 409 and "commit" in r.json()["error"], r.text
        state = (await browser_b.call("GET",
                                      f"/api/vault/pairings/{pid}")).json()
        assert state["state"] == "denied", state


async def test_a_pairing_runs_through_and_expires(h):
    async with h.core() as core:
        browser_b = Browser(core.page_port)
        await sign_in(core, browser_b, "pair2@example.com")
        _, pub_b = _x25519()
        pid = (await browser_b.call("POST", "/api/vault/pairings",
                                    {"commit": b64u(vault.commit_of(pub_b))})
               ).json()["id"]
        _, pub_a = _x25519()
        await browser_b.call("POST", f"/api/vault/pairings/{pid}/answer",
                             {"pubA": b64u(pub_a)})
        r = await browser_b.call("POST", f"/api/vault/pairings/{pid}/reveal",
                                 {"pubB": b64u(pub_b)})
        assert r.status == 204, r.text
        # The Mac approves, sealing the vault key for B (a 60-byte wrap).
        r = await browser_b.call("POST", f"/api/vault/pairings/{pid}/approve",
                                 {"sealed": b64u(b"k" * 60)})
        assert r.status == 204, r.text
        view = (await browser_b.call("GET",
                                     f"/api/vault/pairings/{pid}")).json()
        assert view["state"] == "approved" and view["sealed"], view
        # Another pairing, left to expire: it reads as over.
        _, pb = _x25519()
        pid2 = (await browser_b.call("POST", "/api/vault/pairings",
                                     {"commit": b64u(vault.commit_of(pb))})
                ).json()["id"]
        await core.pool.execute(
            "UPDATE vault_pairings SET expires_at = now() - interval '1 minute' "
            "WHERE id = $1", uuid.UUID(pid2))
        view = (await browser_b.call("GET",
                                     f"/api/vault/pairings/{pid2}")).json()
        assert view["state"] == "expired", view
        r = await browser_b.call("POST", f"/api/vault/pairings/{pid2}/answer",
                                 {"pubA": b64u(pub_a)})
        assert r.status == 409 and "expired" in r.json()["error"], r.text


async def test_deny_ends_the_new_browsers_session(h):
    async with h.core() as core:
        browser_b = Browser(core.page_port)
        await sign_in(core, browser_b, "deny@example.com")
        _, pub_b = _x25519()
        pid = (await browser_b.call("POST", "/api/vault/pairings",
                                    {"commit": b64u(vault.commit_of(pub_b))})
               ).json()["id"]
        # B's socket is open; deny closes it the way sign-out does.
        async with page_socket(core.page_port, cookie=browser_b.cookie) as ws:
            await ws.send(json.dumps({"op": "attach", "ch": 1,
                                      "id": str(uuid.uuid4())}))
            while True:
                frame = await asyncio.wait_for(ws.recv(), 5)
                if isinstance(frame, str) and json.loads(frame)["op"] == "gone":
                    break
            r = await browser_b.call("POST", f"/api/vault/pairings/{pid}/deny")
            assert r.status == 204, r.text
            code = None
            try:
                async with asyncio.timeout(5):
                    while True:
                        await ws.recv()
            except Exception as exc:        # ConnectionClosed
                code = getattr(getattr(exc, "rcvd", None), "code", None)
            assert code == 4401, code
        # B's session has ended.
        assert (await browser_b.call("GET", "/api/vault")).status == 401
        # Denied cannot be approved after.
        r = await browser_b.call("POST", f"/api/vault/pairings/{pid}/approve",
                                 {"sealed": b64u(b"k" * 60)})
        assert r.status in (401, 409), r.text


# ---------------------------------------------------- the address checks

def test_addresses_the_core_refuses():
    for bad in ("127.0.0.1", "10.0.0.5", "169.254.169.254", "::1",
                "192.168.1.1", "172.16.0.1", "224.0.0.1", "0.0.0.0",
                "::ffff:127.0.0.1", "fe80::1"):
        assert reach.allowed_ip(bad) is None, bad
    assert reach.allowed_ip("8.8.8.8") == "8.8.8.8"
    assert reach.allowed_ip("not-an-ip") is None


async def test_reachable_checks_the_address_and_the_limit(h):
    import socket
    listener = socket.socket()
    listener.bind(("127.0.0.1", 0))
    listener.listen(8)
    port = listener.getsockname()[1]
    try:
        async with h.core() as core:
            # Loopback is refused: not reachable, however it answers.
            r = await request(core.page_port, "POST", "/api/machines/reachable",
                              headers=CHANGE,
                              body=json.dumps({"host": "127.0.0.1",
                                               "port": port}).encode())
            assert r.status == 200 and r.json() == {"ok": False}, r.text
            # With the checks relaxed (as in these tests' local servers), a
            # port that answers is reachable, one that does not is not.
            reach.ALLOW_PRIVATE = True
            try:
                r = await request(core.page_port, "POST",
                                  "/api/machines/reachable", headers=CHANGE,
                                  body=json.dumps({"host": "127.0.0.1",
                                                   "port": port}).encode())
                assert r.json() == {"ok": True}, r.text
                r = await request(core.page_port, "POST",
                                  "/api/machines/reachable", headers=CHANGE,
                                  body=json.dumps({"host": "127.0.0.1",
                                                   "port": 1}).encode())
                assert r.json() == {"ok": False}, r.text
            finally:
                reach.ALLOW_PRIVATE = False
            # The rate limit per person.
            core.vault.limiter.per_minute = 2
            codes = []
            for _ in range(4):
                r = await request(core.page_port, "POST",
                                  "/api/machines/reachable", headers=CHANGE,
                                  body=json.dumps({"host": "8.8.8.8",
                                                   "port": 22}).encode())
                codes.append(r.status)
            assert 429 in codes, codes
    finally:
        listener.close()


# ----------------------------------------------- the relay end to end

async def _vault_with_key(core, user_id, priv) -> uuid.UUID:
    """A vault for the person, holding `priv`'s public half; the key's id."""
    public = priv.export_public_key().decode().strip()
    pub = asyncssh.import_public_key(public)
    async with core.pool.acquire() as conn:
        vault_id = await conn.fetchval(
            "INSERT INTO vaults (id, user_id, prf_salt, recovery_salt, "
            "recovery_wrap, recovery_at) VALUES ($1, $2, $3, $4, $5, now()) "
            "RETURNING id",
            uuid.uuid4(), user_id, b"p" * 32, b"s" * 16, b"w" * 60)
        key_id = await conn.fetchval(
            "INSERT INTO vault_keys (id, vault_id, name, type, public_key, "
            "fingerprint, sealed, source) VALUES ($1, $2, 'id_ed25519', "
            "'ssh-ed25519', $3, $4, $5, 'mac') RETURNING id",
            uuid.uuid4(), vault_id, public, pub.get_fingerprint(),
            b"sealed")
    return key_id


async def _key_machine(core, port, host_key, key_id) -> uuid.UUID:
    project = await core.pool.fetchval(
        "SELECT id FROM projects WHERE owner_id = $1", core.owner.id)
    return await core.pool.fetchval(
        """
        INSERT INTO machines (project_id, kind, name, host, port, login,
            host_keys, created_by, login_method, vault_key_id, own_line)
        VALUES ($1, 'server', 'anywhere', '127.0.0.1', $2, 'tterm', $3, $4,
                'key', $5, true)
        RETURNING id
        """, project, port,
        [host_key.export_public_key().decode().strip()], core.owner.id, key_id)


def _raw_sign(priv: asyncssh.SSHKey, alg: str, data: bytes) -> str:
    """What the device returns: the raw signature, pulled out of the SSH
    signature the key makes."""
    full = priv.sign(data, alg.encode())
    packet = SSHPacket(full)
    packet.get_string()                 # the algorithm name
    return b64u(packet.get_string())    # the raw signature


class FakePage:
    """A page socket of the owner's that answers vault.sign by signing with a
    private key (standing in for the device). `policy`: 'sign', 'unable', or
    'wrong' (signs with another key)."""

    def __init__(self, ws, priv, *, policy: str = "sign") -> None:
        self.ws = ws
        self.priv = priv
        self.wrong = asyncssh.generate_private_key("ssh-ed25519")
        self.policy = policy
        self.asked: list[dict] = []
        self.task = asyncio.create_task(self._serve())

    async def can(self, fingerprints: list[str]) -> None:
        await self.ws.send(json.dumps({"op": "vault.can", "keys": fingerprints}))

    async def _serve(self) -> None:
        try:
            async for raw in self.ws:
                if not isinstance(raw, str):
                    continue
                msg = json.loads(raw)
                if msg.get("op") != "vault.sign":
                    continue
                self.asked.append(msg)
                await self._answer(msg)
        except Exception:                # noqa: BLE001 - the socket closed
            pass

    async def _answer(self, msg: dict) -> None:
        if self.policy == "unable":
            await self.ws.send(json.dumps({"op": "vault.unable",
                                           "id": msg["id"]}))
            return
        key = self.priv if self.policy == "sign" else self.wrong
        sig = _raw_sign(key, msg["alg"], b64u_dec(msg["data"]))
        await self.ws.send(json.dumps({"op": "vault.signed", "id": msg["id"],
                                       "sig": sig}))


async def test_a_key_server_signs_in_over_the_relay(h):
    reach.ALLOW_PRIVATE = True
    home = _home()
    try:
        login, _ = _login_shell()
        priv = asyncssh.generate_private_key("ssh-ed25519")
        # The server trusts the person's own key, not the CA.
        (home / ".ssh").mkdir(parents=True, exist_ok=True)
        (home / ".ssh" / "authorized_keys").write_text(
            priv.export_public_key().decode().strip() + "\n")
        async with h.core() as core, \
                shell_server(await _ca_public(core), home, login) \
                as (port, host_key):
            key_id = await _vault_with_key(core, core.owner.id, priv)
            fp = asyncssh.import_public_key(
                priv.export_public_key().decode()).get_fingerprint()
            machine_id = await _key_machine(core, port, host_key, key_id)
            async with page_socket(core.page_port) as ws:
                page = FakePage(ws, priv)
                await page.can([fp])
                await asyncio.sleep(0.1)
                t = await core.terminals.open(core.owner, machine_id, 80, 24)
                await _until(lambda: t.state in ("open", "ended"),
                             what="the key login")
                assert t.state == "open", t.reason
                assert page.asked and page.asked[0]["key"] == fp
                # vault.signed was recorded, with the key and the machine.
                signed = await core.pool.fetchrow(
                    "SELECT machine_id, details FROM journal "
                    "WHERE kind = 'vault.signed'")
                assert signed is not None and signed["machine_id"] == machine_id
                details = json.loads(signed["details"]) if isinstance(
                    signed["details"], str) else signed["details"]
                assert details["fingerprint"] == fp
                # And the key says when it was used last (Settings › Keys).
                listed = (await request(core.page_port, "GET",
                                        "/api/vault")).json()["vault"]["keys"]
                assert [k["id"] for k in listed] == [str(key_id)]
                assert listed[0]["lastUsedAt"] is not None, listed
                await t.close()
    finally:
        reach.ALLOW_PRIVATE = False
        shutil.rmtree(home, ignore_errors=True)


async def test_a_key_server_waits_for_a_socket(h):
    reach.ALLOW_PRIVATE = True
    home = _home()
    try:
        login, _ = _login_shell()
        priv = asyncssh.generate_private_key("ssh-ed25519")
        (home / ".ssh").mkdir(parents=True, exist_ok=True)
        (home / ".ssh" / "authorized_keys").write_text(
            priv.export_public_key().decode().strip() + "\n")
        async with h.core() as core, \
                shell_server(await _ca_public(core), home, login) \
                as (port, host_key):
            key_id = await _vault_with_key(core, core.owner.id, priv)
            fp = asyncssh.import_public_key(
                priv.export_public_key().decode()).get_fingerprint()
            machine_id = await _key_machine(core, port, host_key, key_id)
            # No capable socket yet: the terminal waits and says so, longer
            # than a dial may take (0.1.19: the wait ran into the SSH
            # connection's timeout, and the terminal ended).
            ssh.CONNECT_TIMEOUT = 1
            t = await core.terminals.open(core.owner, machine_id, 80, 24)
            await _until(lambda: t.vault_wait is not None, what="the wait")
            assert t.vault_wait["key"] == fp and t.state == "connecting"
            assert t.describe()["vault"]["keyName"] == "id_ed25519"
            await asyncio.sleep(2.5)
            assert t.state == "connecting" and t.vault_wait is not None, t.reason
            # A socket announces the key; the login goes on by itself.
            async with page_socket(core.page_port) as ws:
                page = FakePage(ws, priv)
                await page.can([fp])
                await _until(lambda: t.state in ("open", "ended"),
                             what="the login after the socket")
                assert t.state == "open", t.reason
                assert t.vault_wait is None
                await t.close()
    finally:
        reach.ALLOW_PRIVATE = False
        ssh.CONNECT_TIMEOUT = 12
        shutil.rmtree(home, ignore_errors=True)


async def test_unable_is_passed_over_and_a_wrong_signature_is_refused(h):
    reach.ALLOW_PRIVATE = True
    home = _home()
    try:
        login, _ = _login_shell()
        priv = asyncssh.generate_private_key("ssh-ed25519")
        (home / ".ssh").mkdir(parents=True, exist_ok=True)
        (home / ".ssh" / "authorized_keys").write_text(
            priv.export_public_key().decode().strip() + "\n")
        async with h.core() as core, \
                shell_server(await _ca_public(core), home, login) \
                as (port, host_key):
            key_id = await _vault_with_key(core, core.owner.id, priv)
            fp = asyncssh.import_public_key(
                priv.export_public_key().decode()).get_fingerprint()
            machine_id = await _key_machine(core, port, host_key, key_id)
            # One socket cannot sign; a second one does.
            async with page_socket(core.page_port) as a, \
                    page_socket(core.page_port) as b:
                unable = FakePage(a, priv, policy="unable")
                signer = FakePage(b, priv, policy="sign")
                await unable.can([fp])
                await signer.can([fp])
                await asyncio.sleep(0.1)
                t = await core.terminals.open(core.owner, machine_id, 80, 24)
                await _until(lambda: t.state in ("open", "ended"),
                             what="the login past unable")
                assert t.state == "open", t.reason
                assert signer.asked, "the signing socket was asked"
                await t.close()
            # A socket that returns a wrong signature: the login is refused.
            async with page_socket(core.page_port) as c:
                wrong = FakePage(c, priv, policy="wrong")
                await wrong.can([fp])
                await asyncio.sleep(0.1)
                t = await core.terminals.open(core.owner, machine_id, 80, 24)
                await _until(lambda: t.state == "ended", what="the refusal")
                assert "did not accept" in (t.reason or "") \
                    or "certificate" in (t.reason or "") \
                    or "Permission" in (t.reason or ""), t.reason
    finally:
        reach.ALLOW_PRIVATE = False
        shutil.rmtree(home, ignore_errors=True)


class _Bastion(asyncssh.SSHServer):
    """A jump host: it trusts the person's key and lets asyncssh open the
    forwarded TCP connection to the target through it."""

    def __init__(self, authorized) -> None:
        self._authorized = authorized

    def connection_made(self, conn) -> None:
        self._conn = conn

    def begin_auth(self, username) -> bool:
        self._conn.set_authorized_keys(self._authorized)
        return True

    def connection_requested(self, dest_host, dest_port, orig_host, orig_port):
        return True             # allow the hop to the target


async def test_a_key_server_opens_behind_a_bastion(h):
    reach.ALLOW_PRIVATE = True
    home = _home()
    bastion = None
    try:
        login, _ = _login_shell()
        priv = asyncssh.generate_private_key("ssh-ed25519")
        pub_line = priv.export_public_key().decode().strip()
        (home / ".ssh").mkdir(parents=True, exist_ok=True)
        (home / ".ssh" / "authorized_keys").write_text(pub_line + "\n")
        jump_key = asyncssh.generate_private_key("ssh-ed25519")
        authorized = asyncssh.import_authorized_keys(pub_line + "\n")
        bastion = await asyncssh.create_server(
            lambda: _Bastion(authorized), "127.0.0.1", 0,
            server_host_keys=[jump_key])
        jump_port = bastion.sockets[0].getsockname()[1]
        async with h.core() as core, \
                shell_server(await _ca_public(core), home, login) \
                as (port, host_key):
            key_id = await _vault_with_key(core, core.owner.id, priv)
            fp = asyncssh.import_public_key(pub_line).get_fingerprint()
            project = await core.pool.fetchval(
                "SELECT id FROM projects WHERE owner_id = $1", core.owner.id)
            machine_id = await core.pool.fetchval(
                """
                INSERT INTO machines (project_id, kind, name, host, port, login,
                    host_keys, created_by, login_method, vault_key_id, own_line,
                    jump_host, jump_port, jump_login, jump_host_keys)
                VALUES ($1, 'server', 'behind', '127.0.0.1', $2, 'tterm', $3,
                        $4, 'key', $5, true, '127.0.0.1', $6, 'tterm', $7)
                RETURNING id
                """, project, port,
                [host_key.export_public_key().decode().strip()], core.owner.id,
                key_id, jump_port,
                [jump_key.export_public_key().decode().strip()])
            async with page_socket(core.page_port) as ws:
                page = FakePage(ws, priv)
                await page.can([fp])
                await asyncio.sleep(0.1)
                t = await core.terminals.open(core.owner, machine_id, 80, 24)
                await _until(lambda: t.state in ("open", "ended"),
                             what="the login through the bastion")
                assert t.state == "open", t.reason
                # The key signed twice: once for the bastion, once for the
                # target.
                assert len(page.asked) >= 2, page.asked
                await t.close()
    finally:
        reach.ALLOW_PRIVATE = False
        if bastion is not None:
            bastion.close()
            await bastion.wait_closed()
        shutil.rmtree(home, ignore_errors=True)


async def test_a_mac_terminal_runs_ssh_through_the_mac(h):
    """A 'mac' server opens a terminal on the person's Mac (a computer) that
    runs ssh to the target: the agent's open message carries `exec`, and the
    terminal is classic."""
    from .test_agents import _fake_mac
    async with h.core() as core:
        mac, computer_id, _token = await _fake_mac(core, web=2, agent="0.14.0")
        try:
            project = await core.pool.fetchval(
                "SELECT id FROM projects WHERE owner_id = $1", core.owner.id)
            server_id = await core.pool.fetchval(
                """
                INSERT INTO machines (project_id, kind, name, created_by,
                    login_method, via_machine_id, ssh_target, own_line)
                VALUES ($1, 'server', 'prod-via-mac', $2, 'mac', $3, 'prod',
                        true)
                RETURNING id
                """, project, core.owner.id, computer_id)
            t = await core.terminals.open(core.owner, server_id, 80, 24)
            await _until(lambda: t.state in ("open", "ended"),
                         what="the mac terminal")
            assert t.state == "open", t.reason
            opens = [m for m in mac.sent("open") if "exec" in m]
            assert opens and opens[-1]["exec"] == ["ssh", "--", "prod"], \
                mac.sent("open")
            assert "cmd" not in opens[-1]
            assert t.blocks is False, "a mac terminal is classic"
            await t.close()
        finally:
            await mac.gone()


async def test_a_mac_server_with_its_mac_offline_says_so(h):
    async with h.core() as core:
        # A computer that is in tTerm Web but whose agent is not connected.
        project = await core.pool.fetchval(
            "SELECT id FROM projects WHERE owner_id = $1", core.owner.id)
        computer_id = await core.pool.fetchval(
            "INSERT INTO machines (project_id, kind, name, created_by) "
            "VALUES ($1, 'computer', 'denis-mac', $2) RETURNING id",
            project, core.owner.id)
        server_id = await core.pool.fetchval(
            "INSERT INTO machines (project_id, kind, name, created_by, "
            "login_method, via_machine_id, ssh_target, own_line) VALUES "
            "($1, 'server', 'prod', $2, 'mac', $3, 'prod', true) RETURNING id",
            project, core.owner.id, computer_id)
        t = await core.terminals.open(core.owner, server_id, 80, 24)
        await _until(lambda: t.state == "ended", what="the offline Mac")
        assert "denis-mac" in (t.reason or "") and "connected" in (t.reason or "")


# ----------------------------------------------- an own key server by API

async def test_add_an_own_key_server(h):
    async with h.core() as core:
        await request(core.page_port, "POST", "/api/vault", headers=CHANGE,
                      body=json.dumps(_create_body()).encode())
        body, priv = _key_body()
        await request(core.page_port, "POST", "/api/vault/keys", headers=CHANGE,
                      body=json.dumps(body).encode())
        key_id = (await request(core.page_port, "GET", "/api/vault")).json()[
            "vault"]["keys"][0]["id"]
        state = (await request(core.page_port, "GET", "/api/state")).json()
        project = state["projects"][0]["id"]
        host_key = asyncssh.generate_private_key("ssh-ed25519")
        r = await request(core.page_port, "POST", "/api/machines/own",
                          headers=CHANGE, body=json.dumps({
                              "project": project, "name": "box", "method": "key",
                              "keyId": key_id, "host": "server.example.com",
                              "port": 22, "login": "deploy", "hostKeys": [
                                  host_key.export_public_key().decode().strip()]
                          }).encode())
        assert r.status == 201, r.text
        assert r.json()["machine"]["method"] == "key"
        row = await core.pool.fetchrow(
            "SELECT login_method, vault_key_id, login, host FROM machines "
            "WHERE name = 'box'")
        assert row["login_method"] == "key" and row["login"] == "deploy"
        assert str(row["vault_key_id"]) == key_id


async def test_add_an_own_cert_server(h):
    """method 'cert': the core asks for a principal and the CA line, the app
    puts it in the person's own authorized_keys, then the core signs in once
    with a certificate before saving the server."""
    reach.ALLOW_PRIVATE = True
    home = _home()
    try:
        async with h.core() as core:
            await remember_cas(core.pool, await core.signer.keys())
            state = (await request(core.page_port, "GET", "/api/state")).json()
            project = state["projects"][0]["id"]
            r = await request(core.page_port, "POST", "/api/machines/own/line",
                              headers=CHANGE, body=json.dumps(
                                  {"project": project, "name": "mine"}).encode())
            assert r.status == 200, r.text
            principal, line = r.json()["principal"], r.json()["line"]
            assert principal.startswith("m-") and "cert-authority" in line
            (home / ".ssh").mkdir(parents=True, exist_ok=True)
            (home / ".ssh" / "authorized_keys").write_text(line + "\n")
            async with ssh_server(core.active_ca["public_key"], home=home) \
                    as (port, host_key, _sign_ins):
                r = await request(core.page_port, "POST", "/api/machines/own",
                                  headers=CHANGE, body=json.dumps({
                                      "project": project, "name": "mine",
                                      "method": "cert", "principal": principal,
                                      "host": "127.0.0.1", "port": port,
                                      "login": "tterm", "hostKeys": [
                                          host_key.export_public_key().decode()
                                          .strip()]}).encode())
                assert r.status == 201, r.text
            row = await core.pool.fetchrow(
                "SELECT login_method, principal, ca_id FROM machines "
                "WHERE name = 'mine'")
            assert row["login_method"] == "cert"
            assert row["principal"] == principal and row["ca_id"]
            # A wrong principal (no matching line) is refused at creation.
            async with ssh_server(core.active_ca["public_key"], home=_home()) \
                    as (port2, host_key2, _s2):
                from ..core import trust
                r = await request(core.page_port, "POST", "/api/machines/own",
                                  headers=CHANGE, body=json.dumps({
                                      "project": project, "name": "nope",
                                      "method": "cert",
                                      "principal": trust.new_principal(),
                                      "host": "127.0.0.1", "port": port2,
                                      "login": "tterm", "hostKeys": [
                                          host_key2.export_public_key().decode()
                                          .strip()]}).encode())
                assert r.status == 422, r.text
    finally:
        reach.ALLOW_PRIVATE = False
        shutil.rmtree(home, ignore_errors=True)


# ----------------------------------------- the migration on an older database

async def test_the_vault_migration_upgrades_an_existing_database(h):
    """Every migration before 013 is applied, a machine added as an older
    tTerm Web would, then 013 and those after it: the machine stays a 'cert'
    one of Add machine (not an own server: dialled as before) and the vault
    tables appear."""
    url = await h.empty_database()
    pool = await db.connect(url)
    try:
        files = sorted(db.MIGRATIONS.glob("*.sql"))
        older = [p for p in files if p.stem < "013"]
        async with pool.acquire() as conn:
            await conn.execute(
                "CREATE TABLE schema_migrations (version text PRIMARY KEY, "
                "applied_at timestamptz NOT NULL DEFAULT now())")
            for path in older:
                async with conn.transaction():
                    await conn.execute(path.read_text(encoding="utf-8"))
                    await conn.execute("INSERT INTO schema_migrations (version) "
                                       "VALUES ($1)", path.stem)
        # A server from before the vault: no login_method column yet.
        uid = await pool.fetchval(
            "INSERT INTO users (name) VALUES ('Old') RETURNING id")
        pid = await pool.fetchval(
            "INSERT INTO projects (owner_id, name, code) VALUES ($1, 'P', 'P') "
            "RETURNING id", uid)
        mid = await pool.fetchval(
            "INSERT INTO machines (project_id, kind, name) VALUES ($1, "
            "'server', 'legacy') RETURNING id", pid)
        assert "login_method" not in {r["column_name"] for r in await pool.fetch(
            "SELECT column_name FROM information_schema.columns "
            "WHERE table_name = 'machines'")}
        # Now 013, and what came after it.
        applied = await db.migrate(pool)
        assert applied == [p.stem for p in files if p.stem >= "013"], applied
        assert applied[0] == "013_vault", applied
        row = await pool.fetchrow(
            "SELECT login_method, vault_key_id, own_server FROM machines "
            "WHERE id = $1", mid)
        assert row["login_method"] == "cert" and row["vault_key_id"] is None
        assert row["own_server"] is False
        tables = {r["tablename"] for r in await pool.fetch(
            "SELECT tablename FROM pg_tables WHERE schemaname = 'public'")}
        assert {"vaults", "vault_locks", "vault_keys",
                "vault_pairings"} <= tables, tables
        # The wrap size check is in place.
        try:
            await pool.execute(
                "INSERT INTO vaults (id, user_id, prf_salt, recovery_salt, "
                "recovery_wrap) VALUES ($1, $2, $3, $4, $5)", uuid.uuid4(),
                uid, b"p" * 32, b"s" * 16, b"w" * 10)
        except Exception as exc:          # noqa: BLE001
            assert "recovery_wrap" in str(exc) or "check" in str(exc).lower()
        else:
            raise AssertionError("a 10-byte recovery wrap was accepted")
    finally:
        await pool.close()



# ------------------------------------- after the security review of 01.11

def test_the_core_refuses_every_address_that_is_not_global():
    """Shared/CGNAT space, 192.0.0.0/24 (but its two global anycast
    addresses), benchmarking, documentation, unique local IPv6 and IPv4
    inside IPv6 (NAT64, 6to4) are not dialled; a real public address is."""
    for bad in ("100.64.0.1", "100.127.255.254", "192.0.0.8", "198.18.0.1",
                "198.19.255.254", "203.0.113.7", "fd00::1", "fd12:3456::1",
                "2001:db8::1", "64:ff9b::a9fe:a9fe", "64:ff9b::7f00:1",
                "2002:a9fe:a9fe::1", "::ffff:100.64.0.1"):
        assert reach.allowed_ip(bad) is None, bad
    for good in ("8.8.8.8", "1.1.1.1", "2606:4700:4700::1111"):
        assert reach.allowed_ip(good) == good, good


async def test_a_mac_server_goes_through_a_computer_of_its_own_project(h):
    """The Mac a 'mac' server goes through is a computer of the same project:
    one of another project of the person's is refused."""
    async with h.core() as core:
        state = (await request(core.page_port, "GET", "/api/state")).json()
        personal = state["projects"][0]["id"]
        r = await request(core.page_port, "POST", "/api/projects", headers=CHANGE,
                          body=json.dumps({"name": "Work"}).encode())
        assert r.status in (200, 201), r.text
        work = r.json()["id"]
        elsewhere = await core.pool.fetchval(
            "INSERT INTO machines (project_id, kind, name, created_by) "
            "VALUES ($1, 'computer', 'work-mac', $2) RETURNING id",
            uuid.UUID(work), core.owner.id)
        here = await core.pool.fetchval(
            "INSERT INTO machines (project_id, kind, name, created_by) "
            "VALUES ($1, 'computer', 'home-mac', $2) RETURNING id",
            uuid.UUID(personal), core.owner.id)

        def body(via):
            return json.dumps({"project": personal, "name": "db", "method": "mac",
                               "via": str(via), "target": "db"}).encode()
        r = await request(core.page_port, "POST", "/api/machines/own",
                          headers=CHANGE, body=body(elsewhere))
        assert r.status == 422 and "this project" in r.json()["error"], r.text
        r = await request(core.page_port, "POST", "/api/machines/own",
                          headers=CHANGE, body=body(here))
        assert r.status == 201, r.text
        row = await core.pool.fetchrow(
            "SELECT via_machine_id, own_server FROM machines WHERE name = 'db'")
        assert row["via_machine_id"] == here and row["own_server"] is True


async def test_an_own_cert_server_is_dialled_the_checked_way(h):
    """A 'cert' server the person added, with no bastion, is dialled the
    checked way at every terminal: its name resolving to the loopback is
    refused once the checks are on, and so is the dial that would take
    tTerm's line back when it is removed. A server of Add machine on the
    same loopback server still opens, as before."""
    home = _home()
    try:
        login, _ = _login_shell()
        async with h.core() as core:
            await remember_cas(core.pool, await core.signer.keys())
            state = (await request(core.page_port, "GET", "/api/state")).json()
            project = state["projects"][0]["id"]
            r = await request(core.page_port, "POST", "/api/machines/own/line",
                              headers=CHANGE, body=json.dumps(
                                  {"project": project, "name": "mine"}).encode())
            principal, line = r.json()["principal"], r.json()["line"]
            (home / ".ssh").mkdir(parents=True, exist_ok=True)
            # The person's own line, and the old one Add machine's server has.
            (home / ".ssh" / "authorized_keys").write_text(
                line + "\n" + f"cert-authority {await _ca_public(core)}\n")
            async with shell_server(await _ca_public(core), home, login) \
                    as (port, host_key):
                keys = [host_key.export_public_key().decode().strip()]
                # Made while the checks let the loopback through (as the
                # tests' servers are local), by a name that resolves to it.
                reach.ALLOW_PRIVATE = True
                try:
                    r = await request(core.page_port, "POST", "/api/machines/own",
                                      headers=CHANGE, body=json.dumps({
                                          "project": project, "name": "mine",
                                          "method": "cert", "principal": principal,
                                          "host": "localhost", "port": port,
                                          "login": "tterm",
                                          "hostKeys": keys}).encode())
                finally:
                    reach.ALLOW_PRIVATE = False
                assert r.status == 201, r.text
                own_id = uuid.UUID(r.json()["machine"]["id"])
                row = await core.pool.fetchrow(
                    "SELECT login_method, jump_host, own_server FROM machines "
                    "WHERE id = $1", own_id)
                assert (row["login_method"], row["jump_host"], row["own_server"]) \
                    == ("cert", None, True), row
                # At a terminal, with the checks on: refused, nothing dialled.
                t = await core.terminals.open(core.owner, own_id, 80, 24)
                await _until(lambda: t.state in ("open", "ended"),
                             what="the own server's terminal")
                assert t.state == "ended", t.state
                assert "not a public address" in (t.reason or ""), t.reason
                # Add machine's server on the same loopback server opens.
                lab = await _key_machine_cert(core, port, host_key)
                t2 = await core.terminals.open(core.owner, lab, 80, 24)
                await _until(lambda: t2.state in ("open", "ended"),
                             what="Add machine's server")
                assert t2.state == "open", t2.reason
                await t2.close()
                # Removed: the line is not taken back by a dial to the
                # loopback; the page gets the command instead.
                r = await request(core.page_port, "DELETE",
                                  f"/api/machines/{own_id}", headers=CHANGE)
                assert r.status == 200, r.text
                assert not r.json().get("accessRemoved") and r.json()["cleanup"], \
                    r.json()
    finally:
        reach.ALLOW_PRIVATE = False
        shutil.rmtree(home, ignore_errors=True)


async def _key_machine_cert(core, port, host_key) -> uuid.UUID:
    """A server as Add machine makes one (the old line, its own_line false),
    on the given loopback port."""
    cas = await core.signer.keys()
    ca = next(c for c in cas if c["active"])
    project = await core.pool.fetchval(
        "SELECT id FROM projects WHERE owner_id = $1", core.owner.id)
    return await core.pool.fetchval(
        "INSERT INTO machines (project_id, kind, name, host, port, login, "
        "host_keys, ca_id, created_by) VALUES ($1, 'server', 'lab', "
        "'127.0.0.1', $2, 'tterm', $3, $4, $5) RETURNING id", project, port,
        [host_key.export_public_key().decode().strip()], ca["id"], core.owner.id)


async def test_what_is_removed_from_the_vault_is_wiped(h):
    """A removed key keeps its row (and the machines that point to it) but
    not its sealed key; a removed lock keeps its row but not its wrap nor
    its credential id. The schema holds a removal to that, and a key or a
    lock in use to having them."""
    async with h.core() as core:
        await request(core.page_port, "POST", "/api/vault", headers=CHANGE,
                      body=json.dumps(_create_body()).encode())
        await request(core.page_port, "POST", "/api/vault/locks", headers=CHANGE,
                      body=json.dumps(_lock("passkey")).encode())
        body, _priv = _key_body()
        await request(core.page_port, "POST", "/api/vault/keys", headers=CHANGE,
                      body=json.dumps(body).encode())
        v = (await request(core.page_port, "GET", "/api/vault")).json()["vault"]
        key_id = v["keys"][0]["id"]
        project = (await request(core.page_port, "GET", "/api/state")).json()[
            "projects"][0]["id"]
        machine = await core.pool.fetchval(
            "INSERT INTO machines (project_id, kind, name, host, port, login, "
            "host_keys, created_by, login_method, vault_key_id, own_line, "
            "own_server) VALUES ($1, 'server', 'box', '203.0.113.9', 22, 'root', "
            "'{}', $2, 'key', $3, true, true) RETURNING id",
            uuid.UUID(project), core.owner.id, uuid.UUID(key_id))
        r = await request(core.page_port, "DELETE", f"/api/vault/keys/{key_id}",
                          headers=CHANGE)
        assert r.status == 204, r.text
        row = await core.pool.fetchrow(
            "SELECT sealed, removed_at, fingerprint FROM vault_keys WHERE id = $1",
            uuid.UUID(key_id))
        assert row["removed_at"] is not None and row["sealed"] is None, row
        assert row["fingerprint"] == body["fingerprint"]
        assert await core.pool.fetchval(
            "SELECT vault_key_id FROM machines WHERE id = $1", machine) \
            == uuid.UUID(key_id)
        passkey = next(lk for lk in v["locks"] if lk["kind"] == "passkey")
        r = await request(core.page_port, "DELETE",
                          f"/api/vault/locks/{passkey['id']}", headers=CHANGE)
        assert r.status == 204, r.text
        row = await core.pool.fetchrow(
            "SELECT wrap, credential_id, removed_at, kind FROM vault_locks "
            "WHERE id = $1", uuid.UUID(passkey["id"]))
        assert row["removed_at"] is not None and row["wrap"] is None \
            and row["credential_id"] is None and row["kind"] == "passkey", row
        # The schema: a removed key with its sealed blob, or a key in use
        # without one, is refused; the same for locks.
        for sql in (
                "UPDATE vault_keys SET sealed = '\\x01' WHERE id = $1",
                "UPDATE vault_locks SET wrap = '\\x01' WHERE id = $1"):
            target = uuid.UUID(key_id) if "vault_keys" in sql \
                else uuid.UUID(passkey["id"])
            try:
                await core.pool.execute(sql, target)
            except asyncpg.CheckViolationError:
                pass
            else:
                raise AssertionError(f"accepted: {sql}")
        app = next(lk for lk in v["locks"] if lk["kind"] == "app")
        try:
            await core.pool.execute(
                "UPDATE vault_locks SET wrap = NULL WHERE id = $1",
                uuid.UUID(app["id"]))
        except asyncpg.CheckViolationError:
            pass
        else:
            raise AssertionError("a lock in use without its wrap was accepted")


async def test_a_pairings_secrets_go_once_its_outcome_is_seen(h):
    """The Mac's and the browser's keys and the sealed vault key are cleared
    once nobody needs them: an approved pairing's when the new browser has
    read them (the Mac's reads before do not), a denied one's at once, an
    expired one's when it is seen; the sweep clears those nobody looked at
    and deletes pairings after a week."""
    from ..core import auth

    def browser_of(cookie: str) -> Browser:
        """A browser holding a session of its own (sign_in_as)."""
        browser = Browser(core.page_port)
        name, value = cookie.split("=", 1)
        browser.jar[name] = value
        return browser

    async with h.core() as core:
        email = "pairsecrets@example.com"
        # The new browser (B) and the Mac (A): two sessions of one person.
        browser_b = browser_of(await sign_in_as(core, email))
        browser_a = browser_of(await sign_in_as(core, email))

        async def pairing(answer=True, reveal=True):
            _, pub_b = _x25519()
            pid = (await browser_b.call("POST", "/api/vault/pairings", {
                "commit": b64u(vault.commit_of(pub_b))})).json()["id"]
            if answer:
                _, pub_a = _x25519()
                await browser_a.call("POST", f"/api/vault/pairings/{pid}/answer",
                                     {"pubA": b64u(pub_a)})
            if reveal:
                await browser_b.call("POST", f"/api/vault/pairings/{pid}/reveal",
                                     {"pubB": b64u(pub_b)})
            return pid

        async def stored(pid):
            return await core.pool.fetchrow(
                "SELECT state, pub_a, pub_b, sealed FROM vault_pairings "
                "WHERE id = $1", uuid.UUID(pid))

        # Approved: the Mac's look leaves it; the new browser's read takes it.
        pid = await pairing()
        await browser_a.call("POST", f"/api/vault/pairings/{pid}/approve",
                             {"sealed": b64u(b"k" * 60)})
        seen_by_a = (await browser_a.call("GET", f"/api/vault/pairings/{pid}")).json()
        assert seen_by_a["sealed"] and seen_by_a["pubA"], seen_by_a
        row = await stored(pid)
        assert row["sealed"] is not None and row["pub_a"] is not None, row
        seen_by_b = (await browser_b.call("GET", f"/api/vault/pairings/{pid}")).json()
        assert seen_by_b["state"] == "approved", seen_by_b
        assert seen_by_b["sealed"] == b64u(b"k" * 60) and seen_by_b["pubA"], seen_by_b
        row = await stored(pid)
        assert row["state"] == "approved" and row["pub_a"] is None \
            and row["pub_b"] is None and row["sealed"] is None, row
        again = (await browser_b.call("GET", f"/api/vault/pairings/{pid}")).json()
        assert again["sealed"] is None and again["pubA"] is None, again

        # Expired, then seen: cleared.
        pid = await pairing(reveal=False)
        await core.pool.execute("UPDATE vault_pairings SET expires_at = now() - "
                                "interval '1 minute' WHERE id = $1", uuid.UUID(pid))
        view = (await browser_a.call("GET", f"/api/vault/pairings/{pid}")).json()
        assert view["state"] == "expired" and view["pubA"] is None, view
        row = await stored(pid)
        assert row["state"] == "expired" and row["pub_a"] is None, row

        # Denied: cleared at once (and the new browser's session ends).
        pid = await pairing()
        r = await browser_a.call("POST", f"/api/vault/pairings/{pid}/deny", {})
        assert r.status == 204, r.text
        row = await stored(pid)
        assert row["state"] == "denied" and row["pub_a"] is None \
            and row["pub_b"] is None, row

        # The sweep: a request over for an hour that nobody looked at is
        # cleared; a pairing older than a week is gone.
        browser_c = browser_of(await sign_in_as(core, email))
        _, pub_c = _x25519()
        left = (await browser_c.call("POST", "/api/vault/pairings", {
            "commit": b64u(vault.commit_of(pub_c))})).json()["id"]
        _, pub_a = _x25519()
        await browser_a.call("POST", f"/api/vault/pairings/{left}/answer",
                             {"pubA": b64u(pub_a)})
        old = (await browser_c.call("POST", "/api/vault/pairings", {
            "commit": b64u(vault.commit_of(_x25519()[1]))})).json()["id"]
        await core.pool.execute(
            "UPDATE vault_pairings SET expires_at = now() - interval '2 hours' "
            "WHERE id = $1", uuid.UUID(left))
        await core.pool.execute(
            "UPDATE vault_pairings SET created_at = now() - interval '8 days', "
            "expires_at = now() - interval '8 days' WHERE id = $1", uuid.UUID(old))
        await auth.sweep(core.pool)
        row = await stored(left)
        assert row["state"] == "expired" and row["pub_a"] is None, row
        assert await stored(old) is None


# --------------------------- after the check in the real app of 01.11

def test_the_journal_names_the_app_by_the_device_it_signed_in_as():
    """A login the app's engine signs is the app's in the journal, by the
    device it signed in as: its socket has no browser's User-Agent, and
    without this it was "A browser". A browser is named by its own."""
    import datetime as dt
    from ..core import auth
    from ..core.accounts import Person
    anna = Person(uuid.uuid4(), "Anna", "system", "free", "anna@example.com")
    app = auth.Session(uuid.uuid4(), anna, uuid.uuid4(), "app", dt.timedelta(0),
                       "tTerm for Mac on MacBook-Pro-Denis")
    assert auth.socket_label(app, "") == "tTerm for Mac on MacBook-Pro-Denis"
    unnamed = auth.Session(uuid.uuid4(), anna, uuid.uuid4(), "app", dt.timedelta(0))
    assert auth.socket_label(unnamed, "") == "tTerm for Mac"
    chrome = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
              "(KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36")
    browser = auth.Session(uuid.uuid4(), anna, None, "code", dt.timedelta(0))
    assert auth.socket_label(browser, chrome) == "Chrome on macOS"


# ------------------------------------------- the vault password (0.1.26)

#: The shared vectors, where the page and the engine read them too.
VECTORS = (Path(__file__).resolve().parents[2] / "web" / "tests"
           / "vault-vectors.json")
WRONG = "That password does not open your vault."
PAUSED = "Too many wrong passwords."
HAS_PASSWORD = "This vault has a password: it has no recovery code any more."


def _pw_vector(name: str = "default") -> dict:
    """One of the vectors' passwords: what a client derives from it (the
    salt, the parameters, auth, the wrap for the vectors' vault id) and the
    check the core keeps."""
    return json.loads(VECTORS.read_text(encoding="utf-8"))["password"][name]


def _pw(name: str = "default", **change) -> dict:
    """A vault password as a client sends it: the vectors', or with a part
    changed."""
    v = _pw_vector(name)
    sent = {"salt": v["salt"], "kdf": dict(v["kdf"]), "auth": v["auth"],
            "wrap": v["wrap"]}
    sent.update(change)
    return sent


def _pw_made_up() -> dict:
    """Another password, as a client sends one it made up: its own salt,
    proof and wrap (random bytes here; the core cannot tell)."""
    return {"salt": b64u(os.urandom(16)),
            "kdf": {"alg": "argon2id", "m": 65536, "t": 3, "p": 1},
            "auth": b64u(os.urandom(32)), "wrap": b64u(os.urandom(60))}


def _pw_body(lock: dict | None = None) -> dict:
    """A new vault as 0.1.26 makes it, with the vectors' password: under the
    vectors' vault id (the wrap's aad), and no recovery code."""
    body = {"id": _pw_vector()["vault_id"], "password": _pw()}
    if lock is not None:
        body["lock"] = lock
    return body


async def _details(core, kind: str) -> list[dict]:
    """What the journal says of each `kind`, oldest first."""
    rows = await core.pool.fetch(
        "SELECT details FROM journal WHERE kind = $1 ORDER BY id", kind)
    return [json.loads(r["details"]) if isinstance(r["details"], str)
            else r["details"] for r in rows]


async def _open(core, auth: str, cookie: str | None = None,
                ip: str | None = None):
    """POST /api/vault/password/open from Chrome on a Mac, as the owner
    unless `cookie` says else; from `ip` as the proxy on this machine says
    it (cloudflared's header), when given."""
    headers = {**CHANGE, "user-agent": CHROME_MAC}
    if cookie is not None:
        headers["cookie"] = cookie
    if ip is not None:
        headers["cf-connecting-ip"] = ip
    return await request(core.page_port, "POST", "/api/vault/password/open",
                         headers=headers,
                         body=json.dumps({"auth": auth}).encode())


async def _wrong_count(core, user_id) -> int:
    return await core.pool.fetchval(
        "SELECT password_wrong FROM vaults WHERE user_id = $1", user_id)


async def _heard(ws, op: str, wait: float = 5.0) -> dict | None:
    """The first message `op` the socket gets within `wait` seconds."""
    try:
        async with asyncio.timeout(wait):
            while True:
                frame = await ws.recv()
                if isinstance(frame, str) and json.loads(frame).get("op") == op:
                    return json.loads(frame)
    except TimeoutError:
        return None


def test_the_password_vectors_check_out():
    """The vectors' check is SHA-256 of their auth, and it is what the core
    keeps of the password, with the wrap; auth itself is not kept. The
    small vector's parameters (fast, for the clients' own tests) are below
    what the core takes."""
    for name in ("small", "default"):
        v = _pw_vector(name)
        assert b64u(hashlib.sha256(b64u_dec(v["auth"])).digest()) == v["check"]
    v = _pw_vector()
    kept = vault._check_password(_pw())
    assert kept["check"] == b64u_dec(v["check"]), kept
    assert kept["wrap"] == b64u_dec(v["wrap"]) and kept["salt"] == b64u_dec(v["salt"])
    assert (kept["kdf"], kept["m"], kept["t"], kept["p"]) == ("argon2id", 65536, 3, 1)
    assert b64u_dec(v["auth"]) not in kept.values()
    try:
        vault._check_password(_pw("small"))
    except vault.Refused:
        pass
    else:
        raise AssertionError("m=256, t=2 was taken")


async def test_a_vault_is_made_with_a_password(h):
    """0.1.26: the vault is made with its password and no recovery code. The
    core keeps the salt, the parameters, the wrap and SHA-256 of auth (the
    vectors' check), never auth; the vault shows the salt, the parameters
    and when it was set, never the wrap nor the check."""
    async with h.core() as core:
        v = _pw_vector()
        r = await request(core.page_port, "POST", "/api/vault",
                          headers={**CHANGE, "user-agent": CHROME_MAC},
                          body=json.dumps(_pw_body(_lock())).encode())
        assert r.status == 201, r.text
        made = r.json()["vault"]
        got = await request(core.page_port, "GET", "/api/vault")
        assert got.status == 200, got.text
        for shown in (made, got.json()["vault"]):
            assert shown["id"] == v["vault_id"] and shown["recoveryAt"] is None
            assert shown["password"] == {
                "salt": v["salt"], "kdf": {"alg": "argon2id", "m": 65536,
                                           "t": 3, "p": 1},
                "setAt": shown["password"]["setAt"]}, shown["password"]
            assert isinstance(shown["password"]["setAt"], int)
            assert [lk["kind"] for lk in shown["locks"]] == ["app"]
        for secret in (v["wrap"], v["check"], v["auth"]):
            assert secret not in got.text and secret not in r.text, secret
        row = await core.pool.fetchrow("SELECT * FROM vaults WHERE id = $1",
                                       uuid.UUID(v["vault_id"]))
        assert bytes(row["password_check"]) == b64u_dec(v["check"])
        assert bytes(row["password_wrap"]) == b64u_dec(v["wrap"])
        assert bytes(row["password_salt"]) == b64u_dec(v["salt"])
        assert (row["password_kdf"], row["password_m"], row["password_t"],
                row["password_p"]) == ("argon2id", 65536, 3, 1)
        assert row["password_at"] is not None
        assert (row["recovery_salt"], row["recovery_wrap"],
                row["recovery_at"]) == (None, None, None)
        assert row["password_wrong"] == 0 and row["password_wrong_at"] is None
        kept = [bytes(value) for value in row.values()
                if isinstance(value, (bytes, bytearray, memoryview))]
        assert b64u_dec(v["auth"]) not in kept, "auth itself is never kept"
        # There is no recovery code to give.
        r = await request(core.page_port, "GET", "/api/vault/recovery")
        assert r.status == 404, r.text
        # Made, and its first password set (no code forgotten), by Chrome.
        assert await _details(core, "vault.created") == [{"lock": "app"}]
        assert await _details(core, "vault.password.set") == [
            {"recovery": False, "device": "Chrome on macOS"}]


async def test_a_vault_takes_a_password_or_a_recovery_code(h):
    """One of the two: the password (0.1.26), or the recovery code tTerm for
    Mac 0.7.x still makes vaults with; not both, and not neither."""
    async with h.core() as core:
        both = dict(_pw_body(), recoverySalt=b64u(b"s" * 16),
                    recoveryWrap=b64u(b"r" * 60))
        half = dict(_pw_body(), recoveryWrap=b64u(b"r" * 60))
        neither = {"id": str(uuid.uuid4()), "lock": _lock()}
        for body in (both, half, neither):
            r = await request(core.page_port, "POST", "/api/vault",
                              headers=CHANGE, body=json.dumps(body).encode())
            assert r.status == 422 and r.json()["error"], r.text
        assert (await request(core.page_port, "GET", "/api/vault")).json() \
            == {"vault": None}
        # The old app's form, as before.
        old = _create_body()
        r = await request(core.page_port, "POST", "/api/vault", headers=CHANGE,
                          body=json.dumps(old).encode())
        assert r.status == 201, r.text
        made = r.json()["vault"]
        assert made["password"] is None and made["recoveryAt"] is not None, made
        r = await request(core.page_port, "GET", "/api/vault/recovery")
        assert r.status == 200 and r.json() == {
            "recoverySalt": old["recoverySalt"],
            "recoveryWrap": old["recoveryWrap"]}, r.text
        # It has no password to open.
        r = await _open(core, _pw_vector()["auth"])
        assert r.status == 404, r.text
        assert await _details(core, "vault.password.set") == []


async def test_a_password_is_checked_before_it_is_kept(h):
    """The sizes and the Argon2id parameters the contract allows, and
    nothing else, when a vault is made and when a password is set; a
    refused one changes nothing."""
    def kdf(**change) -> dict:
        return dict({"alg": "argon2id", "m": 65536, "t": 3, "p": 1}, **change)
    bad = [
        _pw(kdf=kdf(m=65535)), _pw(kdf=kdf(t=2)), _pw(kdf=kdf(p=5)),
        _pw(kdf=kdf(m=1048577)), _pw(kdf=kdf(t=11)), _pw(kdf=kdf(p=0)),
        _pw(kdf=kdf(alg="argon2i")), _pw(kdf=kdf(alg="scrypt")),
        _pw(kdf={"m": 65536, "t": 3, "p": 1}), _pw(kdf=None),
        _pw(kdf="argon2id"), _pw(kdf=kdf(m=65536.0)), _pw(kdf=kdf(m="65536")),
        _pw(kdf=kdf(p=True)), _pw(kdf=kdf(t=None)),
        _pw(salt=b64u(b"s" * 15)), _pw(salt=b64u(b"s" * 17)), _pw(salt=None),
        _pw(salt=_pw()["salt"] + "="),
        _pw(auth=b64u(b"a" * 31)), _pw(auth=b64u(b"a" * 33)), _pw(auth=None),
        _pw(wrap=b64u(b"w" * 59)), _pw(wrap=b64u(b"w" * 61)), _pw(wrap=None),
        "correct horse battery staple", [], {},
    ]
    async with h.core() as core:
        for password in bad:
            body = {"id": str(uuid.uuid4()), "password": password}
            r = await request(core.page_port, "POST", "/api/vault",
                              headers=CHANGE, body=json.dumps(body).encode())
            assert r.status == 422 and r.json()["error"], (password, r.text)
        assert (await request(core.page_port, "GET", "/api/vault")).json() \
            == {"vault": None}
        # The ends of the ranges are taken, and given back as kept.
        edges = {"alg": "argon2id", "m": 1048576, "t": 10, "p": 4}
        r = await request(core.page_port, "POST", "/api/vault", headers=CHANGE,
                          body=json.dumps({"id": _pw_vector()["vault_id"],
                                           "password": _pw(kdf=edges)}).encode())
        assert r.status == 201, r.text
        assert r.json()["vault"]["password"]["kdf"] == edges
        # Setting one is checked the same way.
        for password in bad:
            r = await request(core.page_port, "PUT", "/api/vault/password",
                              headers=CHANGE, body=json.dumps(password).encode())
            assert r.status == 422 and r.json()["error"], (password, r.text)
        v = (await request(core.page_port, "GET", "/api/vault")).json()["vault"]
        assert v["password"]["kdf"] == edges, v["password"]
        assert await _details(core, "vault.password.changed") == []


async def test_the_password_opens_the_vault_ten_tries_an_hour(h):
    """The right proof gets the wrap; a wrong one is 403 with the tries
    left, counting down, and journaled; a right one starts the count again.
    After ten wrong ones within an hour of each other the tries pause until
    an hour after the last (429, retryAt), even for the right one; an hour
    later it opens, and a wrong one then starts a new count."""
    async with h.core() as core:
        v = _pw_vector()
        owner = core.owner.id
        r = await request(core.page_port, "POST", "/api/vault", headers=CHANGE,
                          body=json.dumps(_pw_body()).encode())
        assert r.status == 201, r.text
        r = await _open(core, v["auth"])
        assert r.status == 200 and r.json() == {"wrap": v["wrap"]}, r.text
        # What is not a proof at all is refused as such, and not counted.
        for bad in ("not base64!", b64u(b"a" * 31), None):
            r = await _open(core, bad)
            assert r.status == 422, r.text
        assert await _wrong_count(core, owner) == 0
        wrong = b64u(b"x" * 32)
        for left in (9, 8, 7):
            r = await _open(core, wrong)
            assert r.status == 403 and r.json() == {
                "error": WRONG, "wrong": True, "left": left}, r.text
        r = await _open(core, v["auth"])
        assert r.status == 200 and r.json() == {"wrap": v["wrap"]}, r.text
        assert await _wrong_count(core, owner) == 0
        for left in range(9, -1, -1):
            r = await _open(core, wrong)
            assert r.status == 403 and r.json() == {
                "error": WRONG, "wrong": True, "left": left}, r.text
        # The eleventh within the hour pauses, the right one too.
        last = await core.pool.fetchval(
            "SELECT password_wrong_at FROM vaults WHERE user_id = $1", owner)
        for auth in (v["auth"], wrong):
            r = await _open(core, auth)
            assert r.status == 429, r.text
            body = r.json()
            assert set(body) == {"error", "paused", "retryAt"}, body
            assert body["error"] == PAUSED and body["paused"] is True, body
            assert dt.datetime.fromisoformat(body["retryAt"]) \
                == last + dt.timedelta(hours=1), (body, last)
        # Tries in the pause are not counted, nor is the pause pushed on.
        assert await _wrong_count(core, owner) == 10
        assert await core.pool.fetchval(
            "SELECT password_wrong_at FROM vaults WHERE user_id = $1", owner) == last
        assert await _details(core, "vault.password.wrong") == [
            {"left": n, "device": "Chrome on macOS", "ip": "127.0.0.1"}
            for n in [9, 8, 7, *range(9, -1, -1)]]
        # An hour after the last wrong one, the right one opens.
        await core.pool.execute(
            "UPDATE vaults SET password_wrong_at = password_wrong_at "
            "- interval '61 minutes' WHERE user_id = $1", owner)
        r = await _open(core, v["auth"])
        assert r.status == 200 and r.json() == {"wrap": v["wrap"]}, r.text
        assert await _wrong_count(core, owner) == 0
        # Paused again and over: a wrong one is the first of a new hour's
        # count. The day's goes on (24 wrong ones today), so the tries left
        # before a pause are the day's 6, not the hour's 9.
        for _ in range(10):
            await _open(core, wrong)
        assert (await _open(core, v["auth"])).status == 429
        await core.pool.execute(
            "UPDATE vaults SET password_wrong_at = password_wrong_at "
            "- interval '61 minutes' WHERE user_id = $1", owner)
        r = await _open(core, wrong)
        assert r.status == 403 and r.json()["left"] == 6, r.text
        counts = await core.pool.fetchrow(
            "SELECT password_wrong, password_wrong_day FROM vaults "
            "WHERE user_id = $1", owner)
        assert tuple(counts) == (1, 24), counts


async def test_thirty_wrong_passwords_a_day_and_a_right_one_does_not_clear_them(h):
    """The security review of 02.11: nine wrong and one right, again and
    again, got past the hour's count for ever. The day's count is not
    cleared by a right one: the thirtieth wrong one of a day is the last,
    and from then on every try, the right one too, waits until a day after
    the first wrong one. Then the count is over, and the next wrong one
    starts a new day; a new password clears both counts at once. Each wrong
    one is journaled with the address it came from, as the proxy gives it."""
    async with h.core() as core:
        v = _pw_vector()
        owner = core.owner.id
        r = await request(core.page_port, "POST", "/api/vault", headers=CHANGE,
                          body=json.dumps(_pw_body()).encode())
        assert r.status == 201, r.text
        wrong = b64u(b"x" * 32)

        async def day_from():
            return await core.pool.fetchval(
                "SELECT password_wrong_day_at FROM vaults WHERE user_id = $1",
                owner)
        lefts = []
        first = None
        for _ in range(3):
            for _ in range(9):
                r = await _open(core, wrong, ip="198.51.100.23")
                assert r.status == 403, r.text
                lefts.append(r.json()["left"])
                first = first or await day_from()
            r = await _open(core, v["auth"])
            assert r.status == 200 and r.json() == {"wrap": v["wrap"]}, r.text
        assert lefts == [9, 8, 7, 6, 5, 4, 3, 2, 1] * 3, lefts
        # The fourth round: what is left now is the day's.
        for left in (2, 1, 0):
            r = await _open(core, wrong, ip="198.51.100.23")
            assert r.status == 403 and r.json() == {
                "error": WRONG, "wrong": True, "left": left}, r.text
        assert await day_from() == first, "the day is the first wrong one's"
        for auth in (v["auth"], wrong, v["auth"]):
            r = await _open(core, auth)
            assert r.status == 429 and r.json() == {
                "error": PAUSED, "paused": True,
                "retryAt": (first + dt.timedelta(hours=24)).isoformat()}, r.text
        counts = await core.pool.fetchrow(
            "SELECT password_wrong, password_wrong_day FROM vaults "
            "WHERE user_id = $1", owner)
        assert tuple(counts) == (3, 30), counts
        details = await _details(core, "vault.password.wrong")
        assert details == [{"left": n, "device": "Chrome on macOS",
                            "ip": "198.51.100.23"} for n in lefts + [2, 1, 0]]
        # A day after the first wrong one the count is over: the right one
        # opens, and the next wrong one is the first of a new day.
        await core.pool.execute(
            "UPDATE vaults SET password_wrong_day_at = password_wrong_day_at "
            "- interval '24 hours 1 minute', password_wrong_at = "
            "password_wrong_at - interval '24 hours 1 minute' "
            "WHERE user_id = $1", owner)
        r = await _open(core, v["auth"])
        assert r.status == 200 and r.json() == {"wrap": v["wrap"]}, r.text
        r = await _open(core, wrong)
        assert r.status == 403 and r.json()["left"] == 9, r.text
        row = await core.pool.fetchrow(
            "SELECT password_wrong, password_wrong_day, password_wrong_day_at "
            "FROM vaults WHERE user_id = $1", owner)
        assert (row["password_wrong"], row["password_wrong_day"]) == (1, 1), row
        assert row["password_wrong_day_at"] > first, row
        assert (await _details(core, "vault.password.wrong"))[-1]["ip"] == "127.0.0.1"
        # Thirty again; a new password clears both counts, and opens.
        await core.pool.execute("UPDATE vaults SET password_wrong_day = 30 "
                                "WHERE user_id = $1", owner)
        assert (await _open(core, v["auth"])).status == 429
        new = _pw_made_up()
        r = await request(core.page_port, "PUT", "/api/vault/password",
                          headers=CHANGE, body=json.dumps(new).encode())
        assert r.status == 200, r.text
        counts = await core.pool.fetchrow(
            "SELECT password_wrong, password_wrong_at, password_wrong_day, "
            "password_wrong_day_at FROM vaults WHERE user_id = $1", owner)
        assert tuple(counts) == (0, None, 0, None), counts
        r = await _open(core, new["auth"])
        assert r.status == 200 and r.json() == {"wrap": new["wrap"]}, r.text


async def test_wrong_passwords_at_once_cannot_pass_thirty_a_day(h):
    """With 25 wrong ones today and the hour's count at 0, twenty wrong
    tries at once: the row's lock counts them one by one, so five are told
    the tries left (4 down to 0) and fifteen are paused until a day after
    the first wrong one of the day."""
    async with h.core() as core:
        r = await request(core.page_port, "POST", "/api/vault", headers=CHANGE,
                          body=json.dumps(_pw_body()).encode())
        assert r.status == 201, r.text
        start = await core.pool.fetchval(
            "UPDATE vaults SET password_wrong_day = 25, password_wrong_day_at "
            "= now() - interval '3 hours' WHERE user_id = $1 "
            "RETURNING password_wrong_day_at", core.owner.id)
        answers = await asyncio.gather(*(_open(core, b64u(b"x" * 32))
                                         for _ in range(20)))
        statuses = sorted(a.status for a in answers)
        assert statuses == [403] * 5 + [429] * 15, statuses
        assert sorted(a.json()["left"] for a in answers if a.status == 403) \
            == list(range(5))
        assert {a.json()["retryAt"] for a in answers if a.status == 429} \
            == {(start + dt.timedelta(hours=24)).isoformat()}
        counts = await core.pool.fetchrow(
            "SELECT password_wrong, password_wrong_day FROM vaults "
            "WHERE user_id = $1", core.owner.id)
        assert tuple(counts) == (5, 30), counts
        assert len(await _details(core, "vault.password.wrong")) == 5


async def test_the_later_of_the_two_pauses_is_the_one_said(h):
    """The thirtieth wrong one of a day that ends in a minute, and the tenth
    of an hour: the hour's pause lasts longer than the day, so retryAt is
    the hour's, an hour after that wrong one."""
    async with h.core() as core:
        r = await request(core.page_port, "POST", "/api/vault", headers=CHANGE,
                          body=json.dumps(_pw_body()).encode())
        assert r.status == 201, r.text
        await core.pool.execute(
            "UPDATE vaults SET password_wrong = 9, password_wrong_at = now(), "
            "password_wrong_day = 29, password_wrong_day_at = now() "
            "- interval '23 hours 59 minutes' WHERE user_id = $1", core.owner.id)
        r = await _open(core, b64u(b"x" * 32))
        assert r.status == 403 and r.json()["left"] == 0, r.text
        last = await core.pool.fetchval(
            "SELECT password_wrong_at FROM vaults WHERE user_id = $1",
            core.owner.id)
        r = await _open(core, _pw_vector()["auth"])
        assert r.status == 429, r.text
        assert r.json()["retryAt"] == (last + dt.timedelta(hours=1)).isoformat()


async def test_json_nested_too_deep_is_not_json(h):
    """The security review of 02.11: arrays nested deeper than Python's
    parser goes came back as a 500 with its traceback. How deep that is
    differs: 3.12 and 3.13 stop near 10000 levels, 3.14 goes past 40000
    (30000 parsed on the owner's Mac), so the core takes the page's JSON 64
    levels deep at most (ws.page_json). On every Python, every vault body
    answers 422 for anything deeper, as for anything else that is not JSON,
    and the page's socket says it did not understand, and goes on; 64
    levels are still JSON."""

    def nested(levels: int) -> str:
        """Arrays nested `levels` deep: "[[]]" for 2."""
        return "[" * levels + "]" * levels

    def attach(inside: str) -> str:
        """An attach, which the socket answers with "gone" for a terminal
        that is not there, with `inside` one level down in it."""
        return ('{"op": "attach", "ch": 1, "id": "%s", "x": %s}'
                % (uuid.uuid4(), inside))

    deep_list = ("[" * 30000 + "]" * 30000).encode()
    deep_object = ('{"a":' * 10000 + "1" + "}" * 10000).encode()
    async with h.core() as core:
        for method, path in (("POST", "/api/vault"),
                             ("POST", "/api/vault/password/open"),
                             ("PUT", "/api/vault/password"),
                             ("PUT", "/api/vault/recovery"),
                             ("POST", "/api/vault/locks"),
                             ("POST", "/api/vault/keys"),
                             ("POST", "/api/vault/pairings")):
            for body in (deep_list, deep_object, nested(65).encode()):
                r = await request(core.page_port, method, path,
                                  headers=CHANGE, body=body)
                assert r.status == 422 and r.json() == {
                    "error": "That is not JSON."}, (path, r.status, r.text[:200])
        r = await request(core.page_port, "POST", "/api/vault",
                          headers=CHANGE, body=nested(64).encode())
        assert r.status == 422 and r.json() == {
            "error": "That is not a vault request."}, "64 levels are JSON"
        async with page_socket(core.page_port) as ws:
            for text in (deep_list.decode(), deep_object.decode(),
                         attach(nested(64))):
                await ws.send(text)
                assert await _heard(ws, "error") == {
                    "op": "error", "message": "Not understood."}, text[:60]
            await ws.send(attach(nested(63)))
            assert await _heard(ws, "gone") is not None, "the socket goes on"


async def test_wrong_passwords_sent_at_once_cannot_pass_ten(h):
    """Twenty wrong tries at once: the vault row's lock counts them one by
    one, so ten are told the tries left (9 down to 0, each once) and the
    other ten are paused; then the right one is paused too."""
    async with h.core() as core:
        r = await request(core.page_port, "POST", "/api/vault", headers=CHANGE,
                          body=json.dumps(_pw_body()).encode())
        assert r.status == 201, r.text
        wrong = b64u(b"x" * 32)
        answers = await asyncio.gather(*(_open(core, wrong) for _ in range(20)))
        statuses = sorted(r.status for r in answers)
        assert statuses == [403] * 10 + [429] * 10, statuses
        assert sorted(r.json()["left"] for r in answers if r.status == 403) \
            == list(range(10))
        assert await _wrong_count(core, core.owner.id) == 10
        assert len(await _details(core, "vault.password.wrong")) == 10
        assert (await _open(core, _pw_vector()["auth"])).status == 429


async def test_a_password_replaces_the_recovery_code(h):
    """A vault made before 0.1.26 keeps its recovery code until a password
    is set: setting one forgets the code in the same statement, and the
    journal says a code was forgotten; a new code is refused from then on.
    A later change is journaled as one, starts the wrong count again, and
    the old password no longer opens the vault."""
    async with h.core() as core:
        v = _pw_vector()
        owner = core.owner.id
        old = dict(_create_body(), id=v["vault_id"])
        r = await request(core.page_port, "POST", "/api/vault", headers=CHANGE,
                          body=json.dumps(old).encode())
        assert r.status == 201, r.text
        assert (await request(core.page_port, "GET",
                              "/api/vault/recovery")).status == 200
        r = await request(core.page_port, "PUT", "/api/vault/password",
                          headers={**CHANGE, "user-agent": CHROME_MAC},
                          body=json.dumps(_pw()).encode())
        assert r.status == 200, r.text
        shown = r.json()["vault"]
        assert shown["recoveryAt"] is None and shown["password"]["salt"] == v["salt"]
        assert v["wrap"] not in r.text and v["check"] not in r.text
        assert len(shown["locks"]) == 1, "the locks stay as they were"
        r = await request(core.page_port, "GET", "/api/vault/recovery")
        assert r.status == 404, r.text
        row = await core.pool.fetchrow(
            "SELECT recovery_salt, recovery_wrap, recovery_at, password_check "
            "FROM vaults WHERE user_id = $1", owner)
        assert (row["recovery_salt"], row["recovery_wrap"],
                row["recovery_at"]) == (None, None, None), row
        assert bytes(row["password_check"]) == b64u_dec(v["check"])
        assert await _details(core, "vault.password.set") == [
            {"recovery": True, "device": "Chrome on macOS"}]
        # No new recovery code for it now.
        r = await request(core.page_port, "PUT", "/api/vault/recovery",
                          headers=CHANGE, body=json.dumps(
                              {"recoverySalt": b64u(b"n" * 16),
                               "recoveryWrap": b64u(b"m" * 60)}).encode())
        assert r.status == 409 and r.json() == {"error": HAS_PASSWORD}, r.text
        assert (await request(core.page_port, "GET",
                              "/api/vault/recovery")).status == 404
        # Two wrong tries, then a new password: a change, the count at 0.
        for _ in range(2):
            await _open(core, b64u(b"x" * 32))
        assert await _wrong_count(core, owner) == 2
        new = _pw_made_up()
        r = await request(core.page_port, "PUT", "/api/vault/password",
                          headers=CHANGE, body=json.dumps(new).encode())
        assert r.status == 200, r.text
        assert r.json()["vault"]["password"]["salt"] == new["salt"]
        counts = await core.pool.fetchrow(
            "SELECT password_wrong, password_wrong_at, password_wrong_day, "
            "password_wrong_day_at FROM vaults WHERE user_id = $1", owner)
        assert tuple(counts) == (0, None, 0, None), counts
        assert await _details(core, "vault.password.changed") == [
            {"device": "A browser"}]
        assert len(await _details(core, "vault.password.set")) == 1
        # The old password does not open it any more; the new one does.
        r = await _open(core, v["auth"])
        assert r.status == 403 and r.json()["left"] == 9, r.text
        r = await _open(core, new["auth"])
        assert r.status == 200 and r.json() == {"wrap": new["wrap"]}, r.text


async def test_the_last_lock_stays_with_a_password_too(h):
    """Change 6 stands in 0.1.26: the vault's last lock is never taken off,
    with a password or without; with another lock beside it, either one
    may go, and then the other stays."""
    async with h.core() as core:
        r = await request(core.page_port, "POST", "/api/vault", headers=CHANGE,
                          body=json.dumps(_pw_body(_lock())).encode())
        assert r.status == 201, r.text
        last = r.json()["vault"]["locks"][0]["id"]
        r = await request(core.page_port, "DELETE", f"/api/vault/locks/{last}",
                          headers=CHANGE)
        assert r.status == 422 and r.json() == {"error": LAST_LOCK}, r.text
        v = (await request(core.page_port, "GET", "/api/vault")).json()["vault"]
        assert [lk["id"] for lk in v["locks"]] == [last], v["locks"]
        assert await core.pool.fetchval(
            "SELECT wrap FROM vault_locks WHERE id = $1", uuid.UUID(last)), \
            "the refused lock keeps its wrap"
        # With a second lock, the first may go; then the second stays.
        r = await request(core.page_port, "POST", "/api/vault/locks",
                          headers=CHANGE, body=json.dumps(_lock("passkey")).encode())
        assert r.status == 201, r.text
        passkey = next(lk["id"] for lk in r.json()["vault"]["locks"]
                       if lk["kind"] == "passkey")
        r = await request(core.page_port, "DELETE", f"/api/vault/locks/{last}",
                          headers=CHANGE)
        assert r.status == 204, r.text
        r = await request(core.page_port, "DELETE",
                          f"/api/vault/locks/{passkey}", headers=CHANGE)
        assert r.status == 422 and r.json() == {"error": LAST_LOCK}, r.text
        # A vault of before (a recovery code, one lock): the same, before its
        # password is set and after.
        anna = await sign_in_as(core, "anna.lock@example.com")
        as_anna = {**CHANGE, "cookie": anna}
        r = await request(core.page_port, "POST", "/api/vault", headers=as_anna,
                          body=json.dumps(_create_body()).encode())
        assert r.status == 201, r.text
        hers = r.json()["vault"]["locks"][0]["id"]
        r = await request(core.page_port, "DELETE", f"/api/vault/locks/{hers}",
                          headers=as_anna)
        assert r.status == 422 and r.json() == {"error": LAST_LOCK}, r.text
        r = await request(core.page_port, "PUT", "/api/vault/password",
                          headers=as_anna, body=json.dumps(_pw_made_up()).encode())
        assert r.status == 200, r.text
        r = await request(core.page_port, "DELETE", f"/api/vault/locks/{hers}",
                          headers=as_anna)
        assert r.status == 422 and r.json() == {"error": LAST_LOCK}, r.text
        v = (await request(core.page_port, "GET", "/api/vault",
                           headers={"cookie": anna})).json()["vault"]
        assert [lk["id"] for lk in v["locks"]] == [hers], v["locks"]


async def test_two_locks_taken_off_at_once_leave_the_last(h):
    """The vault's row is held while a removal counts the locks: two
    removals at once (here let go at the same moment, after a transaction
    that held both locks' rows) take one lock off and refuse the other, so
    the last lock stays. In 0.1.17 both could pass the count."""
    async with h.core() as core:
        r = await request(core.page_port, "POST", "/api/vault", headers=CHANGE,
                          body=json.dumps(_pw_body(_lock())).encode())
        assert r.status == 201, r.text
        r = await request(core.page_port, "POST", "/api/vault/locks",
                          headers=CHANGE, body=json.dumps(_lock("passkey")).encode())
        assert r.status == 201, r.text
        ids = [lk["id"] for lk in r.json()["vault"]["locks"]]
        assert len(ids) == 2, ids
        async with core.pool.acquire() as conn:
            held = conn.transaction()
            await held.start()
            await conn.execute("SELECT 1 FROM vault_locks WHERE id = ANY($1::uuid[]) "
                               "FOR UPDATE", [uuid.UUID(i) for i in ids])
            removals = [asyncio.create_task(request(
                core.page_port, "DELETE", f"/api/vault/locks/{i}",
                headers=CHANGE)) for i in ids]
            await asyncio.sleep(0.5)
            assert not any(t.done() for t in removals), "they wait for the rows"
            await held.rollback()
        answers = await asyncio.gather(*removals)
        assert sorted(a.status for a in answers) == [204, 422], \
            [a.text for a in answers]
        v = (await request(core.page_port, "GET", "/api/vault")).json()["vault"]
        assert len(v["locks"]) == 1, v["locks"]


async def test_nobody_else_opens_sets_or_reads_a_vault_password(h):
    """Another person's session reaches only their own vault: the owner's
    password neither opens, changes nor shows there, and tries made there
    count on their own vault, not the owner's."""
    async with h.core() as core:
        v = _pw_vector()
        r = await request(core.page_port, "POST", "/api/vault", headers=CHANGE,
                          body=json.dumps(_pw_body()).encode())
        assert r.status == 201, r.text
        anna = await sign_in_as(core, "anna@example.com")
        as_anna = {**CHANGE, "cookie": anna}
        r = await request(core.page_port, "GET", "/api/vault",
                          headers={"cookie": anna})
        assert r.json() == {"vault": None}, r.text
        r = await _open(core, v["auth"], cookie=anna)
        assert r.status == 404 and "wrap" not in r.json(), r.text
        r = await request(core.page_port, "PUT", "/api/vault/password",
                          headers=as_anna, body=json.dumps(_pw_made_up()).encode())
        assert r.status == 404, r.text
        r = await request(core.page_port, "GET", "/api/vault/recovery",
                          headers={"cookie": anna})
        assert r.status == 404, r.text
        r = await request(core.page_port, "PUT", "/api/vault/recovery",
                          headers=as_anna, body=json.dumps(
                              {"recoverySalt": b64u(b"n" * 16),
                               "recoveryWrap": b64u(b"m" * 60)}).encode())
        assert r.status == 404, r.text
        # Her own vault, with her own password: the owner's proof is a wrong
        # one there, counted on hers.
        r = await request(core.page_port, "POST", "/api/vault", headers=as_anna,
                          body=json.dumps({"id": str(uuid.uuid4()),
                                           "password": _pw_made_up()}).encode())
        assert r.status == 201, r.text
        r = await _open(core, v["auth"], cookie=anna)
        assert r.status == 403 and r.json()["left"] == 9, r.text
        r = await request(core.page_port, "PUT", "/api/vault/password",
                          headers=as_anna, body=json.dumps(_pw_made_up()).encode())
        assert r.status == 200, r.text
        # The owner's is as it was.
        assert await _wrong_count(core, core.owner.id) == 0
        r = await _open(core, v["auth"])
        assert r.status == 200 and r.json() == {"wrap": v["wrap"]}, r.text
        mine = (await request(core.page_port, "GET", "/api/vault")).json()["vault"]
        assert mine["password"]["salt"] == v["salt"], mine["password"]
        # And signed out, nothing at all.
        r = await request(core.page_port, "POST", "/api/vault/password/open",
                          headers={**CHANGE, "cookie": ""},
                          body=json.dumps({"auth": v["auth"]}).encode())
        assert r.status == 401, r.text


async def test_the_persons_pages_hear_that_the_password_changed(h):
    """After a password is set, vault.changed reaches the person's pages
    (they read the vault again), and nobody else's."""
    async with h.core() as core:
        r = await request(core.page_port, "POST", "/api/vault", headers=CHANGE,
                          body=json.dumps(_create_body()).encode())
        assert r.status == 201, r.text
        anna = await sign_in_as(core, "anna.pages@example.com")
        async with page_socket(core.page_port) as mine, \
                page_socket(core.page_port, cookie=anna) as hers:
            r = await request(core.page_port, "PUT", "/api/vault/password",
                              headers=CHANGE, body=json.dumps(_pw()).encode())
            assert r.status == 200, r.text
            assert await _heard(mine, "vault.changed") == {"op": "vault.changed"}
            assert await _heard(hers, "vault.changed", wait=0.5) is None
            # A change again; and opening it is no change.
            r = await request(core.page_port, "PUT", "/api/vault/password",
                              headers=CHANGE,
                              body=json.dumps(_pw_made_up()).encode())
            assert r.status == 200, r.text
            assert await _heard(mine, "vault.changed") == {"op": "vault.changed"}
            r = await _open(core, b64u(b"x" * 32))
            assert r.status == 403, r.text
            assert await _heard(mine, "vault.changed", wait=0.5) is None


async def test_the_password_migration_keeps_a_vault_of_before(h):
    """020 on a database with a vault of 0.1.25 (a recovery code): the vault
    stays as it was, with no password and no wrong tries. From then on the
    schema holds a vault to a whole recovery code or none, a whole password
    or none, at least one of the two, and the password to the contract's
    sizes and parameters."""
    url = await h.empty_database()
    pool = await db.connect(url)
    try:
        files = sorted(db.MIGRATIONS.glob("*.sql"))
        async with pool.acquire() as conn:
            await conn.execute(
                "CREATE TABLE schema_migrations (version text PRIMARY KEY, "
                "applied_at timestamptz NOT NULL DEFAULT now())")
            for path in files:
                if path.stem >= "020":
                    continue
                async with conn.transaction():
                    await conn.execute(path.read_text(encoding="utf-8"))
                    await conn.execute("INSERT INTO schema_migrations (version) "
                                       "VALUES ($1)", path.stem)
        uid = await pool.fetchval(
            "INSERT INTO users (name) VALUES ('Old') RETURNING id")
        vid = await pool.fetchval(
            "INSERT INTO vaults (id, user_id, prf_salt, recovery_salt, "
            "recovery_wrap) VALUES ($1, $2, $3, $4, $5) RETURNING id",
            uuid.uuid4(), uid, b"p" * 32, b"s" * 16, b"r" * 60)
        applied = await db.migrate(pool)
        assert applied == ["020_vault_password"], applied
        row = await pool.fetchrow("SELECT * FROM vaults WHERE id = $1", vid)
        assert bytes(row["recovery_wrap"]) == b"r" * 60 and row["recovery_at"]
        assert row["password_salt"] is None and row["password_wrong"] == 0
        assert row["password_wrong_day"] == 0 and row["password_wrong_day_at"] is None
        view = await vault.get_vault(pool, uid, None)
        assert view["password"] is None and view["recoveryAt"], view

        async def refused(sql: str, *args) -> None:
            try:
                await pool.execute(sql, *args)
            except asyncpg.CheckViolationError:
                return
            raise AssertionError(f"accepted: {sql} {args}")

        no_code = ("UPDATE vaults SET recovery_salt = NULL, recovery_wrap = NULL, "
                   "recovery_at = NULL WHERE id = $1")
        await refused(no_code, vid)
        await refused("UPDATE vaults SET recovery_at = NULL WHERE id = $1", vid)
        await refused("UPDATE vaults SET password_salt = $2 WHERE id = $1",
                      vid, b"s" * 16)
        await refused("UPDATE vaults SET password_wrong = -1 WHERE id = $1", vid)
        await refused("UPDATE vaults SET password_wrong_day = -1 WHERE id = $1",
                      vid)
        good = {"salt": b"s" * 16, "kdf": "argon2id", "m": 65536, "t": 3,
                "p": 1, "check": b"c" * 32, "wrap": b"w" * 60}
        set_password = (
            "UPDATE vaults SET password_salt = $2, password_kdf = $3, "
            "password_m = $4, password_t = $5, password_p = $6, "
            "password_check = $7, password_wrap = $8, password_at = now() "
            "WHERE id = $1")
        for change in ({"m": 65535}, {"m": 1048577}, {"t": 2}, {"t": 11},
                       {"p": 0}, {"p": 5}, {"kdf": "argon2i"},
                       {"salt": b"s" * 15}, {"check": b"c" * 31},
                       {"wrap": b"w" * 59}, {"wrap": b"w" * 61}):
            await refused(set_password, vid, *dict(good, **change).values())
        await refused(set_password.replace(", password_at = now()", ""),
                      vid, *good.values())
        # A whole password: then the code may go.
        await pool.execute(set_password, vid, *good.values())
        await pool.execute(no_code, vid)
        view = await vault.get_vault(pool, uid, None)
        assert view["recoveryAt"] is None and view["password"]["kdf"] == {
            "alg": "argon2id", "m": 65536, "t": 3, "p": 1}, view
        await refused("UPDATE vaults SET password_salt = NULL, "
                      "password_kdf = NULL, password_m = NULL, password_t = NULL, "
                      "password_p = NULL, password_check = NULL, "
                      "password_wrap = NULL, password_at = NULL WHERE id = $1", vid)
    finally:
        await pool.close()
