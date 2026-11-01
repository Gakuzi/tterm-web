// The vault's crypto (0.1.17), exactly as the contract has it
// (vault-design.md, "Crypto"; the shared vectors in vault-vectors.json):
//
//   box(K, P, aad) = nonce(12) || AES-256-GCM(K, P, aad) || tag(16)
//   HKDF           = HKDF-SHA256 (RFC 5869)
//   a key          sealed = box(VK, {"v":1,"type","jwk","comment"}, "tterm/vault/key/v1/" + key id)
//   a lock         wrap   = box(KEK, VK, "tterm/vault/lock/v1/" + lock id)
//   passkey        KEK    = HKDF(PRF output, 32 zero bytes, "tterm/vault/prf/v1")
//   recovery code  KEK    = HKDF(UTF-8 normalized code, recoverySalt, "tterm/vault/recovery/v1"),
//                  wrap   = box(KEK, VK, "tterm/vault/recovery/v1/" + vault id)
//   pairing        commit = SHA-256("tterm/vault/pair/commit/v1" || pubB),
//                  SAS    = first 4 bytes of SHA-256("tterm/vault/pair/sas/v1" || pubA || pubB) mod 10^6,
//                  KEK    = HKDF(X25519(priv, pub), pubA || pubB, "tterm/vault/pair/v1"),
//                  sealed = box(KEK, VK, "tterm/vault/pair/v1/" + pairing id)
//
// The vault key (VK) is held as a non-extractable AES-GCM CryptoKey once it
// is open; its raw bytes exist only for the moment a lock or a recovery code
// is made from them, and are wiped right after.

import {
  bytes, concat, fromUtf8, random, utf8, wipe, type Bytes,
} from "./bytes.ts";

const subtle = (): SubtleCrypto => globalThis.crypto.subtle;

export const VK_LENGTH = 32;
export const NONCE_LENGTH = 12;
export const RECOVERY_SALT_LENGTH = 16;

export const AAD = {
  key: (keyId: string): string => `tterm/vault/key/v1/${keyId}`,
  lock: (lockId: string): string => `tterm/vault/lock/v1/${lockId}`,
  recovery: (vaultId: string): string => `tterm/vault/recovery/v1/${vaultId}`,
  pair: (pairingId: string): string => `tterm/vault/pair/v1/${pairingId}`,
};

export const INFO = {
  prf: "tterm/vault/prf/v1",
  recovery: "tterm/vault/recovery/v1",
  pair: "tterm/vault/pair/v1",
};

const COMMIT_LABEL = "tterm/vault/pair/commit/v1";
const SAS_LABEL = "tterm/vault/pair/sas/v1";

/** The SSH key types a vault holds (v1). */
export type KeyType = "ssh-ed25519" | "ecdsa-sha2-nistp256" | "ecdsa-sha2-nistp384" | "ssh-rsa";
export const KEY_TYPES: KeyType[] = ["ssh-ed25519", "ecdsa-sha2-nistp256", "ecdsa-sha2-nistp384", "ssh-rsa"];

/** A private key as the vault keeps it, sealed. */
export interface KeyPlain {
  v: 1;
  type: KeyType;
  jwk: JsonWebKey;
  comment: string;
}

// ------------------------------------------------------------- primitives

/** An AES-256-GCM key from raw bytes; not extractable unless asked. */
export function aesKey(raw: Bytes, extractable = false): Promise<CryptoKey> {
  if (raw.length !== 32) throw new Error("aes key length");
  return subtle().importKey("raw", raw, { name: "AES-GCM" }, extractable,
    ["encrypt", "decrypt"]);
}

async function keyOf(key: CryptoKey | Bytes): Promise<CryptoKey> {
  return key instanceof Uint8Array ? aesKey(key) : key;
}

/** box(K, P, aad): nonce || ciphertext || tag. */
export async function seal(key: CryptoKey | Bytes, plain: Bytes, aad: string,
  nonce: Bytes = random(NONCE_LENGTH)): Promise<Bytes> {
  if (nonce.length !== NONCE_LENGTH) throw new Error("nonce length");
  const out = await subtle().encrypt(
    { name: "AES-GCM", iv: nonce, additionalData: utf8(aad), tagLength: 128 },
    await keyOf(key), plain);
  return concat(nonce, new Uint8Array(out));
}

/** The plaintext of a box, or an error when it is not this key's or not
 * for this aad. */
export async function open(key: CryptoKey | Bytes, box: Bytes, aad: string): Promise<Bytes> {
  if (box.length < NONCE_LENGTH + 16) throw new Error("box length");
  const out = await subtle().decrypt(
    { name: "AES-GCM", iv: box.slice(0, NONCE_LENGTH), additionalData: utf8(aad), tagLength: 128 },
    await keyOf(key), box.slice(NONCE_LENGTH));
  return new Uint8Array(out);
}

