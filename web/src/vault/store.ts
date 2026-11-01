// The vault as this page holds it (0.1.17, vault-design.md).
//
// In a browser: the vault key (VK) lives only in this page's memory, as a
// non-extractable AES-GCM CryptoKey, and so do the keys it opens, each
// imported for signing and not extractable. It opens with this browser's
// passkey (Touch ID, Windows Hello…: PRF), with the recovery code, or by
// the Mac's approval (pairing). It is dropped on Lock, on sign out, when the
// session ends, on a reload, and after 8 hours without anything done here.
// While it is open the page says on its socket which keys it can sign for
// (vault.can) and answers the core's vault.sign with the raw signature.
// Its raw bytes exist only for a moment: when a lock or a recovery code is
// made from them (then opened again through the passkey, or the code), and
// while the person says whether this browser keeps a passkey lock.
//
// In tTerm for Mac the vault opens in the engine, which signs on the
// socket itself: the page does not sign and sends no vault.can; it asks the
// engine (/api/app/vault…), and shows the Mac's side of a new browser's
// request (vault.pairing).

import { useSyncExternalStore } from "react";
import {
  addVaultKey, addVaultLock, answerAppPairing, approveAppPairing, appRecoveryCode,
  createAppVault, createVault, denyAppPairing, loadAppVault, loadPairing, loadVault,
  lockAppVault, onSignedOut, openAppVault, removeVaultKey, revealPairing, setVaultRecovery,
  startPairing, vaultLockUsed, vaultRecovery, CoreError, type AppVault, type Vault, type VaultLock,
} from "../api";
import { socket, type VaultMessage } from "../socket";
import { b64u, fromB64u, uuid, wipe, type Bytes } from "./bytes.ts";
import {
  aesKey, isRecoveryCode, makeRecovery, newVk, openKey, openPairing, pairCommit, pairSas,
  prfKek, sealKey, unwrapRecovery, unwrapVk, wrapVk, x25519Pair,
} from "./crypto.ts";
import type { ReadKey } from "./keyfile.ts";
import { prfCreate, prfGet } from "./passkey.ts";
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

/** Words of the page for what went wrong, by key (i18n/en.txt). */
export class VaultError extends Error {
  key: string;

  constructor(key: string) {
    super(key);
    this.name = "VaultError";
    this.key = key;
  }
}

/** The engine's answers the page says in its own words (0.1.17; the app's
 * checks of 01.11 found them in English in the app's other languages): Touch
 * ID or the Mac's password not gone through, and, with a code, one that does
 * not open the vault. Known by the engine's sentence, so that another 403 or
 * 422 keeps its own. Anything else as it came. */
export function appWords(error: unknown, withCode = false): unknown {
  if (!(error instanceof CoreError)) return error;
  if (error.status === 403 && error.message.startsWith("Touch ID or your Mac's password did not go through")) { // i18n-ignore: the engine's words
    return new VaultError("vault_problem.touch_failed");
  }
  if (withCode && error.status === 422 && error.message.startsWith("That recovery code does not open your vault")) { // i18n-ignore: the engine's words
    return new VaultError("vault_problem.code_wrong_app");
  }
  return error;
}

/** A problem kept as text (MacRequest): a key of the page for appWords'. */
function problemKept(error: unknown): string {
  const said = appWords(error);
  return said instanceof VaultError ? said.key : (error as Error).message;
}

