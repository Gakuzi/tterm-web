// The vault's crypto (src/vault) against the shared test vectors of the
// contract (vault-vectors.json, the same file the core's and the engine's
// tests use). Node runs it as it is (type stripping):
//
//   node --test tests/vault.test.ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { b64u, concat, fromB64u, fromUtf8, utf8 } from "../src/vault/bytes.ts";
import {
  AAD, groupCode, isRecoveryCode, makeRecovery, newRecoveryCode, normalizeCode, open,
  openKey, openPairing, pairCommit, pairKek, pairSas, prfKek, recoveryKek, seal, sealKey,
  sealKeyText, unwrapRecovery, unwrapVk, wrapRecovery, wrapVk, x25519Shared, aesKey,
} from "../src/vault/crypto.ts";
import { fingerprint, publicLine, shortFingerprint } from "../src/vault/ssh.ts";
import { signerOf } from "../src/vault/sign.ts";

const V = JSON.parse(readFileSync(new URL("./vault-vectors.json", import.meta.url), "utf8"));
const vk = fromB64u(V.vk);
const nonce = fromB64u(V.nonce);
const u = (text: string) => fromB64u(text);

/** An X25519 private key from its 32 raw bytes, as WebCrypto takes it. */
async function x25519Private(raw: Uint8Array): Promise<CryptoKey> {
  const prefix = new Uint8Array([0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06, 0x03, 0x2b,
    0x65, 0x6e, 0x04, 0x22, 0x04, 0x20]);
  return crypto.subtle.importKey("pkcs8", concat(prefix, raw), { name: "X25519" }, true,
    ["deriveBits"]);
}

async function x25519Public(priv: CryptoKey): Promise<string> {
  const jwk = await crypto.subtle.exportKey("jwk", priv);
  return jwk.x ?? "";
}

test("a key sealed with VK is the vector's, and opens again", async () => {
  const sealed = await sealKeyText(vk, V.key.id, V.key.plaintext, nonce);
  assert.equal(b64u(sealed), V.key.sealed);
  assert.equal(AAD.key(V.key.id), V.key.aad);
  // The same with VK as a non-extractable CryptoKey, as the page holds it.
  const held = await aesKey(vk);
  assert.equal(held.extractable, false);
  const plain = await openKey(held, V.key.id, u(V.key.sealed));
  const want = JSON.parse(V.key.plaintext);
  assert.deepEqual(plain, want);
  // Sealed again from the parsed plaintext: the same bytes, the contract's
  // field order.
  assert.equal(b64u(await sealKey(held, V.key.id, plain, nonce)), V.key.sealed);
  // Another key id (aad) does not open it.
  await assert.rejects(openKey(held, "00000000-0000-4000-8000-000000000000", u(V.key.sealed)));
});

test("the key's public half is the vector's OpenSSH line", async () => {
  const want = JSON.parse(V.key.plaintext);
  assert.equal(publicLine(want.type, want.jwk, want.comment), V.key.openssh_public);
  const fp = await fingerprint(want.type, want.jwk);
  assert.match(fp, /^SHA256:[A-Za-z0-9+/]{43}$/);
  assert.equal(shortFingerprint(fp), `SHA256:${fp.slice(7, 11)}…${fp.slice(-4)}`);
});

test("the passkey lock: KEK from the PRF output, the wrap of VK", async () => {
  const L = V.prf_lock;
  assert.equal(L.hkdf_salt, b64u(new Uint8Array(32)));
  const kek = await prfKek(u(L.prf_output));
  assert.equal(b64u(kek), L.kek);
  assert.equal(AAD.lock(L.lock_id), L.aad);
  const wrap = await wrapVk(kek, vk, L.lock_id, nonce);
  assert.equal(b64u(wrap), L.wrap);
  assert.equal(wrap.length, 60);
  assert.equal(b64u(await unwrapVk(kek, u(L.wrap), L.lock_id)), V.vk);
  await assert.rejects(unwrapVk(kek, u(L.wrap), V.recovery.vault_id));
});

