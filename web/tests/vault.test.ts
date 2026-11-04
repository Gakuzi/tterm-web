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
  argon2, beyondLatin, INFO, KDF, kdfAllowed, LONE_SURROGATE, makePassword, passwordCheck,
  passwordFits, passwordKeys, passwordLength, passwordSettings, unwrapPassword, wellFormed,
  wrapPassword, type Kdf,
} from "../src/vault/crypto.ts";
import { passwordRule } from "../src/vault/password.ts";
import { fingerprint, publicLine, shortFingerprint } from "../src/vault/ssh.ts";
import { PROOF_ALG, proofBlob } from "../src/vault/proof.ts";
import { isUserauth, signerOf } from "../src/vault/sign.ts";

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

test("the proof of open keys: the vector's SSHSIG blob and its signature (0.1.28)", async () => {
  const P = V.proof;
  const blob = await proofBlob(P.nonce);
  assert.equal(b64u(blob), P.blob);
  assert.equal(fromUtf8(blob.subarray(0, 6)), "SSHSIG");
  const plain = JSON.parse(V.key.plaintext);
  assert.equal(PROOF_ALG[plain.type as keyof typeof PROOF_ALG], P.alg);
  const signer = await signerOf(plain);
  assert.equal(b64u(await signer.sign(P.alg, blob)), P.raw_sig);
  assert.equal(await fingerprint(plain.type, plain.jwk), P.key);
  // Another nonce, another blob: a proof is for its own socket.
  assert.notEqual(b64u(await proofBlob(P.nonce.slice(1))), P.blob);
  // A login's data is not the proof's, nor the other way round.
  assert.equal(isUserauth(blob, "ssh-ed25519", signer.blob), false);
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

// ------------------------------------------------ the vault password (v2)

/** One of the password vectors, all the way: NFC, UTF-8, Argon2id, the two
 * HKDF keys, what the core keeps, and the wrap of VK. */
async function passwordVector(P: {
  vault_id: string; password: string; nfc: string; utf8: string; salt: string;
  kdf: Kdf; argon2: string; kek_info: string; auth_info: string; kek: string;
  auth: string; check: string; aad: string; wrap: string;
}): Promise<void> {
  assert.equal(P.password.normalize("NFC"), P.nfc);
  assert.equal(b64u(utf8(P.nfc)), P.utf8);
  assert.equal(P.kek_info, INFO.passwordKek);
  assert.equal(P.auth_info, INFO.passwordAuth);
  assert.equal(AAD.password(P.vault_id), P.aad);
  // As typed (not yet NFC): the derivation normalizes it.
  assert.equal(b64u(await argon2(P.password, u(P.salt), P.kdf)), P.argon2);
  const { kek, auth } = await passwordKeys(P.password, u(P.salt), P.kdf);
  assert.equal(b64u(kek), P.kek);
  assert.equal(b64u(auth), P.auth);
  assert.equal(b64u(await passwordCheck(auth)), P.check);
  const wrap = await wrapPassword(kek, vk, P.vault_id, nonce);
  assert.equal(b64u(wrap), P.wrap);
  assert.equal(wrap.length, 60);
  assert.equal(b64u(await unwrapPassword(kek, u(P.wrap), P.vault_id)), V.vk);
  // Another vault's aad, or another kek, does not open it.
  await assert.rejects(unwrapPassword(kek, u(P.wrap), V.key.id));
  await assert.rejects(unwrapPassword(auth, u(P.wrap), P.vault_id));
}

test("the vault password, small parameters: e + U+0301 is é after NFC, Cyrillic", async () => {
  const P = V.password.small;
  assert.notEqual(P.password, P.nfc);
  assert.ok(P.password.includes("é"));
  await passwordVector(P);
  // Typed with é as one sign, it is the same password.
  assert.equal(b64u(await argon2(P.nfc, u(P.salt), P.kdf)), P.argon2);
});

test("the vault password, the real parameters (Argon2id, 64 MiB, 3 passes, 1 lane)", async () => {
  const P = V.password.default;
  assert.deepEqual(P.kdf, KDF);
  await passwordVector(P);
});

test("the password's length: code points after NFC, 12 to 256, nothing trimmed", () => {
  assert.equal(passwordLength("é"), 1);
  assert.equal(passwordLength("тёплый"), 6);
  // An emoji is one code point, two UTF-16 units.
  assert.equal(passwordLength("😀"), 1);
  assert.equal("😀".length, 2);
  assert.ok(!passwordFits("a".repeat(11)));
  assert.ok(passwordFits("a".repeat(12)));
  // Eleven letters and an accent typed apart: 11 after NFC.
  assert.ok(!passwordFits(`${"a".repeat(10)}é`));
  assert.ok(passwordFits("😀".repeat(12)));
  assert.ok(passwordFits("a".repeat(256)));
  assert.ok(!passwordFits("a".repeat(257)));
  // Spaces count, at the ends too.
  assert.ok(passwordFits(" ".repeat(12)));
  assert.equal(passwordLength("  correct horse  "), 17);
  assert.ok(!beyondLatin("Correct horse 7 ~!"));
  assert.ok(beyondLatin("Correct horse 7 été"));
  assert.ok(beyondLatin("тёплый ветер над Тежу"));
  assert.ok(beyondLatin("tab\there"));
});

test("a new password: a fresh salt each time, the real parameters, and it opens VK", async () => {
  const vaultId = V.password.small.vault_id;
  const made = await makePassword("correct horse battery staple", vk, vaultId);
  assert.equal(made.salt.length, 16);
  assert.deepEqual(made.kdf, KDF);
  assert.equal(made.auth.length, 32);
  assert.equal(made.wrap.length, 60);
  const again = await passwordKeys("correct horse battery staple", made.salt, made.kdf);
  assert.equal(b64u(again.auth), b64u(made.auth));
  assert.equal(b64u(await unwrapPassword(again.kek, made.wrap, vaultId)), V.vk);
  const other = await makePassword("correct horse battery staple", vk, vaultId);
  assert.notEqual(b64u(other.salt), b64u(made.salt));
  await assert.rejects(makePassword("too short", vk, vaultId));
});

test("the parameters the page derives with: the core's range only", () => {
  assert.ok(kdfAllowed(KDF));
  assert.ok(kdfAllowed({ alg: "argon2id", m: 1048576, t: 10, p: 4 }));
  for (const weak of [
    { alg: "argon2id", m: 256, t: 2, p: 1 }, { alg: "argon2id", m: 65535, t: 3, p: 1 },
    { alg: "argon2id", m: 65536, t: 2, p: 1 }, { alg: "argon2id", m: 65536, t: 3, p: 0 },
    { alg: "argon2id", m: 2097152, t: 3, p: 1 }, { alg: "argon2id", m: 65536, t: 11, p: 1 },
    { alg: "argon2id", m: 65536, t: 3, p: 5 }, { alg: "argon2i", m: 65536, t: 3, p: 1 },
    { alg: "argon2id", m: 65536.5, t: 3, p: 1 }, { alg: "argon2id", m: "65536", t: 3, p: 1 },
    null, "argon2id",
  ]) {
    assert.ok(!kdfAllowed(weak), JSON.stringify(weak));
  }
});

test("the password window: the hint, the characters missing, the layout note, the match", () => {
  const empty = passwordRule("", "");
  assert.deepEqual(empty, { under: { kind: "hint" }, latin: false, match: null, wellFormed: true, ok: false });
  assert.deepEqual(passwordRule("a", "").under, { kind: "short", n: 11 });
  assert.deepEqual(passwordRule("a".repeat(11), "").under, { kind: "short", n: 1 });
  assert.deepEqual(passwordRule("a".repeat(12), "").under, { kind: "hint" });
  // Counted after NFC: e and its accent typed apart are one character.
  assert.deepEqual(passwordRule(`${"a".repeat(10)}é`, "").under, { kind: "short", n: 1 });
  assert.equal(passwordRule("correct horse", "").latin, false);
  assert.equal(passwordRule("тёплый ветер над Тежу", "").latin, true);
  // The second field: nothing said until it has something.
  assert.equal(passwordRule("correct horse battery", "").match, null);
  assert.equal(passwordRule("correct horse battery", "correct").match, false);
  assert.equal(passwordRule("correct horse battery", "correct horse battery").match, true);
  // The same after NFC.
  assert.equal(passwordRule("été en hiver ok", "été en hiver ok").match, true);
  // The button: 12 to 256, and the same twice.
  assert.equal(passwordRule("correct horse battery", "correct horse battery").ok, true);
  assert.equal(passwordRule("short pass", "short pass").ok, false);
  assert.equal(passwordRule("correct horse battery", "correct horse batter").ok, false);
  assert.equal(passwordRule("a".repeat(257), "a".repeat(257)).ok, false);
  assert.equal(passwordRule("a".repeat(256), "a".repeat(256)).ok, true);
});

test("a password that is not well-formed Unicode: refused, never derived", async () => {
  for (const good of ["", "correct horse", "тёплый ветер", "😀", "a😀b😀", "\ufffd", "\ud83d\ude00\ud83d\ude00"]) {
    assert.ok(wellFormed(good), JSON.stringify(good));
  }
  for (const bad of ["\ud800", "\udc00", "a\ud83d", "\ude00b", "\ud83d\ud83d\ude00", "\ud83d\ude00\ude00",
    "\udbff\udbff"]) {
    assert.ok(!wellFormed(bad), JSON.stringify(bad));
  }
  // The pattern (for a browser without String.prototype.isWellFormed) says
  // what the method says, for every string of up to 5 of these code units.
  const units = ["a", "\ud800", "\udbff", "\udc00", "\udfff", "\ud83d", "\ude00"];
  let level = [""];
  for (let length = 1; length <= 5; length++) {
    level = level.flatMap((s) => units.map((c) => s + c));
    for (const s of level) {
      const native = (s as unknown as { isWellFormed: () => boolean }).isWellFormed();
      assert.equal(!LONE_SURROGATE.test(s), native, JSON.stringify(s));
    }
  }
  // Twelve characters as the length counts them, but one a lone surrogate:
  // TextEncoder would write U+FFFD for it, the same bytes as this other
  // password; neither the rule nor the derivation takes it.
  const lone = `${"a".repeat(11)}\ud800`;
  const replaced = `${"a".repeat(11)}\ufffd`;
  assert.equal(passwordLength(lone), 12);
  assert.ok(!passwordFits(lone));
  assert.ok(passwordFits(replaced));
  assert.deepEqual(passwordRule(lone, lone), { under: { kind: "hint" }, latin: true, match: true,
    wellFormed: false, ok: false });
  const small = V.password.small.kdf as Kdf;
  await assert.rejects(argon2(lone, u(V.password.small.salt), small));
  await assert.rejects(passwordKeys(lone, u(V.password.small.salt), small));
  await assert.rejects(makePassword(lone, vk, V.password.small.vault_id));
  assert.equal((await argon2(replaced, u(V.password.small.salt), small)).length, 32);
});

test("the salt and settings the page derives with: 16 bytes, the core's range", () => {
  const P = V.password.default;
  const got = passwordSettings({ salt: P.salt, kdf: P.kdf });
  assert.ok(got);
  assert.equal(b64u(got.salt), P.salt);
  assert.deepEqual(got.kdf, KDF);
  // Only the four members are taken.
  assert.deepEqual(passwordSettings({ salt: P.salt, kdf: { ...P.kdf, extra: 1 } })?.kdf, KDF);
  for (const bad of [
    { salt: P.salt, kdf: V.password.small.kdf },
    { salt: b64u(new Uint8Array(15)), kdf: P.kdf },
    { salt: b64u(new Uint8Array(32)), kdf: P.kdf },
    { salt: `${P.salt}=`, kdf: P.kdf },
    { salt: 12, kdf: P.kdf },
    { salt: P.salt },
    null,
  ]) {
    assert.equal(passwordSettings(bad), null, JSON.stringify(bad));
  }
});
