"""Keys open on this device (tTerm Web 0.1.28, vault-design.md v3).

The owner's question of 03.11: whoever got into the account with a code
from the email opened his key servers, watched and typed in every terminal
and read the logs, while his Mac was on with its vault open. From 0.1.28 a
guarded machine (a server with the person's key, one through their Mac, a
computer) reaches only a device that proved its keys open: by a key of the
vault signing its socket's nonce, or by the vault password. These checks
hold the core to it: the proofs, what a device without them gets (423 and
`locked`, and nothing of the machine), the vault's changes that would give
a device a proof of its own, the app's own computer, the relay that asks
only the session of the terminal, and that nothing is closed while the
person has no vault a device could prove open.
"""
from __future__ import annotations

import asyncio
import base64
import hashlib
import json
import os
import shutil
import subprocess
import tempfile
import uuid
from pathlib import Path

import asyncssh
from asyncssh.packet import SSHPacket

from ..core import auth, machines, reach, vault
from ..api.page import LOCKED_FIELDS
from .harness import page_socket, request, session_id_of, shell_server
from .test_agents import FakeMac, _fake_mac, _hello, _hub
from .test_app_sign_in import signed_in_app
from .test_logs import _ran, _today
from .test_terminals import CHANGE, _ca_public, _home, _login_shell, _until
from .test_vault import (FakePage, _challenge, _heard, _heard_one, _key_into,
                         _key_machine, _open, _prove, _proven, _proving, _pw,
                         _pw_body, _pw_made_up, _raw_sign, _vault_with_key,
                         _wrong_count, b64u)

LOCKED = {"error", "locked", "machine"}


def _b64u_dec(text: str) -> bytes:
    return base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))


async def _made_vault(core, cookie: str | None = None) -> None:
    """A vault with the vectors' password: the keys guard from now on."""
    headers = dict(CHANGE)
    if cookie is not None:
        headers["cookie"] = cookie
    r = await request(core.page_port, "POST", "/api/vault", headers=headers,
                      body=json.dumps(_pw_body()).encode())
    assert r.status == 201, r.text


async def _opened(core, machine_id: uuid.UUID, *, cookie: str | None = None):
    """POST /api/terminals as the page does it: the answer."""
    headers = dict(CHANGE)
    if cookie is not None:
        headers["cookie"] = cookie
    return await request(core.page_port, "POST", "/api/terminals",
                         headers=headers,
                         body=json.dumps({"machineId": str(machine_id),
                                          "cols": 80, "rows": 24}).encode())


async def _project(core) -> uuid.UUID:
    return await core.pool.fetchval(
        "SELECT id FROM projects WHERE owner_id = $1 ORDER BY created_at "
        "LIMIT 1", core.owner.id)


async def _cert_server(core, project_id, name="lab") -> tuple[uuid.UUID, uuid.UUID]:
    """A server on tTerm's line (not guarded) and an ended terminal on it,
    as rows: for what lists both kinds."""
    machine = await core.pool.fetchval(
        "INSERT INTO machines (project_id, kind, name, host, port, login, "
        "host_keys, created_by) VALUES ($1, 'server', $2, '203.0.113.7', 22, "
        "'tterm', '{}', $3) RETURNING id", project_id, name, core.owner.id)
    terminal = await core.pool.fetchval(
        "INSERT INTO terminals (machine_id, owner_id, name, closed_at) "
        "VALUES ($1, $2, '1', now()) RETURNING id", machine, core.owner.id)
    return machine, terminal


# ------------------------------------------------------------ the proofs

