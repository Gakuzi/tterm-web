// Signing a login with a key of the vault (0.1.17): the core sends the SSH
// user-auth data and the algorithm it negotiated with the server; the page
// signs with WebCrypto and answers the raw signature (vault-design.md,
// "Signing a login"): Ed25519 64 bytes; RSA PKCS#1 v1.5 with SHA-256
// (rsa-sha2-256) or SHA-512 (rsa-sha2-512); ECDSA r || s of fixed length
// (P1363, what WebCrypto gives). The private key is imported once, not
// extractable, and the JWK is not kept.
//
// The page signs a login and nothing else: before it signs, the data must
// be exactly the SSH user-auth request of a public key login with this very
// key and this very algorithm (isUserauth), so that whoever holds the
// socket's other end cannot have it sign anything of their choosing.

import { same, utf8, type Bytes } from "./bytes.ts";
import type { KeyPlain, KeyType } from "./crypto.ts";
import { publicBlob, Reader } from "./ssh.ts";

export type SigAlg = "ssh-ed25519" | "rsa-sha2-256" | "rsa-sha2-512" |
  "ecdsa-sha2-nistp256" | "ecdsa-sha2-nistp384";

/** The signature algorithms each key type signs with. */
export const ALGS: Record<KeyType, SigAlg[]> = {
  "ssh-ed25519": ["ssh-ed25519"],
  "ecdsa-sha2-nistp256": ["ecdsa-sha2-nistp256"],
  "ecdsa-sha2-nistp384": ["ecdsa-sha2-nistp384"],
  "ssh-rsa": ["rsa-sha2-256", "rsa-sha2-512"],
};

export interface Signer {
  type: KeyType;
  /** The SSH public key blob: what a login with this key names. */
  blob: Bytes;
  sign: (alg: SigAlg, data: Bytes) => Promise<Bytes>;
}

/** SSH_MSG_USERAUTH_REQUEST (RFC 4252). */
const USERAUTH_REQUEST = 50;
/** The session identifier is the key exchange's hash: 20 bytes (SHA-1) to
 * 64 (SHA-512). Anything shorter or longer is not one. */
const SESSION_ID_MIN = 16;
const SESSION_ID_MAX = 64;
const SERVICE = utf8("ssh-connection");
const METHOD = utf8("publickey");

/** Whether `data` is exactly what an SSH client signs to log in with a
 * public key (RFC 4252 §7), with the key whose blob is `blob` and the
 * signature algorithm `alg`:
 *
 *   string session_id (16–64 bytes) · byte 50 · string user ·
 *   string "ssh-connection" · string "publickey" · byte 1 (TRUE) ·
 *   string alg · string blob
 *
 * and nothing after. The user name is not looked at: the server decides
 * who may log in. */
export function isUserauth(data: Uint8Array, alg: SigAlg, blob: Uint8Array): boolean {
  try {
    const r = new Reader(data);
    const session = r.bytes();
    if (session.length < SESSION_ID_MIN || session.length > SESSION_ID_MAX) return false;
    if (r.take(1)[0] !== USERAUTH_REQUEST) return false;
    r.bytes();
    if (!same(r.bytes(), SERVICE)) return false;
    if (!same(r.bytes(), METHOD)) return false;
    if (r.take(1)[0] !== 1) return false;
    if (!same(r.bytes(), utf8(alg))) return false;
    if (!same(r.bytes(), blob)) return false;
    return r.left === 0;
  } catch {
    return false;
  }
}

const subtle = (): SubtleCrypto => globalThis.crypto.subtle;

/** WebCrypto's parameters for a key type and a signature algorithm. */
function params(alg: SigAlg): { importAs: RsaHashedImportParams | EcKeyImportParams | Algorithm;
  signWith: AlgorithmIdentifier | RsaPssParams | EcdsaParams } {
  switch (alg) {
    case "ssh-ed25519":
      return { importAs: { name: "Ed25519" }, signWith: { name: "Ed25519" } };
    case "ecdsa-sha2-nistp256":
      return { importAs: { name: "ECDSA", namedCurve: "P-256" } as EcKeyImportParams,
        signWith: { name: "ECDSA", hash: "SHA-256" } as EcdsaParams };
    case "ecdsa-sha2-nistp384":
      return { importAs: { name: "ECDSA", namedCurve: "P-384" } as EcKeyImportParams,
        signWith: { name: "ECDSA", hash: "SHA-384" } as EcdsaParams };
    case "rsa-sha2-256":
      return { importAs: { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" } as RsaHashedImportParams,
        signWith: { name: "RSASSA-PKCS1-v1_5" } };
    case "rsa-sha2-512":
      return { importAs: { name: "RSASSA-PKCS1-v1_5", hash: "SHA-512" } as RsaHashedImportParams,
        signWith: { name: "RSASSA-PKCS1-v1_5" } };
  }
}

/** The key, imported for signing (not extractable), one CryptoKey per
 * algorithm: RSA binds the hash at import. Raises when this browser cannot
 * (an old one without Ed25519). */
export async function signerOf(plain: KeyPlain): Promise<Signer> {
  const keys = new Map<SigAlg, CryptoKey>();
  for (const alg of ALGS[plain.type]) {
    const { importAs } = params(alg);
    // The JWK as WebCrypto wants it: no use or algorithm to disagree with.
    const jwk: JsonWebKey = { ...plain.jwk };
    keys.set(alg, await subtle().importKey("jwk", jwk, importAs, false, ["sign"]));
  }
  return {
    type: plain.type,
    blob: publicBlob(plain.type, plain.jwk),
    sign: async (alg, data) => {
      const key = keys.get(alg);
      if (!key) throw new Error("algorithm");
      return new Uint8Array(await subtle().sign(params(alg).signWith, key, data));
    },
  };
}