/** HKDF-SHA256: `length` bytes. */
export async function hkdf(ikm: Bytes, salt: Bytes, info: string, length = 32): Promise<Bytes> {
  const base = await subtle().importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  const bits = await subtle().deriveBits(
    { name: "HKDF", hash: "SHA-256", salt, info: utf8(info) }, base, length * 8);
  return new Uint8Array(bits);
}

export async function sha256(...parts: Uint8Array[]): Promise<Bytes> {
  return new Uint8Array(await subtle().digest("SHA-256", concat(...parts)));
}

// ------------------------------------------------------------ the locks

/** A passkey lock's KEK from the PRF output of the browser's passkey. */
export function prfKek(prfOutput: Bytes): Promise<Bytes> {
  return hkdf(prfOutput, bytes(32), INFO.prf);
}

/** VK wrapped for one lock (a passkey's, the app's). */
export function wrapVk(kek: Bytes, vk: Bytes, lockId: string, nonce?: Bytes): Promise<Bytes> {
  return seal(kek, vk, AAD.lock(lockId), nonce);
}

/** VK's raw bytes from a lock's wrap. */
export async function unwrapVk(kek: Bytes, wrap: Bytes, lockId: string): Promise<Bytes> {
  const vk = await open(kek, wrap, AAD.lock(lockId));
  if (vk.length !== VK_LENGTH) throw new Error("vault key length");
  return vk;
}

/** Crockford's base32: no I, L, O or U to mistake for other signs. */
const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/** A new recovery code: 120 random bits, 24 signs of Crockford's base32,
 * shown in six groups of four: K7QF-29XM-PL4D-8VHT-R2NC-6WJB. */
export function newRecoveryCode(): string {
  const raw = random(15);
  let bits = 0;
  let have = 0;
  let out = "";
  for (const b of raw) {
    bits = (bits << 8) | b;
    have += 8;
    while (have >= 5) {
      have -= 5;
      out += CROCKFORD[(bits >>> have) & 31];
    }
    bits &= (1 << have) - 1;
  }
  wipe(raw);
  return groupCode(out);
}

/** Upper case, without "-" and spaces; O is 0, I and L are 1. */
export function normalizeCode(code: string): string {
  return code.toUpperCase().replace(/[\s-]+/g, "").replace(/O/g, "0").replace(/[IL]/g, "1");
}

/** Whether what was typed can be a recovery code: 24 signs of the
 * alphabet, once normalized. */
export function isRecoveryCode(code: string): boolean {
  const n = normalizeCode(code);
  return n.length === 24 && [...n].every((c) => CROCKFORD.includes(c));
}

/** Six groups of four, as the code is shown. */
export function groupCode(code: string): string {
  const n = normalizeCode(code);
  return (n.match(/.{1,4}/g) ?? []).join("-");
}

export function recoveryKek(code: string, salt: Bytes): Promise<Bytes> {
  return hkdf(utf8(normalizeCode(code)), salt, INFO.recovery);
}

export async function wrapRecovery(code: string, salt: Bytes, vk: Bytes, vaultId: string,
  nonce?: Bytes): Promise<Bytes> {
  const kek = await recoveryKek(code, salt);
  try {
    return await seal(kek, vk, AAD.recovery(vaultId), nonce);
  } finally {
    wipe(kek);
  }
}

/** VK's raw bytes from the recovery code; an error when the code is not
 * this vault's. */
export async function unwrapRecovery(code: string, salt: Bytes, wrap: Bytes,
  vaultId: string): Promise<Bytes> {
  const kek = await recoveryKek(code, salt);
  try {
    const vk = await open(kek, wrap, AAD.recovery(vaultId));
    if (vk.length !== VK_LENGTH) throw new Error("vault key length");
    return vk;
  } finally {
    wipe(kek);
  }
}

/** A recovery code made anew for VK: what is shown once, and what the core
 * keeps. */
export async function makeRecovery(vk: Bytes, vaultId: string): Promise<{
  code: string; salt: Bytes; wrap: Bytes;
}> {
  const code = newRecoveryCode();
  const salt = random(RECOVERY_SALT_LENGTH);
  return { code, salt, wrap: await wrapRecovery(code, salt, vk, vaultId) };
}

// ------------------------------------------------------------ the pairing

/** An X25519 key pair whose private half never leaves WebCrypto. */
export async function x25519Pair(): Promise<{ privateKey: CryptoKey; publicRaw: Bytes }> {
  const pair = await subtle().generateKey({ name: "X25519" }, false, ["deriveBits"]) as CryptoKeyPair;
  const publicRaw = new Uint8Array(await subtle().exportKey("raw", pair.publicKey));
  return { privateKey: pair.privateKey, publicRaw };
}

