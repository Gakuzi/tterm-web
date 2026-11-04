// The vault's windows (0.1.17, as on the canvas "Макеты tTerm Web", the rows
// of 29.10 and 01.11, Vault.dc; the vault password from 0.1.26, the rows of
// 02.11, VaultPass.dc, and vault-password-texts.md):
//
//   password     Make up a vault password (a new vault: the Mac's Move to
//                cloud and the strip after ssh, a browser's Add a key from
//                a file), Set a vault password (a vault made before, with
//                its recovery code) and Change the vault password: the
//                password twice, Show/Hide, the 12-character rule, whether
//                the two match; in a browser, where VK comes from for a set
//                or a change (this browser's passkey, else the current
//                password, else the recovery code);
//   keep         Your keys are open in this browser: keep them here with
//                Touch ID, or Only this time (after the password, the Mac's
//                approval or a new vault in this browser);
//   web-approve  Open your keys on this browser: the Mac asked, with the six
//                digits both show; Type the password instead (a vault made
//                before 0.1.26 without a password: its recovery code here);
//   forgot       Forgot your vault password?: where a new one can be set;
//   app-password in the app, a vault this Mac has no lock of: opened here
//                once with its password (app-code: with the recovery code,
//                while the vault has no password); from 0.1.28 also a vault
//                open here with no key yet, whose password then proves the
//                keys open to tTerm (`prove`);
//   mac-approve  in the app, a new browser wants to open the keys: the same
//                six digits, Allow with Touch ID or It's not me.
//
// One window at a time, opened from anywhere (vaultUi); App puts the host
// on the page once. The field a closed vault is opened with in a browser
// (PasswordOpen: the server's card and Settings › Keys) is here too.

import {
  useEffect, useId, useRef, useState, useSyncExternalStore, type ReactNode, type RefObject,
} from "react";
import { CoreError, type Vault } from "./api";
import { gap, list, useT, type Translate } from "./i18n";
import { Check, Computer, Fingerprint, Globe, Key, Lock, Unlock } from "./icons";
import { agoLong } from "./time";
import { saidAt } from "./vault/answers";
import { KeyFileError, type KeyFileProblem } from "./vault/keyfile";
import { cancelled } from "./vault/passkey";
import { passwordRule } from "./vault/password";
import { VaultError, vaultStore, useVault } from "./vault/store";
import { unlockOf, type Unlock as UnlockKind } from "./vault/support";
import { isRecoveryCode } from "./vault/crypto";

// ------------------------------------------------------------- the words

/** "Open with Touch ID", "…with Windows Hello", "…with a passkey". */
const UNLOCK_WORDS: Record<"open" | "keep", Record<UnlockKind, string>> = {
  open: { touch: "vault.open_touch", hello: "vault.open_hello", passkey: "vault.open_passkey" },
  keep: { touch: "vault_open.keep_touch", hello: "vault_open.keep_hello", passkey: "vault_open.keep_passkey" },
};

export function unlockWord(t: Translate, which: "open" | "keep"): string {
  return t(UNLOCK_WORDS[which][unlockOf()]);
}

const KEYFILE_PROBLEMS: Record<KeyFileProblem, string> = {
  format: "add_key.problem_format",
  public: "add_key.problem_public",
  passphrase: "add_key.problem_passphrase",
  "wrong-passphrase": "add_key.problem_wrong_passphrase",
  "security-key": "add_key.problem_security_key",
  dsa: "add_key.problem_dsa",
  nistp521: "add_key.problem_nistp521",
  type: "add_key.problem_type",
  cipher: "add_key.problem_cipher",
  "encrypted-pem": "add_key.problem_encrypted_pem",
  ed25519: "add_key.problem_ed25519",
  several: "add_key.problem_several",
};

/** What went wrong, in words of the page: null when the person cancelled
 * the system's own prompt (nothing to say then). A refusal of the core
 * (or the engine) the store did not put in the page's words is said as it
 * came, except where `coreSentences` is false: the vault password's
 * windows and fields never show one (the security review's L5), only the
 * page's own words. */
export function problemText(t: Translate, error: unknown, coreSentences = true): string | null {
  if (cancelled(error)) return null;
  if (error instanceof VaultError) {
    const said = saidAt(error.key, error.values, error.at, t);
    const first = t(said.key, said.values);
    if (!error.then) return first;
    const then = t(error.then.key, error.then.values);
    return `${first}${gap(first, then, t.lang)}${then}`;
  }
  if (error instanceof KeyFileError) return t(KEYFILE_PROBLEMS[error.problem]);
  if (error instanceof CoreError) return coreSentences ? error.message : t("vault_problem.something");
  if (error instanceof DOMException && error.name === "InvalidStateError") {
    return t("vault_problem.passkey_exists");
  }
  if (error instanceof DOMException && error.name === "NotSupportedError") {
    return t("vault_problem.no_passkey_here");
  }
  return t("vault_problem.something");
}

/** A problem the store keeps as text: one of the page's keys, or the
 * core's own sentence. */
export function problemOf(t: Translate, problem: string | null): string | null {
  if (!problem) return null;
  return problem.startsWith("vault_problem.") ? t(problem) : problem;
}

