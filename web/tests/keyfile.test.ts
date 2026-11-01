// Reading private key files (src/vault/keyfile.ts) with keys made by
// ssh-keygen and openssl in a temporary folder: Ed25519, ECDSA P-256 and
// P-384, RSA; OpenSSH's format, also with a passphrase (bcrypt-pbkdf, then
// aes256-ctr, aes128-ctr or aes256-gcm), PKCS#8, PKCS#1 and SEC1 PEM. Each
// key read gives the public key line ssh-keygen wrote and the fingerprint
// it prints; each signs with WebCrypto, and the core's own check
// (tterm.core.vault: check_public_key, verify_ssh_signature) accepts the
// public key and verifies every signature.
//
//   SSH_KEYGEN=/path/to/ssh-keygen node --test tests/keyfile.test.ts
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";

import { b64u, concat, utf8 } from "../src/vault/bytes.ts";
import { aesKey, newVk, openKey, sealKey } from "../src/vault/crypto.ts";
import { KeyFileError, needsPassphrase, readKeyFile, type ReadKey } from "../src/vault/keyfile.ts";
import { ALGS, signerOf } from "../src/vault/sign.ts";
import { sshString, u32 } from "../src/vault/ssh.ts";

const KEYGEN = process.env.SSH_KEYGEN ?? "ssh-keygen";
const OPENSSL = process.env.OPENSSL ?? "openssl";
const REPO = fileURLToPath(new URL("../../", import.meta.url));
let dir = "";

/** What the core is asked to check at the end: every key's public half and
 * every signature made. */
const toVerify: { publicKey: string; type: string; fingerprint: string; alg: string;
  data: string; sig: string }[] = [];

before(() => {
  dir = mkdtempSync(join(tmpdir(), "tterm-keys-"));
});

after(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
});

function keygen(name: string, args: string[], pass = ""): string {
  const path = join(dir, name);
  execFileSync(KEYGEN, ["-q", ...args, "-N", pass, "-C", `${name}@test`, "-f", path],
    { stdio: ["ignore", "ignore", "pipe"] });
  return path;
}

/** The fingerprint ssh-keygen prints for the public key. */
function keygenFingerprint(pubPath: string): string {
  const out = execFileSync(KEYGEN, ["-l", "-E", "sha256", "-f", pubPath]).toString();
  return out.split(/\s+/)[1];
}

/** "type base64": the public key without its comment. */
function bare(line: string): string {
  return line.trim().split(/\s+/).slice(0, 2).join(" ");
}

async function problem(text: string, passphrase?: string): Promise<string> {
  try {
    await readKeyFile(text, passphrase);
  } catch (error) {
    if (error instanceof KeyFileError) return error.problem;
    throw error;
  }
  return "read";
}

/** Signs with the key in every algorithm its type has, for the core to
 * verify; seals and opens it again with a vault key. */
async function exercise(read: ReadKey): Promise<void> {
  const plain = { v: 1 as const, type: read.type, jwk: read.jwk, comment: read.comment };
  const signer = await signerOf(plain);
  for (const alg of ALGS[read.type]) {
    const data = utf8(`session ${alg} ${read.fingerprint}`);
    const sig = await signer.sign(alg, data);
    if (alg === "ssh-ed25519" || alg.startsWith("ecdsa-sha2-nistp256")) {
      assert.equal(sig.length, 64, alg);
    }
    if (alg === "ecdsa-sha2-nistp384") assert.equal(sig.length, 96);
    toVerify.push({ publicKey: read.publicKey, type: read.type, fingerprint: read.fingerprint,
      alg, data: b64u(data), sig: b64u(sig) });
  }
  const vk = await aesKey(newVk());
  const keyId = "6f1c2a3e-4b5d-4e6f-8a9b-0c1d2e3f4a5b";
  const back = await openKey(vk, keyId, await sealKey(vk, keyId, plain));
  assert.deepEqual(back.jwk, read.jwk);
  assert.equal(back.type, read.type);
}

