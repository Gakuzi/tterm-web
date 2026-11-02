// A server that opens with the person's own key, while no page or app that
// can sign with it is there (0.1.17, Vault.dc, web-open; the vault password
// from 0.1.26, VaultPass.dc, web-pass and web-closed): its login waits (the
// terminal's "vault" field), and this card says how to go on. In a browser
// with no lock of the vault (a new one, someone else's): the vault password
// right here, then "or approve on the Mac · Forgot the password?". Where
// the keys were kept with Touch ID: Your vault is closed, Open with Touch
// ID, or type the vault password. A vault made before 0.1.26 with no
// password yet opens as before: Touch ID here, the Mac's approval, the
// recovery code. Once the vault is open here, the page signs and the login
// goes on by itself. In tTerm for Mac the vault opens in the app (Touch ID
// or the Mac's password; once with the vault password where this Mac has no
// lock of it yet, or the recovery code while the vault has no password),
// and the app signs.

import { useState } from "react";
import { useT } from "./i18n";
import { Fingerprint, Key, Lock } from "./icons";
import {
  macLockHere, macsOf, macName, openOnMac, OrLinks, PasswordOpen, problemText, unlockWord, vaultUi,
} from "./VaultDialogs";
import { vaultStore, useVault } from "./vault/store";
import { unlockOf } from "./vault/support";

/** "Open it with Touch ID to sign in to {machine} with your key." */
const CLOSED_TEXT = {
  touch: "vault_locked.closed_text.touch",
  hello: "vault_locked.closed_text.hello",
  passkey: "vault_locked.closed_text.passkey",
};

export function VaultLocked(props: { machine: string; fingerprint: string; keyName: string | null }) {
  const t = useT();
  const v = useVault();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  // "or type the vault password": this browser's lock aside, the field.
  const [typing, setTyping] = useState(false);
  const machine = props.machine;
  const macs = macsOf(v.vault);
  const mac = macName(t, v.vault);
  const signsHere = v.open && v.signable.includes(props.fingerprint);
  const cannot = v.open && !v.app ? v.unsignable[props.fingerprint] : undefined;
  const withPassword = !!v.vault?.password;

  const open = async () => {
    setBusy(true);
    setProblem(null);
    try {
      if (v.app) await openOnMac();
      else await vaultStore.openWithPasskey();
    } catch (error) {
      setProblem(problemText(t, error));
    } finally {
      setBusy(false);
    }
  };

  const approve = { key: "mac", text: t("vault_locked.approve_on", { mac }), go: () => vaultUi.openVault("mac") };
  const useCode = { key: "code", text: t("vault_locked.use_code"), go: () => vaultUi.openVault("code") };
  const forgot = { key: "forgot", text: t("vault_password.forgot"), go: () => vaultUi.forgot() };

  let tile = <Key size={26} />;
  let title = t("vault_locked.title", { machine });
  let body;
  let foot = null;
  if (signsHere) {
    // Open and able: the core asks this page in a moment.
    body = (
      <p className="vault-locked-text waiting-line">
        <span className="spinner" aria-hidden="true" />
        {t("vault_locked.signing", { machine })}
      </p>
    );
  } else if (cannot || v.open) {
    body = (
      <p className="vault-locked-text">
        {cannot === "ed25519" ? t("vault_locked.no_ed25519", { machine })
          : t("vault_locked.not_here", { machine, key: props.keyName ?? t("vault_locked.its_key") })}
      </p>
    );
  } else if (v.app) {
    // This Mac's own lock opens it with Touch ID; without one, the vault
    // password once (the recovery code, while the vault has no password).
    const lockHere = macLockHere(v.vault);
    if (!lockHere && withPassword) {
      body = (
        <>
          <p className="vault-locked-text">{t("vault_locked.text_app_password", { machine })}</p>
          <PasswordOpen />
        </>
      );
    } else {
      body = (
        <>
          <p className="vault-locked-text">
            {lockHere ? t("vault_locked.text_app", { machine }) : t("vault_locked.text_app_code", { machine })}
          </p>
          <button type="button" className="button-accent big" disabled={busy} onClick={() => void open()}>
            {busy ? <span className="spinner" aria-hidden="true" /> : lockHere && <Fingerprint size={18} />}
            {lockHere ? t("vault.open_touch") : t("vault_locked.use_code_button")}
          </button>
        </>
      );
    }
  } else if (v.hereLock && !typing) {
    // The keys were kept here: Touch ID opens them (3b).
    tile = <Lock size={26} />;
    title = t("vault_locked.closed_title");
    body = (
      <>
        <p className="vault-locked-text">{t(CLOSED_TEXT[unlockOf()], { machine })}</p>
        <button type="button" className="button-accent big" disabled={busy} onClick={() => void open()}>
          {busy ? <span className="spinner" aria-hidden="true" /> : <Fingerprint size={18} />}
          {unlockWord(t, "open")}
        </button>
        {withPassword ? (
          <p className="vault-locked-links">
            <button type="button" className="link-button" onClick={() => {
              setProblem(null);
              setTyping(true);
            }}>
              {t("vault_locked.use_password")}
            </button>
          </p>
        ) : (
          <OrLinks links={[...(macs.length ? [approve] : []), useCode]} />
        )}
      </>
    );
    foot = <p className="vault-locked-foot">{t("vault_locked.closes_itself")}</p>;
  } else if (withPassword) {
    // No lock here (a new browser, someone else's): the vault password (3a).
    body = (
      <>
        <p className="vault-locked-text">{t("vault_locked.text_password", { machine })}</p>
        <PasswordOpen autoFocus={typing}
          links={<OrLinks links={[...(macs.length ? [approve] : []), forgot]} />} />
      </>
    );
  } else {
    // A vault with no password yet, and no lock here: as before 0.1.26.
    body = (
      <>
        <p className="vault-locked-text">{t("vault_locked.text", { machine })}</p>
        {macs.length ? (
          <button type="button" className="button-accent big" onClick={() => vaultUi.openVault("mac")}>
            {t("vault_locked.approve_on_button", { mac })}
          </button>
        ) : (
          <button type="button" className="button-accent big" onClick={() => vaultUi.openVault("code")}>
            {t("vault_locked.use_code_button")}
          </button>
        )}
        {macs.length > 0 && <OrLinks links={[useCode]} />}
      </>
    );
  }

  return (
    <div className="vault-locked" role="status">
      <div className="vault-locked-card">
        <span className="vault-tile big" aria-hidden="true">{tile}</span>
        <h1>{title}</h1>
        {body}
        {problem && <div className="error-box" role="alert">{problem}</div>}
        {foot}
      </div>
    </div>
  );
}
