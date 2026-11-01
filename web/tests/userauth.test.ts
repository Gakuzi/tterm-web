// The page signs a login and nothing else (src/vault/sign.ts, isUserauth):
// what the core asks it to sign must be exactly the SSH user-auth request of
// a public key login (RFC 4252 §7) with that very key and algorithm.
//
// The requests checked here are real: a Python script logs in to an asyncssh
// server with the core's own client key for a vault key (RelayKeyPair, which
// hands the data to sign to the relay as the core does), for Ed25519, ECDSA
// P-256 and P-384, and RSA with rsa-sha2-256 and rsa-sha2-512, and records
// the data asyncssh asked to have signed. Each is accepted with its key read
// the way the page reads it (readKeyFile), and the signature the page makes
// over it verifies in the core; then each part of it is changed in turn, and
// every change is refused.
//
//   node --test tests/userauth.test.ts
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { before, test } from "node:test";
import { fileURLToPath } from "node:url";

import { b64u, concat, fromB64u, random, utf8, type Bytes } from "../src/vault/bytes.ts";
import { readKeyFile } from "../src/vault/keyfile.ts";
import { isUserauth, signerOf, type SigAlg, type Signer } from "../src/vault/sign.ts";
import { Reader, sshString, u32 } from "../src/vault/ssh.ts";

const REPO = fileURLToPath(new URL("../../", import.meta.url));

const CAPTURE = String.raw`
import asyncio, base64, json
import asyncssh
from tterm.core.vault import RelayKeyPair

def b64u(data):
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()

class Server(asyncssh.SSHServer):
    def begin_auth(self, username):
        return True
    def public_key_auth_supported(self):
        return True
    def validate_public_key(self, username, key):
        return True

async def capture(priv, user, **options):
    host = asyncssh.generate_private_key("ssh-ed25519")
    server = await asyncssh.create_server(Server, "127.0.0.1", 0,
                                          server_host_keys=[host])
    port = server.sockets[0].getsockname()[1]
    seen = []
    pub = asyncssh.import_public_key(priv.export_public_key())

    async def sign(alg, data):
        seen.append((alg, data))
        return priv.sign(data, alg)
    try:
        async with asyncssh.connect(
                "127.0.0.1", port, username=user, known_hosts=None,
                client_keys=[RelayKeyPair(pub, sign)], agent_path=None,
                password=None, kbdint_auth=False,
                preferred_auth=("publickey",), **options):
            pass
    finally:
        server.close()
        await server.wait_closed()
    (alg, data), = seen
    return {"alg": alg.decode(), "data": b64u(data), "user": user,
            "private": priv.export_private_key("openssh").decode(),
            "public": priv.export_public_key().decode().strip()}

async def main():
    rsa = asyncssh.generate_private_key("ssh-rsa", key_size=2048)
    out = [
        await capture(asyncssh.generate_private_key("ssh-ed25519"), "deploy"),
        await capture(asyncssh.generate_private_key("ecdsa-sha2-nistp256"), "root"),
        await capture(asyncssh.generate_private_key("ecdsa-sha2-nistp384"), "denis"),
        await capture(rsa, "deploy", signature_algs=["rsa-sha2-256"]),
        await capture(rsa, "deploy", signature_algs=["rsa-sha2-512"]),
    ]
    print(json.dumps(out))

asyncio.run(main())
`;

interface Captured {
  alg: SigAlg;
  data: Bytes;
  user: string;
  publicKey: string;
  signer: Signer;
}

let captured: Captured[] = [];

before(async () => {
  const out = execFileSync("python3", ["-c", CAPTURE], { cwd: REPO, timeout: 120_000 });
  const rows = JSON.parse(out.toString()) as { alg: string; data: string; user: string;
    private: string; public: string }[];
  captured = [];
  for (const row of rows) {
    const read = await readKeyFile(row.private);
    const signer = await signerOf({ v: 1, type: read.type, jwk: read.jwk, comment: read.comment });
    captured.push({ alg: row.alg as SigAlg, data: fromB64u(row.data), user: row.user,
      publicKey: row.public, signer });
  }
});