/** X25519(priv, pub): the 32 shared bytes. */
export async function x25519Shared(privateKey: CryptoKey, publicRaw: Bytes): Promise<Bytes> {
  if (publicRaw.length !== 32) throw new Error("x25519 public length");
  const pub = await subtle().importKey("raw", publicRaw, { name: "X25519" }, true, []);
  const bits = await subtle().deriveBits({ name: "X25519", public: pub } as AlgorithmIdentifier,
    privateKey, 256);
  return new Uint8Array(bits);
}

/** The commit a new browser posts first: SHA-256 of its public key. */
export function pairCommit(pubB: Bytes): Promise<Bytes> {
  return sha256(utf8(COMMIT_LABEL), pubB);
}

/** The six digits both sides show, "482 913". */
export async function pairSas(pubA: Bytes, pubB: Bytes): Promise<string> {
  const d = await sha256(utf8(SAS_LABEL), pubA, pubB);
  const n = (((d[0] << 24) | (d[1] << 16) | (d[2] << 8) | d[3]) >>> 0) % 1_000_000;
  const text = String(n).padStart(6, "0");
  return `${text.slice(0, 3)} ${text.slice(3)}`;
}

export function pairKek(shared: Bytes, pubA: Bytes, pubB: Bytes): Promise<Bytes> {
  return hkdf(shared, concat(pubA, pubB), INFO.pair);
}

/** The new browser's side, once the Mac approved: VK's raw bytes from the
 * sealed box, with the browser's own private key and the Mac's public one. */
export async function openPairing(privB: CryptoKey, pubA: Bytes, pubB: Bytes,
  sealed: Bytes, pairingId: string): Promise<Bytes> {
  const shared = await x25519Shared(privB, pubA);
  const kek = await pairKek(shared, pubA, pubB);
  try {
    const vk = await open(kek, sealed, AAD.pair(pairingId));
    if (vk.length !== VK_LENGTH) throw new Error("vault key length");
    return vk;
  } finally {
    wipe(shared, kek);
  }
}

// --------------------------------------------------------------- the keys

/** The JWK with the contract's fields only, in its order. */
export function cleanJwk(type: KeyType, jwk: JsonWebKey): JsonWebKey {
  const pick = (names: (keyof JsonWebKey)[]): JsonWebKey => {
    const out: Record<string, unknown> = {};
    for (const name of names) {
      const value = jwk[name];
      if (typeof value !== "string" || !value) throw new Error(`jwk ${String(name)}`);
      out[name] = value;
    }
    return out as JsonWebKey;
  };
  if (type === "ssh-ed25519") {
    if (jwk.kty !== "OKP" || jwk.crv !== "Ed25519") throw new Error("jwk type");
    return pick(["kty", "crv", "x", "d"]);
  }
  if (type === "ssh-rsa") {
    if (jwk.kty !== "RSA") throw new Error("jwk type");
    return pick(["kty", "n", "e", "d", "p", "q", "dp", "dq", "qi"]);
  }
  const crv = type === "ecdsa-sha2-nistp256" ? "P-256" : "P-384";
  if (jwk.kty !== "EC" || jwk.crv !== crv) throw new Error("jwk type");
  return pick(["kty", "crv", "x", "y", "d"]);
}

/** The plaintext of a key in the vault, as the contract writes it. */
export function keyText(plain: KeyPlain): string {
  return JSON.stringify({ v: 1, type: plain.type, jwk: cleanJwk(plain.type, plain.jwk),
    comment: plain.comment });
}

/** A key sealed with VK, for its id. */
export function sealKeyText(vk: CryptoKey | Bytes, keyId: string, text: string,
  nonce?: Bytes): Promise<Bytes> {
  return seal(vk, utf8(text), AAD.key(keyId), nonce);
}

export function sealKey(vk: CryptoKey | Bytes, keyId: string, plain: KeyPlain,
  nonce?: Bytes): Promise<Bytes> {
  return sealKeyText(vk, keyId, keyText(plain), nonce);
}

/** A key out of the vault: its plaintext, checked to be one the vault
 * holds. */
export async function openKey(vk: CryptoKey | Bytes, keyId: string, sealed: Bytes): Promise<KeyPlain> {
  const plain = await open(vk, sealed, AAD.key(keyId));
  let data: unknown;
  try {
    data = JSON.parse(fromUtf8(plain));
  } finally {
    wipe(plain);
  }
  const p = data as Partial<KeyPlain> | null;
  if (!p || p.v !== 1 || !KEY_TYPES.includes(p.type as KeyType) || typeof p.jwk !== "object" || !p.jwk) {
    throw new Error("key plaintext");
  }
  return { v: 1, type: p.type as KeyType, jwk: cleanJwk(p.type as KeyType, p.jwk),
    comment: typeof p.comment === "string" ? p.comment : "" };
}

/** A new vault key, raw: made once per account, by the device that makes
 * the vault. */
export function newVk(): Bytes {
  return random(VK_LENGTH);
}
