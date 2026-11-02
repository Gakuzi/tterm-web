// The vault as this page holds it (0.1.17, vault-design.md; the vault
// password from 0.1.26, the contract's "v2").
//
// In a browser: the vault key (VK) lives only in this page's memory, as a
// non-extractable AES-GCM CryptoKey, and so do the keys it opens, each
// imported for signing and not extractable. It opens with the vault
// password (for this session), with this browser's passkey where the
// person kept the keys here (Touch ID, Windows Hello…: PRF), or by the
// Mac's approval (pairing); a vault made before 0.1.26 that has no password
// yet also with its recovery code. It is dropped on Lock, on sign out, when
// the session ends, on a reload, and after 8 hours without anything done
// here. While it is open the page says on its socket which keys it can sign
// for (vault.can) and answers the core's vault.sign with the raw signature.
// Its raw bytes exist only for a moment: when a lock or a password is made
// from them (got again through the passkey, the password or the code), and
// while the person says whether this browser keeps the keys with a passkey
// (the Keep question, after the password, the Mac's approval or a new
// vault).
//
// In tTerm for Mac the vault opens in the engine, which signs on the
// socket itself: the page does not sign and sends no vault.can; it asks the
// engine (/api/app/vault…), and shows the Mac's side of a new browser's
// request (vault.pairing).

import { useSyncExternalStore } from "react";
import {
  addVaultKey, addVaultLock, answerAppPairing, approveAppPairing, createAppVault, createVault,
  denyAppPairing, loadAppVault, loadPairing, loadVault, lockAppVault, onSignedOut, openAppVault,
  openVaultPassword, removeVaultKey, revealPairing, setAppVaultPassword, setVaultPassword,
  startPairing, vaultLockUsed, vaultRecovery, CoreError, type AppVault, type Vault, type VaultLock,
} from "../api";
import type { Values } from "../i18n";
import { socket, type VaultMessage } from "../socket";
import { coreSaid, engineSaid, refusedSaid, type Said } from "./answers.ts";
import { b64u, fromB64u, uuid, wipe, type Bytes } from "./bytes.ts";
import {
  aesKey, isRecoveryCode, makePassword, newVk, NoWasm, openKey, openPairing, pairCommit,
  pairSas, passwordFits, passwordKeys, passwordLength, passwordSettings, prfKek, sealKey,
  unwrapPassword, unwrapRecovery, unwrapVk, wellFormed, wrapVk, x25519Pair, PASSWORD_MAX, PASSWORD_MIN,
  type Kdf,
} from "./crypto.ts";
import type { ReadKey } from "./keyfile.ts";
import { cancelled, prfCreate, prfGet } from "./passkey.ts";
import { ALGS, isUserauth, signerOf, type SigAlg, type Signer } from "./sign.ts";
import { deviceLabel, passkeysHere, support, type Support } from "./support.ts";

/** Without anything done here for this long, the vault locks again: the
 * session's own clock (auth.py ends a session after as long). */
export const IDLE_MS = 8 * 60 * 60 * 1000;
const IDLE_CHECK_MS = 60_000;
/** How often a new browser looks at its request, besides the socket. */
const PAIR_POLL_MS = 2_000;
/** The credential ids of the passkeys made in this browser, per person: a
 * convenience, so that the page knows which lock is this browser's. */
const PASSKEYS_KEY = "tterm.vault.passkeys";

/** Words of the page for what went wrong, by key (i18n/en.txt), with their
 * values; `then`, a sentence after it (how many tries are left); `at`, the
 * moment `{time}` names, said with its day when it is not today. */
export class VaultError extends Error {
  key: string;
  values?: Values;
  then?: { key: string; values?: Values };
  at?: number;

  constructor(key: string, values?: Values, then?: { key: string; values?: Values }, at?: number) {
    super(key);
    this.name = "VaultError";
    this.key = key;
    this.values = values;
    this.then = then;
    this.at = at;
  }
}

/** A VaultError of what the page says (answers.ts). */
function saidError(said: Said): VaultError {
  return new VaultError(said.key, said.values, said.then, said.at);
}

/** What the core says to a vault password, in the page's words (0.1.26):
 * wrong, with the tries left when few; too many, with the time to try
 * again; none set; anything else, something that went wrong. The core's
 * sentences are never shown (the security review's L5). */
export function passwordWords(error: unknown): unknown {
  return error instanceof CoreError ? saidError(coreSaid(error)) : error;
}

/** The core's refusal of a vault made here or of a password set, in the
 * page's words (answers.ts, refusedSaid). */
function refusedWords(error: unknown, what: "make" | "set"): unknown {
  return error instanceof CoreError ? saidError(refusedSaid(error, what)) : error;
}

/** Any other answer of the core on the way to a password: something that
 * went wrong, not its sentence. */