/** A user-auth request, part by part. */
interface Parts {
  session: Bytes;
  message: number;
  user: Bytes;
  service: Bytes;
  method: Bytes;
  flag: number;
  alg: Bytes;
  blob: Bytes;
}

function parse(data: Bytes): Parts {
  const r = new Reader(data);
  const parts = {
    session: r.bytes(), message: r.take(1)[0], user: r.bytes(), service: r.bytes(),
    method: r.bytes(), flag: r.take(1)[0], alg: r.bytes(), blob: r.bytes(),
  };
  assert.equal(r.left, 0);
  return parts;
}

function build(p: Parts): Bytes {
  return concat(sshString(p.session), new Uint8Array([p.message]), sshString(p.user),
    sshString(p.service), sshString(p.method), new Uint8Array([p.flag]), sshString(p.alg),
    sshString(p.blob));
}

const text = (bytes: Uint8Array): string => new TextDecoder().decode(bytes);

test("asyncssh's real login requests are accepted, with the key the page read", () => {
  assert.equal(captured.length, 5);
  assert.deepEqual(captured.map((c) => c.alg), ["ssh-ed25519", "ecdsa-sha2-nistp256",
    "ecdsa-sha2-nistp384", "rsa-sha2-256", "rsa-sha2-512"]);
  for (const c of captured) {
    assert.ok(isUserauth(c.data, c.alg, c.signer.blob), c.alg);
    // It is what RFC 4252 says, and rebuilt from its parts it is the same.
    const p = parse(c.data);
    assert.equal(p.message, 50);
    assert.equal(text(p.user), c.user);
    assert.equal(text(p.service), "ssh-connection");
    assert.equal(text(p.method), "publickey");
    assert.equal(p.flag, 1);
    assert.equal(text(p.alg), c.alg);
    assert.ok(p.session.length >= 16 && p.session.length <= 64, `${p.session.length}`);
    assert.deepEqual(build(p), c.data);
    // The blob in the request is the key's public blob, as the page made it.
    assert.equal(Buffer.from(p.blob).toString("base64"), c.publicKey.split(" ")[1]);
  }
});

test("the page's signature over a login request verifies in the core", async () => {
  const items = [];
  for (const c of captured) {
    const sig = await c.signer.sign(c.alg, c.data);
    items.push({ publicKey: c.publicKey, alg: c.alg, data: b64u(c.data), sig: b64u(sig) });
  }
  const script = [
    "import base64, json, sys",
    "from tterm.core import vault",
    "d = lambda s: base64.urlsafe_b64decode(s + '=' * (-len(s) % 4))",
    "items = json.load(sys.stdin)",
    "for it in items:",
    "    vault.verify_ssh_signature(it['publicKey'], d(it['data']), it['alg'].encode(), d(it['sig']))",
    "print(len(items))",
  ].join("\n");
  const out = execFileSync("python3", ["-c", script], { cwd: REPO, input: JSON.stringify(items) });
  assert.equal(Number(out.toString().trim()), captured.length);
});

test("the user name is not looked at", () => {
  for (const c of captured) {
    const p = parse(c.data);
    for (const user of [new Uint8Array(0), utf8("root"), utf8("dénis"), new Uint8Array([0xff, 0xfe]),
      utf8("x".repeat(300))]) {
      assert.ok(isUserauth(build({ ...p, user }), c.alg, c.signer.blob), `${c.alg} ${text(user)}`);
    }
  }
});

test("arbitrary data is refused", () => {
  const vectorData = fromB64u("c2Vzc2lvbi1pZC1hbmQtdXNlcmF1dGgtcmVxdWVzdA");
  // An SSHSIG (ssh-keygen -Y sign) of some file: the signed data's preamble.
  const sshsig = concat(utf8("SSHSIG"), sshString("file"), sshString(""), sshString("sha512"),
    sshString(random(64)));
  for (const c of captured) {
    for (const data of [new Uint8Array(0), vectorData, random(32), random(400), sshsig,
      utf8("GET / HTTP/1.1\r\n\r\n")]) {
      assert.equal(isUserauth(data, c.alg, c.signer.blob), false, c.alg);
    }
  }
});