/** The Macs whose tTerm for Mac has a lock of the vault, by name. */
export function macsOf(vault: Vault | null): string[] {
  return (vault?.locks ?? []).filter((l) => l.kind === "app")
    .map((l) => /^tTerm for Mac on (.+)$/.exec(l.label)?.[1] ?? l.label)
    .filter((name) => !!name);
}

/** "MacBook-Pro-Denis", or "your Mac" for none or several. */
export function macName(t: Translate, vault: Vault | null): string {
  const macs = macsOf(vault);
  return macs.length === 1 ? macs[0] : t("vault.your_mac");
}

/** In tTerm for Mac: whether this Mac has its own lock of the vault. The
 * app's requests go with the app's session, so the app lock tTerm lists as
 * this device's is this Mac's; another Mac's lock does not open it here. */
export function macLockHere(vault: Vault | null): boolean {
  return !!vault?.locks.some((l) => l.kind === "app" && l.thisDevice);
}

/** Whether a set or a change could not get VK through this browser's
 * passkey (not a cancel): the window asks for the current password, or
 * the code, instead. */
function passkeyFailed(error: unknown): boolean {
  if (error instanceof VaultError) {
    return /^vault_problem\.(no_passkey|no_prf|lock_broken)/.test(error.key);
  }
  return error instanceof DOMException && !cancelled(error);
}

// --------------------------------------------------- one window at a time

/** What the password window is for. */
export type PasswordUse = "new-app" | "new-web" | "set" | "change";

type Asked =
  | { kind: "open"; start: "mac" | "code" | null }
  | { kind: "password"; use: PasswordUse; keyName: string | null; done: (ok: boolean) => void }
  | { kind: "forgot" }
  | { kind: "passphrase"; keyName: string; signIn: string | null;
      done: (passphrase: string | null) => void }
  | { kind: "app-code"; lost: boolean; done: (opened: boolean) => void }
  | { kind: "app-password"; lost: boolean; prove?: boolean; done: (opened: boolean) => void };

class Windows {
  private asked: Asked | null = null;
  private listeners = new Set<() => void>();
  private wanted = 0;
  private wantListeners = new Set<() => void>();

  get = (): Asked | null => this.asked;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  show(asked: Asked | null): void {
    this.asked = asked;
    for (const listener of [...this.listeners]) listener();
  }

  /** Open your keys on this browser: the Mac asked at once, or (a vault
   * with no password yet) the code. */
  openVault(start: "mac" | "code" | null): void {
    this.show({ kind: "open", start });
  }

  /** Make up a vault password, for a new vault: in the app (`keyName` the
   * key the strip saves; none for Move to cloud, which moves this Mac's
   * keys), or in this browser (the key from a file). Whether the vault was
   * made; in a browser the Keep question comes after it. */
  newVault(where: "app" | "web", keyName: string | null): Promise<boolean> {
    return new Promise((resolve) => this.show({ kind: "password", use: where === "app" ? "new-app" : "new-web",
      keyName, done: resolve }));
  }

  /** Set a vault password (a vault made before 0.1.26) or change it:
   * whether it was. */
  password(use: "set" | "change"): Promise<boolean> {
    return new Promise((resolve) => this.show({ kind: "password", use, keyName: null, done: resolve }));
  }

  forgot(): void {
    this.show({ kind: "forgot" });
  }

  /** A key's passphrase, in the app: for the vault (the key goes there),
   * or with `signIn`, the servers Let tTerm in signs in to with the key
   * once, to add tTerm's line (the key stays on this Mac). */
  passphrase(keyName: string, signIn: string | null = null): Promise<string | null> {
    return new Promise((resolve) => this.show({ kind: "passphrase", keyName, signIn, done: resolve }));
  }

  /** In the app, a vault this Mac has no lock of (made in a browser or on
   * another Mac; `lost`: this Mac's lock no longer opens it), with no
   * password yet: its recovery code, once, and the engine opens it and
   * gives this Mac its own lock. Whether it opened; false when the person
   * stopped. */
  appCode(lost = false): Promise<boolean> {
    return new Promise((resolve) => this.show({ kind: "app-code", lost, done: resolve }));
  }

  /** The same, for a vault with a password (0.1.26): the password, once.
   * `prove` (0.1.28): the vault is open here but has no key yet, and the
   * password proves the keys open to tTerm. */
  appPassword(lost = false, prove = false): Promise<boolean> {
    return new Promise((resolve) => this.show({ kind: "app-password", lost, prove, done: resolve }));
  }

  close(): void {
    this.show(null);
  }

  /** Back to the field a closed vault is opened with (Type the password
   * instead): it takes the keys. */
  wantPassword(): void {
    this.wanted += 1;
    for (const listener of [...this.wantListeners]) listener();
  }

  wantedNow = (): number => this.wanted;

  subscribeWanted = (listener: () => void): (() => void) => {
    this.wantListeners.add(listener);
    return () => {
      this.wantListeners.delete(listener);
    };
  };
}

export const vaultUi = new Windows();

