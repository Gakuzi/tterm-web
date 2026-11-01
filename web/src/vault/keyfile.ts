// A private key from a file (0.1.17, Settings › Keys › Add a key from a
// file): read in the page, never sent anywhere as it is. What comes out is
// the contract's plaintext (a JWK and the comment) and the public key and
// fingerprint the core checks.
//
// Read: OpenSSH's own format (openssh-key-v1, what ssh-keygen writes), also
// encrypted with a passphrase (bcrypt-pbkdf, then aes256-ctr, ssh-keygen's
// default, or aes128-ctr and the AES-GCM ciphers); unencrypted PKCS#8
// (BEGIN PRIVATE KEY), PKCS#1 (BEGIN RSA PRIVATE KEY) and SEC1 (BEGIN EC
// PRIVATE KEY) PEM. Ed25519, ECDSA P-256 and P-384, and RSA. Not: keys on
// a security key (sk-*), which cannot leave it, nistp521 and DSA (not in
// the vault in v1), and encrypted PEM (ssh-keygen -p turns it into
// OpenSSH's format).
//
// bcrypt-pbkdf: the npm package of that name (Joyent's 1:1 port of
// OpenBSD's bcrypt_pbkdf.c, the one ssh2 and sshpk use), loaded only when an
// encrypted key is read.

import { concat, fromB64, fromUtf8, b64u, same, utf8, wipe, type Bytes } from "./bytes.ts";
import { cleanJwk, KEY_TYPES, type KeyType } from "./crypto.ts";
import {
  cleanComment, curveOf, fingerprint, fixed, publicBlob, publicLine, Reader, rsaBits,
} from "./ssh.ts";

/** Why a file could not be read: each has words of its own on the page. */
export type KeyFileProblem =
  | "format"            // not a private key file tTerm knows
  | "public"            // a public key (.pub), not the private one
  | "passphrase"        // encrypted: the passphrase is needed
  | "wrong-passphrase"  // that passphrase does not open it
  | "security-key"      // sk-*: it cannot leave its security key
  | "dsa"               // DSA: not in the vault
  | "nistp521"          // ECDSA P-521: not in the vault in v1
  | "type"              // another kind of key
  | "cipher"            // encrypted in a way tTerm cannot read here
  | "encrypted-pem"     // an encrypted PEM file
  | "ed25519"           // this browser cannot work with Ed25519
  | "several";          // more than one key in the file

export class KeyFileError extends Error {
  problem: KeyFileProblem;

  constructor(problem: KeyFileProblem) {
    super(problem);
    this.name = "KeyFileError";
    this.problem = problem;
  }
}

const fail = (problem: KeyFileProblem): never => {
  throw new KeyFileError(problem);
};

/** A private key, read. */
export interface ReadKey {
  type: KeyType;
  jwk: JsonWebKey;
  comment: string;
  /** The public key, one OpenSSH line with the comment. */
  publicKey: string;
  fingerprint: string;
  /** An RSA key's size. */
  bits: number | null;
  /** It took a passphrase. */
  encrypted: boolean;
}

const subtle = (): SubtleCrypto => globalThis.crypto.subtle;

// ------------------------------------------------------------- the file

interface Pem {
  label: string;
  headers: string;
  body: Bytes;
}

function pem(text: string): Pem | null {
  const m = /-----BEGIN ([A-Z0-9 ]+)-----\r?\n([\s\S]*?)-----END \1-----/.exec(text);
  if (!m) return null;
  let content = m[2];
  let headers = "";
  // A traditional PEM has headers first, then an empty line.
  const split = /^((?:[A-Za-z-]+:[^\n]*\r?\n)+)\r?\n/.exec(content);
  if (split) {
    headers = split[1];
    content = content.slice(split[0].length);
  }
  let body: Bytes;
  try {
    body = fromB64(content);
  } catch {
    return fail("format");
  }
  return { label: m[1], headers, body };
}

/** Whether the file wants a passphrase before it can be read. */
export function needsPassphrase(text: string): boolean {
  try {
    const found = pem(text);
    if (!found || found.label !== "OPENSSH PRIVATE KEY") return false;
    const r = new Reader(found.body.subarray(MAGIC.length));
    return r.text() !== "none";
  } catch {
    return false;
  }
}

/** Reads a private key file. `passphrase` for one that is encrypted; without
 * it such a file raises "passphrase". */