test("trailing or missing bytes are refused", () => {
  for (const c of captured) {
    assert.equal(isUserauth(concat(c.data, new Uint8Array([0])), c.alg, c.signer.blob), false);
    assert.equal(isUserauth(concat(c.data, c.data), c.alg, c.signer.blob), false);
    assert.equal(isUserauth(concat(c.data, sshString("more")), c.alg, c.signer.blob), false);
    assert.equal(isUserauth(c.data.slice(0, -1), c.alg, c.signer.blob), false);
    assert.equal(isUserauth(c.data.slice(0, 40), c.alg, c.signer.blob), false);
    // A length that runs past the end.
    const p = parse(c.data);
    const long = concat(sshString(p.session), new Uint8Array([50]), u32(0xffffffff));
    assert.equal(isUserauth(long, c.alg, c.signer.blob), false);
  }
});

test("another key's blob is refused", () => {
  for (const c of captured) {
    for (const other of captured) {
      if (other.publicKey === c.publicKey) continue;
      // Another key's own request, offered to this key…
      assert.equal(isUserauth(other.data, other.alg, c.signer.blob), false, `${other.alg} as ${c.alg}`);
      // …and this key's request with the other key's blob in it.
      const p = parse(c.data);
      assert.equal(isUserauth(build({ ...p, blob: other.signer.blob }), c.alg, c.signer.blob), false);
    }
    const p = parse(c.data);
    const flipped = p.blob.slice();
    flipped[flipped.length - 1] ^= 1;
    assert.equal(isUserauth(build({ ...p, blob: flipped }), c.alg, c.signer.blob), false);
  }
});

test("an algorithm other than the request's is refused", () => {
  const all: SigAlg[] = ["ssh-ed25519", "ecdsa-sha2-nistp256", "ecdsa-sha2-nistp384",
    "rsa-sha2-256", "rsa-sha2-512"];
  for (const c of captured) {
    for (const alg of all) {
      if (alg === c.alg) continue;
      assert.equal(isUserauth(c.data, alg, c.signer.blob), false, `${c.alg} asked as ${alg}`);
    }
    // The request naming another algorithm than the one asked for.
    const p = parse(c.data);
    for (const name of ["ssh-rsa", "ssh-dss", "rsa-sha2-256-cert-v01@openssh.com", "", "SSH-ED25519"]) {
      if (name === c.alg) continue;
      assert.equal(isUserauth(build({ ...p, alg: utf8(name) }), c.alg, c.signer.blob), false, name);
    }
  }
  // RSA: a request for rsa-sha2-256 is not signed as rsa-sha2-512, nor the other way.
  const [rsa256, rsa512] = captured.slice(3);
  assert.equal(isUserauth(rsa256.data, "rsa-sha2-512", rsa256.signer.blob), false);
  assert.equal(isUserauth(rsa512.data, "rsa-sha2-256", rsa512.signer.blob), false);
});

test("a session id shorter than 16 bytes or longer than 64 is refused", () => {
  for (const c of captured) {
    const p = parse(c.data);
    for (const n of [0, 1, 8, 15, 65, 100]) {
      assert.equal(isUserauth(build({ ...p, session: random(n) }), c.alg, c.signer.blob), false, `${n}`);
    }
    for (const n of [16, 20, 32, 48, 64]) {
      assert.ok(isUserauth(build({ ...p, session: random(n) }), c.alg, c.signer.blob), `${n}`);
    }
  }
});

test("another message, service, method or flag is refused", () => {
  for (const c of captured) {
    const p = parse(c.data);
    const refused = (changed: Partial<Parts>, why: string) =>
      assert.equal(isUserauth(build({ ...p, ...changed }), c.alg, c.signer.blob), false, why);
    refused({ message: 51 }, "message 51");
    refused({ message: 0 }, "message 0");
    refused({ message: 60 }, "message 60");
    refused({ service: utf8("ssh-userauth") }, "service ssh-userauth");
    refused({ service: utf8("ssh-connection\0") }, "service with a NUL");
    refused({ service: new Uint8Array(0) }, "no service");
    refused({ method: utf8("hostbased") }, "hostbased");
    refused({ method: utf8("publickey ") }, "publickey with a space");
    refused({ method: utf8("password") }, "password");
    refused({ flag: 0 }, "a query without a signature");
    refused({ flag: 2 }, "flag 2");
  }
});