/** A vault window is up over the page (0.1.28): one asked for here, the
 * Keep question after the password, or the Mac's approval of a browser, as
 * VaultDialogHost shows them. A window under it leaves Esc and the keys to
 * it. */
export function vaultWindowUp(): boolean {
  const v = vaultStore.get();
  return vaultUi.get() !== null || !!v.request || (v.offerPasskey && !v.app);
}

/** The same, for a window that waits for it to go. */
export function useVaultWindowUp(): boolean {
  const asked = useSyncExternalStore(vaultUi.subscribe, vaultUi.get, vaultUi.get);
  const v = useVault();
  return asked !== null || !!v.request || (v.offerPasskey && !v.app);
}

/** In tTerm for Mac: the vault opened on this Mac. With this Mac's own lock,
 * Touch ID or the Mac's password; a vault this Mac has no lock of opens
 * once with its password (with its recovery code while it has none; the
 * engine then gives this Mac its lock), and so does one whose lock here the
 * engine cannot open (409: its keychain item gone, or the lock taken off in
 * a browser). False when the person stopped; anything else the engine
 * refuses (403: Touch ID did not go through) is thrown, for the caller to
 * show as it shows the engine's other answers. */
export async function openOnMac(): Promise<boolean> {
  await vaultStore.refreshApp();
  let state = vaultStore.get();
  if (state.appVault?.open) {
    // Open with nothing to prove it by to tTerm (0.1.28): a vault with its
    // password and no key yet, opened with Touch ID. The password, once:
    // tTerm takes a change of the vault, its first key say, only then.
    if (!state.proofs || state.appVault.proves !== false) return true;
    if (!state.vault) {
      await vaultStore.reload();
      state = vaultStore.get();
    }
    return state.vault?.password ? vaultUi.appPassword(false, true) : true;
  }
  if (!state.vault) {
    await vaultStore.reload();
    state = vaultStore.get();
  }
  const once = (lost: boolean) => (state.vault?.password ? vaultUi.appPassword(lost) : vaultUi.appCode(lost));
  if (!macLockHere(state.vault)) return once(false);
  try {
    await vaultStore.appOpen();
    return true;
  } catch (error) {
    if (error instanceof CoreError && error.status === 409 && state.vault) return once(true);
    throw error;
  }
}

/** Esc closes, and the window takes the keys when it opens. */
function useWindow(onClose: () => void) {
  const box = useRef<HTMLElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const first = box.current?.querySelector<HTMLElement>("[data-autofocus]");
    (first ?? box.current)?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented) {
        event.preventDefault();
        close.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return box;
}

/** The field takes the keys when the person comes back to it from a window
 * (Type the password instead, Got it). */
function usePasswordWanted(field: RefObject<HTMLInputElement | null>): void {
  const wanted = useSyncExternalStore(vaultUi.subscribeWanted, vaultUi.wantedNow, vaultUi.wantedNow);
  const seen = useRef(wanted);
  useEffect(() => {
    if (wanted === seen.current) return;
    seen.current = wanted;
    field.current?.focus();
  }, [wanted, field]);
}

/** The host: whichever window is asked for, the Mac's request, and the Keep
 * question once nothing else is up. */
export function VaultDialogHost() {
  const asked = useSyncExternalStore(vaultUi.subscribe, vaultUi.get, vaultUi.get);
  const v = useVault();
  if (v.request) return <MacApprove />;
  if (!asked) return v.offerPasskey && !v.app ? <KeepHere /> : null;
  switch (asked.kind) {
    case "open":
      return <OpenVault key="open" start={asked.start} />;
    case "password":
      return <PasswordWindow key={`password-${asked.use}`} asked={asked} />;
    case "forgot":
      return <Forgot key="forgot" />;
    case "passphrase":
      return <Passphrase key="pass" keyName={asked.keyName} signIn={asked.signIn} onDone={(p) => {
        vaultUi.close();
        asked.done(p);
      }} />;
    case "app-code":
      return <AppCode key="app-code" lost={asked.lost} onDone={(opened) => {
        vaultUi.close();
        asked.done(opened);
      }} />;
    case "app-password":
      return <AppPassword key="app-password" lost={asked.lost} prove={asked.prove} onDone={(opened) => {
        vaultUi.close();
        asked.done(opened);
      }} />;
  }
}

function Tile(props: { children: ReactNode; green?: boolean }) {
  return <span className={props.green ? "vault-tile green" : "vault-tile"} aria-hidden="true">{props.children}</span>;
}

const code = (inner: ReactNode) => <code className="vault-code-inline">{inner}</code>;

/** Show or Hide, next to a password field. */
function ShowHide(props: { shown: boolean; onToggle: () => void; disabled?: boolean }) {
  const t = useT();
  return (
    <button type="button" className="button-plain vault-show" disabled={props.disabled}
      onClick={props.onToggle}>
      {props.shown ? t("vault_password.hide") : t("vault_password.show")}
    </button>
  );
}

// ------------------------------------- Make up, set or change the password

