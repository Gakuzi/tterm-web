// Settings › Keys (0.1.17), as on the canvas (Vault.dc, web-keys): the
// person's vault, the SSH keys they saved, on all their devices. How it is
// here (open in this browser, with how it opened and when it locks again,
// and Lock; or locked, and Open); each key with its type and fingerprint,
// the servers it opens, where it came from and when it was last used, and
// Remove; Add a key from a file, also with a passphrase; Make a new
// recovery code; and where the vault opens. In tTerm for Mac the vault
// opens in the app itself (Touch ID or the Mac's password), and keys come
// from ~/.ssh with Move to cloud.

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { type Project, type VaultKey } from "./api";
import { Confirm } from "./Confirm";
import { gap, list, useT, type Translate } from "./i18n";
import { Fingerprint, Key, Lock, Plus, Unlock } from "./icons";
import { agoLong, onDay } from "./time";
import {
  macLockHere, macsOf, openOnMac, problemText, serversText, unlockWord, vaultUi,
} from "./VaultDialogs";
import { needsPassphrase, readKeyFile, type ReadKey } from "./vault/keyfile";
import { rsaBits, shortFingerprint } from "./vault/ssh";
import { vaultStore, useVault } from "./vault/store";
import { passkeysHere, unlockOf } from "./vault/support";

/** "ED25519", "ECDSA P-256", "RSA 4096": a key's kind, short. */
export function keyKind(type: string, publicKey?: string, bits?: number | null): string {
  if (type === "ssh-ed25519") return "ED25519";
  if (type === "ecdsa-sha2-nistp256") return "ECDSA P-256";
  if (type === "ecdsa-sha2-nistp384") return "ECDSA P-384";
  if (type === "ssh-rsa") {
    const n = bits ?? rsaBitsOf(publicKey);
    return n ? `RSA ${n}` : "RSA";
  }
  return type.toUpperCase();
}

/** An RSA key's size from its OpenSSH public line. */
function rsaBitsOf(publicKey?: string): number | null {
  try {
    const blob = Uint8Array.from(atob(publicKey?.split(/\s+/)[1] ?? ""), (c) => c.charCodeAt(0));
    let at = 0;
    const next = () => {
      const n = new DataView(blob.buffer).getUint32(at);
      const part = blob.subarray(at + 4, at + 4 + n);
      at += 4 + n;
      return part;
    };
    next();
    next();
    const modulus = next();
    let text = "";
    for (const b of modulus) text += String.fromCharCode(b);
    return rsaBits({ n: btoa(text).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "") });
  } catch {
    return null;
  }
}

/** The first sentence of the card while the vault is open here. */
const OPENED: Record<string, string> = {
  touch: "keys.open_text.touch",
  hello: "keys.open_text.hello",
  passkey: "keys.open_text.passkey",
  recovery: "keys.open_text.recovery",
  pairing: "keys.open_text.pairing",
  new: "keys.open_text.new",
};

/** Where a key came from and when it was used: "Saved from MacBook-Pro on
 * 29 Oct · last used 2 hours ago". */
function fromText(t: Translate, key: VaultKey): string {
  const day = onDay(key.createdAt, t);
  const where = key.source === "mac"
    ? t("keys.from_mac", { where: key.sourceLabel || t("vault.your_mac"), day })
    : t("keys.from_file", { day });
  const used = key.lastUsedAt ? t("keys.used", { ago: agoLong(key.lastUsedAt, t) }) : t("keys.unused");
  return `${where} · ${used}`;
}

interface Props {
  projects: Project[];
  notify: (text: string) => void;
}