function somethingWords(error: unknown): unknown {
  return error instanceof CoreError ? new VaultError("vault_problem.something") : error;
}

/** The engine's answers the page says in its own words (0.1.17; the app's
 * checks of 01.11 found them in English in the app's other languages):
 * Touch ID or the Mac's password not gone through; with a code, one that
 * does not open the vault; from 0.1.26, with a password, as the core's,
 * and a vault made or a password set refused (answers.ts, engineSaid).
 * With a code, a password or a new password, anything else is something
 * that went wrong; a Touch ID open keeps it as it came (openOnMac tells
 * this Mac's missing lock by its 409). */
export function appWords(error: unknown, what: "code" | "password" | "new" | null = null): unknown {
  if (!(error instanceof CoreError)) return error;
  const said = engineSaid(error, what);
  return said ? saidError(said) : error;
}

/** Four texts name the vault password as the other way in; a vault with no
 * password yet (made before 0.1.26) keeps their forms with the recovery
 * code. */
const WITH_CODE = {
  "vault_problem.no_passkey": "vault_problem.no_passkey_code",
  "vault_problem.no_prf": "vault_problem.no_prf_code",
  "vault_problem.lock_broken": "vault_problem.lock_broken_code",
  "vault_problem.no_x25519": "vault_problem.no_x25519_code",
} as const;

/** Argon2id where it cannot run here, in the page's words. */
function wasmWords(error: unknown): unknown {
  return error instanceof NoWasm ? new VaultError("vault_problem.no_wasm") : error;
}

/** The vault password as the core keeps it, checked: what this page
 * derives with. Settings outside the core's own range, or a salt of another
 * length, are not used (crypto.ts, passwordSettings): weaker ones would let
 * whoever answered for the core guess the password from the `auth` this
 * page would send. Said as something that went wrong. */
function passwordOf(vault: Vault): { salt: Bytes; kdf: Kdf } {
  if (!vault.password) throw new VaultError("vault_problem.no_password");
  const settings = passwordSettings(vault.password);
  if (!settings) throw new VaultError("vault_problem.something");
  return settings;
}

/** A problem kept as text (MacRequest): a key of the page for appWords'. */
function problemKept(error: unknown): string {
  const said = appWords(error);
  return said instanceof VaultError ? said.key : (error as Error).message;
}

export type OpenedBy = "passkey" | "password" | "recovery" | "pairing" | "new";

/** Where VK's raw bytes come from when a password is set in a browser:
 * this browser's passkey, the current password, or (a vault with no
 * password yet) the recovery code. */
export type RawFrom = { passkey: true } | { password: string } | { code: string };

/** A new browser's request to the Mac, as this browser follows it. */
export interface PairingView {
  id: string | null;
  state: "starting" | "waiting" | "answered" | "revealed" | "approved" | "denied" | "expired" | "failed";
  sas: string | null;
  problem: string | null;
}

/** The Mac's side of a request from a new browser (in the app). */
export interface MacRequest {
  id: string;
  device: string;
  ip: string;
  method: string;
  createdAt: number | null;
  sas: string | null;
  busy: boolean;
  problem: string | null;
}

export interface VaultState {
  /** GET /api/vault answered once for this person. */
  ready: boolean;
  /** In tTerm for Mac: the engine holds the vault. */
  app: boolean;
  vault: Vault | null;
  /** Open here: in this page's memory, or in the engine. */
  open: boolean;
  openedBy: OpenedBy | null;
  /** The fingerprints that sign here now. */
  signable: string[];
  /** Keys of the vault this browser cannot sign with, and why. */
  unsignable: Record<string, "ed25519" | "broken">;
  support: Support | null;
  /** This browser's own passkey lock. */
  hereLock: VaultLock | null;
  /** What the engine says (in the app). */
  appVault: AppVault | null;
  pairing: PairingView | null;
  /** Just opened with the password, the recovery code or the Mac's
   * approval, or just made here: whether this browser keeps the keys with a
   * passkey is the person's to say (the Keep question is up). */
  offerPasskey: boolean;
  /** While the Keep question is up: VK's raw bytes are still here, so a
   * passkey lock can be made (false after it failed for good). */
  canKeep: boolean;
  request: MacRequest | null;
}

interface Me {
  id: string;
  name: string;
  email: string | null;
}

interface PairingInside {
  id: string;
  priv: CryptoKey;
  pubB: Bytes;
  commit: string;
  pubA: Bytes | null;
  revealed: boolean;
  stepping: boolean;
  timer: number;
}

const EMPTY: VaultState = {
  ready: false, app: false, vault: null, open: false, openedBy: null, signable: [],
  unsignable: {}, support: null, hereLock: null, appVault: null, pairing: null,
  offerPasskey: false, canKeep: false, request: null,
};

