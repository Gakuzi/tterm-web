// The passkey lock of a browser (0.1.17, vault-design.md, "Locks"): a
// WebAuthn credential of this browser with the PRF extension. The PRF output
// for the vault's prfSalt is what the lock's KEK comes from; nothing is
// verified by the core, which never sees that output.
//
// Made with userVerification "required", residentKey "preferred", the rp
// id the page's host name, a user id of 16 random bytes, the person's email
// as the user name and "tTerm vault" as the display name; algorithms -8,
// -7, -257. When the browser gives no PRF output at create, one get() right
// away; when that gives none either, this browser has no passkey lock.

import { copy, random, type Bytes } from "./bytes.ts";

interface PrfOutputs {
  enabled?: boolean;
  results?: { first?: BufferSource };
}

function prfOf(credential: PublicKeyCredential): { enabled?: boolean; first: Bytes | null } {
  const ext = credential.getClientExtensionResults() as { prf?: PrfOutputs };
  const first = ext.prf?.results?.first;
  const view = !first ? null : first instanceof ArrayBuffer ? new Uint8Array(first)
    : new Uint8Array(first.buffer, first.byteOffset, first.byteLength);
  return { enabled: ext.prf?.enabled, first: view ? copy(view) : null };
}

/** The PRF output of a passkey of this browser, one of `credentialIds`, for
 * the salt: what the authenticator picked, or null when it gives no PRF.
 * Raises when the person cancels or no passkey answers. */
export async function prfGet(credentialIds: Bytes[], salt: Bytes,
  rpId = location.hostname): Promise<{ credentialId: Bytes; prf: Bytes | null }> {
  const credential = await navigator.credentials.get({
    publicKey: {
      challenge: random(32),
      rpId,
      allowCredentials: credentialIds.map((id) => ({ type: "public-key" as const, id })),
      userVerification: "required",
      timeout: 120_000,
      extensions: { prf: { eval: { first: salt } } } as AuthenticationExtensionsClientInputs,
    },
  }) as PublicKeyCredential | null;
  if (!credential) throw new Error("no credential");
  return { credentialId: new Uint8Array(credential.rawId), prf: prfOf(credential).first };
}

/** A new passkey for the vault, and its PRF output for the salt (null when
 * this browser gives none: then it has no passkey lock). */
export async function prfCreate(userName: string, salt: Bytes,
  rpId = location.hostname): Promise<{ credentialId: Bytes; prf: Bytes | null }> {
  const credential = await navigator.credentials.create({
    publicKey: {
      rp: { id: rpId, name: "tTerm" },
      user: {
        id: random(16),
        name: userName,
        displayName: "tTerm vault", // i18n-ignore: the contract's name of the passkey
      },
      challenge: random(32),
      pubKeyCredParams: [
        { type: "public-key", alg: -8 },
        { type: "public-key", alg: -7 },
        { type: "public-key", alg: -257 },
      ],
      authenticatorSelection: { userVerification: "required", residentKey: "preferred" },
      attestation: "none",
      timeout: 120_000,
      extensions: { prf: { eval: { first: salt } } } as AuthenticationExtensionsClientInputs,
    },
  }) as PublicKeyCredential | null;
  if (!credential) throw new Error("no credential");
  const credentialId = new Uint8Array(credential.rawId);
  const made = prfOf(credential);
  if (made.first) return { credentialId, prf: made.first };
  if (made.enabled === false) {
    forget(credentialId, rpId);
    return { credentialId, prf: null };
  }
  // Some authenticators give PRF only on get(): once, right away.
  const got = await prfGet([credentialId], salt, rpId);
  if (!got.prf) forget(credentialId, rpId);
  return { credentialId, prf: got.prf };
}

/** A passkey made in vain (no PRF here): where the browser can, its
 * password manager is told to drop it. */
function forget(credentialId: Bytes, rpId: string): void {
  const signal = (PublicKeyCredential as unknown as {
    signalUnknownCredential?: (o: { rpId: string; credentialId: string }) => Promise<void>;
  }).signalUnknownCredential;
  if (typeof signal !== "function") return;
  let text = "";
  for (const b of credentialId) text += String.fromCharCode(b);
  const id = btoa(text).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  signal({ rpId, credentialId: id }).catch(() => {});
}

/** Why a WebAuthn call did not give a result: the person cancelled or let
 * it time out ("cancelled"), or something else. */
export function cancelled(error: unknown): boolean {
  return error instanceof DOMException && (error.name === "NotAllowedError" || error.name === "AbortError");
}