export function KeysSection(props: Props) {
  const t = useT();
  const v = useVault();
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState<VaultKey | null>(null);
  const [adding, setAdding] = useState<{ name: string; text: string } | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const personal = props.projects.find((p) => p.personal)?.name ?? null;
  const vault = v.vault;
  const macs = macsOf(vault);
  const passkey = passkeysHere(v.support);

  const act = (what: () => Promise<unknown>) => async () => {
    setBusy(true);
    setProblem(null);
    try {
      await what();
    } catch (error) {
      setProblem(problemText(t, error));
    } finally {
      setBusy(false);
    }
  };

  /** Open, the way this browser can: its passkey; else the window with the
   * Mac's approval and the recovery code. In the app: this Mac's lock, or
   * once the recovery code where this Mac has none yet. */
  const openHere = act(async () => {
    if (v.app) await openOnMac();
    else if (v.hereLock) await vaultStore.openWithPasskey();
    else vaultUi.openVault(macs.length ? null : "code");
  });
  /** In the app, a vault this Mac has no lock of: it opens with the code. */
  const codeOnMac = v.app && !macLockHere(vault);

  const pickFile = () => {
    setProblem(null);
    if (vault && !v.open) {
      void openHere();
      return;
    }
    file.current?.click();
  };

  const placesText = (): string => {
    if (!vault?.locks.length) return t("keys.opens_on_code");
    const names = vault.locks.map((l) => {
      const mac = /^tTerm for Mac on (.+)$/.exec(l.label)?.[1];
      return mac ? t("keys.place_mac", { mac, app: t("app_link.mac") }) : l.label || t("keys.place_browser");
    });
    return t("keys.opens_on", { places: list([...new Set(names)], t.lang) });
  };

  let card;
  if (!v.ready) {
    card = (
      <div className="account-card vault-state">
        <div className="waiting"><span className="spinner" />{t("common.loading")}</div>
      </div>
    );
  } else if (!vault) {
    card = (
      <div className="account-card vault-state">
        <Lock size={20} className="vault-state-icon" />
        <span className="vault-state-text">
          <strong>{t("keys.none_title")}</strong>
          <span>{v.app ? t("keys.none_app") : t("keys.none_web")}</span>
        </span>
      </div>
    );
  } else if (v.open) {
    const how = v.app ? null : v.openedBy === "passkey" ? unlockOf() : v.openedBy ?? "recovery";
    card = (
      <div className="account-card vault-state open">
        <Unlock size={20} className="vault-state-icon" />
        <span className="vault-state-text">
          <strong>{v.app ? t("keys.open_mac") : t("keys.open_here")}</strong>
          <span>{v.app ? t("keys.open_text.mac") : t(OPENED[how ?? "recovery"])}</span>
        </span>
        <button type="button" className="button-plain small" onClick={() => vaultStore.lock()}>
          {t("keys.lock")}
        </button>
      </div>
    );
  } else {
    card = (
      <div className="account-card vault-state">
        <Lock size={20} className="vault-state-icon" />
        <span className="vault-state-text">
          <strong>{v.app ? t("keys.locked_mac") : t("keys.locked_here")}</strong>
          <span>
            {codeOnMac ? t("keys.locked_mac_code") : v.app ? t("keys.locked_mac_text") : t("keys.locked_text")}
          </span>
        </span>
        <button type="button" className="button-accent" disabled={busy} onClick={() => void openHere()}>
          {((v.app && !codeOnMac) || (!v.app && v.hereLock)) && <Fingerprint size={15} />}
          {codeOnMac ? t("keys.open_code") : v.app ? t("vault.open_touch")
            : v.hereLock ? unlockWord(t, "open") : t("keys.open")}
        </button>
      </div>
    );
  }

  const ed25519 = vault?.keys.some((k) => k.type === "ssh-ed25519") && v.support?.ed25519 === false;
  // Two sentences side by side: no space between them in Chinese and Japanese.
  const places = vault ? placesText() : "";
  const more = v.app ? t("keys.more_app") : t("keys.more_web");

  return (
    <section className="account-section" aria-labelledby="st-keys" id="st-keys-section">
      <div className="account-section-head">
        <h2 id="st-keys" className="with-icon"><Key size={17} />{t("keys.title")}</h2>
        <p>{t("keys.about")}</p>
      </div>
      {card}
      {!v.app && v.ready && v.support && !passkey && (
        <p className="vault-note">{t("keys.no_passkey_here")}</p>
      )}
      {!v.app && ed25519 && <p className="vault-note">{t("keys.no_ed25519_here")}</p>}
      {vault && vault.keys.length > 0 && (
        <ul className="account-card device-list vault-keys">
          {vault.keys.map((key) => (
            <li key={key.id} className="device-row">
              <span className="device-icon" aria-hidden="true"><Key size={17} /></span>
              <span className="device-text">
                <strong>
                  {key.name}
                  <span className="vault-kind" title={key.fingerprint}>
                    {keyKind(key.type, key.publicKey)} · {shortFingerprint(key.fingerprint)}
                  </span>
                </strong>
                <span className="vault-key-servers">
                  {key.servers.length
                    ? t("keys.opens", { servers: serversText(t, key.servers, personal) })
                    : t("keys.opens_none")}
                </span>
                <span>{fromText(t, key)}</span>
                {!v.app && v.open && v.unsignable[key.fingerprint] && (
                  <span className="vault-warn">
                    {v.unsignable[key.fingerprint] === "ed25519" ? t("keys.cannot_ed25519") : t("keys.cannot_open")}
                  </span>
                )}
              </span>
              <button type="button" className="button-plain small" onClick={() => setRemoving(key)}>
                {t("keys.remove")}
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="button-row">
        {!v.app && (
          <button type="button" className="button-plain with-icon" disabled={busy || !v.ready}
            onClick={pickFile}>
            <Plus size={14} />{t("keys.add_file")}
          </button>
        )}
        {vault && (
          <button type="button" className="button-ghost" disabled={busy}
            onClick={() => vaultUi.newRecovery()}>
            {t("keys.new_recovery")}
          </button>
        )}
        <input ref={file} type="file" hidden onChange={(event) => {
          const chosen = event.target.files?.[0];
          event.target.value = "";
          if (!chosen) return;
          if (chosen.size > 64 * 1024) {
            setProblem(t("add_key.problem_big"));
            return;
          }
          void chosen.text().then((text) => setAdding({ name: chosen.name, text }))
            .catch(() => setProblem(t("add_key.problem_read")));
        }} />
      </div>
      {problem && <div className="error-box" role="alert">{problem}</div>}
      {vault && (
        <p className="vault-places">{places}{gap(places, more, t.lang)}{more}</p>
      )}
      {adding && (
        <AddKey fileName={adding.name} text={adding.text} hasVault={!!vault}
          onClose={() => setAdding(null)}
          onAdded={(name) => {
            setAdding(null);
            props.notify(t("add_key.added", { name }));
          }} />
      )}
      {removing && (
        <Confirm title={t("keys.remove_title", { name: removing.name })}
          confirm={t("keys.remove_confirm", { name: removing.name })}
          onConfirm={async () => {
            await vaultStore.removeKey(removing.id);
            setRemoving(null);
            props.notify(t("keys.removed", { name: removing.name }));
          }}
          onCancel={() => setRemoving(null)}>
          <p>
            {removing.servers.length
              ? t("keys.remove_text", { servers: serversText(t, removing.servers, personal) })
              : t("keys.remove_text_none")}
          </p>
          <p className="hint">{t("keys.remove_hint")}</p>
        </Confirm>
      )}
    </section>
  );
}

/** "deploy-ci": a key's name from its file, as the person may keep it. */
function nameOf(fileName: string): string {
  const base = fileName.replace(/\.(pem|key|txt|priv|private)$/i, "").trim();
  return (base || fileName).slice(0, 64);
}

/** Add a key from a file: the passphrase when it has one, the key as read,
 * its name; with no vault yet, Save your key to your vault first. */
function AddKey(props: {
  fileName: string;
  text: string;
  hasVault: boolean;
  onClose: () => void;
  onAdded: (name: string) => void;
}) {
  const t = useT();
  const [passphrase, setPassphrase] = useState("");
  const [read, setRead] = useState<ReadKey | null>(null);
  const [name, setName] = useState(nameOf(props.fileName));
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const wantsPassphrase = needsPassphrase(props.text);
  const box = useRef<HTMLElement>(null);
  // Save your key to your vault and the recovery code come over it: it
  // waits behind them, out of sight.
  const covered = useSyncExternalStore(vaultUi.subscribe, vaultUi.get, vaultUi.get) !== null;

  const readIt = async () => {
    setBusy(true);
    setProblem(null);
    try {
      setRead(await readKeyFile(props.text, wantsPassphrase ? passphrase : undefined));
    } catch (error) {
      setProblem(problemText(t, error));
    } finally {
      setBusy(false);
    }
  };

  // A key without a passphrase is read at once.
  useEffect(() => {
    if (!wantsPassphrase) void readIt();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const add = async () => {
    if (!read) return;
    setBusy(true);
    setProblem(null);
    try {
      if (!props.hasVault) {
        const made = await vaultUi.newVault("web", name, null);
        if (!made) {
          setBusy(false);
          return;
        }
      }
      await vaultStore.addKey(read, name.trim(), props.fileName);
      props.onAdded(name.trim());
    } catch (error) {
      setProblem(problemText(t, error));
      setBusy(false);
    }
  };

  if (covered) return null;
  return (
    <div className="scrim">
      <section ref={box} className="dialog vault-dialog" role="dialog" aria-modal="true"
        aria-labelledby="ak-title" tabIndex={-1} onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            props.onClose();
          }
        }}>
        <div className="dialog-head">
          <div className="dialog-title">
            <h2 id="ak-title">{t("add_key.title")}</h2>
            <p className="dialog-note mono">{props.fileName}</p>
          </div>
        </div>
        {wantsPassphrase && !read && (
          <form className="vault-field" onSubmit={(e) => {
            e.preventDefault();
            if (passphrase) void readIt();
          }}>
            <label htmlFor="ak-pass" className="vault-label">{t("add_key.passphrase")}</label>
            <div className="vault-code-row">
              <input id="ak-pass" type="password" className="vault-input" autoFocus
                autoComplete="off" value={passphrase} onChange={(e) => setPassphrase(e.target.value)} />
              <button type="submit" className="button-plain" disabled={busy || !passphrase}>
                {busy ? <span className="spinner" aria-hidden="true" /> : null}
                {t("add_key.open_key")}
              </button>
            </div>
            <p className="hint">{t("add_key.passphrase_hint")}</p>
          </form>
        )}
        {!wantsPassphrase && busy && !read && (
          <div className="waiting"><span className="spinner" />{t("add_key.reading")}</div>
        )}
        {read && (
          <>
            <div className="vault-read">
              <Key size={18} />
              <span className="vault-read-text">
                <strong>{keyKind(read.type, read.publicKey, read.bits)}</strong>
                <code title={read.fingerprint}>{read.fingerprint}</code>
                {read.comment && <span>{read.comment}</span>}
              </span>
            </div>
            <div className="vault-field">
              <label htmlFor="ak-name" className="vault-label">{t("add_key.name")}</label>
              <input id="ak-name" type="text" className="vault-input" maxLength={64}
                value={name} autoFocus onChange={(e) => setName(e.target.value)} />
            </div>
            <p className="vault-dialog-text small">{t("add_key.sealed_here")}</p>
          </>
        )}
        {problem && <div className="error-box" role="alert">{problem}</div>}
        <div className="vault-buttons">
          <button type="button" className="button-plain" disabled={busy} onClick={props.onClose}>
            {t("common.cancel")}
          </button>
          {read && (
            <button type="button" className="button-accent big" disabled={busy || !name.trim()}
              onClick={() => void add()}>
              {busy ? <span className="spinner" aria-hidden="true" /> : null}
              {props.hasVault ? t("add_key.add") : t("add_key.next")}
            </button>
          )}
        </div>
      </section>
    </div>
  );
}
