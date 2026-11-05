// Move to cloud (0.1.17, Vault.dc, move and moved), in the account's menu
// right under Settings, only in tTerm for Mac: the servers this Mac knows
// (~/.ssh/config, known_hosts and the ssh run here) go to the person's
// account, each the way chosen for it: My key (the key goes to the vault;
// the server stays as it is), tTerm's pass (tTerm's own line on the server,
// the key stays here) or Through this Mac (nothing moves; the Mac connects
// while it is on: a server behind a VPN, or one whose key cannot leave
// this Mac). The keys of ~/.ssh: only the ticked ones go to the vault.
// Nothing moves until Move is pressed; then, server by server, what came of
// it, with Try again and Change for one that did not. From 0.1.26 a new
// vault is made with the password the person makes up (no Touch ID), and
// once a server moved with its own key, the result says how to open it from
// another computer (VaultPass.dc, moved).

import { useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { moveToCloud, type MoveMethod, type MoveResult, type SshHost, type SshInventory, type SshKeyFile } from "./api";
import { PageHead, useEscCloses } from "./Account";
import { list, useT, type Translate } from "./i18n";
import { Alert, Check, CloudUp, Globe, Key, Lock, Server } from "./icons";
import { keyKind } from "./Keys.tsx";
import { inventory, MoveContext, vaultReady } from "./SshStrip";
import {
  address, askedAbout, cloudReaches, inTterm, jumpOf, keyFor, lastUsedMs, samePath,
} from "./sshHosts";
import { agoLong } from "./time";
import { problemText, vaultUi } from "./VaultDialogs";
import { shortFingerprint } from "./vault/ssh";
import { vaultStore, useVault } from "./vault/store";

interface Row {
  host: SshHost;
  on: boolean;
  method: MoveMethod;
  /** The cloud reaches it, or its bastion; null while asked. */
  reach: boolean | null;
  key: SshKeyFile | null;
  /** Why it cannot be moved: a git host, or one in tTerm already. */
  off: "git" | "there" | null;
}

/** Where the moved servers open from another computer: the tTerm Web the
 * app is signed in to, as the engine names it in GET /api/app/vault
 * ("app.tterm.net", from 0.8.0); else tTerm Web (vault-password-texts.md,
 * 10). */
const WEB = "tTerm Web";

const METHODS: { value: MoveMethod; label: string }[] = [
  { value: "key", label: "move.method_key" },
  { value: "cert", label: "move.method_cert" },
  { value: "mac", label: "move.method_mac" },
];

/** The way a server goes by itself: its own key where it can, through this
 * Mac where the cloud does not reach it or its key cannot leave. */
function defaultMethod(reach: boolean | null, key: SshKeyFile | null): MoveMethod {
  if (reach === false) return "mac";
  if (key?.movable) return "key";
  if (key && !key.movable) return "mac";
  return "cert";
}

function whereFrom(t: Translate, host: SshHost): string {
  const parts: string[] = [];
  if (host.from.includes("config")) parts.push("~/.ssh/config");
  else if (host.from.includes("known_hosts")) parts.push("known_hosts");
  const used = lastUsedMs(host);
  if (used) parts.push(t("move.ran_ago", { alias: host.alias, ago: agoLong(used, t) }));
  else if (host.from.includes("history")) parts.push(t("move.ran_here", { alias: host.alias }));
  return parts.join(" · ");
}

function rowNote(t: Translate, row: Row): { text: string; amber: boolean } {
  const { host } = row;
  if (row.off === "git") return { text: t("move.note_git"), amber: false };
  if (row.off === "there") return { text: t("move.note_there"), amber: false };
  const jump = jumpOf(host);
  if (row.reach === null) return { text: t("move.note_checking"), amber: false };
  if (jump) {
    return row.reach
      ? { text: t("move.note_jump", { jump: jump.host }), amber: false }
      : { text: t("move.note_jump_far", { jump: jump.host }), amber: true };
  }
  if (!row.reach) return { text: t("move.note_far"), amber: true };
  if (row.key && !row.key.movable && row.method === "mac") {
    return { text: t("move.note_key_stays", { key: row.key.name }), amber: true };
  }
  return { text: whereFrom(t, host) || t("move.note_known"), amber: false };
}

const WHY: Record<string, string> = {
  "security key": "move.key_security",
  "agent only": "move.key_agent",
  type: "move.key_type",
};

export function MoveToCloud(props: {
  onClose: () => void;
  onOpenTerminal: (machineId: string) => void;
}) {
  const t = useT();
  const frame = useContext(MoveContext);
  const v = useVault();
  const [inv, setInv] = useState<SshInventory | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [keyTicks, setKeyTicks] = useState<Record<string, boolean>>({});
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<{ result: MoveResult; method: MoveMethod; row: Row }[] | null>(null);
  const [movedKeys, setMovedKeys] = useState<string[]>([]);
  const nothingTyped = useRef(false);
  nothingTyped.current = busy;
  useEscCloses(props.onClose, nothingTyped);

  useEffect(() => {
    let live = true;
    inventory(true).then((got) => {
      if (!live) return;
      setInv(got);
      setRows(got.hosts.map((host): Row => {
        const off = host.noTerminal ? "git" : inTterm(frame.projects, host) ? "there" : null;
        const key = keyFor(got, host);
        // A server only known_hosts knows (no Host in the config, never typed
        // in tTerm) may be an old one: listed, but not ticked.
        const onlyKnown = host.from.length > 0 && host.from.every((f) => f === "known_hosts");
        return { host, on: !off && !onlyKnown && askedAbout(host.alias) !== "never",
          method: defaultMethod(null, key), reach: off ? false : null, key, off };
      }));
      // Whether the cloud reaches each, a few at a time.
      const queue = got.hosts.filter((h) => !h.noTerminal && !inTterm(frame.projects, h));
      const next = async (): Promise<void> => {
        const host = queue.shift();
        if (!host || !live) return;
        const reach = await cloudReaches(host);
        if (!live) return;
        setRows((all) => all.map((r) => (r.host.alias === host.alias
          ? { ...r, reach, method: r.reach === null ? defaultMethod(reach, r.key) : r.method } : r)));
        await next();
      };
      void Promise.all([next(), next(), next()]);
    }).catch((error: Error) => {
      if (live) setProblem(problemText(t, error));
    });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const keys = inv?.keys ?? [];
  /** The ticked servers that go with their own key, by key path. */
  const usedBy = useMemo(() => {
    const out: Record<string, string[]> = {};
    for (const r of rows) {
      if (r.on && r.method === "key" && r.key) (out[r.key.path] ??= []).push(r.host.alias);
    }
    return out;
  }, [rows]);
  const ticked = (k: SshKeyFile) => k.movable && (keyTicks[k.path] ?? !!usedBy[k.path]);
  const chosen = rows.filter((r) => r.on && !r.off);
  const inVault = new Set(v.vault?.keys.map((k) => k.fingerprint) ?? []);

  const set = (alias: string, change: Partial<Row>) =>
    setRows((all) => all.map((r) => (r.host.alias === alias ? { ...r, ...change } : r)));

  const run = async (servers: Row[]): Promise<void> => {
    if (!frame.personal || !servers.length) return;
    setBusy(true);
    setProblem(null);
    try {
      const own = servers.filter((r) => r.method === "key");
      const lettingIn = servers.filter((r) => r.method === "cert");
      // To the vault: the ticked keys of the servers that go with their own key.
      const toVault = keys.filter((k) => ticked(k) && own.some((r) => r.key?.path === k.path));
      // Let tTerm in signs in with a server's key once, to add tTerm's line:
      // a key with a passphrase goes along for that (the engine takes the
      // passphrase of the server's first identity file in `keys`), and it
      // stays on this Mac.
      const signIn = keys.filter((k) => k.encrypted && !toVault.includes(k) &&
        lettingIn.some((r) => r.key?.path === k.path));
      if (own.length && !await vaultReady(null)) return;
      const phrases = new Map<string, string>();
      for (const k of [...toVault, ...signIn]) {
        if (!k.encrypted) continue;
        const forServers = signIn.includes(k)
          ? list(lettingIn.filter((r) => r.key?.path === k.path).map((r) => r.host.alias), t.lang) : null;
        const said = await vaultUi.passphrase(k.name, forServers);
        if (said === null) return;
        phrases.set(k.path, said);
      }
      const entry = (k: SshKeyFile) => {
        const passphrase = phrases.get(k.path);
        return passphrase ? { path: k.path, passphrase } : { path: k.path };
      };
      // The engine moves a `key` server with the first of its identity files
      // that `keys` holds: a key that only signs in for Let tTerm in goes in
      // a request of its own when such a server could take it, so that only
      // ticked keys go to the vault.
      const apart = own.length > 0 && signIn.some((k) =>
        own.some((r) => r.host.identityFiles.some((f) => samePath(f, k.path))));
      const requests = apart
        ? [{ servers: servers.filter((r) => r.method !== "cert"), keys: toVault },
          { servers: lettingIn, keys: signIn }]
        : [{ servers, keys: [...toVault, ...signIn] }];
      const got: MoveResult[] = [];
      let stopped: string | null = null;
      for (const one of requests) {
        try {
          got.push(...await moveToCloud({ project: frame.personal.id,
            servers: one.servers.map((r) => ({ alias: r.host.alias, method: r.method })),
            keys: one.keys.map(entry) }));
        } catch (error) {
          // Nothing moved: said as before. After a first request that went
          // through, its servers keep their results and the rest say why.
          if (!got.length) throw error;
          stopped = problemText(t, error) ?? t("vault_problem.something");
          break;
        }
      }
      const byAlias = new Map(got.map((r) => [r.alias, r]));
      const next = servers.map((row) => ({ row, method: row.method,
        result: byAlias.get(row.host.alias) ?? { alias: row.host.alias, ok: false, error: stopped ?? undefined } }));
      setResults((was) => {
        if (!was) return next;
        // Try again on one: its line changes, the others stay.
        return was.map((x) => next.find((n) => n.row.host.alias === x.row.host.alias) ?? x);
      });
      setMovedKeys((was) => [...new Set([...was, ...toVault.filter((k) =>
        own.some((r) => r.key?.path === k.path && byAlias.get(r.host.alias)?.ok)).map((k) => k.name)])]);
      if (stopped) setProblem(stopped);
      frame.refresh();
      void vaultStore.reload();
    } catch (error) {
      setProblem(problemText(t, error));
    } finally {
      setBusy(false);
    }
  };

  if (results) {
    const ok = results.filter((r) => r.result.ok).length;
    const project = frame.personal?.name ?? "";
    // How to open them from another computer (0.1.26): once a server went
    // with its own key; and which ones open only through this Mac.
    const byKey = results.some((r) => r.result.ok && r.method === "key");
    const throughMac = results.filter((r) => r.result.ok && r.method === "mac")
      .map((r) => r.result.machine?.name ?? r.row.host.alias);
    const strong = (inner: ReactNode) => <strong>{inner}</strong>;
    return (
      <main className="account-view move-view" aria-labelledby="md-title">
        <div className="move-head">
          <h1 id="md-title">{t("moved.title", { ok, n: results.length })}</h1>
          <p>{t("moved.text", { project })}</p>
        </div>
        <ul className="account-card move-list">
          {results.map(({ row, method, result }) => {
            const jump = jumpOf(row.host);
            const note = result.ok
              ? method === "key" ? (jump ? t("moved.key_jump", { jump: jump.host }) : t("moved.key"))
                : method === "cert" ? (jump ? t("moved.cert_jump", { jump: jump.host }) : t("moved.cert"))
                : t("moved.mac")
              : result.error || t("moved.failed");
            return (
              <li key={row.host.alias} className="move-row">
                <span className={result.ok ? "move-mark ok" : "move-mark bad"} aria-hidden="true">
                  {result.ok ? <Check size={14} /> : <Alert size={14} />}
                </span>
                <span className="move-text">
                  <strong>{result.machine?.name ?? row.host.alias}</strong>
                  <span className={result.ok ? "" : "amber"}>
                    {result.ok ? note : t("moved.failed_text", { why: note })}
                  </span>
                </span>
                {result.ok && result.machine ? (
                  <button type="button" className="link-button" onClick={() => props.onOpenTerminal(result.machine!.id)}>
                    {t("moved.open")}
                  </button>
                ) : !result.ok && (
                  <span className="button-row">
                    <button type="button" className="button-plain small" disabled={busy}
                      onClick={() => void run([row])}>
                      {t("common.try_again")}
                    </button>
                    <button type="button" className="button-plain small" disabled={busy}
                      onClick={() => {
                        setRows((all) => all.map((r) => ({ ...r, on: r.host.alias === row.host.alias })));
                        setResults(null);
                      }}>
                      {t("moved.change")}
                    </button>
                  </span>
                )}
              </li>
            );
          })}
        </ul>
        {problem && <div className="error-box" role="alert">{problem}</div>}
        {byKey && (
          <section className="move-how" aria-labelledby="md-how">
            <h2 id="md-how"><Globe size={18} />{t("moved.how_title")}</h2>
            <ol>
              <li><span className="move-step" aria-hidden="true">1</span>
                <span>{t.rich("moved.how_1", { site: v.appVault?.web || WEB, b: strong })}</span></li>
              <li><span className="move-step" aria-hidden="true">2</span>
                <span>{t.rich("moved.how_2", { b: strong })}</span></li>
              <li><span className="move-step" aria-hidden="true">3</span>
                <span>{t("moved.how_3")}</span></li>
            </ol>
            {throughMac.length > 0 && (
              <p className="move-how-mac">
                {throughMac.length === 1
                  ? t.rich("moved.how_mac_one", { servers: throughMac[0], b: strong })
                  : t.rich("moved.how_mac_many", { servers: list(throughMac, t.lang), b: strong })}
              </p>
            )}
          </section>
        )}
        <div className="account-card move-foot">
          <Lock size={18} />
          <span>
            {movedKeys.length
              ? t.rich(movedKeys.length === 1 ? "moved.keys_one" : "moved.keys_many",
                { keys: list(movedKeys, t.lang), b: (inner) => <strong>{inner}</strong> })
              : t("moved.no_keys")}
          </span>
          <button type="button" className="button-accent big" onClick={props.onClose}>{t("common.done")}</button>
        </div>
      </main>
    );
  }

  return (
    <main className="account-view move-view" aria-labelledby="mv-title">
      <PageHead title={t("move.title")} id="mv-title" onClose={props.onClose} />
      <p className="move-lead"><CloudUp size={18} />{t("move.text")}</p>

      <section className="account-section" aria-labelledby="mv-servers">
        <div className="move-section-head">
          <h2 id="mv-servers">{t("move.servers")}</h2>
          <span>{t.rich("move.servers_from", { code: (inner) => <code>{inner}</code> })}</span>
        </div>
        {!inv && !problem && (
          <div className="account-card vault-state"><div className="waiting"><span className="spinner" />{t("move.looking")}</div></div>
        )}
        {inv && rows.length === 0 && <div className="account-card vault-state">{t("move.no_servers")}</div>}
        {rows.length > 0 && (
          <ul className="account-card move-list">
            {rows.map((row) => {
              const note = rowNote(t, row);
              const off = !!row.off;
              return (
                <li key={row.host.alias} className={off ? "move-row off" : "move-row"}>
                  <input type="checkbox" checked={row.on && !off} disabled={off || busy}
                    aria-label={t("move.tick_server", { name: row.host.alias })}
                    onChange={(e) => set(row.host.alias, { on: e.target.checked })} />
                  <Server size={16} />
                  <span className="move-text">
                    <strong>
                      {row.host.alias}
                      <span className="move-addr">
                        {jumpOf(row.host) ? t("move.addr_via", { address: address(row.host), jump: jumpOf(row.host)!.host })
                          : address(row.host)}
                      </span>
                    </strong>
                    <span className={note.amber ? "amber" : ""}>{note.text}</span>
                  </span>
                  <select className={row.method === "key" && !off ? "move-method mine" : "move-method"}
                    value={row.method} disabled={off || busy}
                    aria-label={t("move.how", { name: row.host.alias })}
                    onChange={(e) => set(row.host.alias, { method: e.target.value as MoveMethod })}>
                    {METHODS.map((m) => (
                      <option key={m.value} value={m.value}
                        disabled={(m.value === "key" && !row.key?.movable) ||
                          (m.value !== "mac" && row.reach === false)}>
                        {t(m.label)}
                      </option>
                    ))}
                  </select>
                </li>
              );
            })}
          </ul>
        )}
        <div className="move-ways">
          <div className="move-way mine">
            <strong>{t("move.method_key")}</strong>
            <span>{t("move.way_key")}</span>
          </div>
          <div className="move-way">
            <strong>{t("move.method_cert")}</strong>
            <span>{t("move.way_cert")}</span>
          </div>
          <div className="move-way">
            <strong>{t("move.method_mac")}</strong>
            <span>{t("move.way_mac")}</span>
          </div>
        </div>
      </section>

      {keys.length > 0 && (
        <section className="account-section" aria-labelledby="mv-keys">
          <div className="move-section-head">
            <h2 id="mv-keys">{t("move.keys")}</h2>
            <span>{t("move.keys_note")}</span>
          </div>
          <ul className="account-card move-list">
            {keys.map((k) => {
              const users = usedBy[k.path] ?? [];
              const on = ticked(k);
              const note = !k.movable ? t(WHY[k.why ?? "type"] ?? "move.key_type")
                : inVault.has(k.fingerprint) ? t("move.key_in_vault")
                : users.length === 1 ? t("move.key_used_one", { servers: users[0] })
                : users.length ? t("move.key_used_many", { servers: list(users, t.lang) })
                : t("move.key_unused");
              return (
                <li key={k.path} className={k.movable ? "move-row" : "move-row off"}>
                  <input type="checkbox" checked={on} disabled={!k.movable || busy}
                    aria-label={t("move.tick_key", { name: k.name })}
                    onChange={(e) => setKeyTicks((was) => ({ ...was, [k.path]: e.target.checked }))} />
                  <Key size={16} />
                  <span className="move-text">
                    <strong className="mono">
                      {k.name}
                      <span className="move-addr ui" title={k.fingerprint}>
                        {keyKind(k.type)}{k.fingerprint ? ` · ${shortFingerprint(k.fingerprint)}` : ""}
                      </span>
                    </strong>
                    <span className={on ? "amber" : ""}>
                      {note}{k.encrypted && k.movable ? ` · ${t("move.key_passphrase")}` : ""}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {problem && <div className="error-box" role="alert">{problem}</div>}

      <div className="account-card move-foot">
        <Lock size={20} />
        <span>{t("move.vault_note")}</span>
        <button type="button" className="button-accent big" disabled={busy || !chosen.length || !frame.personal}
          onClick={() => void run(chosen)}>
          {busy && <span className="spinner" aria-hidden="true" />}
          {t("move.go", { n: chosen.length })}
        </button>
      </div>
    </main>
  );
}