export type OpenedBy = "passkey" | "recovery" | "pairing" | "new";

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
  /** Just opened with the recovery code or the Mac's approval: whether this
   * browser keeps a passkey lock is the person's to say. */
  offerPasskey: boolean;
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
  offerPasskey: false, request: null,
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
    for (const listener of [...this.listeners]) listener();
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

  /** Opens with this browser's passkey; with none known here, with any
   * passkey lock of the vault the browser has (a synced one). */
  async openWithPasskey(): Promise<void> {
    const vault = this.need();
    const here = this.hereLock(vault);
    const locks = here ? [here] : vault.locks.filter((l) => l.kind === "passkey" && l.credentialId);
    if (!locks.length) throw new VaultError("vault_problem.no_passkey");
    const got = await prfGet(locks.map((l) => fromB64u(l.credentialId!)), fromB64u(vault.prfSalt));
    const lock = locks.find((l) => l.credentialId === b64u(got.credentialId));
    if (!lock) throw new VaultError("vault_problem.no_passkey");
    if (!got.prf) throw new VaultError("vault_problem.no_prf");
    const kek = await prfKek(got.prf);
    wipe(got.prf);
    let raw: Bytes;
    try {
      raw = await unwrapVk(kek, fromB64u(lock.wrap), lock.id);
    } catch {
      throw new VaultError("vault_problem.lock_broken");
    } finally {
      wipe(kek);
    }
    if (this.me && lock.credentialId) remember(this.me.id, lock.credentialId);
    await this.openWith(raw, "passkey", false);
    vaultLockUsed(lock.id).catch(() => {});
  }

  /** Opens with the recovery code. */
  async openWithRecovery(code: string): Promise<void> {
    const vault = this.need();
    if (!isRecoveryCode(code)) throw new VaultError("vault_problem.code_form");
    const { recoverySalt, recoveryWrap } = await vaultRecovery();
    let raw: Bytes;
    try {
      raw = await unwrapRecovery(code, fromB64u(recoverySalt), fromB64u(recoveryWrap), vault.id);
    } catch {
      throw new VaultError("vault_problem.code_wrong");
    }
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
    this.set({ open: true, openedBy: by, offerPasskey: keep });
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

  /** The person's word after opening with the code or the Mac: a passkey
   * lock for this browser, so that it opens with Touch ID next time. */
  async keepWithPasskey(): Promise<boolean> {
    const raw = this.pendingRaw;
    if (!raw || !this.me) return false;
    try {
      const vault = this.need();
      const made = await prfCreate(this.me.email ?? this.me.name, fromB64u(vault.prfSalt));
      if (!made.prf) {
        this.set({ support: this.state.support ? { ...this.state.support, prf: false } : null });
        throw new VaultError("vault_problem.no_prf_here");
      }
      const lockId = uuid();
      const kek = await prfKek(made.prf);
      const wrap = await wrapVk(kek, raw, lockId);
      wipe(kek, made.prf);
      const credentialId = b64u(made.credentialId);
      const updated = await addVaultLock({ id: lockId, kind: "passkey", credentialId,
        wrap: b64u(wrap), label: deviceLabel() });
      remember(this.me.id, credentialId);
      this.applyVault(updated);
      return true;
    } finally {
      this.skipPasskey();
    }
  }

  /** Only this time: no passkey lock here; VK stays for this session. */
  skipPasskey(): void {
    wipe(this.pendingRaw);
    this.pendingRaw = null;
    if (this.state.offerPasskey) this.set({ offerPasskey: false });
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
    this.set({ open: false, openedBy: null, signable: [], unsignable: {}, offerPasskey: false });
    if (was) this.announce();
    if (!this.pair) {
      this.release?.();
      this.release = null;
    }
  }

  // ----------------------------------------------- making it, in a browser

  /** A vault made in this browser, for a person without the Mac: VK, the
   * recovery code (what this gives back, to show once), and this browser's
   * passkey lock when it can have one. It is open here after. */
  async create(): Promise<string> {
    if (this.state.vault) throw new VaultError("vault_problem.exists");
    if (!this.me) throw new VaultError("vault_problem.no_vault");
    const raw = newVk();
    const vaultId = uuid();
    let locked = false;
    try {
      const recovery = await makeRecovery(raw, vaultId);
      const vault = await createVault({ id: vaultId, recoverySalt: b64u(recovery.salt),
        recoveryWrap: b64u(recovery.wrap) });
      this.applyVault(vault);
      if (passkeysHere(this.state.support)) {
        try {
          const made = await prfCreate(this.me.email ?? this.me.name, fromB64u(vault.prfSalt));
          if (made.prf) {
            const lockId = uuid();
            const kek = await prfKek(made.prf);
            const wrap = await wrapVk(kek, raw, lockId);
            wipe(kek, made.prf);
            const credentialId = b64u(made.credentialId);
            this.applyVault(await addVaultLock({ id: lockId, kind: "passkey", credentialId,
              wrap: b64u(wrap), label: deviceLabel() }));
            remember(this.me.id, credentialId);
            locked = true;
          } else if (this.state.support) {
            this.set({ support: { ...this.state.support, prf: false } });
          }
        } catch {
          // Cancelled, or no passkey here: the recovery code opens it, and
          // it stays open for this session.
        }
      }
      await this.openWith(raw, locked ? "passkey" : "new", false);
      return recovery.code;
    } catch (error) {
      wipe(raw);
      throw error;
    }
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

  /** Make a new recovery code: VK's raw bytes again, through this browser's
   * passkey or the code it has now; in the app, the engine's. The new code,
   * to show once. */
  async newRecoveryCode(currentCode?: string): Promise<string> {
    if (this.state.app) {
      const made = await appRecoveryCode().catch((error: unknown) => {
        throw appWords(error);
      });
      void this.reload();
      return made.recoveryCode;
    }
    const vault = this.need();
    let raw: Bytes;
    if (currentCode) {
      if (!isRecoveryCode(currentCode)) throw new VaultError("vault_problem.code_form");
      const { recoverySalt, recoveryWrap } = await vaultRecovery();
      try {
        raw = await unwrapRecovery(currentCode, fromB64u(recoverySalt), fromB64u(recoveryWrap), vault.id);
      } catch {
        throw new VaultError("vault_problem.code_wrong");
      }
    } else {
      const lock = this.hereLock(vault);
      if (!lock?.credentialId) throw new VaultError("vault_problem.need_code");
      const got = await prfGet([fromB64u(lock.credentialId)], fromB64u(vault.prfSalt));
      if (!got.prf) throw new VaultError("vault_problem.no_prf");
      const kek = await prfKek(got.prf);
      wipe(got.prf);
      try {
        raw = await unwrapVk(kek, fromB64u(lock.wrap), lock.id);
      } catch {
        throw new VaultError("vault_problem.lock_broken");
      } finally {
        wipe(kek);
      }
    }
    try {
      const made = await makeRecovery(raw, vault.id);
      await setVaultRecovery({ recoverySalt: b64u(made.salt), recoveryWrap: b64u(made.wrap) });
      void this.reload();
      return made.code;
    } finally {
      wipe(raw);
    }
  }

  // ------------------------------------------- a new browser asks the Mac

  async startPairing(): Promise<void> {
    if (this.pair) return;
    const found = this.state.support ?? await support();
    if (!found.x25519) {
      this.set({ pairing: { id: null, state: "failed", sas: null, problem: "vault_problem.no_x25519" } });
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

  /** Opens the vault on this Mac (Touch ID or its password); with the code,
   * a vault made elsewhere. */
  async appOpen(recoveryCode?: string): Promise<void> {
    await openAppVault(recoveryCode).catch((error: unknown) => {
      throw appWords(error, !!recoveryCode);
    });
    await this.refreshApp();
    void this.reload();
  }

  /** The vault made on this Mac: the recovery code, shown once. */
  async appCreate(): Promise<string> {
    const made = await createAppVault().catch((error: unknown) => {
      throw appWords(error);
    });
    await this.reload();
    await this.refreshApp();
    return made.recoveryCode;
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