const OPENSSH = [
  { name: "ed25519", args: ["-t", "ed25519"], type: "ssh-ed25519" },
  { name: "ecdsa256", args: ["-t", "ecdsa", "-b", "256"], type: "ecdsa-sha2-nistp256" },
  { name: "ecdsa384", args: ["-t", "ecdsa", "-b", "384"], type: "ecdsa-sha2-nistp384" },
  { name: "rsa2048", args: ["-t", "rsa", "-b", "2048"], type: "ssh-rsa", bits: 2048 },
  { name: "rsa3072", args: ["-t", "rsa", "-b", "3072"], type: "ssh-rsa", bits: 3072 },
  // With a passphrase: ssh-keygen's own rounds for one, fewer for speed.
  { name: "ed25519-pass", args: ["-t", "ed25519"], type: "ssh-ed25519", pass: "correct horse battery" },
  { name: "rsa-pass", args: ["-t", "rsa", "-b", "2048", "-a", "8"], type: "ssh-rsa", pass: "пароль ünï", bits: 2048 },
  { name: "ecdsa256-pass", args: ["-t", "ecdsa", "-b", "256", "-a", "8"], type: "ecdsa-sha2-nistp256", pass: "p" },
  { name: "ecdsa384-ctr128", args: ["-t", "ecdsa", "-b", "384", "-a", "8", "-Z", "aes128-ctr"],
    type: "ecdsa-sha2-nistp384", pass: "short" },
  { name: "ed25519-gcm", args: ["-t", "ed25519", "-a", "8", "-Z", "aes256-gcm@openssh.com"],
    type: "ssh-ed25519", pass: "gcm pass" },
];

for (const c of OPENSSH) {
  test(`OpenSSH ${c.name}: the public key and fingerprint ssh-keygen gives, and it signs`, async () => {
    const path = keygen(c.name, c.args, c.pass ?? "");
    const text = readFileSync(path, "utf8");
    assert.match(text, /BEGIN OPENSSH PRIVATE KEY/);
    assert.equal(needsPassphrase(text), !!c.pass);
    if (c.pass) {
      assert.equal(await problem(text), "passphrase");
      assert.equal(await problem(text, `${c.pass}!`), "wrong-passphrase");
    }
    const read = await readKeyFile(text, c.pass);
    assert.equal(read.type, c.type);
    assert.equal(read.encrypted, !!c.pass);
    const pub = readFileSync(`${path}.pub`, "utf8").trim();
    assert.equal(read.publicKey, pub);
    assert.equal(read.comment, `${c.name}@test`);
    assert.equal(read.fingerprint, keygenFingerprint(`${path}.pub`));
    if (c.bits) assert.equal(read.bits, c.bits);
    await exercise(read);
  });
}

const PEM = [
  { name: "rsa-pem", args: ["-t", "rsa", "-b", "2048", "-m", "PEM"], label: "RSA PRIVATE KEY", type: "ssh-rsa" },
  { name: "rsa-pkcs8", args: ["-t", "rsa", "-b", "2048", "-m", "PKCS8"], label: "PRIVATE KEY", type: "ssh-rsa" },
  { name: "ecdsa256-pem", args: ["-t", "ecdsa", "-b", "256", "-m", "PEM"], label: "EC PRIVATE KEY",
    type: "ecdsa-sha2-nistp256" },
  { name: "ecdsa384-pkcs8", args: ["-t", "ecdsa", "-b", "384", "-m", "PKCS8"], label: "PRIVATE KEY",
    type: "ecdsa-sha2-nistp384" },
];

for (const c of PEM) {
  test(`PEM ${c.name}: read, the same public key and fingerprint, and it signs`, async () => {
    const path = keygen(c.name, c.args);
    const text = readFileSync(path, "utf8");
    assert.match(text, new RegExp(`BEGIN ${c.label}-----`));
    assert.equal(needsPassphrase(text), false);
    const read = await readKeyFile(text);
    assert.equal(read.type, c.type);
    assert.equal(read.comment, "");
    assert.equal(bare(read.publicKey), bare(readFileSync(`${path}.pub`, "utf8")));
    assert.equal(read.fingerprint, keygenFingerprint(`${path}.pub`));
    await exercise(read);
  });
}

