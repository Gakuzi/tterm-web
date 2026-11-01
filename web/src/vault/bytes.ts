// Bytes for the vault (0.1.17): base64url without padding, as every binary
// value of the vault goes in JSON (vault-design.md, "Crypto"), the standard
// base64 of OpenSSH's public keys and fingerprints, UTF-8, and random bytes.
//
// Kept to erasable TypeScript and to nothing outside src/vault, so that the
// checks run these files in Node as they are (web/tests).

/** Bytes over an ArrayBuffer of their own, as WebCrypto takes them. */
export type Bytes = Uint8Array<ArrayBuffer>;

const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });

export function utf8(text: string): Bytes {
  return encoder.encode(text) as Bytes;
}

/** UTF-8 text; refuses bytes that are not. */
export function fromUtf8(bytes: Uint8Array): string {
  return decoder.decode(bytes);
}

export function bytes(length: number): Bytes {
  return new Uint8Array(length);
}

/** A copy, over a buffer of its own. */
export function copy(data: Uint8Array): Bytes {
  const out = new Uint8Array(data.length);
  out.set(data);
  return out;
}

export function concat(...parts: Uint8Array[]): Bytes {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

export function random(length: number): Bytes {
  const out = new Uint8Array(length);
  globalThis.crypto.getRandomValues(out);
  return out;
}

/** Whether two byte strings are the same, without stopping at the first
 * difference. */
export function same(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

/** Overwrites a secret that is no longer needed. */
export function wipe(...secrets: (Uint8Array | null | undefined)[]): void {
  for (const s of secrets) s?.fill(0);
}

function binary(data: Uint8Array): string {
  let out = "";
  for (let i = 0; i < data.length; i += 0x8000) {
    out += String.fromCharCode(...data.subarray(i, i + 0x8000));
  }
  return out;
}

/** Standard base64 with padding, as OpenSSH writes public keys. */
export function b64(data: Uint8Array): string {
  return btoa(binary(data));
}

/** Standard base64; white space is left out, as in a PEM file. */
export function fromB64(text: string): Bytes {
  const clean = text.replace(/\s+/g, "");
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(clean) || clean.length % 4 === 1) {
    throw new Error("base64");
  }
  const raw = atob(clean);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/** base64url without padding ("b64u" in the contract). */
export function b64u(data: Uint8Array): string {
  return b64(data).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** base64url without padding, strictly: what b64u writes and nothing else,
 * as the core reads it. */
export function fromB64u(text: string): Bytes {
  if (typeof text !== "string" || !/^[A-Za-z0-9_-]*$/.test(text) || text.length % 4 === 1) {
    throw new Error("base64url");
  }
  const std = text.replace(/-/g, "+").replace(/_/g, "/");
  const out = fromB64(std + "=".repeat((4 - (std.length % 4)) % 4));
  if (b64u(out) !== text) throw new Error("base64url");
  return out;
}

/** A new UUID (version 4), for the ids the client picks: vaults, locks,
 * keys. */
export function uuid(): string {
  if (typeof globalThis.crypto.randomUUID === "function") return globalThis.crypto.randomUUID();
  const b = random(16);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const hex = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