async def test_a_socket_proves_its_keys_by_a_key_or_the_password(h):
    """Each socket its own nonce; a key of the vault over that nonce's blob,
    or the vault password's proof, and nothing else: not another socket's
    nonce, not a login's data, not a key out of the vault or removed, not
    a way of signing the key does not have. A wrong password counts as on
    password/open. The proof goes with vault.closed and with the socket."""
    async with h.core() as core:
        await _made_vault(core)
        priv = asyncssh.generate_private_key("ssh-ed25519")
        key_id = await _key_into(core, core.owner.id, priv)
        # PUT /api/vault/recovery: 409 where the keys are open (a vault with
        # a password has no recovery code), 423 where they are not.
        probe = json.dumps({"recoverySalt": b64u(b"n" * 16),
                            "recoveryWrap": b64u(b"m" * 60)}).encode()

        async def keys_open_here() -> bool:
            r = await request(core.page_port, "PUT", "/api/vault/recovery",
                              headers=CHANGE, body=probe)
            assert r.status in (409, 423), r.text
            return r.status == 409

        assert not await keys_open_here()
        async with page_socket(core.page_port) as a, \
                page_socket(core.page_port) as b:
            nonce_a, nonce_b = await _challenge(a), await _challenge(b)
            assert nonce_a != nonce_b
            assert len(_b64u_dec(nonce_a)) == vault.NONCE_LEN
            # Another socket's nonce, signed: no proof here.
            stolen = {"op": "vault.prove", "key": _proof_key(priv),
                      "alg": "ssh-ed25519",
                      "sig": _raw_sign(priv, "ssh-ed25519",
                                       vault.proof_blob(nonce_a))}
            await b.send(json.dumps(stolen))
            said = await _heard_one(b, ("vault.proven", "vault.unproven"))
            assert said["op"] == "vault.unproven", said
            # A login's data, signed by the right key: no proof either.
            login = _raw_sign(priv, "ssh-ed25519", b"session-id-and-userauth")
            for bad in (
                    {**stolen, "sig": login},
                    {**stolen, "sig": b64u(b"x" * 64)},
                    {**stolen, "alg": "rsa-sha2-512"},
                    {**stolen, "alg": "made-up"},
                    {**stolen, "key": "SHA256:not-a-key-of-the-vault"},
                    {**stolen, "key": 7},
                    {"op": "vault.prove", "auth": b64u(b"a" * 31)}):
                bad = dict(bad)
                if bad.get("sig") == stolen["sig"]:
                    bad["sig"] = _raw_sign(priv, "ssh-ed25519",
                                           vault.proof_blob(nonce_b))
                await b.send(json.dumps(bad))
                said = await _heard_one(b, ("vault.proven", "vault.unproven"))
                assert said["op"] == "vault.unproven" and said["error"], (bad, said)
            assert not await keys_open_here()
            # The right one, on its own socket.
            await a.send(json.dumps(stolen))
            assert await _heard_one(a, ("vault.proven", "vault.unproven")) \
                == {"op": "vault.proven"}
            assert await keys_open_here()
            # The keys closed on that device: the proof goes.
            await a.send(json.dumps({"op": "vault.closed"}))
            await asyncio.sleep(0.2)
            assert not await keys_open_here()
            # The password, wrong: counted as on password/open, journaled
            # with the device and the address.
            await b.send(json.dumps({"op": "vault.prove",
                                     "auth": b64u(b"x" * 32)}))
            said = await _heard_one(b, ("vault.proven", "vault.unproven"))
            assert said["op"] == "vault.unproven" and said["wrong"] is True \
                and said["left"] == 9, said
            assert await core.pool.fetchval(
                "SELECT password_wrong FROM vaults WHERE user_id = $1",
                core.owner.id) == 1
            wrong = await core.pool.fetchval(
                "SELECT details FROM journal WHERE kind = 'vault.password.wrong'")
            wrong = json.loads(wrong) if isinstance(wrong, str) else wrong
            assert wrong["ip"] == "127.0.0.1" and wrong["device"], wrong
            # And right.
            await b.send(json.dumps({"op": "vault.prove",
                                     "auth": _pw()["auth"]}))
            assert await _heard_one(b, ("vault.proven", "vault.unproven")) \
                == {"op": "vault.proven"}
            assert await keys_open_here()
        # The sockets gone, the proofs went with them.
        await asyncio.sleep(0.2)
        assert not await keys_open_here()
        # A key taken out of the vault proves nothing any more.
        await core.pool.execute(
            "UPDATE vault_keys SET removed_at = now(), sealed = NULL "
            "WHERE id = $1", key_id)
        async with page_socket(core.page_port) as ws:
            said = await _prove(ws, priv=priv)
            assert said["op"] == "vault.unproven", said


def _proof_key(priv) -> str:
    return asyncssh.import_public_key(
        priv.export_public_key().decode()).get_fingerprint()


def test_the_shared_proof_vector_checks_out():
    """The proof of the shared vectors (vault-vectors.json, "proof"), which
    the page and the engine make with the vectors' key: the core builds the
    same blob from the nonce, and the signature verifies with that key."""
    from .test_vault import VECTORS
    v = json.loads(VECTORS.read_text(encoding="utf-8"))
    proof, key = v["proof"], v["key"]
    assert vault.proof_blob(proof["nonce"]) == _b64u_dec(proof["blob"])
    public = key["openssh_public"]
    assert asyncssh.import_public_key(public).get_fingerprint() == proof["key"]
    vault.verify_ssh_signature(public, _b64u_dec(proof["blob"]),
                               proof["alg"].encode(), _b64u_dec(proof["raw_sig"]))


async def test_the_proof_blob_is_sshsig(h):
    """The blob is OpenSSH's SSHSIG of the namespace, over SHA-512 of the
    message and the nonce: what `ssh-keygen -Y sign -n tterm-keys@tterm.net`
    signs, and no SSH login's data (that starts with a length)."""
    nonce = "abc_-DEF"
    blob = vault.proof_blob(nonce)
    assert blob.startswith(b"SSHSIG\x00\x00\x00\x14tterm-keys@tterm.net"
                           b"\x00\x00\x00\x00\x00\x00\x00\x06sha512"
                           b"\x00\x00\x00\x40"), blob[:60]
    assert blob.endswith(hashlib.sha512(b"tterm keys open v1\n"
                                        + nonce.encode()).digest())
    assert len(blob) == 6 + 4 + 20 + 4 + 4 + 6 + 4 + 64


# ---------------------------------------------------------- what is closed

async def test_nothing_is_closed_without_a_vault_to_prove(h):
    """No vault, or one with a recovery code and no key: no device could
    prove anything, so the computer opens as before 0.1.28. With a
    password, it is closed until a socket proves the keys open."""
    async with h.core() as core:
        mac, computer, _ = await _fake_mac(core, web=2, agent="0.14.0")
        try:
            r = await _opened(core, computer)
            assert r.status == 201, r.text
            r = await request(core.page_port, "POST", "/api/vault",
                              headers=CHANGE, body=json.dumps({
                                  "id": str(uuid.uuid4()),
                                  "recoverySalt": b64u(b"s" * 16),
                                  "recoveryWrap": b64u(b"r" * 60),
                                  "lock": {"id": str(uuid.uuid4()),
                                           "kind": "app",
                                           "wrap": b64u(b"w" * 60)}}).encode())
            assert r.status == 201, r.text
            r = await _opened(core, computer)
            assert r.status == 201, r.text
            # A password: from now on a device proves its keys open first.
            r = await request(core.page_port, "PUT", "/api/vault/password",
                              headers=CHANGE, body=json.dumps(_pw()).encode())
            assert r.status == 200, r.text
            r = await _opened(core, computer)
            assert r.status == 423 and set(r.json()) == LOCKED, r.text
            assert r.json()["machine"] == "fake-mac" and r.json()["locked"] is True
            async with _proven(core, auth=_pw()["auth"]):
                r = await _opened(core, computer)
                assert r.status == 201, r.text
            for t in core.terminals.live(core.owner.id):
                await t.close()
        finally:
            await mac.gone()


