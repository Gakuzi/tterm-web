// A server that opens with the person's own key, while no page or app that
// can sign with it is there (0.1.17, Vault.dc, web-open): its login waits
// (the terminal's "vault" field), and this card says how to go on. Open
// with Touch ID where this browser has its passkey lock; or approve on the
// Mac, or the recovery code (Open your keys on this browser). Once the
// vault is open here, the page signs and the login goes on by itself. In
// tTerm for Mac the vault opens in the app (Touch ID or the Mac's
// password; once with the recovery code where this Mac has no lock of it
// yet), and the app signs.

import { useState } from "react";
import { gap, useT } from "./i18n";
import { Fingerprint, Key } from "./icons";
import { macLockHere, macsOf, macName, openOnMac, problemText, unlockWord, vaultUi } from "./VaultDialogs";
import { vaultStore, useVault } from "./vault/store";

export function VaultLocked(props: { machine: string; fingerprint: string; keyName: string | null }) {
  const t = useT();
  const v = useVault();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const machine = props.machine;
  const macs = macsOf(v.vault);
  const mac = macName(t, v.vault);
  const signsHere = v.open && v.signable.includes(props.fingerprint);
  const cannot = v.open && !v.app ? v.unsignable[props.fingerprint] : undefined;

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

  let body;
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
    // This Mac's own lock opens it with Touch ID; without one, the code once.
    const lockHere = macLockHere(v.vault);
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
  } else {
    const links = [
      ...(macs.length && v.hereLock ? [{ key: "mac", text: t("vault_locked.approve_on", { mac }),
        go: () => vaultUi.openVault("mac") }] : []),
      ...(v.hereLock || macs.length ? [{ key: "code", text: t("vault_locked.use_code"),
        go: () => vaultUi.openVault("code") }] : []),
    ];
    const or = t("vault_locked.or");
    body = (
      <>
        <p className="vault-locked-text">{t("vault_locked.text", { machine })}</p>
        {v.hereLock ? (
          <button type="button" className="button-accent big" disabled={busy} onClick={() => void open()}>
            {busy ? <span className="spinner" aria-hidden="true" /> : <Fingerprint size={18} />}
            {unlockWord(t, "open")}
          </button>
        ) : macs.length ? (
          <button type="button" className="button-accent big" onClick={() => vaultUi.openVault("mac")}>
            {t("vault_locked.approve_on_button", { mac })}
          </button>
        ) : (
          <button type="button" className="button-accent big" onClick={() => vaultUi.openVault("code")}>
            {t("vault_locked.use_code_button")}
          </button>
        )}
        {links.length > 0 && (
          <p className="vault-locked-links">
            {or}{gap(or, links[0].text, t.lang)}
            {links.map((l, i) => (
              <span key={l.key}>
                {i > 0 && " · "}
                <button type="button" className="link-button" onClick={l.go}>{l.text}</button>
              </span>
            ))}
          </p>
        )}
      </>
    );
  }

  return (
    <div className="vault-locked" role="status">
      <div className="vault-locked-card">
        <span className="vault-tile big" aria-hidden="true"><Key size={26} /></span>
        <h1>{t("vault_locked.title", { machine })}</h1>
        {body}
        {problem && <div className="error-box" role="alert">{problem}</div>}
      </div>
    </div>
  );
}
