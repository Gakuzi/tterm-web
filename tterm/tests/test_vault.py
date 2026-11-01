"""The vault: its API, the pairing state machine, the signing relay on the
test sshd, the address checks, and the migration on an existing database.

The crypto the core checks is exercised with the shared test vectors
(vault-vectors.json): the pairing commit, and the raw signature → SSH
signature blob and its verification. The core never sees a private key or
the vault key in the clear, so the tests feed it what the page and the
device would, and hold the private key themselves to stand in for the
device over the socket.
"""
from __future__ import annotations

import asyncio
import base64
import json
import shutil
import uuid

import asyncpg
import asyncssh
from asyncssh.packet import SSHPacket

from ..core import db, reach, ssh, vault
from ..core.machines import remember_cas
from .harness import page_socket, request, shell_server, sign_in_as, ssh_server
from .test_auth import Browser, sign_in
from .test_terminals import _ca_public, _home, _login_shell, _until

CHANGE = {"x-tterm": "1", "content-type": "application/json"}
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
        assert r.status == 422 and "only lock" in r.json()["error"], r.text
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
            "recovery_wrap) VALUES ($1, $2, $3, $4, $5) RETURNING id",
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