async def test_a_computer_is_closed_to_a_device_without_its_keys(h):
    """Without the proof, nothing of a computer: no terminal, no screen,
    no blocks, output, history, completion, log, count or search hit, and
    the page lists its terminals only by name; with it, all of it."""
    async with h.core() as core:
        await _made_vault(core)
        mac, computer, _ = await _fake_mac(core, web=2, agent="0.14.0")
        try:
            project = (await request(core.page_port, "GET", "/api/state")).json()[
                "projects"][0]["id"]
            project = uuid.UUID(project)
            proving = await _proving(core, auth=_pw()["auth"])
            r = await _opened(core, computer)
            assert r.status == 201, r.text
            tid = uuid.UUID(r.json()["id"])
            t = core.terminals.get(tid, core.owner.id)
            await _until(lambda: t.state == "open", what="the terminal")
            entry = await _ran(core.pool, project, core.owner.id, computer,
                               tid, 10, "echo zq-only-on-the-mac")
            lab, lab_terminal = await _cert_server(core, project)
            await _ran(core.pool, project, core.owner.id, lab, lab_terminal, 10,
                       "echo zq-on-the-lab")
            start, end = _today()
            page = core.page_port
            routes = [
                ("GET", f"/api/terminals/{tid}", None),
                ("GET", f"/api/terminals/{tid}/blocks", None),
                ("GET", f"/api/terminals/{tid}/blocks/10/output", None),
                ("GET", f"/api/terminals/{tid}/history", None),
                ("POST", f"/api/terminals/{tid}/complete",
                 {"line": "ls ", "cursor": 3}),
                ("POST", f"/api/terminals/{tid}/dirs", {}),
                ("POST", f"/api/terminals/{tid}/branches", {}),
                ("PATCH", f"/api/terminals/{tid}", {"name": "renamed"}),
                ("GET", f"/api/machines/{computer}/log?start={start}&end={end}",
                 None),
                ("GET", f"/api/machines/{computer}/log/find?q=echo", None),
                ("POST", "/api/log/notes", {"entry": entry, "text": "a note"}),
                ("POST", "/api/log/notes", {"terminalId": str(tid), "seq": 10,
                                            "text": "a note"}),
                ("POST", f"/api/log/{entry}/redact", {"reason": "why"}),
                ("POST", f"/api/machines/{computer}/move",
                 {"projectId": str(project)}),
                ("DELETE", f"/api/terminals/{tid}", None),
                ("DELETE", f"/api/machines/{computer}", None),
            ]

            async def call(method, path, body):
                return await request(page, method, path,
                                     headers=CHANGE if method != "GET" else None,
                                     body=json.dumps(body).encode()
                                     if body is not None else None)

            # With the keys open: everything is there.
            r = await call("GET", f"/api/terminals/{tid}/history", None)
            assert "echo zq-only-on-the-mac" in [c["command"] for c in
                                                r.json()["commands"]], r.text
            r = await call("GET", "/api/search?q=zq", None)
            assert {c["command"] for c in r.json()["commands"]} == \
                {"echo zq-only-on-the-mac", "echo zq-on-the-lab"}, r.json()
            counts = (await call("GET", f"/api/logs/today?since={start}",
                                 None)).json()["counts"]
            assert counts.get(str(computer)) == 1, counts
            state = (await call("GET", "/api/state", None)).json()
            listed = next(x for x in state["terminals"] if x["id"] == str(tid))
            assert "locked" not in listed and "cwd" in listed

            # Closed on this device.
            await proving.close()
            await asyncio.sleep(0.2)
            for method, path, body in routes:
                r = await call(method, path, body)
                assert r.status == 423, (method, path, r.status, r.text)
                assert r.json()["locked"] is True and \
                    r.json()["machine"] == "fake-mac", (path, r.text)
            assert t.state == "open" and t.name != "renamed", "nothing changed"
            # Lists: the lab's, none of the Mac's.
            r = await call("GET", f"/api/terminals/{lab_terminal}/history", None)
            assert [c["command"] for c in r.json()["commands"]] == \
                ["echo zq-on-the-lab"], r.text
            found = (await call("GET", "/api/search?q=zq", None)).json()
            assert [c["command"] for c in found["commands"]] == \
                ["echo zq-on-the-lab"], found
            assert all("only-on-the-mac" not in json.dumps(x)
                       for x in found["output"] + found["logs"]), found
            assert (await call("GET", f"/api/search?q=&near={computer}",
                               None)).json()["recent"] == []
            counts = (await call("GET", f"/api/logs/today?since={start}",
                                 None)).json()["counts"]
            assert str(computer) not in counts and counts.get(str(lab)) == 1, \
                counts
            state = (await call("GET", "/api/state", None)).json()
            listed = next(x for x in state["terminals"] if x["id"] == str(tid))
            assert set(listed) == set(LOCKED_FIELDS) | {"locked"}, listed
            assert listed["locked"] is True and listed["machine"] == "fake-mac"
            # The socket: `locked` instead of a watcher, and nothing of it.
            async with page_socket(page) as ws:
                await ws.send(json.dumps({"op": "attach", "ch": 4,
                                          "id": str(tid), "cols": 80,
                                          "rows": 24}))
                said = await _heard_one(ws, ("locked", "attached", "reset"))
                assert said == {"op": "locked", "ch": 4, "terminal": {
                    "id": str(tid), "name": t.name, "machine": "fake-mac",
                    "machineId": str(computer)}}, said
                await mac.prints(_mac_channel(mac), b"after the lock\r\n")
                assert await _frame_for(ws, 4, wait=0.6) is None
                # Proved on this socket: attached, and the screen comes.
                assert (await _prove(ws, auth=_pw()["auth"]))["op"] == \
                    "vault.proven"
                await ws.send(json.dumps({"op": "attach", "ch": 4,
                                          "id": str(tid), "cols": 80,
                                          "rows": 24}))
                said = await _heard_one(ws, ("locked", "attached"))
                assert said["op"] == "attached", said
                # Closed again (Lock, idle, signing out): the tab turns into
                # its card, and nothing more comes.
                await ws.send(json.dumps({"op": "vault.closed"}))
                said = await _heard_one(ws, ("locked",))
                assert said is not None and said["ch"] == 4, said
                await asyncio.sleep(0.2)
                await mac.prints(_mac_channel(mac), b"after closing\r\n")
                assert await _frame_for(ws, 4, wait=0.6) is None
            # An ended terminal of a guarded machine: locked too, not where
            # it ended up.
            ended = await core.pool.fetchval(
                "INSERT INTO terminals (machine_id, owner_id, name, closed_at, "
                "last_cwd, end_reason) VALUES ($1, $2, 'old', now(), "
                "'/Users/denis/secret', 'Closed.') RETURNING id",
                computer, core.owner.id)
            async with page_socket(page) as ws:
                await ws.send(json.dumps({"op": "attach", "ch": 5,
                                          "id": str(ended)}))
                said = await _heard_one(ws, ("locked", "gone"))
                assert said["op"] == "locked" and "secret" not in json.dumps(said), \
                    said
                assert (await _prove(ws, auth=_pw()["auth"]))["op"] == \
                    "vault.proven"
                await ws.send(json.dumps({"op": "attach", "ch": 5,
                                          "id": str(ended)}))
                said = await _heard_one(ws, ("locked", "gone"))
                assert said["op"] == "gone" and \
                    said["terminal"]["cwd"] == "/Users/denis/secret", said
            await t.close()
        finally:
            await mac.gone()