export async function readKeyFile(text: string, passphrase?: string): Promise<ReadKey> {
  const trimmed = text.trim();
  if (/^(ssh-(ed25519|rsa|dss)|ecdsa-sha2-|sk-)\S* [A-Za-z0-9+/=]+/.test(trimmed) ||
      trimmed.startsWith("---- BEGIN SSH2 PUBLIC KEY") || /-----BEGIN (RSA )?PUBLIC KEY-----/.test(trimmed)) {
    return fail("public");
  }
  const found = pem(trimmed);
  if (!found) return fail("format");
  switch (found.label) {
    case "OPENSSH PRIVATE KEY":
      return readOpenssh(found.body, passphrase);
    case "PRIVATE KEY":
      return readPkcs8(found.body);
    case "RSA PRIVATE KEY":
      if (/ENCRYPTED/.test(found.headers)) return fail("encrypted-pem");
      return finish("ssh-rsa", rsaFromPkcs1(found.body), "", false);
    case "EC PRIVATE KEY":
      if (/ENCRYPTED/.test(found.headers)) return fail("encrypted-pem");
      return readSec1(found.body, null);
    case "ENCRYPTED PRIVATE KEY":
      return fail("encrypted-pem");
    case "DSA PRIVATE KEY":
      return fail("dsa");
    default:
      return fail("format");
  }
}

async function finish(type: KeyType, jwk: JsonWebKey, comment: string,
  encrypted: boolean): Promise<ReadKey> {
  let clean: JsonWebKey;
  try {
    clean = cleanJwk(type, jwk);
  } catch {
    return fail("format");
  }
  const note = cleanComment(comment);
  return {
    type, jwk: clean, comment: note,
    publicKey: publicLine(type, clean, note),
    fingerprint: await fingerprint(type, clean),
    bits: type === "ssh-rsa" ? rsaBits(clean) : null,
    encrypted,
  };
}

// --------------------------------------------------------------- OpenSSH

const MAGIC = utf8("openssh-key-v1\0");

/** The ciphers of openssh-key-v1 that WebCrypto has. */
const CIPHERS: Record<string, { mode: "ctr" | "gcm"; keyLength: number; ivLength: number }> = {
  "aes256-ctr": { mode: "ctr", keyLength: 32, ivLength: 16 },
  "aes128-ctr": { mode: "ctr", keyLength: 16, ivLength: 16 },
  "aes256-gcm@openssh.com": { mode: "gcm", keyLength: 32, ivLength: 12 },
  "aes128-gcm@openssh.com": { mode: "gcm", keyLength: 16, ivLength: 12 },
};

interface BcryptPbkdf {
  pbkdf: (pass: Uint8Array, passlen: number, salt: Uint8Array, saltlen: number,
    key: Uint8Array, keylen: number, rounds: number) => number;
}

async function bcryptPbkdf(pass: Bytes, salt: Bytes, rounds: number, length: number): Promise<Bytes> {
  const loaded = await import("bcrypt-pbkdf") as unknown as { default?: BcryptPbkdf } & Partial<BcryptPbkdf>;
  const lib = loaded.default?.pbkdf ? loaded.default : loaded as BcryptPbkdf;
  const out = new Uint8Array(length);
  if (rounds < 1 || rounds > 1 << 16 || lib.pbkdf(pass, pass.length, salt, salt.length, out, length, rounds) !== 0) {
    return fail("cipher");
  }
  return out;
}

function typeOf(name: string): KeyType {
  if (name.startsWith("sk-")) return fail("security-key");
  if (name === "ssh-dss") return fail("dsa");
  if (name === "ecdsa-sha2-nistp521") return fail("nistp521");
  if (!KEY_TYPES.includes(name as KeyType)) return fail("type");
  return name as KeyType;
}