test("PKCS#8 Ed25519 from openssl, and SEC1 EC without its public point", async () => {
  const ed = join(dir, "ed25519-openssl.pem");
  execFileSync(OPENSSL, ["genpkey", "-algorithm", "ed25519", "-out", ed]);
  const edRead = await readKeyFile(readFileSync(ed, "utf8"));
  assert.equal(edRead.type, "ssh-ed25519");
  // ssh-keygen does not read this file: asyncssh (the core's library) works
  // out the public key from it instead.
  const edPub = execFileSync("python3", ["-c",
    "import asyncssh, sys; print(asyncssh.import_private_key(open(sys.argv[1]).read())" +
    ".export_public_key().decode())", ed]).toString();
  assert.equal(bare(edRead.publicKey), bare(edPub));
  await exercise(edRead);

  const ec = join(dir, "ec-openssl.pem");
  execFileSync(OPENSSL, ["ecparam", "-name", "prime256v1", "-genkey", "-noout", "-out", ec]);
  const bareEc = join(dir, "ec-nopub.pem");
  execFileSync(OPENSSL, ["ec", "-in", ec, "-no_public", "-out", bareEc], { stdio: "ignore" });
  const ecText = readFileSync(bareEc, "utf8");
  assert.match(ecText, /BEGIN EC PRIVATE KEY/);
  const ecRead = await readKeyFile(ecText);
  const ecWhole = await readKeyFile(readFileSync(ec, "utf8"));
  assert.equal(ecRead.publicKey, ecWhole.publicKey);
  assert.equal(ecRead.type, "ecdsa-sha2-nistp256");
  await exercise(ecRead);
});

test("what is refused, and why", async () => {
  // A public key, by mistake.
  const ed = keygen("refused-ed", ["-t", "ed25519"]);
  assert.equal(await problem(readFileSync(`${ed}.pub`, "utf8")), "public");
  // P-521 is not in the vault in v1.
  const p521 = keygen("p521", ["-t", "ecdsa", "-b", "521"]);
  assert.equal(await problem(readFileSync(p521, "utf8")), "nistp521");
  // Encrypted PEM: ssh-keygen -p turns it into OpenSSH's format.
  const encPem = keygen("enc-pem", ["-t", "rsa", "-b", "2048", "-m", "PEM"], "secret");
  assert.equal(await problem(readFileSync(encPem, "utf8")), "encrypted-pem");
  const encPkcs8 = keygen("enc-pkcs8", ["-t", "rsa", "-b", "2048", "-m", "PKCS8"], "secret");
  assert.equal(await problem(readFileSync(encPkcs8, "utf8")), "encrypted-pem");
  // A key on a security key: its file holds only a handle.
  const magic = utf8("openssh-key-v1\0");
  const skPub = concat(sshString("sk-ssh-ed25519@openssh.com"), sshString(new Uint8Array(32)),
    sshString("ssh:"));
  const sk = concat(magic, sshString("none"), sshString("none"), sshString(""), u32(1),
    sshString(skPub), sshString(new Uint8Array(8)));
  const skText = `-----BEGIN OPENSSH PRIVATE KEY-----\n${Buffer.from(sk).toString("base64")}\n` +
    "-----END OPENSSH PRIVATE KEY-----\n";
  assert.equal(await problem(skText), "security-key");
  // DSA, where this ssh-keygen still makes one.
  let dsa = "";
  try {
    dsa = keygen("dsa", ["-t", "dsa"]);
  } catch {
    dsa = "";
  }
  if (dsa) assert.equal(await problem(readFileSync(dsa, "utf8")), "dsa");
  // Anything else.
  assert.equal(await problem("hello"), "format");
  assert.equal(await problem("-----BEGIN OPENSSH PRIVATE KEY-----\nAAAA\n-----END OPENSSH PRIVATE KEY-----"),
    "format");
  writeFileSync(join(dir, "note.txt"), "PuTTY-User-Key-File-3: ssh-ed25519\n");
  assert.equal(await problem(readFileSync(join(dir, "note.txt"), "utf8")), "format");
});

test("the core accepts every public key and verifies every signature", () => {
  assert.ok(toVerify.length >= 20, `${toVerify.length} signatures`);
  const script = [
    "import base64, json, sys",
    "from tterm.core import vault",
    "items = json.load(sys.stdin)",
    "d = lambda s: base64.urlsafe_b64decode(s + '=' * (-len(s) % 4))",
    "for it in items:",
    "    vault.check_public_key(it['publicKey'], it['type'], it['fingerprint'])",
    "    vault.verify_ssh_signature(it['publicKey'], d(it['data']), it['alg'].encode(), d(it['sig']))",
    "print(len(items))",
  ].join("\n");
  const out = execFileSync("python3", ["-c", script], { cwd: REPO, input: JSON.stringify(toVerify) });
  assert.equal(Number(out.toString().trim()), toVerify.length);
});