function PasswordWindow(props: { asked: Extract<Asked, { kind: "password" }> }) {
  const { asked } = props;
  const t = useT();
  const v = useVault();
  const ids = useId();
  const [first, setFirst] = useState("");
  const [again, setAgain] = useState("");
  const [current, setCurrent] = useState("");
  const [shown, setShown] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [noPasskey, setNoPasskey] = useState(false);
  const isNew = asked.use === "new-app" || asked.use === "new-web";
  const cancel = () => {
    if (busy) return;
    vaultUi.close();
    asked.done(false);
  };
  const box = useWindow(cancel);
  const rule = passwordRule(first, again);
  // In a browser, where VK's raw bytes come from for a set or a change: the
  // engine has them in the app, and a new vault makes them.
  const from: "passkey" | "password" | "code" | null = isNew || v.app ? null
    : v.hereLock && !noPasskey ? "passkey" : v.vault?.password ? "password" : "code";
  const fromReady = from === "password" ? current.length > 0 : from === "code" ? isRecoveryCode(current) : true;
  const ready = rule.ok && fromReady && !busy;

  const go = async () => {
    if (!ready) return;
    setBusy(true);
    setProblem(null);
    try {
      if (asked.use === "new-app") await vaultStore.appCreate(first);
      else if (asked.use === "new-web") await vaultStore.create(first);
      else {
        await vaultStore.setPassword(first, from === "passkey" ? { passkey: true }
          : from === "password" ? { password: current } : from === "code" ? { code: current } : null);
      }
      vaultUi.close();
      asked.done(true);
    } catch (error) {
      setBusy(false);
      if (from === "passkey" && passkeyFailed(error)) setNoPasskey(true);
      setProblem(problemText(t, error, false));
    }
  };

  const title = isNew ? t("vault_password.title_new")
    : asked.use === "set" ? t("vault_password.title_set") : t("vault_password.title_change");
  const text = asked.use === "new-app"
    ? (asked.keyName ? t.rich("vault_password.text_key", { key: asked.keyName, code }) : t("vault_password.text_mac"))
    : asked.use === "new-web" ? t.rich("vault_password.text_web", { key: asked.keyName ?? "", code })
    : asked.use === "set" ? t("vault_password.text_set") : t("vault_password.text_change");
  const note = asked.use === "new-app" ? t("vault_password.note_mac")
    : asked.use === "new-web" ? t("vault_password.note_web") : null;
  const goWord = isNew ? t("vault_password.create")
    : asked.use === "set" ? t("vault_password.set") : t("vault_password.change");
  const type = shown ? "text" : "password";

  return (
    <div className="scrim">
      <section ref={box} className="dialog vault-dialog wide" role="dialog" aria-modal="true"
        aria-labelledby={`${ids}-title`} tabIndex={-1}>
        {isNew && <Tile><Lock size={24} /></Tile>}
        <h2 id={`${ids}-title`} className="vault-dialog-title">{title}</h2>
        <p className="vault-dialog-text">{text}</p>
        <form className="vault-pass-form" onSubmit={(e) => {
          e.preventDefault();
          void go();
        }}>
          {from === "password" && (
            <div className="vault-field">
              <label htmlFor={`${ids}-current`} className="vault-label">{t("vault_password.current")}</label>
              <input id={`${ids}-current`} type={type} className="vault-input big" data-autofocus
                autoComplete="current-password" spellCheck={false} autoCapitalize="off" value={current}
                disabled={busy} aria-describedby={`${ids}-current-note`}
                onChange={(e) => setCurrent(e.target.value)} />
              <span id={`${ids}-current-note`} className="vault-field-note">{t("vault_password.current_hint")}</span>
            </div>
          )}
          {from === "code" && (
            <div className="vault-field">
              <label htmlFor={`${ids}-code`} className="vault-label">{t("recovery.now_code")}</label>
              <input id={`${ids}-code`} type="text" className="vault-input big mono" data-autofocus
                placeholder="XXXX-XXXX-XXXX-XXXX-XXXX-XXXX" autoComplete="off" spellCheck={false}
                autoCapitalize="characters" value={current} disabled={busy}
                aria-describedby={`${ids}-code-note`} onChange={(e) => setCurrent(e.target.value)} />
              <span id={`${ids}-code-note`} className="vault-field-note">{t("vault_password.code_hint")}</span>
            </div>
          )}
          <div className="vault-field">
            <label htmlFor={`${ids}-first`} className="vault-label">
              {asked.use === "change" ? t("vault_password.label_new") : t("vault_password.label")}
            </label>
            <div className="vault-code-row">
              <input id={`${ids}-first`} type={type} className="vault-input big"
                data-autofocus={from === "password" || from === "code" ? undefined : true}
                autoComplete="new-password" spellCheck={false} autoCapitalize="off" value={first}
                disabled={busy} aria-describedby={`${ids}-under`}
                onChange={(e) => setFirst(e.target.value)} />
              <ShowHide shown={shown} disabled={busy} onToggle={() => setShown((was) => !was)} />
            </div>
            <span id={`${ids}-under`} className="vault-field-note">
              {rule.under.kind === "short" ? t("vault_password.short", { n: rule.under.n }) : t("vault_password.hint")}
              {rule.latin && <span className="vault-field-latin">{t("vault_password.latin")}</span>}
            </span>
          </div>
          <div className="vault-field">
            <label htmlFor={`${ids}-again`} className="vault-label">{t("vault_password.label_again")}</label>
            <input id={`${ids}-again`} type={type} className="vault-input big" autoComplete="new-password"
              spellCheck={false} autoCapitalize="off" value={again} disabled={busy}
              aria-describedby={rule.match === null ? undefined : `${ids}-match`}
              onChange={(e) => setAgain(e.target.value)} />
            {rule.match !== null && (
              <span id={`${ids}-match`} className={rule.match ? "vault-field-note green" : "vault-field-note amber"}>
                {rule.match && <Check size={13} />}
                {rule.match ? t("vault_password.match") : t("vault_password.no_match")}
              </span>
            )}
          </div>
          {note && <p className="vault-pass-note">{note}</p>}
          {problem && <div className="error-box" role="alert">{problem}</div>}
          <div className="vault-buttons">
            <button type="button" className="button-plain" disabled={busy} onClick={cancel}>
              {t("common.cancel")}
            </button>
            <button type="submit" className="button-accent big" disabled={!ready}>
              {busy && <span className="spinner" aria-hidden="true" />}
              {busy ? t("vault_password.working") : goWord}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

// ------------------- the field a closed vault opens with, in a browser (3a)

/** The vault password, typed where a closed vault shows (a server's card,
 * Settings › Keys; in the app, a Mac with no lock of the vault yet): Open
 * the keys, and what goes under it (`links`). In a browser the keys open
 * here for this session, and the Keep question follows; in the app the
 * engine opens the vault and gives this Mac its lock. */
export function PasswordOpen(props: { links?: ReactNode; autoFocus?: boolean; action?: string }) {
  const t = useT();
  const v = useVault();
  const id = useId();
  const [value, setValue] = useState("");
  const [shown, setShown] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const field = useRef<HTMLInputElement>(null);
  usePasswordWanted(field);
  useEffect(() => {
    if (props.autoFocus) field.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const go = async () => {
    if (busy || !value) return;
    setBusy(true);
    setProblem(null);
    try {
      if (v.app) await vaultStore.appOpen({ password: value });
      else await vaultStore.openWithPassword(value);
      setValue("");
    } catch (error) {
      setProblem(problemText(t, error, false));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="vault-pass-open" onSubmit={(e) => {
      e.preventDefault();
      void go();
    }}>
      <div className="vault-field">
        <label htmlFor={id} className="vault-label">{t("vault_password.label_vault")}</label>
        <div className="vault-code-row">
          <input ref={field} id={id} type={shown ? "text" : "password"} className="vault-input big strong"
            autoComplete="current-password" spellCheck={false} autoCapitalize="off" value={value}
            disabled={busy} onChange={(e) => setValue(e.target.value)} />
          <ShowHide shown={shown} disabled={busy} onToggle={() => setShown((was) => !was)} />
        </div>
      </div>
      <button type="submit" className="button-accent big vault-pass-go" disabled={busy || !value}>
        {busy ? <span className="spinner" aria-hidden="true" /> : <Unlock size={18} />}
        {busy ? t("vault_password.opening") : props.action ?? t("vault_password.open")}
      </button>
      {problem && <div className="error-box" role="alert">{problem}</div>}
      {props.links}
    </form>
  );
}

/** "or approve on MacBook-Pro-Denis · Forgot the password?": small links
 * under the button, put together as the language writes them. */
export function OrLinks(props: { links: { key: string; text: string; go: () => void }[] }) {
  const t = useT();
  if (!props.links.length) return null;
  const or = t("vault_locked.or");
  return (
    <p className="vault-locked-links">
      {or}{gap(or, props.links[0].text, t.lang)}
      {props.links.map((l, i) => (
        <span key={l.key}>
          {i > 0 && " · "}
          <button type="button" className="link-button" onClick={l.go}>{l.text}</button>
        </span>
      ))}
    </p>
  );
}

// ------------------------------- Keep the keys in this browser? (section 4)

const KEEP_TEXT: Record<UnlockKind, string> = {
  touch: "vault_open.keep_text.touch",
  hello: "vault_open.keep_text.hello",
  passkey: "vault_open.keep_text.passkey",
};

function KeepHere() {
  const t = useT();
  const v = useVault();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const onlyNow = () => {
    if (!busy) vaultStore.skipPasskey();
  };
  const box = useWindow(onlyNow);
  const keep = async () => {
    setBusy(true);
    setProblem(null);
    try {
      await vaultStore.keepWithPasskey();
    } catch (error) {
      // Cancelled: the question stays as it was, to try again.
      const said = problemText(t, error, false);
      if (said) {
        const more = error instanceof VaultError && error.key === "vault_problem.no_prf_here"
          ? "" : t("vault_open.kept_session");
        setProblem(more ? `${said}${gap(said, more, t.lang)}${more}` : said);
      }
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="scrim">
      <section ref={box} className="dialog vault-dialog" role="dialog" aria-modal="true"
        aria-labelledby="wk-title" aria-describedby="wk-text" tabIndex={-1}>
        <Tile green><Unlock size={24} /></Tile>
        <h2 id="wk-title" className="vault-dialog-title">{t("vault_open.opened_title")}</h2>
        <p id="wk-text" className="vault-dialog-text ink">{t(KEEP_TEXT[unlockOf()])}</p>
        <p className="vault-dialog-text small">{t("vault_open.keep_foreign")}</p>
        {problem && <div className="error-box" role="alert">{problem}</div>}
        <div className="vault-buttons">
          <button type="button" className={v.canKeep ? "button-plain" : "button-accent big"} disabled={busy}
            data-autofocus={v.canKeep ? undefined : true} onClick={onlyNow}>
            {t("vault_open.only_now")}
          </button>
          {v.canKeep && (
            <button type="button" className="button-accent big" data-autofocus disabled={busy}
              onClick={() => void keep()}>
              {busy ? <span className="spinner" aria-hidden="true" /> : <Fingerprint size={17} />}
              {unlockWord(t, "keep")}
            </button>
          )}
        </div>
      </section>
    </div>
  );
}

// ------------------------------ Open your keys on this browser: the Mac

function OpenVault(props: { start: "mac" | "code" | null }) {
  const t = useT();
  const v = useVault();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const field = useRef<HTMLInputElement>(null);
  const close = () => {
    vaultStore.endPairing();
    vaultUi.close();
  };
  const box = useWindow(close);
  const macs = macsOf(v.vault);
  const mac = macName(t, v.vault);
  const pairing = v.pairing;
  const canPair = macs.length > 0;
  // A vault with a password opens with it, or with the Mac's approval; one
  // made before 0.1.26 with no password yet, also with its recovery code.
  const withPassword = !!v.vault?.password;

  // Asked from "approve on the Mac": the request goes at once.
  useEffect(() => {
    if (props.start === "mac" && canPair) void vaultStore.startPairing();
    if (props.start === "code") window.setTimeout(() => field.current?.focus(), 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Open: the window has done its part (the Keep question comes next).
  useEffect(() => {
    if (v.open) close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v.open]);

  const openWithCode = async () => {
    setBusy(true);
    setProblem(null);
    try {
      await vaultStore.openWithRecovery(code);
      vaultStore.endPairing();
    } catch (error) {
      setProblem(problemText(t, error));
    } finally {
      setBusy(false);
    }
  };

  const waiting = pairing && (pairing.state === "starting" || pairing.state === "waiting" ||
    pairing.state === "answered" || pairing.state === "revealed");
  const macLine = !pairing ? t("vault_open.mac_ask")
    : pairing.state === "starting" || pairing.state === "waiting" || pairing.state === "answered"
      ? t("vault_open.mac_waiting")
    : pairing.state === "revealed" ? t("vault_open.mac_compare")
    : pairing.state === "approved" ? t("vault_open.mac_approved")
    : pairing.state === "denied" ? t("vault_open.mac_denied")
    : pairing.state === "expired" ? t("vault_open.mac_expired")
    : problemOf(t, pairing.problem) ?? t("vault_problem.pairing");
  const noX25519 = v.support?.x25519 === false;

  return (
    <div className="scrim">
      <section ref={box} className="dialog vault-dialog wide" role="dialog" aria-modal="true"
        aria-labelledby="wa-title" tabIndex={-1}>
        <h2 id="wa-title" className="vault-dialog-title">{t("vault_open.title")}</h2>
        <p className="vault-dialog-text">
          {withPassword ? t("vault_open.text_password") : canPair ? t("vault_open.text") : t("vault_open.text_code")}
        </p>
        {canPair && (
          <button type="button" className={waiting ? "vault-mac asked" : "vault-mac"}
            disabled={!!waiting || noX25519}
            onClick={() => {
              vaultStore.endPairing();
              void vaultStore.startPairing();
            }}>
            <Computer size={20} />
            <span className="vault-mac-text">
              <strong>{t("vault_open.mac_name", { mac, app: t("app_link.mac") })}</strong>
              <span>
                {noX25519 ? (withPassword ? t("vault_problem.no_x25519") : t("vault_problem.no_x25519_code"))
                  : macLine}
              </span>
            </span>
            {waiting && <span className="spinner" aria-hidden="true" />}
          </button>
        )}
        {pairing?.sas && (
          <div className="vault-sas">
            <span>{t("vault_open.sas_text")}</span>
            <code aria-label={t("vault.code_label", { code: pairing.sas })}>{pairing.sas}</code>
          </div>
        )}
        {!withPassword && (
          <>
            {canPair && (
              <div className="vault-or" aria-hidden="true"><span />{t("vault_open.or")}<span /></div>
            )}
            <label htmlFor="wa-code" className="vault-label">{t("vault_open.code")}</label>
            <form className="vault-code-row" onSubmit={(e) => {
              e.preventDefault();
              void openWithCode();
            }}>
              <input id="wa-code" ref={field} type="text" className="vault-input mono"
                placeholder="XXXX-XXXX-XXXX-XXXX-XXXX-XXXX" autoComplete="off" spellCheck={false}
                autoCapitalize="characters" value={code} data-autofocus={props.start !== "mac" ? true : undefined}
                onChange={(e) => setCode(e.target.value)} />
              <button type="submit" className="button-plain" disabled={busy || !isRecoveryCode(code)}>
                {busy ? <span className="spinner" aria-hidden="true" /> : null}
                {t("vault_open.open")}
              </button>
            </form>
          </>
        )}
        {problem && <div className="error-box" role="alert">{problem}</div>}
        <div className="vault-buttons">
          {withPassword ? (
            <button type="button" className="button-ghost" onClick={() => {
              close();
              vaultUi.wantPassword();
            }}>
              {t("vault_open.use_password")}
            </button>
          ) : (
            <button type="button" className="button-ghost" onClick={close}>
              {t("vault.not_now")}
            </button>
          )}
        </div>
      </section>
    </div>
  );
}

// ----------------------------------------- Forgot the password? (section 6)

function Forgot() {
  const t = useT();
  const back = () => {
    vaultUi.close();
    vaultUi.wantPassword();
  };
  const box = useWindow(back);
  return (
    <div className="scrim">
      <section ref={box} className="dialog vault-dialog wide" role="dialog" aria-modal="true"
        aria-labelledby="vf-title" tabIndex={-1}>
        <h2 id="vf-title" className="vault-dialog-title">{t("vault_forgot.title")}</h2>
        <p className="vault-dialog-text">{t("vault_forgot.text")}</p>
        <ul className="vault-points ink">
          <li>{t("vault_forgot.mac")}</li>
          <li>{t("vault_forgot.browser")}</li>
        </ul>
        <p className="vault-dialog-text small">{t.rich("vault_forgot.none", { code })}</p>
        <div className="vault-buttons">
          <button type="button" className="button-accent big" data-autofocus onClick={back}>
            {t("vault_forgot.ok")}
          </button>
        </div>
      </section>
    </div>
  );
}

// -------------------------------------------- a passphrase, for one key

function Passphrase(props: { keyName: string; signIn: string | null;
  onDone: (passphrase: string | null) => void }) {
  const t = useT();
  const [value, setValue] = useState("");
  const box = useWindow(() => props.onDone(null));
  return (
    <div className="scrim">
      <section ref={box} className="dialog vault-dialog" role="dialog" aria-modal="true"
        aria-labelledby="pp-title" tabIndex={-1}>
        <Tile><Key size={24} /></Tile>
        <h2 id="pp-title" className="vault-dialog-title">
          {t("passphrase.title", { key: props.keyName })}
        </h2>
        <p className="vault-dialog-text">
          {props.signIn ? t("passphrase.text_sign_in", { server: props.signIn }) : t("passphrase.text")}
        </p>
        <form className="vault-code-row" onSubmit={(e) => {
          e.preventDefault();
          if (value) props.onDone(value);
        }}>
          <input type="password" className="vault-input" data-autofocus value={value}
            aria-label={t("passphrase.label")} autoComplete="off"
            onChange={(e) => setValue(e.target.value)} />
          <button type="submit" className="button-accent big" disabled={!value}>
            {t("passphrase.go")}
          </button>
        </form>
        <div className="vault-buttons">
          <button type="button" className="button-ghost" onClick={() => props.onDone(null)}>
            {t("common.cancel")}
          </button>
        </div>
      </section>
    </div>
  );
}

// ------------- in the app: a vault this Mac has no lock of, opened once

function AppCode(props: { lost: boolean; onDone: (opened: boolean) => void }) {
  const t = useT();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const box = useWindow(() => {
    if (!busy) props.onDone(false);
  });
  // The engine opens the vault with the code (422: not a code, or not this
  // vault's), then asks Touch ID for this Mac's own lock (403 when it does
  // not go through): what it says shows here, and the person tries again.
  const go = async () => {
    if (busy || !isRecoveryCode(code)) return;
    setBusy(true);
    setProblem(null);
    try {
      await vaultStore.appOpen({ recoveryCode: code });
      props.onDone(true);
    } catch (error) {
      setBusy(false);
      setProblem(problemText(t, error, false));
    }
  };
  return (
    <div className="scrim">
      <section ref={box} className="dialog vault-dialog" role="dialog" aria-modal="true"
        aria-labelledby="ac-title" tabIndex={-1}>
        <Tile><Lock size={24} /></Tile>
        <h2 id="ac-title" className="vault-dialog-title">{t("app_code.title")}</h2>
        <p className="vault-dialog-text">{props.lost ? t("app_code.text_lost") : t("app_code.text")}</p>
        <form className="vault-code-row" onSubmit={(e) => {
          e.preventDefault();
          void go();
        }}>
          <input type="text" className="vault-input mono" data-autofocus value={code}
            aria-label={t("vault_open.code")} placeholder="XXXX-XXXX-XXXX-XXXX-XXXX-XXXX"
            autoComplete="off" spellCheck={false} disabled={busy} onChange={(e) => setCode(e.target.value)} />
          <button type="submit" className="button-accent big" disabled={busy || !isRecoveryCode(code)}>
            {busy && <span className="spinner" aria-hidden="true" />}
            {t("vault_open.open")}
          </button>
        </form>
        {problem && <div className="error-box" role="alert">{problem}</div>}
        <div className="vault-buttons">
          <button type="button" className="button-ghost" disabled={busy} onClick={() => props.onDone(false)}>
            {t("common.cancel")}
          </button>
        </div>
      </section>
    </div>
  );
}

/** The same with the vault password (0.1.26): the engine derives it, asks
 * tTerm for the wrap, and gives this Mac its own lock; no Touch ID, the
 * person has just typed the password. A wrong one, or too many, is said in
 * the page's words, and the window stays to try again. */
function AppPassword(props: { lost: boolean; prove?: boolean; onDone: (opened: boolean) => void }) {
  const t = useT();
  const id = useId();
  const [value, setValue] = useState("");
  const [shown, setShown] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const box = useWindow(() => {
    if (!busy) props.onDone(false);
  });
  const go = async () => {
    if (busy || !value) return;
    setBusy(true);
    setProblem(null);
    try {
      await vaultStore.appOpen({ password: value });
      props.onDone(true);
    } catch (error) {
      setBusy(false);
      setProblem(problemText(t, error, false));
    }
  };
  return (
    <div className="scrim">
      <section ref={box} className="dialog vault-dialog" role="dialog" aria-modal="true"
        aria-labelledby="ap-title" tabIndex={-1}>
        <Tile><Lock size={24} /></Tile>
        <h2 id="ap-title" className="vault-dialog-title">
          {props.prove ? t("vault_password.open") : t("app_code.title")}
        </h2>
        <p className="vault-dialog-text">
          {props.prove ? t("app_code.text_prove")
            : props.lost ? t("app_code.text_lost_password") : t("app_code.text_password")}
        </p>
        <form className="vault-pass-form" onSubmit={(e) => {
          e.preventDefault();
          void go();
        }}>
          <div className="vault-field">
            <label htmlFor={id} className="vault-label">{t("vault_password.label_vault")}</label>
            <div className="vault-code-row">
              <input id={id} type={shown ? "text" : "password"} className="vault-input big" data-autofocus
                autoComplete="current-password" spellCheck={false} autoCapitalize="off" value={value}
                disabled={busy} onChange={(e) => setValue(e.target.value)} />
              <ShowHide shown={shown} disabled={busy} onToggle={() => setShown((was) => !was)} />
            </div>
          </div>
          {problem && <div className="error-box" role="alert">{problem}</div>}
          <div className="vault-buttons">
            <button type="button" className="button-plain" disabled={busy} onClick={() => props.onDone(false)}>
              {t("common.cancel")}
            </button>
            <button type="submit" className="button-accent big" disabled={busy || !value}>
              {busy ? <span className="spinner" aria-hidden="true" /> : <Unlock size={17} />}
              {busy ? t("vault_password.opening") : t("vault_password.open")}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

// ------------------------------- the Mac's side of a new browser's request

function MacApprove() {
  const t = useT();
  const v = useVault();
  const request = v.request!;
  const box = useWindow(() => vaultStore.dismissRequest());
  const when = request.createdAt ? agoLong(request.createdAt, t) : "";
  const said = request.method === "code"
    ? (when ? t("mac_approve.text_code", { ago: when, ip: request.ip })
      : t("mac_approve.text_code_now", { ip: request.ip }))
    : t("mac_approve.text_other", { ip: request.ip });
  return (
    <div className="scrim">
      <section ref={box} className="dialog vault-dialog" role="alertdialog" aria-modal="true"
        aria-labelledby="ma-title" aria-describedby="ma-text" tabIndex={-1}>
        <Tile><Globe size={24} /></Tile>
        <h2 id="ma-title" className="vault-dialog-title">
          {t("mac_approve.title", { device: request.device || t("mac_approve.a_browser") })}
        </h2>
        <p id="ma-text" className="vault-dialog-text">{said}</p>
        <div className="vault-sas">
          <span>{t("mac_approve.sas_text")}</span>
          {request.sas ? (
            <code aria-label={t("vault.code_label", { code: request.sas })}>{request.sas}</code>
          ) : <span className="spinner" aria-label={t("mac_approve.sas_waiting")} />}
        </div>
        {request.problem && <div className="error-box" role="alert">{problemOf(t, request.problem)}</div>}
        <div className="vault-buttons">
          <button type="button" className="button-plain red-line" disabled={request.busy}
            onClick={() => void vaultStore.denyRequest()}>
            {t("mac_approve.not_me")}
          </button>
          <button type="button" className="button-accent big" data-autofocus
            disabled={request.busy || !request.sas}
            onClick={() => void vaultStore.allowRequest()}>
            {request.busy ? <span className="spinner" aria-hidden="true" /> : <Fingerprint size={17} />}
            {t("mac_approve.allow")}
          </button>
        </div>
        <p className="vault-small">{t("mac_approve.not_me_note")}</p>
      </section>
    </div>
  );
}

/** "web-01 in Client X, droplet and staging": the servers of a key, those
 * outside the personal project with it. */
export function serversText(t: Translate, servers: { name: string; project: string }[],
  personal: string | null): string {
  return list(servers.map((s) => (s.project && s.project !== personal
    ? t("keys.server_in", { server: s.name, project: s.project }) : s.name)), t.lang);
}