async function readOpenssh(raw: Bytes, passphrase: string | undefined): Promise<ReadKey> {
  if (raw.length < MAGIC.length || !same(raw.subarray(0, MAGIC.length), MAGIC)) return fail("format");
  const r = new Reader(raw.subarray(MAGIC.length));
  let cipher: string;
  let kdf: string;
  let kdfOptions: Bytes;
  let pubBlob: Bytes;
  let section: Bytes;
  let type: KeyType;
  let tag: Bytes | null = null;
  try {
    cipher = r.text();
    kdf = r.text();
    kdfOptions = r.bytes();
    if (r.u32() !== 1) return fail("several");
    pubBlob = r.bytes();
    type = typeOf(new Reader(pubBlob).text());
    section = r.bytes();
    if (CIPHERS[cipher]?.mode === "gcm") tag = r.take(16);
  } catch (error) {
    if (error instanceof KeyFileError) throw error;
    return fail("format");
  }
  const encrypted = cipher !== "none";
  if (encrypted) {
    const spec = CIPHERS[cipher];
    if (!spec || kdf !== "bcrypt") return fail("cipher");
    if (!passphrase) return fail("passphrase");
    let salt: Bytes;
    let rounds: number;
    try {
      const o = new Reader(kdfOptions);
      salt = o.bytes();
      rounds = o.u32();
    } catch {
      return fail("format");
    }
    const pass = utf8(passphrase);
    const keyIv = await bcryptPbkdf(pass, salt, rounds, spec.keyLength + spec.ivLength);
    wipe(pass);
    const key = keyIv.slice(0, spec.keyLength);
    const iv = keyIv.slice(spec.keyLength);
    try {
      section = await decrypt(spec.mode, key, iv, section, tag);
    } finally {
      wipe(keyIv, key);
    }
  } else if (kdf !== "none") {
    return fail("format");
  }
  try {
    return await readSection(section, type, pubBlob, encrypted);
  } finally {
    wipe(section);
  }
}

async function decrypt(mode: "ctr" | "gcm", raw: Bytes, iv: Bytes, data: Bytes,
  tag: Bytes | null): Promise<Bytes> {
  const name = mode === "ctr" ? "AES-CTR" : "AES-GCM";
  const key = await subtle().importKey("raw", raw, { name }, false, ["decrypt"]);
  try {
    const out = mode === "ctr"
      ? await subtle().decrypt({ name, counter: iv, length: 128 }, key, data)
      : await subtle().decrypt({ name, iv, tagLength: 128 }, key, concat(data, tag ?? new Uint8Array(0)));
    return new Uint8Array(out);
  } catch {
    // GCM checks its tag: a wrong passphrase ends here.
    return fail("wrong-passphrase");
  }
}

async function readSection(section: Bytes, type: KeyType, pubBlob: Bytes,
  encrypted: boolean): Promise<ReadKey> {
  const p = new Reader(section);
  let jwk: JsonWebKey;
  let comment: string;
  try {
    if (p.u32() !== p.u32()) return fail(encrypted ? "wrong-passphrase" : "format");
    if (p.text() !== type) return fail("format");
    if (type === "ssh-ed25519") {
      const pub = p.bytes();
      const priv = p.bytes();
      if (pub.length !== 32 || priv.length !== 64 || !same(priv.subarray(32), pub)) return fail("format");
      jwk = { kty: "OKP", crv: "Ed25519", x: b64u(pub), d: b64u(priv.subarray(0, 32)) };
      wipe(priv);
    } else if (type === "ssh-rsa") {
      const n = p.mpint();
      const e = p.mpint();
      const d = p.mpint();
      const qi = p.mpint();
      const pp = p.mpint();
      const q = p.mpint();
      jwk = rsaJwk(n, e, d, pp, q, qi);
    } else {
      const curve = curveOf(type)!;
      if (p.text() !== curve.name) return fail("format");
      const point = p.bytes();
      const d = p.mpint();
      jwk = ecJwk(curve.crv, curve.size, point, d);
    }
    comment = fromUtf8(p.bytes());
  } catch (error) {
    if (error instanceof KeyFileError) throw error;
    return fail(encrypted ? "wrong-passphrase" : "format");
  }
  const read = await finish(type, jwk, comment, encrypted);
  // The private half must be the public half's: the file's public key and
  // the one worked out of the private key are the same.
  if (!same(publicBlob(type, read.jwk), pubBlob)) return fail("format");
  return read;
}

// ------------------------------------------------------------------- RSA

function big(b: Uint8Array): bigint {
  let x = 0n;
  for (const v of b) x = (x << 8n) | BigInt(v);
  return x;
}

