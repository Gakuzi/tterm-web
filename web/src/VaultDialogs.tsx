// The vault's windows (0.1.17), as on the canvas "Макеты tTerm Web" (the
// rows of 29.10 and the clickable row of 01.11, Vault.dc):
//
//   vault-new    Save your key to your vault: what the vault is, and Make
//                my vault with Touch ID (in the app, and in a browser for a
//                person without the Mac);
//   recovery     Your recovery code, shown once, with Copy and Save as a
//                file;
//   web-approve  Open your keys on this browser: the Mac asked, with the six
//                digits both show, or the recovery code; then, where it can,
//                whether this browser keeps a passkey lock;
//   mac-approve  in the app, a new browser wants to open the keys: the same
//                six digits, Allow with Touch ID or It's not me.
//
// One window at a time, opened from anywhere (vaultUi); App puts the host
// on the page once.

import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { CoreError, type Vault } from "./api";
import { PRESSED_MS, toClipboard, useBriefly } from "./briefly";
import { list, useT, type Translate } from "./i18n";
import { Check, Computer, Copy, Download, Fingerprint, Globe, Key, Lock } from "./icons";
import { agoLong } from "./time";
import { KeyFileError, type KeyFileProblem } from "./vault/keyfile";
import { cancelled } from "./vault/passkey";
import { VaultError, vaultStore, useVault } from "./vault/store";
import { passkeysHere, unlockOf, type Unlock } from "./vault/support";
import { isRecoveryCode } from "./vault/crypto";

// ------------------------------------------------------------- the words

/** "Open with Touch ID", "…with Windows Hello", "…with a passkey". */
const UNLOCK_WORDS: Record<"open" | "make" | "keep", Record<Unlock, string>> = {
  open: { touch: "vault.open_touch", hello: "vault.open_hello", passkey: "vault.open_passkey" },
  make: { touch: "vault_new.make_touch", hello: "vault_new.make_hello", passkey: "vault_new.make_passkey" },
  keep: { touch: "vault_open.keep_touch", hello: "vault_open.keep_hello", passkey: "vault_open.keep_passkey" },
};

