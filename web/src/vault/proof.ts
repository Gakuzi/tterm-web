// The proof that the keys are open on this device (0.1.28, vault-design.md
// v3): on each new socket the core sends a nonce (vault.challenge); a page
// whose vault is open here signs, with any key of the vault, the SSHSIG blob
// (OpenSSH PROTOCOL.sshsig) of namespace tterm-keys@tterm.net over the
// message and that nonce, and the core checks it with the key's public half.
// Until then nothing of a guarded machine reaches the page: a server with
// the person's key, one through their Mac, a computer.
//
// The page builds the blob itself from the nonce: it starts with "SSHSIG",
// and no SSH login's data does (that starts with a length), so whoever
// holds the socket's other end can have it sign neither a login this way
// nor anything else of their choosing.

import { concat, utf8, type Bytes } from "./bytes.ts";
import type { KeyType } from "./crypto.ts";
import type { SigAlg } from "./sign.ts";
import { sshString } from "./ssh.ts";

export const PROOF_NAMESPACE = "tterm-keys@tterm.net";
// The contract's bytes, not a text to translate.
export const PROOF_MESSAGE = "tterm keys open v1\n"; // i18n-ignore

/** How each kind of key signs its proof. */
export const PROOF_ALG: Record<KeyType, SigAlg> = {
  "ssh-ed25519": "ssh-ed25519",
  "ecdsa-sha2-nistp256": "ecdsa-sha2-nistp256",
  "ecdsa-sha2-nistp384": "ecdsa-sha2-nistp384",
  "ssh-rsa": "rsa-sha2-512",
};

/** The blob a key signs to prove the keys open on the socket that was given
 * `nonce`: "SSHSIG" · string(namespace) · string("") · string("sha512") ·
 * string(SHA-512(message · nonce)). */
export async function proofBlob(nonce: string): Promise<Bytes> {
  const digest = new Uint8Array(await globalThis.crypto.subtle.digest("SHA-512",
    utf8(PROOF_MESSAGE + nonce)));
  return concat(utf8("SSHSIG"), sshString(PROOF_NAMESPACE), sshString(new Uint8Array(0)),
    sshString("sha512"), sshString(digest));
}