function remembered(userId: string): string[] {
  try {
    const all = JSON.parse(localStorage.getItem(PASSKEYS_KEY) ?? "{}") as Record<string, unknown>;
    const mine = all[userId];
    return Array.isArray(mine) ? mine.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function remember(userId: string, credentialId: string): void {
  try {
    const all = JSON.parse(localStorage.getItem(PASSKEYS_KEY) ?? "{}") as Record<string, string[]>;
    const mine = new Set(Array.isArray(all[userId]) ? all[userId] : []);
    mine.add(credentialId);
    all[userId] = [...mine].slice(-20);
    localStorage.setItem(PASSKEYS_KEY, JSON.stringify(all));
  } catch {
    // Storage can be off: thisDevice, or the passkey prompt itself, tells.
  }
}

class Store {
  private state: VaultState = EMPTY;
  private listeners = new Set<() => void>();
  private me: Me | null = null;
  private vk: CryptoKey | null = null;
  private signers = new Map<string, Signer>();
  /** VK's raw bytes, only while the person says whether to keep a passkey
   * lock here (offerPasskey). */
  private pendingRaw: Bytes | null = null;
  /** Who waits for the Keep question to be answered (a new vault's first
   * key goes in after it). */
  private keepWaiters: (() => void)[] = [];
  private pair: PairingInside | null = null;
  private release: (() => void) | null = null;
  private lastActivity = Date.now();
  private idleTimer = 0;
  private generation = 0;

  constructor() {
    socket.onVault((message) => void this.onMessage(message));
    socket.onOpen(() => this.announce());
    onSignedOut(() => this.stop());
  }

  // ------------------------------------------------------------ the state

  get = (): VaultState => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  private set(change: Partial<VaultState>): void {
    this.state = { ...this.state, ...change };
    if (!this.state.offerPasskey) this.keepDone();
    for (const listener of [...this.listeners]) listener();
  }

  /** The Keep question answered (or gone with the vault): whoever waited
   * goes on. */
  private keepDone(): void {
    if (!this.keepWaiters.length) return;
    const waiting = this.keepWaiters;
    this.keepWaiters = [];
    for (const go of waiting) go();
  }

  /** Once the Keep question is answered; at once when it is not up. */
  keepAnswered(): Promise<void> {
    if (!this.state.offerPasskey) return Promise.resolve();
    return new Promise((resolve) => this.keepWaiters.push(resolve));
  }

  /** Signed in (again): the vault of this person. In the app the engine
   * holds it. */
  start(me: Me, app: boolean): void {
    if (this.me?.id === me.id && this.state.app === app) {
      this.me = me;
      return;
    }
    this.stop();
    this.me = me;
    const generation = ++this.generation;
    this.set({ ...EMPTY, app });
    void support().then((found) => {
      if (generation === this.generation) this.set({ support: found });
    });
    void this.reload();
    if (app) {
      // The Mac's side of a new browser's request comes on the socket.
      this.release = socket.hold();
      void this.refreshApp();
    } else {
      window.addEventListener("keydown", this.touch, true);
      window.addEventListener("pointerdown", this.touch, true);
      this.idleTimer = window.setInterval(this.checkIdle, IDLE_CHECK_MS);
    }
  }

  /** Signed out, the session ended, or someone else signed in: nothing of
   * the vault stays in this page. */
  stop(): void {
    this.generation += 1;
    this.dropKeys();
    this.endPairing();
    window.removeEventListener("keydown", this.touch, true);
    window.removeEventListener("pointerdown", this.touch, true);
    window.clearInterval(this.idleTimer);
    this.release?.();
    this.release = null;
    this.me = null;
    this.state = EMPTY;
    this.keepDone();
    for (const listener of [...this.listeners]) listener();
  }

  private touch = (): void => {
    this.lastActivity = Date.now();
  };

  private checkIdle = (): void => {
    if (this.vk && Date.now() - this.lastActivity > IDLE_MS) this.lock();
  };

  private hereLock(vault: Vault | null): VaultLock | null {
    if (!vault || !this.me) return null;
    const mine = remembered(this.me.id);
    return vault.locks.find((l) => l.kind === "passkey" && l.credentialId &&
      (l.thisDevice || mine.includes(l.credentialId))) ?? null;
  }

  private applyVault(vault: Vault | null): void {
    this.set({ vault, ready: true, hereLock: this.hereLock(vault) });
  }

  /** GET /api/vault again; an open vault opens the keys added meanwhile. */
  async reload(): Promise<void> {
    const generation = this.generation;
    try {
      const vault = await loadVault();
      if (generation !== this.generation) return;
      this.applyVault(vault);
      if (this.vk) await this.loadSigners();
    } catch {
      if (generation === this.generation && !this.state.ready) this.set({ ready: true });
    }
  }

  private need(): Vault {
    const vault = this.state.vault;
    if (!vault) throw new VaultError("vault_problem.no_vault");
    return vault;
  }

  // -------------------------------------------------- opening, in a browser

  /** The text for a vault with a password, or the one with the recovery
   * code a vault with no password yet keeps (0.1.26). */
  private said(key: keyof typeof WITH_CODE, vault: Vault | null = this.state.vault): string {
    return vault?.password ? key : WITH_CODE[key];
  }

  /** VK's raw bytes through a passkey of this browser: its own lock, or
   * with none known here, any passkey lock of the vault the browser has (a
   * synced one). The passkey is asked first thing, nothing awaited before
   * it: Safari lets a page ask only right after a click. */
  private async rawFromPasskey(vault: Vault): Promise<{ raw: Bytes; lock: VaultLock }> {
    const here = this.hereLock(vault);
    const locks = here ? [here] : vault.locks.filter((l) => l.kind === "passkey" && l.credentialId);
    if (!locks.length) throw new VaultError(this.said("vault_problem.no_passkey", vault));
    const got = await prfGet(locks.map((l) => fromB64u(l.credentialId!)), fromB64u(vault.prfSalt));
    const lock = locks.find((l) => l.credentialId === b64u(got.credentialId));
    if (!lock) {
      wipe(got.prf);
      throw new VaultError(this.said("vault_problem.no_passkey", vault));
    }
    if (!got.prf) throw new VaultError(this.said("vault_problem.no_prf", vault));
    const kek = await prfKek(got.prf);
    wipe(got.prf);
    try {
      return { raw: await unwrapVk(kek, fromB64u(lock.wrap), lock.id), lock };
    } catch {
      throw new VaultError(this.said("vault_problem.lock_broken", vault));
    } finally {
      wipe(kek);
    }
  }

  /** VK's raw bytes from the vault password: derived here (Argon2id, with
   * the salt and parameters the core keeps), and the wrap the core gives
   * for the right `auth`. The vault is read again first, so that a password
   * changed elsewhere is derived with its own salt and no try is lost on a
   * stale one. A password that cannot be one (under 12 characters, over
   * 256, or not well-formed Unicode) is not sent: it would only cost a try.
   * Whatever else the core answers is said in the page's words. */
  private async rawFromPassword(password: string): Promise<Bytes> {
    const n = passwordLength(password);
    if (n < PASSWORD_MIN) throw new VaultError("vault_problem.password_short");
    if (n > PASSWORD_MAX || !wellFormed(password)) throw new VaultError("vault_problem.password_wrong");
    const vault = await loadVault().catch((error: unknown) => {
      throw somethingWords(error);
    });
    if (!vault) throw new VaultError("vault_problem.no_vault");
    this.applyVault(vault);
    const { salt, kdf } = passwordOf(vault);
    const { kek, auth } = await passwordKeys(password, salt, kdf).catch((error: unknown) => {
      throw wasmWords(error);
    });
    try {
      const { wrap } = await openVaultPassword(b64u(auth)).catch((error: unknown) => {
        throw passwordWords(error);
      });
      try {
        return await unwrapPassword(kek, fromB64u(wrap), vault.id);
      } catch {
        throw new VaultError("vault_problem.password_wrong");
      }
    } finally {
      wipe(kek, auth);
    }
  }

  /** VK's raw bytes from the recovery code (a vault with no password yet). */
  /** VK from the recovery code of a vault made before 0.1.26. `wrong` is
   * what a code that does not open it says: when it opens this browser,
   * the Mac's approval is the other way; when it sets the password, the
   * person may have no Mac, so only to check it. */
  private async rawFromCode(vault: Vault, code: string,
    wrong: "vault_problem.code_wrong" | "vault_problem.code_wrong_app" = "vault_problem.code_wrong"): Promise<Bytes> {
    if (!isRecoveryCode(code)) throw new VaultError("vault_problem.code_form");
    const { recoverySalt, recoveryWrap } = await vaultRecovery().catch((error: unknown) => {
      throw somethingWords(error);
    });
    try {
      return await unwrapRecovery(code, fromB64u(recoverySalt), fromB64u(recoveryWrap), vault.id);
    } catch {
      throw new VaultError(wrong);
    }
  }

  /** Opens with this browser's passkey. */
  async openWithPasskey(): Promise<void> {
    const vault = this.need();
    const { raw, lock } = await this.rawFromPasskey(vault);
    if (this.me && lock.credentialId) remember(this.me.id, lock.credentialId);
    await this.openWith(raw, "passkey", false);
    vaultLockUsed(lock.id).catch(() => {});
  }

  /** Opens with the vault password, for this session; then the Keep
   * question. */
  async openWithPassword(password: string): Promise<void> {
    this.need();
    const raw = await this.rawFromPassword(password);
    await this.openWith(raw, "password", true);
  }

  /** Opens with the recovery code (a vault with no password yet). */
  async openWithRecovery(code: string): Promise<void> {
    const vault = this.need();
    const raw = await this.rawFromCode(vault, code);
    await this.openWith(raw, "recovery", true);
  }

  private canOfferPasskey(): boolean {
    return passkeysHere(this.state.support) && !this.hereLock(this.state.vault);
  }

  /** VK in memory, from its raw bytes (wiped here, unless they wait for the
   * person's word on a passkey lock). */
  private async openWith(raw: Bytes, by: OpenedBy, offer: boolean): Promise<void> {
    try {
      this.vk = await aesKey(raw);
    } catch (error) {
      wipe(raw);
      throw error;
    }
    this.lastActivity = Date.now();
    this.signers.clear();
    const keep = offer && this.canOfferPasskey();
    wipe(this.pendingRaw);
    this.pendingRaw = keep ? raw : null;
    if (!keep) wipe(raw);
    this.set({ open: true, openedBy: by, offerPasskey: keep, canKeep: keep });
    this.release ??= socket.hold();
    try {
      const vault = await loadVault();
      if (vault) this.applyVault(vault);
    } catch {
      // The vault as the page has it, then.
    }
    await this.loadSigners();
  }

  /** The keys of the vault, opened with VK and imported for signing. */
  private async loadSigners(): Promise<void> {
    const vk = this.vk;
    const vault = this.state.vault;
    if (!vk || !vault) return;
    const unsignable: Record<string, "ed25519" | "broken"> = {};
    const fresh = new Map<string, Signer>();
    for (const key of vault.keys) {
      const had = this.signers.get(key.fingerprint);
      if (had) {
        fresh.set(key.fingerprint, had);
        continue;
      }
      try {
        const plain = await openKey(vk, key.id, fromB64u(key.sealed));
        try {
          fresh.set(key.fingerprint, await signerOf(plain));
        } catch {
          unsignable[key.fingerprint] = plain.type === "ssh-ed25519" && this.state.support?.ed25519 === false
            ? "ed25519" : "broken";
        }
      } catch {
        unsignable[key.fingerprint] = "broken";
      }
    }
    if (this.vk !== vk) return;
    this.signers = fresh;
    this.set({ signable: [...fresh.keys()], unsignable });
    this.announce();
  }

  /** Tells the core which keys this page signs for now (none: locked). */
  private announce(): void {
    if (this.state.app || !this.me) return;
    socket.send({ op: "vault.can", keys: this.vk ? [...this.signers.keys()] : [] });
  }

  /** The person's word after the password, the Mac's approval or a new
   * vault: a passkey lock for this browser, so that Touch ID is enough here
   * next time. The passkey is made first thing (Safari: right after the
   * click). Cancelled, the question stays, to try again or say Only this
   * time; failed otherwise, the raw bytes go and the question stays only
   * to say why. */
  async keepWithPasskey(): Promise<void> {
    const raw = this.pendingRaw;
    const me = this.me;
    const vault = this.state.vault;
    if (!raw || !me || !vault) {
      this.skipPasskey();
      return;
    }
    let made: { credentialId: Bytes; prf: Bytes | null };
    try {
      made = await prfCreate(me.email ?? me.name, fromB64u(vault.prfSalt));
    } catch (error) {
      if (!cancelled(error)) this.spendRaw();
      throw error;
    }
    // Locked, or signed out, while the passkey was made: the raw bytes are
    // gone (wiped), and nothing is wrapped from them.
    if (this.pendingRaw !== raw || this.me !== me || !this.vk) {
      wipe(made.prf);
      this.spendRaw();
      throw new VaultError("vault_problem.locked");
    }
    try {
      if (!made.prf) {
        this.set({ support: this.state.support ? { ...this.state.support, prf: false } : null });
        throw new VaultError("vault_problem.no_prf_here");
      }
      const lockId = uuid();
      const kek = await prfKek(made.prf);
      let wrap: Bytes;
      try {
        wrap = await wrapVk(kek, raw, lockId);
      } finally {
        wipe(kek, made.prf);
      }
      const credentialId = b64u(made.credentialId);
      const updated = await addVaultLock({ id: lockId, kind: "passkey", credentialId,
        wrap: b64u(wrap), label: deviceLabel() });
      remember(me.id, credentialId);
      this.applyVault(updated);
      wipe(this.pendingRaw);
      this.pendingRaw = null;
      // Kept here: it opens with Touch ID from now on.
      this.set({ offerPasskey: false, canKeep: false, openedBy: this.vk ? "passkey" : this.state.openedBy });
    } catch (error) {
      this.spendRaw();
      throw error;
    }
  }

  /** The raw bytes go; the Keep question stays up, to say why. */
  private spendRaw(): void {
    wipe(this.pendingRaw);
    this.pendingRaw = null;
    if (this.state.canKeep) this.set({ canKeep: false });
  }

  /** Only this time: no passkey lock here; VK stays for this session. */
  skipPasskey(): void {
    wipe(this.pendingRaw);
    this.pendingRaw = null;
    if (this.state.offerPasskey || this.state.canKeep) this.set({ offerPasskey: false, canKeep: false });
  }

  private dropKeys(): void {
    this.vk = null;
    this.signers.clear();
    wipe(this.pendingRaw);
    this.pendingRaw = null;
  }

  /** Lock: VK and the keys leave this page's memory. */
  lock(): void {
    if (this.state.app) {
      // The engine's answer is the state; a session that ended signs out.
      void lockAppVault().catch(() => {}).finally(() => void this.refreshApp());
      return;
    }
    const was = !!this.vk;
    this.dropKeys();
    this.set({ open: false, openedBy: null, signable: [], unsignable: {}, offerPasskey: false,
      canKeep: false });
    if (was) this.announce();
    if (!this.pair) {
      this.release?.();
      this.release = null;
    }
  }

  // ----------------------------------------------- making it, in a browser

  /** A vault made in this browser, for a person without the Mac (Add a key
   * from a file): VK, and the password the person made up, derived here.
   * It is open here after, for this session; the Keep question comes next. */
  async create(password: string): Promise<void> {
    if (this.state.vault) throw new VaultError("vault_problem.exists");
    if (!this.me) throw new VaultError("vault_problem.no_vault");
    if (!passwordFits(password)) {
      throw new VaultError(passwordLength(password) < PASSWORD_MIN ? "vault_problem.password_short"
        : "vault_problem.something");
    }
    const raw = newVk();
    const vaultId = uuid();
    try {
      const made = await makePassword(password, raw, vaultId).catch((error: unknown) => {
        throw wasmWords(error);
      });
      try {
        this.applyVault(await createVault({ id: vaultId, password: { salt: b64u(made.salt),
          kdf: made.kdf, auth: b64u(made.auth), wrap: b64u(made.wrap) } }).catch((error: unknown) => {
          throw refusedWords(error, "make");
        }));
      } finally {
        wipe(made.auth);
      }
    } catch (error) {
      wipe(raw);
      throw error;
    }
    await this.openWith(raw, "new", true);
  }

  /** A key read from a file, into the vault: sealed here with VK. */
  async addKey(read: ReadKey, name: string, fileName: string): Promise<void> {
    if (!this.vk) throw new VaultError("vault_problem.locked");
    const keyId = uuid();
    const sealed = await sealKey(this.vk, keyId, { v: 1, type: read.type, jwk: read.jwk,
      comment: read.comment });
    const vault = await addVaultKey({ id: keyId, name, type: read.type, publicKey: read.publicKey,
      fingerprint: read.fingerprint, sealed: b64u(sealed), source: "file", sourceLabel: fileName });
    this.applyVault(vault);
    await this.loadSigners();
  }

  async removeKey(id: string): Promise<void> {
    await removeVaultKey(id);
    await this.reload();
  }

  /** Sets the vault password, or a new one in place of it. In a browser,
   * VK's raw bytes again, right then: through this browser's passkey, else
   * from the current password, else (a vault with no password yet) from the
   * recovery code; then a fresh salt, the derivation, and the core keeps it.
   * In the app, the engine (Touch ID). Whether it was the first password
   * (the recovery code is forgotten then). */
  async setPassword(password: string, from: RawFrom | null): Promise<boolean> {
    if (!passwordFits(password)) {
      throw new VaultError(passwordLength(password) < PASSWORD_MIN ? "vault_problem.password_short"
        : "vault_problem.something");
    }
    if (this.state.app) {
      const first = !this.state.vault?.password;
      await setAppVaultPassword(password).catch((error: unknown) => {
        throw appWords(error, "new");
      });
      await this.reload();
      return first;
    }
    const vault = this.need();
    let raw: Bytes;
    if (from && "passkey" in from) {
      raw = (await this.rawFromPasskey(vault)).raw;
    } else if (from && "password" in from) {
      raw = await this.rawFromPassword(from.password);
    } else if (from && "code" in from) {
      raw = await this.rawFromCode(vault, from.code, "vault_problem.code_wrong_app");
    } else {
      throw new VaultError(vault.password ? "vault_problem.password_short" : "vault_problem.need_code");
    }
    const now = this.state.vault ?? vault;
    const first = !now.password;
    try {
      const made = await makePassword(password, raw, now.id).catch((error: unknown) => {
        throw wasmWords(error);
      });
      try {
        this.applyVault(await setVaultPassword({ salt: b64u(made.salt), kdf: made.kdf,
          auth: b64u(made.auth), wrap: b64u(made.wrap) }).catch((error: unknown) => {
          throw refusedWords(error, "set");
        }));
      } finally {
        wipe(made.auth);
      }
    } finally {
      wipe(raw);
    }
    return first;
  }

  // ------------------------------------------- a new browser asks the Mac

  async startPairing(): Promise<void> {
    if (this.pair) return;
    const found = this.state.support ?? await support();
    if (!found.x25519) {
      this.set({ pairing: { id: null, state: "failed", sas: null, problem: this.said("vault_problem.no_x25519") } });
      return;
    }
    this.set({ pairing: { id: null, state: "starting", sas: null, problem: null } });
    try {
      const { privateKey, publicRaw } = await x25519Pair();
      const commit = b64u(await pairCommit(publicRaw));
      const made = await startPairing(commit);
      this.pair = { id: made.id, priv: privateKey, pubB: publicRaw, commit, pubA: null,
        revealed: false, stepping: false, timer: 0 };
      this.pair.timer = window.setInterval(() => void this.pairStep(), PAIR_POLL_MS);
      this.release ??= socket.hold();
      this.set({ pairing: { id: made.id, state: "waiting", sas: null, problem: null } });
    } catch (error) {
      this.set({ pairing: { id: null, state: "failed", sas: null,
        problem: (error as Error).message || "vault_problem.pairing" } });
    }
  }

  /** Done with the request (Not now, or the dialog closed): this browser
   * stops waiting for it. */
  endPairing(): void {
    if (this.pair) window.clearInterval(this.pair.timer);
    this.pair = null;
    if (this.state.pairing) this.set({ pairing: null });
    if (!this.vk && !this.state.app) {
      this.release?.();
      this.release = null;
    }
  }

  private async pairStep(): Promise<void> {
    const p = this.pair;
    if (!p || p.stepping) return;
    p.stepping = true;
    try {
      const view = await loadPairing(p.id);
      if (this.pair !== p) return;
      if (!view || view.commit !== p.commit) {
        this.finishPairing(p, "failed", "vault_problem.pairing");
        return;
      }
      if (view.state === "answered" && !p.revealed && view.pubA) {
        p.pubA = fromB64u(view.pubA);
        await revealPairing(p.id, b64u(p.pubB));
        p.revealed = true;
        const sas = await pairSas(p.pubA, p.pubB);
        this.set({ pairing: { id: p.id, state: "revealed", sas, problem: null } });
      } else if ((view.state === "revealed" || view.state === "approved") && !p.pubA && view.pubA) {
        p.pubA = fromB64u(view.pubA);
        this.set({ pairing: { id: p.id, state: "revealed", sas: await pairSas(p.pubA, p.pubB), problem: null } });
      }
      if (view.state === "approved" && view.sealed && p.pubA) {
        const raw = await openPairing(p.priv, p.pubA, p.pubB, fromB64u(view.sealed), p.id);
        const sas = this.state.pairing?.sas ?? null;
        this.finishPairing(p, "approved", null, sas);
        await this.openWith(raw, "pairing", true);
      } else if (view.state === "approved") {
        // The core gives the sealed vault key out once, then clears it: an
        // approved request without it was read already. Ask again.
        this.finishPairing(p, "failed", "vault_problem.pairing");
      } else if (view.state === "denied" || view.state === "expired") {
        this.finishPairing(p, view.state, null);
      }
    } catch (error) {
      if (this.pair === p && !(error instanceof TypeError)) {
        this.finishPairing(p, "failed", (error as Error).message || "vault_problem.pairing");
      }
    } finally {
      p.stepping = false;
    }
  }

  private finishPairing(p: PairingInside, state: PairingView["state"], problem: string | null,
    sas: string | null = null): void {
    window.clearInterval(p.timer);
    if (this.pair === p) this.pair = null;
    this.set({ pairing: { id: p.id, state, sas, problem } });
  }

  // ----------------------------------------------------- the socket's ops

  private async onMessage(message: VaultMessage): Promise<void> {
    if (!this.me) return;
    switch (message.op) {
      case "vault.sign":
        await this.sign(message);
        break;
      case "vault.changed":
        await this.reload();
        if (this.state.app) await this.refreshApp();
        break;
      case "vault.pairing":
        if (this.state.app) this.requestCame(message);
        break;
      case "vault.pairing.update": {
        const id = String(message.id ?? "");
        const state = String(message.state ?? "");
        if (this.pair?.id === id) void this.pairStep();
        const request = this.state.request;
        if (request?.id === id && ["approved", "denied", "expired"].includes(state)) {
          this.set({ request: null });
        }
        break;
      }
    }
  }

  private unable(id: string): void {
    socket.send({ op: "vault.unable", id });
  }

  /** The core asks this page to sign a login: with the key, if this page
   * holds it open; else it is asked elsewhere. */
  private async sign(message: VaultMessage): Promise<void> {
    const id = String(message.id ?? "");
    if (!id) return;
    // In the app the engine signs; one that reaches the page is not its to
    // answer.
    if (this.state.app || !this.vk) {
      this.unable(id);
      return;
    }
    const signer = this.signers.get(String(message.key ?? ""));
    const alg = String(message.alg ?? "") as SigAlg;
    if (!signer || !ALGS[signer.type].includes(alg)) {
      this.unable(id);
      return;
    }
    try {
      const data = fromB64u(String(message.data ?? ""));
      // A login with this very key, and nothing else (RFC 4252 §7).
      if (!isUserauth(data, alg, signer.blob)) {
        this.unable(id);
        return;
      }
      const raw = await signer.sign(alg, data);
      socket.send({ op: "vault.signed", id, sig: b64u(raw) });
    } catch {
      this.unable(id);
    }
  }

  // ---------------------------------------------------- in tTerm for Mac

  /** The newest refreshApp() asked: an older one answered later is not
   * applied over it. The core tells vault.changed before it answers the
   * Mac's new lock, so a refresh asked then can come back "locked" after
   * the one asked once the vault opened (seen in the app's checks, 01.11). */
  private appAsked = 0;

  async refreshApp(): Promise<void> {
    if (!this.state.app) return;
    const generation = this.generation;
    const asked = ++this.appAsked;
    const current = () => generation === this.generation && asked === this.appAsked;
    try {
      const appVault = await loadAppVault();
      if (!current()) return;
      this.set({ appVault, open: appVault.open, signable: appVault.keys,
        openedBy: appVault.open ? "passkey" : null });
    } catch {
      if (current()) this.set({ appVault: null });
    }
  }

  /** Opens the vault on this Mac: Touch ID or the Mac's password, with this
   * Mac's lock; a vault this Mac has no lock of yet, once with the vault
   * password (or the recovery code, while it has no password), and the
   * engine gives this Mac its own lock. */
  async appOpen(how: { password: string } | { recoveryCode: string } | null = null): Promise<void> {
    if (how && "password" in how) {
      const n = passwordLength(how.password);
      if (n < PASSWORD_MIN) throw new VaultError("vault_problem.password_short");
      if (n > PASSWORD_MAX || !wellFormed(how.password)) throw new VaultError("vault_problem.password_wrong");
    }
    await openAppVault(how).catch((error: unknown) => {
      throw appWords(error, !how ? null : "password" in how ? "password" : "code");
    });
    await this.refreshApp();
    void this.reload();
  }

  /** The vault made on this Mac, with the password the person made up: no
   * Touch ID, and it is open after (0.1.26). */
  async appCreate(password: string): Promise<void> {
    if (!passwordFits(password)) {
      throw new VaultError(passwordLength(password) < PASSWORD_MIN ? "vault_problem.password_short"
        : "vault_problem.something");
    }
    await createAppVault(password).catch((error: unknown) => {
      throw appWords(error, "new");
    });
    await this.reload();
    await this.refreshApp();
  }

  private requestCame(message: VaultMessage): void {
    const id = String(message.id ?? "");
    if (!id) return;
    const request: MacRequest = {
      id, device: String(message.device ?? ""), ip: String(message.ip ?? ""),
      method: String(message.method ?? "code"),
      createdAt: typeof message.createdAt === "number" ? message.createdAt : null,
      sas: null, busy: false, problem: null,
    };
    this.set({ request });
    const update = (change: Partial<MacRequest>) => {
      const now = this.state.request;
      if (now?.id === id) this.set({ request: { ...now, ...change } });
    };
    // When it signed in comes with the pairing itself.
    loadPairing(id).then((view) => {
      if (view) update({ createdAt: view.createdAt ?? request.createdAt, device: view.device || request.device });
    }).catch(() => {});
    // The Mac's key, then the six digits, once the browser revealed its own.
    answerAppPairing(id)
      .then(({ sas }) => update({ sas }))
      .catch((error: Error) => update({ problem: error.message }));
  }

  async allowRequest(): Promise<void> {
    const request = this.state.request;
    if (!request) return;
    this.set({ request: { ...request, busy: true, problem: null } });
    try {
      await approveAppPairing(request.id);
      if (this.state.request?.id === request.id) this.set({ request: null });
    } catch (error) {
      const now = this.state.request;
      if (now?.id === request.id) this.set({ request: { ...now, busy: false, problem: problemKept(error) } });
    }
  }

  async denyRequest(): Promise<void> {
    const request = this.state.request;
    if (!request) return;
    this.set({ request: { ...request, busy: true, problem: null } });
    try {
      await denyAppPairing(request.id);
      if (this.state.request?.id === request.id) this.set({ request: null });
    } catch (error) {
      const now = this.state.request;
      if (now?.id === request.id) this.set({ request: { ...now, busy: false, problem: (error as Error).message } });
    }
  }

  /** Later: the request waits, until it expires. */
  dismissRequest(): void {
    this.set({ request: null });
  }
}

/** The one vault of this page. */
export const vaultStore = new Store();

export function useVault(): VaultState {
  return useSyncExternalStore(vaultStore.subscribe, vaultStore.get, vaultStore.get);
}