export function unlockWord(t: Translate, which: "open" | "make" | "keep"): string {
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
 * the system's own prompt (nothing to say then). */
export function problemText(t: Translate, error: unknown): string | null {
  if (cancelled(error)) return null;
  if (error instanceof VaultError) return t(error.key);
  if (error instanceof KeyFileError) return t(KEYFILE_PROBLEMS[error.problem]);
  if (error instanceof CoreError) return error.message;
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

// --------------------------------------------------- one window at a time

type Asked =
  | { kind: "open"; start: "mac" | "code" | null }
  | { kind: "new"; where: "app" | "web"; keyName: string; server: string | null;
      done: (made: boolean) => void }
  | { kind: "recovery"; code: string; fresh: boolean; done: () => void }
  | { kind: "passphrase"; keyName: string; signIn: string | null;
      done: (passphrase: string | null) => void }
  | { kind: "app-code"; lost: boolean; done: (opened: boolean) => void }
  | { kind: "new-recovery" };

class Windows {
  private asked: Asked | null = null;
  private listeners = new Set<() => void>();

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

  /** Open your keys on this browser: the Mac asked at once, or the code. */
  openVault(start: "mac" | "code" | null): void {
    this.show({ kind: "open", start });
  }

  /** Save your key to your vault, then its recovery code once: whether the
   * vault was made. */
  newVault(where: "app" | "web", keyName: string, server: string | null): Promise<boolean> {
    return new Promise((resolve) => this.show({ kind: "new", where, keyName, server, done: resolve }));
  }

  recovery(code: string, fresh: boolean): Promise<void> {
    return new Promise((resolve) => this.show({ kind: "recovery", code, fresh, done: resolve }));
  }

  /** A key's passphrase, in the app: for the vault (the key goes there),
   * or with `signIn`, the servers Let tTerm in signs in to with the key
   * once, to add tTerm's line (the key stays on this Mac). */
  passphrase(keyName: string, signIn: string | null = null): Promise<string | null> {
    return new Promise((resolve) => this.show({ kind: "passphrase", keyName, signIn, done: resolve }));
  }

  /** In the app, a vault this Mac has no lock of (made in a browser or on
   * another Mac; `lost`: this Mac's lock no longer opens it): its recovery
   * code, once, and the engine opens it and gives this Mac its own lock.
   * Whether it opened; false when the person stopped. */
  appCode(lost = false): Promise<boolean> {
    return new Promise((resolve) => this.show({ kind: "app-code", lost, done: resolve }));
  }

  newRecovery(): void {
    this.show({ kind: "new-recovery" });
  }

  close(): void {
    this.show(null);
  }
}

export const vaultUi = new Windows();

/** In tTerm for Mac: the vault opened on this Mac. With this Mac's own lock,
 * Touch ID or the Mac's password; a vault this Mac has no lock of opens
 * once with its recovery code (the engine then gives this Mac its lock),
 * and so does one whose lock here the engine cannot open (409: its keychain
 * item gone, or the lock taken off in a browser). False when the person
 * stopped; anything else the engine refuses (403: Touch ID did not go
 * through) is thrown, for the caller to show as it shows the engine's
 * other answers. */
export async function openOnMac(): Promise<boolean> {
  await vaultStore.refreshApp();
  let state = vaultStore.get();
  if (state.appVault?.open) return true;
  if (!state.vault) {
    await vaultStore.reload();
    state = vaultStore.get();
  }
  if (!macLockHere(state.vault)) return vaultUi.appCode(false);
  try {
    await vaultStore.appOpen();
    return true;
  } catch (error) {
    if (error instanceof CoreError && error.status === 409 && state.vault) return vaultUi.appCode(true);
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

/** The host: whichever window is asked for, and the Mac's request. */
export function VaultDialogHost() {
  const asked = useSyncExternalStore(vaultUi.subscribe, vaultUi.get, vaultUi.get);
  const v = useVault();
  if (v.request) return <MacApprove />;
  if (!asked) return null;
  switch (asked.kind) {
    case "open":
      return <OpenVault key="open" start={asked.start} />;
    case "new":
      return <VaultNew key="new" asked={asked} />;
    case "recovery":
      return <RecoveryCode key={asked.code} code={asked.code} fresh={asked.fresh}
        onDone={() => {
          vaultUi.close();
          asked.done();
        }} />;
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
    case "new-recovery":
      return <NewRecovery key="new-recovery" />;
  }
}

function Tile(props: { children: ReactNode }) {
  return <span className="vault-tile" aria-hidden="true">{props.children}</span>;
}

// ------------------------------------------------- Save your key to your vault

function VaultNew(props: { asked: Extract<Asked, { kind: "new" }> }) {
  const { asked } = props;
  const t = useT();
  const v = useVault();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const cancel = () => {
    if (busy) return;
    vaultUi.close();
    asked.done(false);
  };
  const box = useWindow(cancel);
  const app = asked.where === "app";
  const passkey = passkeysHere(v.support);
  const code = (inner: ReactNode) => <code className="vault-code-inline">{inner}</code>;

  const make = async () => {
    setBusy(true);
    setProblem(null);
    try {
      const recovery = app ? await vaultStore.appCreate() : await vaultStore.create();
      // The code once; then what was asked goes on.
      await vaultUi.recovery(recovery, false);
      asked.done(true);
    } catch (error) {
      setBusy(false);
      setProblem(problemText(t, error));
    }
  };

  return (
    <div className="scrim">
      <section ref={box} className="dialog vault-dialog" role="dialog" aria-modal="true"
        aria-labelledby="vn-title" tabIndex={-1}>
        <Tile><Lock size={24} /></Tile>
        <h2 id="vn-title" className="vault-dialog-title">{t("vault_new.title")}</h2>
        <p className="vault-dialog-text">
          {asked.server
            ? t.rich("vault_new.text_server", { key: asked.keyName, server: asked.server, code })
            : t.rich("vault_new.text", { key: asked.keyName, code })}
        </p>
        <ul className="vault-points">
          {app ? (
            <>
              <li>{t("vault_new.point_mac_unlock")}</li>
              <li>{t("vault_new.point_mac_locked")}</li>
              <li>{t("vault_new.point_mac_browser")}</li>
            </>
          ) : (
            <>
              <li>{passkey ? t("vault_new.point_web_unlock") : t("vault_new.point_web_no_passkey")}</li>
              <li>{t("vault_new.point_web_locked")}</li>
              <li>{t("vault_new.point_web_browser")}</li>
            </>
          )}
        </ul>
        {problem && <div className="error-box" role="alert">{problem}</div>}
        <div className="vault-buttons">
          <button type="button" className="button-plain" disabled={busy} onClick={cancel}>
            {t("common.cancel")}
          </button>
          <button type="button" className="button-accent big" data-autofocus disabled={busy}
            onClick={() => void make()}>
            {busy ? <span className="spinner" aria-hidden="true" /> : (app || passkey) && <Fingerprint size={17} />}
            {app ? t("vault_new.make_touch") : passkey ? unlockWord(t, "make") : t("vault_new.make")}
          </button>
        </div>
      </section>
    </div>
  );
}

// ------------------------------------------------------ the recovery code

function RecoveryCode(props: { code: string; fresh: boolean; onDone: () => void }) {
  const t = useT();
  const v = useVault();
  const [kept, setKept] = useState(false);
  const [copied, showCopied] = useBriefly<true>();
  const [saved, showSaved] = useBriefly<true>();
  const [problem, setProblem] = useState<string | null>(null);
  // Closing it unsaved is no choice: Done, once the code is kept.
  const box = useWindow(() => {});
  const copy = async () => {
    if (await toClipboard(props.code)) showCopied(true);
    else setProblem(t("recovery.copy_failed"));
  };
  const save = () => {
    const text = t("recovery.file_text", { code: props.code });
    const url = URL.createObjectURL(new Blob([`${text}\n`], { type: "text/plain" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "tterm-recovery-code.txt";
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), PRESSED_MS);
    showSaved(true);
  };
  return (
    <div className="scrim">
      <section ref={box} className="dialog vault-dialog wide" role="dialog" aria-modal="true"
        aria-labelledby="rc-title" tabIndex={-1}>
        <h2 id="rc-title" className="vault-dialog-title">
          {props.fresh ? t("recovery.title_new") : t("recovery.title")}
        </h2>
        <p className="vault-dialog-text">
          {props.fresh ? t("recovery.text_new") : t("recovery.text")}
        </p>
        <div className="recovery-box">
          <code className="recovery-code" aria-label={t("recovery.code_label", { code: props.code })}>
            {props.code}
          </code>
          <button type="button" className="button-plain small" onClick={() => void copy()}>
            {copied ? <Check size={14} className="pressed-mark" /> : <Copy size={14} />}
            {copied ? t("common.copied") : t("common.copy")}
          </button>
          <button type="button" className="button-plain small" onClick={save}>
            {saved ? <Check size={14} className="pressed-mark" /> : <Download size={14} />}
            {t("recovery.save_file")}
          </button>
        </div>
        <label className="vault-check">
          <input type="checkbox" checked={kept} data-autofocus
            onChange={(e) => setKept(e.target.checked)} />
          {v.app ? t("recovery.kept_mac") : t("recovery.kept_web")}
        </label>
        {problem && <div className="error-box" role="alert">{problem}</div>}
        <div className="vault-buttons">
          <button type="button" className="button-accent big" disabled={!kept}
            onClick={props.onDone}>
            {t("common.done")}
          </button>
        </div>
      </section>
    </div>
  );
}

// ------------------------------------------ Open your keys on this browser

function OpenVault(props: { start: "mac" | "code" | null }) {
  const t = useT();
  const v = useVault();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [keeping, setKeeping] = useState(false);
  const field = useRef<HTMLInputElement>(null);
  const close = () => {
    vaultStore.endPairing();
    vaultStore.skipPasskey();
    vaultUi.close();
  };
  const box = useWindow(close);
  const macs = macsOf(v.vault);
  const mac = macName(t, v.vault);
  const pairing = v.pairing;
  const canPair = macs.length > 0;

  // Asked from "approve on the Mac": the request goes at once.
  useEffect(() => {
    if (props.start === "mac" && canPair) void vaultStore.startPairing();
    if (props.start === "code") window.setTimeout(() => field.current?.focus(), 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Open, and nothing more to ask: the window has done its part.
  useEffect(() => {
    if (v.open && !v.offerPasskey && !keeping) close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v.open, v.offerPasskey, keeping]);

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

  const keep = async () => {
    setKeeping(true);
    setProblem(null);
    try {
      await vaultStore.keepWithPasskey();
      close();
    } catch (error) {
      setProblem(problemText(t, error) ?? t("vault_open.kept_session"));
      setKeeping(false);
    }
  };

  if (v.open && (v.offerPasskey || keeping)) {
    return (
      <div className="scrim">
        <section ref={box} className="dialog vault-dialog" role="dialog" aria-modal="true"
          aria-labelledby="wk-title" tabIndex={-1}>
          <Tile><Fingerprint size={24} /></Tile>
          <h2 id="wk-title" className="vault-dialog-title">{t("vault_open.opened_title")}</h2>
          <p className="vault-dialog-text">{t("vault_open.opened_text")}</p>
          {problem && <div className="error-box" role="alert">{problem}</div>}
          <div className="vault-buttons">
            <button type="button" className="button-plain" disabled={keeping}
              onClick={() => {
                vaultStore.skipPasskey();
                close();
              }}>
              {t("vault_open.only_now")}
            </button>
            <button type="button" className="button-accent big" data-autofocus disabled={keeping}
              onClick={() => void keep()}>
              {keeping ? <span className="spinner" aria-hidden="true" /> : <Fingerprint size={17} />}
              {unlockWord(t, "keep")}
            </button>
          </div>
        </section>
      </div>
    );
  }

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
          {canPair ? t("vault_open.text") : t("vault_open.text_code")}
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
              <span>{noX25519 ? t("vault_problem.no_x25519") : macLine}</span>
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
        {problem && <div className="error-box" role="alert">{problem}</div>}
        <div className="vault-buttons">
          <button type="button" className="button-ghost" onClick={close}>
            {t("vault.not_now")}
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
      await vaultStore.appOpen(code);
      props.onDone(true);
    } catch (error) {
      setBusy(false);
      setProblem(problemText(t, error));
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

// ------------------------------------------- Make a new recovery code

function NewRecovery() {
  const t = useT();
  const v = useVault();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const box = useWindow(() => vaultUi.close());
  // Its raw key again: through this browser's passkey, else the code it has
  // now; the app's engine has it open.
  const withPasskey = v.app || !!v.hereLock;
  const go = async () => {
    setBusy(true);
    setProblem(null);
    try {
      const made = await vaultStore.newRecoveryCode(withPasskey ? undefined : code);
      await vaultUi.recovery(made, true);
    } catch (error) {
      setProblem(problemText(t, error));
      setBusy(false);
    }
  };
  return (
    <div className="scrim">
      <section ref={box} className="dialog vault-dialog" role="dialog" aria-modal="true"
        aria-labelledby="nr-title" tabIndex={-1}>
        <h2 id="nr-title" className="vault-dialog-title">{t("recovery.make_title")}</h2>
        <p className="vault-dialog-text">{t("recovery.make_text")}</p>
        {!withPasskey && (
          <>
            <label htmlFor="nr-code" className="vault-label">{t("recovery.now_code")}</label>
            <input id="nr-code" type="text" className="vault-input mono" data-autofocus
              placeholder="XXXX-XXXX-XXXX-XXXX-XXXX-XXXX" autoComplete="off" spellCheck={false}
              value={code} onChange={(e) => setCode(e.target.value)} />
            <p className="hint">{t("recovery.now_code_hint")}</p>
          </>
        )}
        {problem && <div className="error-box" role="alert">{problem}</div>}
        <div className="vault-buttons">
          <button type="button" className="button-plain" disabled={busy} onClick={() => vaultUi.close()}>
            {t("common.cancel")}
          </button>
          <button type="button" className="button-accent big" disabled={busy || (!withPasskey && !isRecoveryCode(code))}
            data-autofocus={withPasskey ? true : undefined} onClick={() => void go()}>
            {busy ? <span className="spinner" aria-hidden="true" /> : withPasskey && <Fingerprint size={17} />}
            {withPasskey ? (v.app ? t("recovery.make_touch") : t("recovery.make_go_passkey"))
              : t("recovery.make_go")}
          </button>
        </div>
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