test("the recovery code: normalized, its KEK, the wrap of VK", async () => {
  const R = V.recovery;
  assert.equal(normalizeCode(R.code), R.normalized);
  assert.equal(normalizeCode(" k7qf 29xm-pl4d-8vht-r2nc-6wjb "), R.normalized);
  assert.equal(normalizeCode("K7QF-29XM-PI4D-8VHT-R2NC-6WJB"), R.normalized);
  assert.equal(normalizeCode("K7QF-29XM-PL4D-8VHT-R2NC-6WJB").length, 24);
  assert.ok(isRecoveryCode(R.code));
  assert.ok(!isRecoveryCode("K7QF-29XM-PL4D-8VHT-R2NC"));
  assert.ok(!isRecoveryCode("K7QF-29XM-PL4D-8VHT-R2NC-6WJU"));
  assert.equal(b64u(await recoveryKek(R.code, u(R.salt))), R.kek);
  assert.equal(AAD.recovery(R.vault_id), R.aad);
  assert.equal(b64u(await wrapRecovery(R.code, u(R.salt), vk, R.vault_id, nonce)), R.wrap);
  // Typed as it is shown, or in small letters with spaces: it opens.
  assert.equal(b64u(await unwrapRecovery("k7qf 29xm pl4d 8vht r2nc 6wjb", u(R.salt), u(R.wrap),
    R.vault_id)), V.vk);
  await assert.rejects(unwrapRecovery("K7QF-29XM-PL4D-8VHT-R2NC-6WJC", u(R.salt), u(R.wrap),
    R.vault_id));
});

test("a new recovery code: 24 signs of Crockford's base32 in six groups", async () => {
  const seen = new Set<string>();
  for (let i = 0; i < 50; i++) {
    const code = newRecoveryCode();
    assert.match(code, /^[0-9A-HJKMNP-TV-Z]{4}(-[0-9A-HJKMNP-TV-Z]{4}){5}$/);
    assert.equal(groupCode(normalizeCode(code)), code);
    seen.add(code);
  }
  assert.equal(seen.size, 50);
  const made = await makeRecovery(vk, V.recovery.vault_id);
  assert.equal(made.salt.length, 16);
  assert.equal(made.wrap.length, 60);
  assert.equal(b64u(await unwrapRecovery(made.code, made.salt, made.wrap, V.recovery.vault_id)),
    V.vk);
});

test("pairing: the public keys, commit, SAS, shared secret, KEK and sealed VK", async () => {
  const P = V.pairing;
  const privA = await x25519Private(u(P.privA));
  const privB = await x25519Private(u(P.privB));
  assert.equal(await x25519Public(privA), P.pubA);
  assert.equal(await x25519Public(privB), P.pubB);
  const pubA = u(P.pubA);
  const pubB = u(P.pubB);
  assert.equal(b64u(await pairCommit(pubB)), P.commit);
  assert.equal(await pairSas(pubA, pubB), P.sas);
  const shared = await x25519Shared(privA, pubB);
  assert.equal(b64u(shared), P.shared);
  assert.equal(b64u(await x25519Shared(privB, pubA)), P.shared);
  const kek = await pairKek(shared, pubA, pubB);
  assert.equal(b64u(kek), P.kek);
  assert.equal(AAD.pair(P.id), P.aad);
  assert.equal(b64u(await seal(kek, vk, AAD.pair(P.id), nonce)), P.sealed);
  // The new browser's side: VK out of the sealed box.
  assert.equal(b64u(await openPairing(privB, pubA, pubB, u(P.sealed), P.id)), V.vk);
  await assert.rejects(openPairing(privB, pubA, pubB, u(P.sealed), V.key.id));
});

test("signing: the raw Ed25519 signature of the vector", async () => {
  const S = V.signature;
  const plain = JSON.parse(V.key.plaintext);
  assert.equal(plain.type, S.type);
  const signer = await signerOf(plain);
  const sig = await signer.sign("ssh-ed25519", u(S.data));
  assert.equal(b64u(sig), S.raw_sig);
  assert.equal(fromUtf8(u(S.data)), "session-id-and-userauth-request");
});

test("base64url is strict, as the core reads it", () => {
  assert.equal(b64u(utf8("ab?")), "YWI_");
  assert.deepEqual([...fromB64u("YWI_")], [...utf8("ab?")]);
  for (const bad of ["YWI/", "YWI_=", "YQ==", "Y", "YR", "a b"]) {
    assert.throws(() => fromB64u(bad), undefined, bad);
  }
  assert.deepEqual([...fromB64u("")], []);
});

test("a box is nonce, ciphertext and tag; another aad does not open it", async () => {
  const box = await seal(vk, utf8("hello"), "one");
  assert.equal(box.length, 12 + 5 + 16);
  assert.equal(fromUtf8(await open(vk, box, "one")), "hello");
  await assert.rejects(open(vk, box, "two"));
});
