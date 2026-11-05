// "Add a machine", from the approved mockup: pick the project, run one
// command on the server, keep the window open, see it connect. A computer
// (from 0.0.6) runs its agent instead; the agent connects out and the window
// sees the computer come in the same way. From 0.0.8 a computer's command is
// an installer too, with autostart; starting the agent by hand stays, for
// trying one that is not released yet. From 0.1.12 the installer puts in
// the agent from tterm-app's releases, one file, no Python.

import { useCallback, useEffect, useRef, useState } from "react";
import {
  installStatus, newInstall, type Install, type InstallStatus,
  type MachineKind, type Project,
} from "./api";
import { useBriefly } from "./briefly";
import { useT } from "./i18n";
import { Check, Close, Computer, Copy, Download, Server } from "./icons";

const POLL_MS = 1500;

import { copyToClipboard } from "./clipboard";

interface Props {
  projects: Project[];
  projectId: string;
  kind: MachineKind;
  onClose: () => void;
  onConnected: () => void;
  onOpenTerminal: (machineId: string) => void;
  notYet: (what: string) => void;
}

function minutesLeft(expiresAt: string, now: number): number {
  return Math.max(0, Math.ceil((Date.parse(expiresAt) - now) / 60000));
}

export function AddMachine(props: Props) {
  const { projects, onClose, onConnected, notYet } = props;
  const t = useT();
  const addable = projects.filter((p) => p.role === "owner" || p.role === "admin");
  const [projectId, setProjectId] = useState(props.projectId);
  const [kind, setKind] = useState<MachineKind>(props.kind);
  const [osPlatform, setOsPlatform] = useState<"unix" | "windows">("unix");
  const [install, setInstall] = useState<Install | null>(null);
  const [status, setStatus] = useState<InstallStatus | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  // Copied, with a check, for a moment after Copy (0.1.13); then Copy again.
  const [copied, showCopied, hideCopied] = useBriefly<true>();
  const [copiedHand, showCopiedHand, hideCopiedHand] = useBriefly<true>();
  const [now, setNow] = useState(Date.now());
  const dialog = useRef<HTMLElement>(null);
  const announced = useRef(false);
  // The page passes new functions each time it draws, every ten seconds
  // while a computer is listed. Kept here, they do not restart the watch
  // below or take the focus back to the dialog each time.
  const handlers = useRef({ onClose, onConnected });
  useEffect(() => {
    handlers.current = { onClose, onConnected };
  });

  const project = projects.find((p) => p.id === projectId);

  const fresh = useCallback(() => {
    setInstall(null);
    setStatus(null);
    setProblem(null);
    hideCopied();
    hideCopiedHand();
    announced.current = false;
    newInstall(projectId, kind)
      .then(setInstall)
      .catch((e: Error) => setProblem(e.message));
  }, [projectId, kind, hideCopied, hideCopiedHand]);

  // A command for the chosen project and kind of machine.
  useEffect(() => {
    fresh();
  }, [fresh]);

  // Watch the install until it connects or expires; after that nothing
  // more can change, so the asking stops.
  useEffect(() => {
    if (!install) return;
    let stopped = false;
    let timer: number | undefined;
    const tick = async () => {
      setNow(Date.now());
      try {
        const next = await installStatus(install.id);
        if (stopped) return;
        setStatus(next);
        if (next.state === "connected" || next.state === "expired") {
          window.clearInterval(timer);
        }
        if (next.state === "connected" && !announced.current) {
          announced.current = true;
          handlers.current.onConnected();
        }
      } catch {
        // The core may be restarting; the next tick tries again.
      }
    };
    timer = window.setInterval(tick, POLL_MS);
    tick();
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [install]);

  const done = status?.state === "connected";

  useEffect(() => {
    dialog.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      // Handled here: what lies under the dialog (the account page) lets
      // this Esc be.
      if (event.key === "Escape") {
        event.preventDefault();
        handlers.current.onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const copy = async (text: string | null | undefined, done: () => void) => {
    if (!text) return;
    const ok = await copyToClipboard(text);
    if (ok) {
      done();
    } else {
      notYet(t("add_machine.copy_failed"));
    }
  };

  const state = status?.state ?? "waiting";
  const left = install ? minutesLeft(install.expiresAt, now) : 10;
  const works = t("add_machine.works_once", { n: left });

  return (
    <div className="scrim">
      <section ref={dialog} className="dialog" role="dialog" aria-modal="true"
        aria-labelledby="am-title" tabIndex={-1}>
        <div className="dialog-head">
          <div className="dialog-title">
            <h2 id="am-title">{t("add_machine.title")}</h2>
            <div className="dialog-sub">
              <label htmlFor="am-project">{t("add_machine.to_project")}</label>
              <select id="am-project" value={projectId} disabled={done}
                onChange={(e) => setProjectId(e.target.value)}>
                {addable.map((p) => (
                  <option key={p.id} value={p.id}>{p.code} · {p.name}</option>
                ))}
              </select>
            </div>
          </div>
          <button type="button" className="icon-button small"
            aria-label={t("common.close")} onClick={onClose}>
            <Close size={16} />
          </button>
        </div>

        {!done && (
          <div className="segmented" role="group" aria-label={t("add_machine.kind")}>
            <button type="button" aria-pressed={kind === "server"}
              onClick={() => setKind("server")}>
              <Server size={15} /> {t("add_machine.server")}
            </button>
            <button type="button" aria-pressed={kind === "computer"}
              onClick={() => setKind("computer")}>
              <Computer size={15} /> {t("add_machine.computer")}
            </button>
          </div>
        )}

        {kind === "computer" && !done && (
          <>
            <ol className="dialog-steps">
              <li>
                <span className="step-number" aria-hidden="true">1</span>
                <div className="dialog-step">
                  <strong>{t("add_machine.run_computer")}</strong>
                  <div className="platform-toggle" role="tablist">
                    <button
                      type="button"
                      className={`platform-btn ${osPlatform === "unix" ? "active" : ""}`}
                      onClick={() => setOsPlatform("unix")}
                    >
                      macOS / Linux {/* i18n-ignore */}
                    </button>
                    <button
                      type="button"
                      className={`platform-btn ${osPlatform === "windows" ? "active" : ""}`}
                      onClick={() => setOsPlatform("windows")}
                    >
                      Windows (PowerShell) {/* i18n-ignore */}
                    </button>
                  </div>
                  <div className="command-box">
                    <code>
                      {install
                        ? (osPlatform === "windows"
                            ? (install.windowsCommand || install.command)
                            : install.command)
                        : "…"}
                    </code>
                    <button type="button" className="button-accent"
                      onClick={() => copy(
                        osPlatform === "windows"
                          ? (install?.windowsCommand || install?.command)
                          : install?.command,
                        () => showCopied(true))}
                      disabled={!install}>
                      {copied ? <Check size={14} className="pressed-mark" />
                        : <Copy size={14} />}
                      {copied ? t("common.copied") : t("common.copy")}
                    </button>
                  </div>
                  <span className="hint">
                    {osPlatform === "windows"
                      ? "Запустите команду в обычном PowerShell от своего имени (без Administrator)." /* i18n-ignore */
                      : t("add_machine.hint_computer", { works })}
                  </span>
                  {osPlatform === "windows" && (
                    <>
                      <div style={{ marginTop: 10, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                        <a
                          href="/tterm-agent.exe"
                          className="button-accent"
                          download="tterm-agent.exe"
                          style={{ display: "inline-flex", alignItems: "center", gap: 6, textDecoration: "none" }}
                        >
                          <Download size={14} />
                          Скачать программу (.exe) {/* i18n-ignore */}
                        </a>
                        <a
                          href={install?.command ? `/c/${install.command.split("/c/")[1]?.split(" ")[0]}.bat` : "#"}
                          className="button-plain"
                          download="tterm-setup.bat"
                          style={{ display: "inline-flex", alignItems: "center", gap: 6, textDecoration: "none" }}
                        >
                          <Download size={14} />
                          Скрипт (.bat) {/* i18n-ignore */}
                        </a>
                      </div>
                      <details className="by-hand" style={{ marginTop: 12 }}>
                        <summary style={{ cursor: "pointer", color: "var(--color-accent, #3b82f6)", fontWeight: 500 }}>
                          {/* i18n-ignore */}
                          💡 Если Windows 11 блокирует («Установить из магазина приложений» / «Только из Store»)
                        </summary>
                        <div style={{ padding: "8px 12px", background: "rgba(255,255,255,0.04)", borderRadius: 6, marginTop: 6, fontSize: 13, lineHeight: 1.5 }}>
                          {/* i18n-ignore */}
                          <p style={{ margin: "0 0 6px 0" }}>В Windows 11 по умолчанию может быть включен строгий режим «Только из Microsoft Store». Чтобы разрешить подключение:</p>
                          <ol style={{ margin: "0 0 8px 18px", padding: 0 }}>
                            {/* i18n-ignore */}
                            <li>Нажмите <kbd>Win + I</kbd> (Параметры) → <strong>Приложения</strong> → <strong>Дополнительные параметры приложений</strong>.</li>
                            {/* i18n-ignore */}
                            <li>В пункте <strong>«Выберите, откуда получать приложения»</strong> переключите с «Только из Store» на <em>«Из любого источника»</em>.</li>
                            {/* i18n-ignore */}
                            <li>Если Windows в S-режиме: Параметры → Система → Активация → <em>Выйти из S-режима</em>.</li>
                            {/* i18n-ignore */}
                            <li>Скопируйте команду выше, вставьте в обычный PowerShell (без Administrator) и нажмите Enter.</li>
                          </ol>
                          <p style={{ margin: 0, color: "var(--color-text-secondary, #888)", fontSize: 12 }}>
                            {"* Python из Microsoft Store не требуется: агент tTerm работает на встроенном системном .NET." /* i18n-ignore */}
                          </p>
                        </div>
                      </details>
                    </>
                  )}
                  {install?.byHand && (
                    <details className="by-hand">
                      <summary>{t("add_machine.by_hand")}</summary>
                      <span className="hint">
                        {t("add_machine.by_hand_hint", { version: "0.11.0" })}
                      </span>
                      <div className="command-box">
                        <code>{install.byHand}</code>
                        <button type="button" className="button-plain"
                          onClick={() => copy(install.byHand,
                            () => showCopiedHand(true))}>
                          {copiedHand ? <Check size={14} className="pressed-mark" />
                            : <Copy size={14} />}
                          {copiedHand ? t("common.copied") : t("common.copy")}
                        </button>
                      </div>
                    </details>
                  )}
                </div>
              </li>
              <li>
                <span className="step-number" aria-hidden="true">2</span>
                <div className="dialog-step">
                  <strong>{t("add_machine.keep_open")}</strong>
                  <Progress state={state} problem={problem}
                    error={status?.error ?? null} onAgain={fresh}
                    project={project?.name ?? null} kind="computer" />
                </div>
              </li>
            </ol>
            <details className="explain">
              <summary>{t("add_machine.what_command")}</summary>
              <ul>
                <li>{t("add_machine.what_command_puts",
                  { folder: "~/.tterm-web", bot_folder: "~/.tterm" })}</li>
                <li>{t("add_machine.what_command_updates")}</li>
                <li>{t("add_machine.what_command_key")}</li>
                <li>{t("add_machine.what_command_runs")}</li>
                <li>{t("add_machine.what_command_uninstall",
                  { command: "~/.tterm-web/uninstall.sh" })}</li>
              </ul>
            </details>
          </>
        )}

        {kind === "server" && !done && (
          <>
            <ol className="dialog-steps">
              <li>
                <span className="step-number" aria-hidden="true">1</span>
                <div className="dialog-step">
                  <strong>{t("add_machine.run_server")}</strong>
                  <div className="command-box">
                    <code>{install ? install.command : "…"}</code>
                    <button type="button" className="button-accent"
                      onClick={() => copy(install?.command, () => showCopied(true))}
                      disabled={!install}>
                      {copied ? <Check size={14} className="pressed-mark" />
                        : <Copy size={14} />}
                      {copied ? t("common.copied") : t("common.copy")}
                    </button>
                  </div>
                  <span className="hint">
                    {t("add_machine.hint_server", { works })}
                  </span>
                </div>
              </li>
              <li>
                <span className="step-number" aria-hidden="true">2</span>
                <div className="dialog-step">
                  <strong>{t("add_machine.keep_open")}</strong>
                  <Progress state={state} problem={problem}
                    error={status?.error ?? null} onAgain={fresh}
                    project={project?.name ?? null} kind="server" />
                </div>
              </li>
            </ol>
            <details className="explain">
              <summary>{t("add_machine.what_script")}</summary>
              <ul>
                <li>{t("add_machine.what_script_user")}</li>
                <li>{t("add_machine.what_script_certificates")}</li>
                <li>{t("add_machine.what_script_sudo")}</li>
                <li>{t("add_machine.what_script_safe")}</li>
              </ul>
            </details>
          </>
        )}

        {done && status?.machine && (
          <div className="connected">
            <div className="connected-head">
              <span className="big-check" aria-hidden="true"><Check size={22} /></span>
              <div role="status" className="connected-text">
                <strong>{t("add_machine.connected", { name: status.machine.name })}</strong>
                <span>
                  {[status.machine.os, status.machine.host,
                    t("add_machine.tabs_label", { label: status.machine.label })]
                    .filter(Boolean).join(" · ")}
                </span>
              </div>
            </div>
            <div className="button-row">
              <button type="button" className="button-accent big"
                onClick={() => status.machine &&
                  props.onOpenTerminal(status.machine.id)}>
                {t("add_machine.open_terminal")}
              </button>
              <button type="button" className="button-plain" onClick={fresh}>
                {t("add_machine.add_another")}
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function Progress({ state, problem, error, onAgain, project, kind }: {
  state: string;
  problem: string | null;
  error: string | null;
  onAgain: () => void;
  project: string | null;
  kind: MachineKind;
}) {
  const t = useT();
  const computer = kind === "computer";
  if (problem) {
    return (
      <div className="error-box" role="alert">
        {t("add_machine.no_command", { why: problem })}
        <button type="button" className="button-plain" onClick={onAgain}>
          {t("common.try_again")}
        </button>
      </div>
    );
  }
  if (state === "expired") {
    return (
      <div className="error-box" role="alert">
        {computer ? t("add_machine.expired_token") : t("add_machine.expired_command")}
        <button type="button" className="button-plain" onClick={onAgain}>
          {t("add_machine.new_command")}
        </button>
      </div>
    );
  }
  if (state === "failed") {
    return (
      <div className="error-box" role="alert">
        <span>{error ?? (computer ? t("add_machine.failed_computer")
          : t("add_machine.failed_server"))}</span>
        <span className="hint">{t("add_machine.still_works")}</span>
      </div>
    );
  }
  return (
    <>
      <span role="status" className="waiting">
        <span className="spinner" aria-hidden="true" />
        {state === "connecting"
          ? computer ? t("add_machine.agent_in") : t("add_machine.server_in")
          : computer ? t("add_machine.waiting_agent") : t("add_machine.waiting_server")}
      </span>
      <span className="hint">
        {computer
          ? project === null ? t("add_machine.appears_computer_unnamed")
            : t("add_machine.appears_computer", { project })
          : project === null ? t("add_machine.appears_server_unnamed")
            : t("add_machine.appears_server", { project })}
      </span>
    </>
  );
}
