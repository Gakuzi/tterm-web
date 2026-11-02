// The strip under a successful `ssh <host>` in this Mac's terminals
// (0.1.17, Vault.dc, ssh): the server, "open it from anywhere", with Save
// my key (the key goes to the vault, encrypted on this Mac, and opens with
// the vault password in any browser, 0.1.26; the server stays as it is),
// Let tTerm in (tTerm's own line goes on the
// server; the key stays on this Mac), Not now and Don't ask for <host>.
// Once per host, remembered on this Mac; not for a host already in tTerm,
// nor for one with no terminal (a git host). A server the cloud does not
// reach (nor its bastion) opens through this Mac instead. Only in tTerm for
// Mac.

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { loadAppSsh, moveToCloud, type MoveMethod, type Project, type SshHost, type SshInventory } from "./api";
import type { FeedBlock } from "./BlockView";
import { useT, type Translate } from "./i18n";
import { Close, Cloud, Key } from "./icons";
import {
  address, askedAbout, cloudReaches, hostFor, inTterm, keyFor, rememberAsked, sshTarget, tilde,
} from "./sshHosts";
import { openOnMac, problemText, vaultUi } from "./VaultDialogs";
import { vaultStore } from "./vault/store";

/** What the strip and Move to cloud need of the page around them. */
export interface MoveFrame {
  /** In the app, signed in. */
  enabled: boolean;
  projects: Project[];
  /** Where moved servers go: Personal. */
  personal: Project | null;
  notify: (text: string) => void;
  /** The lists from the core again: a moved server shows in the sidebar. */
  refresh: () => void;
}

export const MoveContext = createContext<MoveFrame>({
  enabled: false, projects: [], personal: null, notify: () => {}, refresh: () => {},
});

let known: Promise<SshInventory> | null = null;

/** The servers and keys this Mac knows, asked of the engine once; again
 * when `fresh`. */
export function inventory(fresh = false): Promise<SshInventory> {
  if (fresh || !known) {
    known = loadAppSsh();
    known.catch(() => {
      known = null;
    });
  }
  return known;
}

/** The vault ready on this Mac for a key: made (Make up a vault password:
 * `keyName` the key the strip saves, none for Move to cloud, which moves
 * this Mac's keys; no Touch ID), or opened (Touch ID with this Mac's own
 * lock; a vault this Mac has no lock of, once, with its password, or its
 * recovery code while it has none). False when the person stopped. */
export async function vaultReady(keyName: string | null): Promise<boolean> {
  await vaultStore.refreshApp();
  const state = vaultStore.get();
  if (!state.appVault?.exists && !state.vault) return vaultUi.newVault("app", keyName);
  return openOnMac();
}

/** What a moved server's line says. */
export function movedText(t: Translate, alias: string, method: MoveMethod): string {
  return method === "key" ? t("ssh_strip.saved_key", { alias })
    : method === "cert" ? t("ssh_strip.saved_cert", { alias })
    : t("ssh_strip.saved_mac", { alias });
}

const code = (inner: ReactNode) => <code>{inner}</code>;
const strong = (inner: ReactNode) => <strong>{inner}</strong>;