def _mac_channel(mac: FakeMac) -> int:
    return mac.sent("open")[-1]["ch"]


async def _frame_for(ws, ch: int, wait: float):
    """The next frame of channel `ch` within `wait`, binary or JSON."""
    try:
        async with asyncio.timeout(wait):
            while True:
                frame = await ws.recv()
                if isinstance(frame, bytes):
                    if int.from_bytes(frame[1:5], "big") == ch:
                        return frame
                elif json.loads(frame).get("ch") == ch:
                    return json.loads(frame)
    except TimeoutError:
        return None


# --------------------------------------------- the vault's own changes

async def test_a_session_without_the_keys_cannot_give_itself_a_proof(h):
    """Who signed in with a code from the email, without the keys: no key
    of their own into the vault, no password of their own, no key taken
    out, no recovery code made anew. Otherwise any of them would prove the
    keys open there from then on. No lock taken off either (the Mac would
    forget its key to the vault), and no guarded server of their own: one
    with the person's key, or through the person's Mac, aimed at a host of
    theirs and named as a real one."""
    async with h.core() as core:
        priv = asyncssh.generate_private_key("ssh-ed25519")
        key_id = await _vault_with_key(core, core.owner.id, priv)
        project = await _project(core)
        computer = await core.pool.fetchval(
            "INSERT INTO machines (project_id, kind, name, created_by) "
            "VALUES ($1, 'computer', 'denis-mac', $2) RETURNING id",
            project, core.owner.id)
        lock = await core.pool.fetchval(
            "INSERT INTO vault_locks (id, vault_id, kind, wrap) SELECT $1, "
            "v.id, 'app', $3 FROM vaults v WHERE v.user_id = $2 RETURNING id",
            uuid.uuid4(), core.owner.id, b"w" * 60)
        token = await auth.open_session(core.pool, core.owner.id)
        intruder = {**CHANGE, "cookie": f"{auth.SESSION_COOKIE}={token}"}
        theirs = asyncssh.generate_private_key("ssh-ed25519")
        public = theirs.export_public_key().decode().strip()
        body = {"id": str(uuid.uuid4()), "name": "mine", "type": "ssh-ed25519",
                "publicKey": public, "fingerprint": _proof_key(theirs),
                "sealed": b64u(b"x" * 40), "source": "file",
                "sourceLabel": "id_ed25519"}
        host_key = asyncssh.generate_private_key("ssh-ed25519")
        tries = [
            ("POST", "/api/vault/keys", body),
            ("DELETE", f"/api/vault/keys/{key_id}", None),
            ("PUT", "/api/vault/password", _pw()),
            ("PUT", "/api/vault/recovery", {"recoverySalt": b64u(b"n" * 16),
                                            "recoveryWrap": b64u(b"m" * 60)}),
            ("DELETE", f"/api/vault/locks/{lock}", None),
            ("POST", "/api/machines/own", {
                "project": str(project), "name": "prod", "method": "key",
                "keyId": str(key_id), "host": "server.example.com",
                "port": 22, "login": "deploy",
                "hostKeys": [host_key.export_public_key().decode().strip()]}),
            ("POST", "/api/machines/own", {
                "project": str(project), "name": "prod-db", "method": "mac",
                "via": str(computer), "target": "db"}),
        ]
        for method, path, sent in tries:
            r = await request(core.page_port, method, path, headers=intruder,
                              body=json.dumps(sent).encode()
                              if sent is not None else None)
            assert r.status == 423 and r.json()["locked"] is True, \
                (path, r.status, r.text)
        row = await core.pool.fetchrow(
            "SELECT password_check, (SELECT count(*) FROM vault_keys k WHERE "
            "k.vault_id = v.id AND k.removed_at IS NULL) AS keys, (SELECT "
            "count(*) FROM vault_locks l WHERE l.vault_id = v.id AND "
            "l.removed_at IS NULL) AS locks "
            "FROM vaults v WHERE user_id = $1", core.owner.id)
        assert row["password_check"] is None and row["keys"] == 1 \
            and row["locks"] == 1, row
        assert await core.pool.fetchval(
            "SELECT count(*) FROM machines WHERE name LIKE 'prod%'") == 0
        # Their own key proves nothing: it is not in the vault.
        async with page_socket(core.page_port,
                               cookie=f"{auth.SESSION_COOKIE}={token}") as ws:
            said = await _prove(ws, priv=theirs)
            assert said["op"] == "vault.unproven", said
        # The owner's device with the key open: all of it goes.
        async with _proven(core, priv=priv):
            r = await request(core.page_port, "POST", "/api/vault/keys",
                              headers=CHANGE, body=json.dumps(body).encode())
            assert r.status == 201, r.text


