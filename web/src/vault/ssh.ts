// SSH's wire format, as far as the vault needs it (0.1.17): the public key
// of a private key the page reads, as one OpenSSH line, and its SHA256
// fingerprint, both as the core checks them (asyncssh), and as ssh-keygen
// writes them.

import { b64, concat, fromB64u, fromUtf8, utf8, type Bytes } from "./bytes.ts";
import { sha256, type KeyType } from "./crypto.ts";

export function u32(n: number): Bytes {
  const out = new Uint8Array(4);
  new DataView(out.buffer).setUint32(0, n >>> 0);
  return out;
}

/** An SSH string: its length in four bytes, then the bytes. */
export function sshString(data: Uint8Array | string): Bytes {
  const raw = typeof data === "string" ? utf8(data) : data;
  return concat(u32(raw.length), raw);
}

/** An SSH mpint of an unsigned big-endian number: no leading zeros, but one
 * where the top bit is set, so that it stays positive. */
export function sshMpint(unsigned: Uint8Array): Bytes {
  let start = 0;
  while (start < unsigned.length && unsigned[start] === 0) start++;
  const body = unsigned.subarray(start);
  if (!body.length) return u32(0);
  return sshString(body[0] & 0x80 ? concat(new Uint8Array([0]), body) : body);
}

/** Reads SSH's wire format; any short read is an error. */
export class Reader {
  data: Uint8Array;
  at: number;

  constructor(data: Uint8Array) {
    this.data = data;
    this.at = 0;
  }

  get left(): number {
    return this.data.length - this.at;
  }

  take(n: number): Bytes {
    if (n < 0 || n > this.left) throw new Error("short");
    const out = this.data.slice(this.at, this.at + n);
    this.at += n;
    return out;
  }

  u32(): number {
    const b = this.take(4);
    return new DataView(b.buffer).getUint32(0);
  }

  bytes(): Bytes {
    return this.take(this.u32());
  }

  text(): string {
    return fromUtf8(this.bytes());
  }

  /** An mpint, as an unsigned big-endian number without its sign byte. */
  mpint(): Bytes {
    const raw = this.bytes();
    if (raw.length && raw[0] & 0x80) throw new Error("negative mpint");
    let start = 0;
    while (start < raw.length - 1 && raw[start] === 0) start++;
    return raw.slice(start);
  }
}

const CURVES: Record<string, { name: string; crv: "P-256" | "P-384"; size: number }> = {
  "ecdsa-sha2-nistp256": { name: "nistp256", crv: "P-256", size: 32 },
  "ecdsa-sha2-nistp384": { name: "nistp384", crv: "P-384", size: 48 },
};

export function curveOf(type: KeyType): { name: string; crv: "P-256" | "P-384"; size: number } | null {
  return CURVES[type] ?? null;
}

/** A big-endian number of exactly `size` bytes (a coordinate, a scalar). */
export function fixed(unsigned: Uint8Array, size: number): Bytes {
  let start = 0;
  while (start < unsigned.length && unsigned[start] === 0 && unsigned.length - start > size) start++;
  const body = unsigned.subarray(start);
  if (body.length > size) throw new Error("number too long");
  const out = new Uint8Array(size);
  out.set(body, size - body.length);
  return out;
}

/** The SSH public key blob of a private key's JWK. */
export function publicBlob(type: KeyType, jwk: JsonWebKey): Bytes {
  if (type === "ssh-ed25519") {
    const x = fromB64u(jwk.x ?? "");
    if (x.length !== 32) throw new Error("ed25519 public length");
    return concat(sshString(type), sshString(x));
  }
  if (type === "ssh-rsa") {
    return concat(sshString(type), sshMpint(fromB64u(jwk.e ?? "")), sshMpint(fromB64u(jwk.n ?? "")));
  }
  const curve = CURVES[type];
  if (!curve) throw new Error("key type");
  const point = concat(new Uint8Array([4]), fixed(fromB64u(jwk.x ?? ""), curve.size),
    fixed(fromB64u(jwk.y ?? ""), curve.size));
  return concat(sshString(type), sshString(curve.name), sshString(point));
}

/** A comment as one line of printable text. */
export function cleanComment(comment: string): string {
  return comment.replace(/[\p{C}]+/gu, " ").replace(/\s+/g, " ").trim().slice(0, 200);
}

/** The public key as OpenSSH writes it on one line: type, base64, comment. */
export function publicLine(type: KeyType, jwk: JsonWebKey, comment = ""): string {
  const line = `${type} ${b64(publicBlob(type, jwk))}`;
  const note = cleanComment(comment);
  return note ? `${line} ${note}` : line;
}

/** "SHA256:" and the unpadded base64 of the blob's SHA-256, as ssh-keygen
 * -l and asyncssh write it. */
export async function fingerprintOf(blob: Bytes): Promise<string> {
  return `SHA256:${b64(await sha256(blob)).replace(/=+$/, "")}`;
}

export async function fingerprint(type: KeyType, jwk: JsonWebKey): Promise<string> {
  return fingerprintOf(publicBlob(type, jwk));
}

/** "SHA256:3fQ8…a9Kc": a fingerprint short enough for a list. */
export function shortFingerprint(fp: string): string {
  const body = fp.startsWith("SHA256:") ? fp.slice(7) : fp;
  return body.length > 10 ? `SHA256:${body.slice(0, 4)}…${body.slice(-4)}` : fp;
}

/** The size of an RSA key in bits, from its modulus. */
export function rsaBits(jwk: JsonWebKey): number {
  const n = fromB64u(jwk.n ?? "");
  let start = 0;
  while (start < n.length && n[start] === 0) start++;
  if (start === n.length) return 0;
  return (n.length - start - 1) * 8 + (32 - Math.clz32(n[start]));
}