export function SshStrip(props: { block: FeedBlock; blocks: FeedBlock[] }) {
  const frame = useContext(MoveContext);
  const t = useT();
  const { block } = props;
  const target = block.state === "done" && block.exitCode === 0 ? sshTarget(block.command) : null;
  // Only the last ssh to the same host in the feed.
  const latest = !!target && !props.blocks.some((b) => b.seqStart > block.seqStart &&
    b.state === "done" && sshTarget(b.command) === target);
  const wanted = frame.enabled && latest;
  const [inv, setInv] = useState<SshInventory | null>(null);
  const [reach, setReach] = useState<boolean | null>(null);
  const [hidden, setHidden] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const host: SshHost | null = target ? hostFor(inv, target) : null;

  useEffect(() => {
    if (!wanted) return;
    let live = true;
    inventory().then((got) => {
      if (live) setInv(got);
    }).catch(() => {});
    return () => {
      live = false;
    };
  }, [wanted, block.key]);

  const shown = wanted && !!host && !host.noTerminal && !hidden &&
    !askedAbout(host.alias) && !inTterm(frame.projects, host);

  useEffect(() => {
    if (!shown || !host) return;
    let live = true;
    void cloudReaches(host).then((ok) => {
      if (live) setReach(ok);
    });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown, host?.alias]);

  if (!shown || !host || !inv) return null;
  const key = keyFor(inv, host);
  const canSave = !!key?.movable && reach !== false;
  const alias = host.alias;

  const dismiss = (said: "seen" | "never") => {
    rememberAsked(alias, said);
    setHidden(true);
  };

  const move = async (method: MoveMethod) => {
    if (!frame.personal) return;
    setBusy(true);
    setProblem(null);
    try {
      const reaches = reach ?? await cloudReaches(host);
      const how: MoveMethod = reaches ? method : "mac";
      let passphrase: string | undefined;
      if (how === "key") {
        if (!key) return;
        if (!await vaultReady(key.name)) return;
        if (key.encrypted) {
          const said = await vaultUi.passphrase(key.name);
          if (said === null) return;
          passphrase = said;
        }
      } else if (how === "cert" && key?.encrypted) {
        // Let tTerm in: this Mac signs in with the key once, to add tTerm's
        // line; the engine takes the passphrase from `keys`, and only a
        // `key` server's key goes to the vault.
        const said = await vaultUi.passphrase(key.name, alias);
        if (said === null) return;
        passphrase = said;
      }
      const sent = key && (how === "key" || (how === "cert" && passphrase));
      const [result] = await moveToCloud({
        project: frame.personal.id,
        servers: [{ alias, method: how }],
        keys: sent ? [{ path: key.path, ...(passphrase ? { passphrase } : {}) }] : [],
      });
      if (!result?.ok) {
        setProblem(result?.error || t("vault_problem.something"));
        return;
      }
      rememberAsked(alias, "seen");
      setHidden(true);
      frame.notify(movedText(t, alias, how));
      frame.refresh();
      void vaultStore.reload();
    } catch (error) {
      setProblem(problemText(t, error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="ssh-strip" role="region" aria-label={t("ssh_strip.region", { alias })}>
      <div className="ssh-strip-head">
        <span className="vault-tile small" aria-hidden="true"><Cloud size={18} /></span>
        <span className="ssh-strip-text">
          <strong>{t("ssh_strip.title", { alias })}</strong>
          <span>
            {key ? t.rich("ssh_strip.text", { address: address(host), key: tilde(key.path), code })
              : t.rich("ssh_strip.text_no_key", { address: address(host), code })}
          </span>
        </span>
        <button type="button" className="icon-button small" aria-label={t("ssh_strip.not_now")}
          title={t("ssh_strip.not_now")} onClick={() => dismiss("seen")}>
          <Close size={14} />
        </button>
      </div>
      {reach === false && <p className="ssh-strip-note">{t("ssh_strip.unreachable", { alias })}</p>}
      <div className="ssh-strip-actions">
        {reach === false ? (
          <button type="button" className="button-accent" disabled={busy} onClick={() => void move("mac")}>
            {busy && <span className="spinner" aria-hidden="true" />}
            {t("ssh_strip.through_mac")}
          </button>
        ) : (
          <>
            {canSave && (
              <button type="button" className="button-accent" disabled={busy} onClick={() => void move("key")}>
                {busy ? <span className="spinner" aria-hidden="true" /> : <Key size={15} />}
                {t("ssh_strip.save")}
              </button>
            )}
            <button type="button" className={canSave ? "button-plain" : "button-accent"} disabled={busy}
              onClick={() => void move("cert")}>
              {t("ssh_strip.let_in")}
            </button>
          </>
        )}
        <button type="button" className="button-ghost" disabled={busy} onClick={() => dismiss("seen")}>
          {t("ssh_strip.not_now")}
        </button>
        <span className="push-right" />
        <button type="button" className="link-button dim" disabled={busy} onClick={() => dismiss("never")}>
          {t("ssh_strip.never", { alias })}
        </button>
      </div>
      {problem && <div className="error-box" role="alert">{problem}</div>}
      <p className="ssh-strip-explain">
        {canSave ? t.rich("ssh_strip.explain", { alias, b: strong })
          : t.rich("ssh_strip.explain_pass", { alias, b: strong })}
      </p>
    </div>
  );
}