def _recovery_probe(core):
    """Whether a session's requests count as made with the keys open: PUT
    /api/vault/recovery is 409 there (a vault with a password has no
    recovery code), 423 where they are not."""
    probe = json.dumps({"recoverySalt": b64u(b"n" * 16),
                        "recoveryWrap": b64u(b"m" * 60)}).encode()

    async def keys_open(cookie: str | None = None) -> bool:
        headers = dict(CHANGE)
        if cookie is not None:
            headers["cookie"] = cookie
        r = await request(core.page_port, "PUT", "/api/vault/recovery",
                          headers=headers, body=probe)
        assert r.status in (409, 423), r.text
        return r.status == 409
    return keys_open


async def test_a_change_of_the_vault_asks_the_other_sessions_to_prove_again(h):
    """A new password (a new recovery code, a key out): what proved the
    keys open on the person's other sessions may be gone, so each of their
    sockets is asked to prove again, and the guarded terminals they watched
    turn locked. The session that made the change keeps its proof. The old
    password proves nothing there any more; the new one does. A socket's
    proof by the right password does not forgive the wrong tries before it
    (the app sends it by itself on each new socket); one typed does."""
    async with h.core() as core:
        await _made_vault(core)
        keys_open = _recovery_probe(core)
        mac, computer, _ = await _fake_mac(core, web=2, agent="0.14.0")
        try:
            token = await auth.open_session(core.pool, core.owner.id)
            other = f"{auth.SESSION_COOKIE}={token}"
            mine = await _proving(core, auth=_pw()["auth"])
            theirs = await _proving(core, auth=_pw()["auth"], cookie=other)
            assert await keys_open() and await keys_open(other)
            r = await _opened(core, computer, cookie=other)
            assert r.status == 201, r.text
            tid = r.json()["id"]
            await theirs.send(json.dumps({"op": "attach", "ch": 1, "id": tid}))
            said = await _heard_one(theirs, ("attached", "locked"))
            assert said["op"] == "attached", said
            # A new password, from this session.
            new = _pw_made_up()
            r = await request(core.page_port, "PUT", "/api/vault/password",
                              headers=CHANGE, body=json.dumps(new).encode())
            assert r.status == 200, r.text
            said = await _heard_one(theirs, ("locked",))
            assert said is not None and said["ch"] == 1, said
            again = await _heard(theirs, "vault.challenge")
            assert again is not None and again["nonce"], again
            assert not await keys_open(other)
            assert await keys_open(), "the session that changed it keeps it"
            assert await _heard(mine, "vault.challenge", wait=0.5) is None
            # The old password, there: wrong now.
            await theirs.send(json.dumps({"op": "vault.prove",
                                          "auth": _pw()["auth"]}))
            said = await _heard_one(theirs, ("vault.proven", "vault.unproven"))
            assert said["op"] == "vault.unproven" and said["wrong"] is True, said
            assert await _wrong_count(core, core.owner.id) == 1
            # The new one: proven, and the wrong try stays counted.
            await theirs.send(json.dumps({"op": "vault.prove",
                                          "auth": new["auth"]}))
            assert await _heard_one(theirs, ("vault.proven", "vault.unproven")) \
                == {"op": "vault.proven"}
            assert await keys_open(other)
            assert await _wrong_count(core, core.owner.id) == 1
            # Typed (password/open), it is forgiven.
            r = await _open(core, new["auth"])
            assert r.status == 200, r.text
            assert await _wrong_count(core, core.owner.id) == 0
            await mine.close()
            await theirs.close()
            for t in core.terminals.live(core.owner.id):
                await t.close()
        finally:
            await mac.gone()


async def test_a_key_taken_out_asks_the_other_sessions_to_prove_again(h):
    """A new recovery code: a socket of another session is asked to prove
    again, and its key proves it again. A key out of the vault: a socket
    that proved with it proves nothing now. The session that made either
    change keeps its proof."""
    async with h.core() as core:
        priv = asyncssh.generate_private_key("ssh-ed25519")
        await _vault_with_key(core, core.owner.id, priv)
        second = asyncssh.generate_private_key("ssh-ed25519")
        second_id = await _key_into(core, core.owner.id, second)
        token = await auth.open_session(core.pool, core.owner.id)
        other = f"{auth.SESSION_COOKIE}={token}"
        cookie_header = {**CHANGE, "cookie": other}
        mine = await _proving(core, priv=priv)
        theirs = await _proving(core, priv=second, cookie=other)

        async def keys_open(headers) -> bool:
            r = await request(core.page_port, "DELETE",
                              f"/api/vault/locks/{uuid.uuid4()}",
                              headers=headers)
            assert r.status in (404, 423), r.text
            return r.status == 404

        assert await keys_open(CHANGE) and await keys_open(cookie_header)
        r = await request(core.page_port, "PUT", "/api/vault/recovery",
                          headers=CHANGE, body=json.dumps(
                              {"recoverySalt": b64u(b"n" * 16),
                               "recoveryWrap": b64u(b"m" * 60)}).encode())
        assert r.status == 204, r.text
        again = await _heard(theirs, "vault.challenge")
        assert again is not None, "no new challenge"
        assert not await keys_open(cookie_header)
        assert await keys_open(CHANGE)
        said = await _prove_on(theirs, second, again["nonce"])
        assert said == {"op": "vault.proven"}, said
        assert await keys_open(cookie_header)
        r = await request(core.page_port, "DELETE",
                          f"/api/vault/keys/{second_id}", headers=CHANGE)
        assert r.status == 204, r.text
        again = await _heard(theirs, "vault.challenge")
        assert again is not None, "no new challenge"
        assert not await keys_open(cookie_header)
        assert await keys_open(CHANGE)
        said = await _prove_on(theirs, second, again["nonce"])
        assert said["op"] == "vault.unproven", said
        await mine.close()
        await theirs.close()


