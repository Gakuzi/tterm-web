// The card of a tab whose machine is closed on this device (0.1.28, the
// owner's decisions of 03.11; the clickable mockup LockFlow.dc, canvas
// version 106): a new terminal asked for with a lock, a terminal of such a
// machine, or its log. It says why it is closed and opens the keys right
// here, as the vault opens anywhere on the page: the vault password, Touch
// ID where the browser keeps the keys, the Mac's approval, in the app Touch
// ID. Once the keys are proved open here, the tab goes on by itself: the
// new terminal is made (only the one asked for), the terminal shows from
// where it is now, the log opens. In the app the engine proves them; with
// nothing to prove them by (a vault with its password and no key yet,
// opened with Touch ID: app 0.8.1 says so) the card asks for the password.
// The same opening of the keys stands in the windows that remove or move
// such a machine (KeysHere; the canvas, version 109).

import { useState } from "react";
import { useT } from "./i18n";
import { Computer, Fingerprint, Key, Lock } from "./icons";
import {
  macLockHere, macsOf, macName, openOnMac, OrLinks, PasswordOpen, problemText, unlockWord, vaultUi,
} from "./VaultDialogs";
import { useVault, vaultStore } from "./vault/store";

/** What the tab is for: a new terminal on a machine (by how it opens), a
 * terminal by its name, a machine's log. */
export type ClosedWhat =
  | { kind: "new"; machine: string; opens: "key" | "via" | "mac"; mac?: string }
  | { kind: "terminal"; machine: string; name: string }
  | { kind: "log"; machine: string };

export function KeysClosed(props: { what: ClosedWhat }) {
  const t = useT();
  const v = useVault();
  const { what } = props;
  const mac = macName(t, v.vault);
  // The password's button: for a new terminal, both; otherwise the keys.
  const action = what.kind === "new" ? t("keys_closed.open_new") : undefined;

  let tile = <Lock size={26} />;
  let title: string;
  let text: string;
  if (what.kind === "new") {
    const via = what.mac || mac;
    if (what.opens === "key") {
      tile = <Key size={26} />;
      title = t("keys_closed.new_key_title", { machine: what.machine });
      text = t("keys_closed.new_key_text", { machine: what.machine });
    } else if (what.opens === "via") {
      tile = <Computer size={26} />;
      title = t("keys_closed.new_via_title", { machine: what.machine, mac: via });
      text = t("keys_closed.new_via_text");
    } else {
      tile = <Computer size={26} />;
      title = t("keys_closed.new_mac_title", { mac: what.machine });
      text = t("keys_closed.new_mac_text");
    }
  } else if (what.kind === "log") {
    title = t("keys_closed.log_title", { machine: what.machine });
    text = t("keys_closed.log_text");
  } else {
    title = t("keys_closed.terminal_title");
    text = t("keys_closed.terminal_text", { name: what.name, machine: what.machine });
  }

  return (
    <div className="vault-locked keys-closed" role="status">
      <div className="vault-locked-card">
        <span className="vault-tile big" aria-hidden="true">{tile}</span>
        <h1>{title}</h1>
        <p className="vault-locked-text">{text}</p>
        <OpenKeys action={action} />
        <p className="vault-locked-foot keys-closed-foot">{t("keys_closed.foot")}</p>
      </div>
    </div>
  );
}

/** In a window that removes or moves a machine closed on this device
 * (04.11, the canvas, version 109): why it waits, and the keys opened right
 * there; once they are, the window is the usual one again. */
export function KeysHere(props: { text: string }) {
  return (
    <div className="keys-here">
      <p className="keys-here-text">
        <Lock size={16} />
        <span>{props.text}</span>
      </p>
      <OpenKeys />
    </div>
  );
}

/** The keys opened on this device, as each way is there: the vault
 * password, Touch ID where the browser keeps the keys, the Mac's approval,
 * in the app Touch ID; then a moment while they are proved to tTerm. The
 * card's and KeysHere's; `action`, the password button's words. */
function OpenKeys(props: { action?: string }) {
  const t = useT();
  const v = useVault();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [typing, setTyping] = useState(false);
  const { action } = props;
  const macs = macsOf(v.vault);
  const mac = macName(t, v.vault);
  const withPassword = !!v.vault?.password;

  const touch = async () => {
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

  // The keys open here and being proved: a moment. In the app the engine
  // proves them, unless it says it has nothing to prove them by.
  const proving = v.open && (v.app ? v.appVault?.proves !== false : v.signable.length > 0);
  let body;
  if (proving) {
    body = (
      <p className="vault-locked-text waiting-line">
        <span className="spinner" aria-hidden="true" />
        {t("keys_closed.proving")}
      </p>
    );
  } else if (v.app) {
    // This Mac's own lock: Touch ID; without one, the vault password once
    // (the recovery code, while the vault has no password). Open with
    // nothing to prove it by: the password.
    const lockHere = macLockHere(v.vault);
    body = (!lockHere || v.open) && withPassword ? <PasswordOpen action={action} /> : (
      <button type="button" className="button-accent big" disabled={busy} onClick={() => void touch()}>
        {busy ? <span className="spinner" aria-hidden="true" /> : lockHere && <Fingerprint size={18} />}
        {lockHere ? t("vault.open_touch") : t("vault_locked.use_code_button")}
      </button>
    );
  } else if (v.hereLock && !v.open && !typing) {
    body = (
      <>
        <button type="button" className="button-accent big" disabled={busy} onClick={() => void touch()}>
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
  } else if (withPassword) {
    // No lock here, or the keys open but nothing to prove them by: the
    // vault password, right here.
    body = (
      <PasswordOpen action={action} autoFocus={typing}
        links={<OrLinks links={[...(macs.length && !v.open ? [approve] : []), forgot]} />} />
    );
  } else {
    // A vault made before 0.1.26 with no password yet: as before.
    body = macs.length ? (
      <>
        <button type="button" className="button-accent big" onClick={() => vaultUi.openVault("mac")}>
          {t("vault_locked.approve_on_button", { mac })}
        </button>
        <OrLinks links={[useCode]} />
      </>
    ) : (
      <button type="button" className="button-accent big" onClick={() => vaultUi.openVault("code")}>
        {t("vault_locked.use_code_button")}
      </button>
    );
  }

  return (
    <>
      {body}
      {problem && <div className="error-box" role="alert">{problem}</div>}
    </>
  );
}