function unbig(x: bigint): Bytes {
  let hex = x.toString(16);
  if (hex.length % 2) hex = `0${hex}`;
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function strip(b: Uint8Array): Bytes {
  let start = 0;
  while (start < b.length - 1 && b[start] === 0) start++;
  return b.slice(start);
}

/** An RSA JWK from its numbers; dp and dq worked out, the key checked to be
 * whole (n = p·q, qi·q ≡ 1 mod p). */
function rsaJwk(n: Bytes, e: Bytes, d: Bytes, p: Bytes, q: Bytes, qi: Bytes | null): JsonWebKey {
  const [N, D, P, Q] = [big(n), big(d), big(p), big(q)];
  if (N === 0n || P <= 1n || Q <= 1n || P * Q !== N) return fail("format");
  const QI = qi ? big(qi) : modInverse(Q, P);
  if ((QI * Q) % P !== 1n) return fail("format");
  return {
    kty: "RSA", n: b64u(strip(n)), e: b64u(strip(e)), d: b64u(strip(d)),
    p: b64u(strip(p)), q: b64u(strip(q)),
    dp: b64u(unbig(D % (P - 1n))), dq: b64u(unbig(D % (Q - 1n))), qi: b64u(unbig(QI)),
  };
}

function modInverse(a: bigint, m: bigint): bigint {
  let [oldR, r] = [((a % m) + m) % m, m];
  let [oldS, s] = [1n, 0n];
  while (r !== 0n) {
    const k = oldR / r;
    [oldR, r] = [r, oldR - k * r];
    [oldS, s] = [s, oldS - k * s];
  }
  if (oldR !== 1n) return fail("format");
  return ((oldS % m) + m) % m;
}

// ------------------------------------------------------------------- DER

interface Der {
  tag: number;
  body: Bytes;
}

function derAt(data: Bytes, at: number): { node: Der; next: number } {
  if (at + 2 > data.length) return fail("format");
  const tag = data[at];
  let length = data[at + 1];
  let start = at + 2;
  if (length & 0x80) {
    const count = length & 0x7f;
    if (count < 1 || count > 3 || start + count > data.length) return fail("format");
    length = 0;
    for (let i = 0; i < count; i++) length = length * 256 + data[start + i];
    start += count;
  }
  if (start + length > data.length) return fail("format");
  return { node: { tag, body: data.slice(start, start + length) }, next: start + length };
}

function der(data: Bytes): Der {
  return derAt(data, 0).node;
}

function children(body: Bytes): Der[] {
  const out: Der[] = [];
  let at = 0;
  while (at < body.length) {
    const { node, next } = derAt(body, at);
    out.push(node);
    at = next;
  }
  return out;
}

function oidOf(node: Der | undefined): string {
  if (!node || node.tag !== 0x06 || !node.body.length) return "";
  const b = node.body;
  const parts = [Math.floor(b[0] / 40), b[0] % 40];
  let value = 0;
  for (let i = 1; i < b.length; i++) {
    value = value * 128 + (b[i] & 0x7f);
    if (!(b[i] & 0x80)) {
      parts.push(value);
      value = 0;
    }
  }
  return parts.join(".");
}

function int(node: Der | undefined): Bytes {
  if (!node || node.tag !== 0x02) return fail("format");
  return strip(node.body);
}

function derLength(n: number): Bytes {
  if (n < 0x80) return new Uint8Array([n]);
  const out: number[] = [];
  for (let x = n; x > 0; x = Math.floor(x / 256)) out.unshift(x & 0xff);
  return new Uint8Array([0x80 | out.length, ...out]);
}

function tlv(tag: number, ...body: Uint8Array[]): Bytes {
  const inner = concat(...body);
  return concat(new Uint8Array([tag]), derLength(inner.length), inner);
}

const OID = {
  rsa: "1.2.840.113549.1.1.1",
  ec: "1.2.840.10045.2.1",
  p256: "1.2.840.10045.3.1.7",
  p384: "1.3.132.0.34",
  p521: "1.3.132.0.35",
  ed25519: "1.3.101.112",
  ed448: "1.3.101.113",
  dsa: "1.2.840.10040.4.1",
};

/** The DER of an OID, for the two curves and EC itself. */
const OID_DER: Record<string, Bytes> = {
  [OID.ec]: new Uint8Array([0x06, 0x07, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x02, 0x01]),
  [OID.p256]: new Uint8Array([0x06, 0x08, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x03, 0x01, 0x07]),
  [OID.p384]: new Uint8Array([0x06, 0x05, 0x2b, 0x81, 0x04, 0x00, 0x22]),
};

/** PKCS#1's RSAPrivateKey: version, n, e, d, p, q, dp, dq, qi. */
function rsaFromPkcs1(body: Bytes): JsonWebKey {
  const top = der(body);
  if (top.tag !== 0x30) return fail("format");
  const f = children(top.body);
  if (f.length < 9 || int(f[0]).some((x) => x !== 0)) return fail("format");
  return rsaJwk(int(f[1]), int(f[2]), int(f[3]), int(f[4]), int(f[5]), int(f[8]));
}

function curveByOid(oid: string): { type: KeyType; crv: "P-256" | "P-384"; size: number } {
  if (oid === OID.p256) return { type: "ecdsa-sha2-nistp256", crv: "P-256", size: 32 };
  if (oid === OID.p384) return { type: "ecdsa-sha2-nistp384", crv: "P-384", size: 48 };
  if (oid === OID.p521) return fail("nistp521");
  return fail("type");
}

function ecJwk(crv: "P-256" | "P-384", size: number, point: Bytes, d: Bytes): JsonWebKey {
  if (point.length !== 1 + 2 * size || point[0] !== 4) return fail("format");
  return {
    kty: "EC", crv, x: b64u(point.subarray(1, 1 + size)), y: b64u(point.subarray(1 + size)),
    d: b64u(fixed(d, size)),
  };
}

/** SEC1's ECPrivateKey: the curve from its own [0] or from PKCS#8 around
 * it; the public point from its [1], or else from WebCrypto. */
async function readSec1(body: Bytes, curveOid: string | null): Promise<ReadKey> {
  const top = der(body);
  if (top.tag !== 0x30) return fail("format");
  const f = children(top.body);
  const d = f[1]?.tag === 0x04 ? f[1].body : fail("format");
  const params = f.find((x) => x.tag === 0xa0);
  const oid = curveOid ?? (params ? oidOf(der(params.body)) : "");
  const curve = curveByOid(oid);
  const pub = f.find((x) => x.tag === 0xa1);
  if (pub) {
    const bits = der(pub.body);
    if (bits.tag === 0x03 && bits.body[0] === 0) {
      return finish(curve.type, ecJwk(curve.crv, curve.size, bits.body.slice(1), d), "", false);
    }
  }
  // No public point in the file: WebCrypto works it out from PKCS#8.
  const pkcs8 = tlv(0x30, new Uint8Array([0x02, 0x01, 0x00]),
    tlv(0x30, OID_DER[OID.ec], OID_DER[oid]), tlv(0x04, body));
  return finish(curve.type, await exported(pkcs8, { name: "ECDSA", namedCurve: curve.crv }), "", false);
}

async function exported(pkcs8: Bytes, alg: Algorithm | EcKeyImportParams): Promise<JsonWebKey> {
  let key: CryptoKey;
  try {
    key = await subtle().importKey("pkcs8", pkcs8, alg, true, ["sign"]);
  } catch {
    return fail(alg.name === "Ed25519" ? "ed25519" : "format");
  }
  return subtle().exportKey("jwk", key);
}

/** PKCS#8's PrivateKeyInfo (and OneAsymmetricKey): which algorithm, then
 * the key inside. */
async function readPkcs8(body: Bytes): Promise<ReadKey> {
  const top = der(body);
  if (top.tag !== 0x30) return fail("format");
  const f = children(top.body);
  const algorithm = f[1]?.tag === 0x30 ? children(f[1].body) : fail("format");
  const inner = f[2]?.tag === 0x04 ? f[2].body : fail("format");
  const oid = oidOf(algorithm[0]);
  if (oid === OID.rsa) return finish("ssh-rsa", rsaFromPkcs1(inner), "", false);
  if (oid === OID.ec) return readSec1(inner, oidOf(algorithm[1]));
  if (oid === OID.ed25519) {
    const seed = der(inner);
    if (seed.tag !== 0x04 || seed.body.length !== 32) return fail("format");
    // OneAsymmetricKey may carry the public key ([1]); else WebCrypto
    // works it out.
    const pub = f.find((x) => x.tag === 0x81);
    if (pub && pub.body.length === 33 && pub.body[0] === 0) {
      return finish("ssh-ed25519", { kty: "OKP", crv: "Ed25519", x: b64u(pub.body.slice(1)),
        d: b64u(seed.body) }, "", false);
    }
    return finish("ssh-ed25519", await exported(body, { name: "Ed25519" }), "", false);
  }
  if (oid === OID.dsa) return fail("dsa");
  return fail("type");
}