async def _prove_on(ws, priv, nonce: str) -> dict | None:
    """vault.prove by `priv` over a nonce the socket heard already."""
    await ws.send(json.dumps({"op": "vault.prove", "key": _proof_key(priv),
                              "alg": "ssh-ed25519",
                              "sig": _raw_sign(priv, "ssh-ed25519",
                                               vault.proof_blob(nonce))}))
    return await _heard_one(ws, ("vault.proven", "vault.unproven"))


async def test_a_proof_checked_as_the_vault_changed_is_not_taken(h):
    """A proof whose check ran before a change of the vault and ended after
    it: the socket was asked to prove again meanwhile, so that proof is not
    taken. Else a password checked a moment before it changed would stand."""
    async with h.core() as core:
        await _made_vault(core)
        keys_open = _recovery_probe(core)
        token = await auth.open_session(core.pool, core.owner.id)
        other = f"{auth.SESSION_COOKIE}={token}"
        mine = await _proving(core, auth=_pw()["auth"])
        checked, go_on = asyncio.Event(), asyncio.Event()
        real = vault.open_with_password

        async def slow(*args, **kwargs):
            done = await real(*args, **kwargs)
            checked.set()
            await go_on.wait()
            return done

        vault.open_with_password = slow
        try:
            async with page_socket(core.page_port, cookie=other) as theirs:
                await _challenge(theirs)
                await theirs.send(json.dumps({"op": "vault.prove",
                                              "auth": _pw()["auth"]}))
                await asyncio.wait_for(checked.wait(), 5)
                r = await request(core.page_port, "PUT", "/api/vault/password",
                                  headers=CHANGE,
                                  body=json.dumps(_pw_made_up()).encode())
                assert r.status == 200, r.text
                assert await _heard(theirs, "vault.challenge") is not None
                go_on.set()
                said = await _heard_one(theirs, ("vault.proven",
                                                 "vault.unproven"))
                assert said["op"] == "vault.unproven" \
                    and "prove it again" in said["error"], said
                assert not await keys_open(other)
        finally:
            vault.open_with_password = real
            go_on.set()
        assert await keys_open()
        await mine.close()


async def test_a_redaction_leaves_the_lines_of_machines_closed_here(h):
    """A command's words go from every line of the project with the same
    words (0.1.23), but not from those of a machine closed to the device
    that redacts (0.1.28): that would change its log, and the answer would
    say where else the words ran. With the keys open, from all of them."""
    async with h.core() as core:
        await _made_vault(core)
        project = await _project(core)
        computer = await core.pool.fetchval(
            "INSERT INTO machines (project_id, kind, name, created_by) "
            "VALUES ($1, 'computer', 'denis-mac', $2) RETURNING id",
            project, core.owner.id)
        on_mac = await core.pool.fetchval(
            "INSERT INTO terminals (machine_id, owner_id, name, closed_at) "
            "VALUES ($1, $2, '1', now()) RETURNING id", computer, core.owner.id)
        lab, on_lab = await _cert_server(core, project)
        secret = "export TOKEN=zq-secret"
        first = await _ran(core.pool, project, core.owner.id, lab, on_lab, 10,
                           secret)
        closed = await _ran(core.pool, project, core.owner.id, computer, on_mac,
                            10, secret)

        async def words(entry):
            return await core.pool.fetchval(
                "SELECT x.text FROM journal j JOIN log_texts x "
                "ON x.id = j.text_id WHERE j.id = $1", entry)

        async def redact(entry) -> dict:
            r = await request(core.page_port, "POST", f"/api/log/{entry}/redact",
                              headers=CHANGE,
                              body=json.dumps({"reason": "a token"}).encode())
            assert r.status == 200, r.text
            return r.json()

        done = await redact(first)
        assert done["also"] == [], done
        assert await words(first) is None and await words(closed) == secret
        assert await core.pool.fetchval(
            "SELECT count(*) FROM journal WHERE kind = 'log.redacted' "
            "AND machine_id = $1", computer) == 0
        # With the keys open, the Mac's line goes too.
        again = await _ran(core.pool, project, core.owner.id, lab, on_lab, 20,
                           secret)
        async with _proven(core, auth=_pw()["auth"]):
            done = await redact(again)
        assert [x["id"] for x in done["also"]] == [closed], done
        assert await words(closed) is None


# ------------------------------------------------ the app's own computer

async def test_the_apps_own_computer_and_the_servers_through_it_need_no_proof(h):
    """The app's session, on the computer it said with that computer's own
    key: that computer and the servers through it open without a proof
    there; another computer of the person's does not, nor does the same
    computer from her browser."""
    async with h.core(owner_email="") as core:
        browser, app = await signed_in_app(core)
        r = await browser.call("POST", "/api/vault", _pw_body())
        assert r.status == 201, r.text
        key = machines.new_token("computer")
        async with page_socket(core.page_port, cookie=app.cookie) as app_ws:
            await _challenge(app_ws)
            r = await app.call("POST", "/api/computers/this",
                               {"key": key, "name": "MacBook-Pro-Anna"})
            assert r.status == 201, r.text
            computer = uuid.UUID(r.json()["machine"]["id"])
            project = uuid.UUID(r.json()["machine"]["projectId"])
            assert await core.pool.fetchval(
                "SELECT computer_id FROM devices WHERE id = $1",
                uuid.UUID(app.device_id)) == computer
            ws, reply = await _hello(_hub(core), key, key=key, web=2,
                                     agent="0.14.0", name="MacBook-Pro-Anna")
            assert reply["t"] == "welcome", reply
            mac = FakeMac(ws)
            try:
                anna = await core.pool.fetchval(
                    "SELECT user_id FROM devices WHERE id = $1",
                    uuid.UUID(app.device_id))
                via = await core.pool.fetchval(
                    "INSERT INTO machines (project_id, kind, name, created_by, "
                    "login_method, via_machine_id, ssh_target, own_line) VALUES "
                    "($1, 'server', 'db-internal', $2, 'mac', $3, 'db', true) "
                    "RETURNING id", project, anna, computer)
                other = await core.pool.fetchval(
                    "INSERT INTO machines (project_id, kind, name, created_by) "
                    "VALUES ($1, 'computer', 'Mac-mini', $2) RETURNING id",
                    project, anna)
                for machine_id in (computer, via):
                    r = await app.call("POST", "/api/terminals",
                                       {"machineId": str(machine_id)})
                    assert r.status == 201, r.text
                    r = await browser.call("POST", "/api/terminals",
                                           {"machineId": str(machine_id)})
                    assert r.status == 423, r.text
                r = await app.call("POST", "/api/terminals",
                                   {"machineId": str(other)})
                assert r.status == 423 and r.json()["machine"] == "Mac-mini", \
                    r.text
                # A server through it is added from the app without a proof
                # there; through another computer, or from her browser, not.
                def through(mac, name):
                    return {"project": str(project), "name": name,
                            "method": "mac", "via": str(mac), "target": name}
                r = await browser.call("POST", "/api/machines/own",
                                       through(computer, "cache"))
                assert r.status == 423 and r.json()["locked"] is True, r.text
                r = await app.call("POST", "/api/machines/own",
                                   through(other, "cache"))
                assert r.status == 423 and r.json()["locked"] is True, r.text
                r = await app.call("POST", "/api/machines/own",
                                   through(computer, "cache"))
                assert r.status == 201, r.text
                assert await core.pool.fetchval(
                    "SELECT via_machine_id FROM machines WHERE name = 'cache'") \
                    == computer
                # The socket open before the app said it learnt it too.
                mine = next(t for t in core.terminals.live(anna)
                            if t.machine.id == computer)
                await app_ws.send(json.dumps({"op": "attach", "ch": 1,
                                              "id": str(mine.id)}))
                said = await _heard_one(app_ws, ("attached", "locked"))
                assert said["op"] == "attached", said
                # Her browser's socket does not.
                async with page_socket(core.page_port,
                                       cookie=browser.cookie) as ws:
                    await ws.send(json.dumps({"op": "attach", "ch": 1,
                                              "id": str(mine.id)}))
                    said = await _heard_one(ws, ("attached", "locked"))
                    assert said["op"] == "locked", said
                for t in core.terminals.live(anna):
                    await t.close()
            finally:
                await mac.gone()


async def test_no_one_elses_machine_is_named(h):
    """The check names only the person's own machines: a line of someone
    else's log, by its number, is not there for them (404), not closed."""
    async with h.core() as core:
        await _made_vault(core)
        anna_cookie, anna = await _anna(core)
        anna_project = await core.pool.fetchval(
            "SELECT id FROM projects WHERE owner_id = $1", anna)
        hers = await core.pool.fetchval(
            "INSERT INTO machines (project_id, kind, name, created_by) VALUES "
            "($1, 'computer', 'annas-secret-mac', $2) RETURNING id",
            anna_project, anna)
        her_terminal = await core.pool.fetchval(
            "INSERT INTO terminals (machine_id, owner_id, name) VALUES "
            "($1, $2, '1') RETURNING id", hers, anna)
        entry = await _ran(core.pool, anna_project, anna, hers, her_terminal,
                           3, "echo hers")
        start, end = _today()
        for method, path, body in (
                ("POST", "/api/log/notes", {"entry": entry, "text": "x"}),
                ("POST", f"/api/log/{entry}/redact", {"reason": "x"}),
                ("GET", f"/api/machines/{hers}/log?start={start}&end={end}",
                 None),
                ("GET", f"/api/machines/{hers}/log/find?q=echo", None),
                ("DELETE", f"/api/machines/{hers}", None),
                ("GET", f"/api/terminals/{her_terminal}/blocks", None)):
            r = await request(core.page_port, method, path,
                              headers=CHANGE if method != "GET" else None,
                              body=json.dumps(body).encode() if body else None)
            assert r.status in (403, 404) and "annas-secret-mac" not in r.text, \
                (path, r.status, r.text)


async def _anna(core) -> tuple[str, uuid.UUID]:
    from .harness import sign_in_as
    cookie = await sign_in_as(core, "anna@example.com")
    anna = await core.pool.fetchval(
        "SELECT id FROM users WHERE email = 'anna@example.com'")
    return cookie, anna


# ----------------------------------------------------------- the relay

async def test_a_key_servers_login_is_signed_only_by_its_sessions_sockets(h):
    """What the owner found on 03.11: the terminal of a session signed in
    with a code from the email got its login signed by his Mac. Now only
    the sockets of the session that opened the terminal are asked; a socket
    of another session that can sign is not, whatever it announces."""
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
            fp = _proof_key(priv)
            machine_id = await _key_machine(core, port, host_key, key_id)
            # Without its keys open, a session gets no terminal there.
            token = await auth.open_session(core.pool, core.owner.id)
            other = f"{auth.SESSION_COOKIE}={token}"
            r = await _opened(core, machine_id, cookie=other)
            assert r.status == 423, r.text
            # The Mac: another session, keys open, ready to sign anything.
            mac_ws = await _proving(core, priv=priv, cookie=other)
            mac = FakePage(mac_ws, priv)
            await mac.can([fp])
            # This browser proves its keys open but cannot sign yet.
            here = await _proving(core, priv=priv)
            r = await _opened(core, machine_id)
            assert r.status == 201, r.text
            t = core.terminals.get(uuid.UUID(r.json()["id"]), core.owner.id)
            assert t.session_id == await session_id_of(core)
            await _until(lambda: t.vault_wait is not None, what="the wait")
            await asyncio.sleep(1.0)
            assert t.state == "connecting" and not mac.asked, \
                "the other session's socket was asked"
            # This session's socket can sign: it is the one asked.
            page = FakePage(here, priv)
            await page.can([fp])
            await _until(lambda: t.state in ("open", "ended"), what="the login")
            assert t.state == "open", t.reason
            assert page.asked and not mac.asked, (page.asked, mac.asked)
            # And the other session sees nothing of it.
            async with page_socket(core.page_port, cookie=other) as ws:
                await ws.send(json.dumps({"op": "attach", "ch": 1,
                                          "id": str(t.id)}))
                said = await _heard_one(ws, ("attached", "locked"))
                assert said["op"] == "locked", said
            await t.close()
            await here.close()
            await mac_ws.close()
    finally:
        reach.ALLOW_PRIVATE = False
        shutil.rmtree(home, ignore_errors=True)


async def test_a_proof_made_by_ssh_keygen_checks_out(h):
    """The proof is OpenSSH's own: `ssh-keygen -Y sign -n
    tterm-keys@tterm.net` over the message and the nonce makes a signature
    the core takes, for each kind of key. Where there is no ssh-keygen
    ($TTERM_SSH_KEYGEN, or in PATH), there is nothing to compare with."""
    keygen = os.environ.get("TTERM_SSH_KEYGEN") or shutil.which("ssh-keygen")
    if not keygen:
        return
    nonce = vault.new_nonce()
    with tempfile.TemporaryDirectory() as tmp:
        message = Path(tmp) / "message"
        message.write_bytes(vault.PROOF_MESSAGE + nonce.encode())
        for kind, alg in (("ssh-ed25519", "ssh-ed25519"),
                          ("ecdsa-sha2-nistp256", "ecdsa-sha2-nistp256"),
                          ("ecdsa-sha2-nistp384", "ecdsa-sha2-nistp384"),
                          ("ssh-rsa", "rsa-sha2-512")):
            priv = asyncssh.generate_private_key(kind)
            key = Path(tmp) / f"key-{kind}"
            key.write_bytes(priv.export_private_key("openssh"))
            key.chmod(0o600)
            sig = Path(f"{message}.sig")
            sig.unlink(missing_ok=True)
            done = subprocess.run(
                [keygen, "-Y", "sign", "-n", vault.PROOF_NAMESPACE.decode(),
                 "-f", str(key), str(message)],
                capture_output=True, timeout=30)
            assert done.returncode == 0, done.stderr
            armored = sig.read_text().splitlines()
            data = base64.b64decode("".join(armored[1:-1]))
            packet = SSHPacket(data[6:])
            assert data[:6] == b"SSHSIG" and packet.get_uint32() == 1
            packet.get_string()                             # the public key
            assert packet.get_string() == vault.PROOF_NAMESPACE
            packet.get_string()                             # reserved
            assert packet.get_string() == b"sha512"
            inner = SSHPacket(packet.get_string())
            said_alg, raw = inner.get_string(), inner.get_string()
            assert said_alg.decode() == alg, (kind, said_alg)
            if alg.startswith("ecdsa-"):
                # The raw signature of the relay and the proof: r || s, each
                # of the curve's size (as WebCrypto gives it).
                size = vault.SIG_ALGS[alg] // 2
                pair = SSHPacket(raw)
                raw = b"".join(n.to_bytes(size, "big")
                               for n in (pair.get_mpint(), pair.get_mpint()))
            public = priv.export_public_key().decode().strip()
            vault.verify_ssh_signature(public, vault.proof_blob(nonce),
                                       said_alg, raw)


async def test_the_migration_adds_the_apps_computer(h):
    """021: the app's device says which computer it runs on; a computer
    taken out of the database leaves the device as it was, without it."""
    async with h.core(owner_email="") as core:
        browser, app = await signed_in_app(core)
        r = await app.call("POST", "/api/computers/this",
                           {"key": machines.new_token("computer"),
                            "name": "MacBook-Pro-Anna"})
        assert r.status == 201, r.text
        computer = uuid.UUID(r.json()["machine"]["id"])
        device = uuid.UUID(app.device_id)
        assert await core.pool.fetchval(
            "SELECT computer_id FROM devices WHERE id = $1", device) == computer
        # Only the app's own device: a browser's session cannot say it.
        r = await browser.call("POST", "/api/computers/this",
                               {"key": machines.new_token("computer"),
                                "name": "x"})
        assert r.status == 403, r.text
        await core.pool.execute("DELETE FROM journal WHERE machine_id = $1",
                                computer)
        await core.pool.execute("DELETE FROM machines WHERE id = $1", computer)
        assert await core.pool.fetchval(
            "SELECT computer_id FROM devices WHERE id = $1", device) is None
