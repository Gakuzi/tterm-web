// The machines page: each machine with its passport, what tTerm Web learned
// about it when it connected (over SSH from a server, through the agent from
// a computer), a button for a new terminal, and the terminals already
// running on it. A computer is online only while its agent runs. The owner
// and admins can remove a machine here (from 0.0.8). In the app before
// signing in (0.1.4) there is only the computer it runs on: nothing to
// remove, and Add a machine says what signing in brings (0.1.5). From
// 0.1.28 (the canvas, version 109) a machine closed on this device says so,
// its button has the lock (the keys first, then the terminal) and its
// terminals are dimmed, each with a lock, as in the sidebar.

import type { Machine, Passport, Project, Role, TerminalInfo } from "./api";
import { colorClass } from "./colors";
import { useT, type Translate } from "./i18n";
import { Computer, Lock, Plus, Server, TerminalIcon, Trash } from "./icons";
import { lastSeen } from "./time";

interface Props {
  projects: Project[];
  terminals: TerminalInfo[];
  /** A machine closed on this device (0.1.28, keysHere.ts). */
  closed: (machine: Machine) => boolean;
  onAdd: (projectId: string) => void;
  onOpenTerminal: (machineId: string, projectId?: string) => void;
  onGoTo: (terminalId: string) => void;
  onRemove: (machine: Machine) => void;
  /** The app before signing in: this computer only. */
  local?: boolean;
}

/** Whether this role may add and remove machines. */
export function canManage(role: Role): boolean {
  return role === "owner" || role === "admin";
}

/** What sudo is like there: works, asks for a password, or is not there. */
export function sudoText(p: Passport, t: Translate): string | null {
  if (p.sudo === undefined) return null;
  if (p.sudo) return t("machines.sudo_works");
  return p.sudo_password ? t("machines.sudo_password") : t("machines.sudo_missing");
}

/** "16 GB", "7.5 GB": as the language writes numbers and the unit. */
function gb(kb: number | undefined, t: Translate): string | null {
  if (!kb) return null;
  const value = kb / 1024 / 1024;
  const digits = value >= 10 ? 0 : 1;
  const size = new Intl.NumberFormat(t.lang, {
    minimumFractionDigits: digits, maximumFractionDigits: digits, useGrouping: false,
  }).format(value);
  return t("machines.gb", { size });
}

function facts(p: Passport, t: Translate): [string, string][] {
  const rows: [string, string | null][] = [
    [t("machines.system"), [p.os, p.arch].filter(Boolean).join(", ") || null],
    [t("machines.kernel"), p.kernel ?? null],
    [t("machines.cpu"), p.cpus ? t("machines.cores", { n: p.cpus }) : null],
    [t("machines.memory"), gb(p.memory_kb, t)],
    [t("machines.disk"), p.disk_total_kb
      ? t("machines.disk_free", { free: gb(p.disk_free_kb, t) ?? "?",
        total: gb(p.disk_total_kb, t) ?? "?" }) : null],
    [t("machines.packages"), p.package_manager ?? null],
    [t("machines.shell"), p.shell ? (p.shells?.length
      ? t("machines.shell_has", { shell: p.shell, shells: p.shells.join(", ") })
      : p.shell) : null],
    ["sudo", sudoText(p, t)],
    [t("machines.commands"), p.commands_count
      ? t("machines.commands_known", { n: p.commands_count }) : null],
    // tTerm for the computer keeps the link itself from 0.4.0, and says
    // "app 0.4.0" where an agent says its version.
    [t("machines.agent"), p.agent ? (p.agent.startsWith("app ") ? `tTerm ${p.agent}`
      : `tterm-agent ${p.agent}`) : null],
    [t("machines.account"), p.user ?? null],
  ];
  return rows.filter((row): row is [string, string] => row[1] !== null);
}

function MachineCard({ machine, code, projectId, terminals, manage, shut, onOpenTerminal, onGoTo,
  onRemove }: {
  machine: Machine;
  code: string;
  projectId?: string;
  terminals: TerminalInfo[];
  manage: boolean;
  /** Closed on this device (0.1.28). */
  shut: boolean;
  onOpenTerminal: (machineId: string, projectId?: string) => void;
  onGoTo: (terminalId: string) => void;
  onRemove: (machine: Machine) => void;
}) {
  const t = useT();
  const passport = machine.passport ?? {};
  const computer = machine.kind === "computer";
  const offline = computer && !machine.online;
  const lockTitle = computer ? t("sidebar.keys_closed_mac")
    : t("sidebar.keys_closed_new", { name: machine.name });
  return (
    <article className="machine-card" aria-label={machine.name}>
      <div className="machine-top">
        <span className="tile" aria-hidden="true">
          {computer ? <Computer size={20} /> : <Server size={20} />}
        </span>
        <div className="machine-names">
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <strong>{machine.name}</strong>
            {machine.shared && (
              <span style={{ fontSize: 11, background: "rgba(56, 189, 248, 0.15)", color: "#38bdf8", padding: "1px 6px", borderRadius: 4 }}>
                Общая {/* i18n-ignore */}
              </span>
            )}
          </div>
          <span>
            {computer && (
              <span className="machine-state">
                <span className={offline ? "dot away" : "dot open"}
                  aria-hidden="true" />
                {offline ? (machine.lastSeen
                  ? t("machines.offline_seen", { seen: lastSeen(machine.lastSeen, t) })
                  : t("machines.offline")) : t("machines.online")}
              </span>
            )}
            {shut && (
              <span className="machine-closed">
                <Lock size={12} />
                {t("machines.closed")}
              </span>
            )}
            {[machine.os, machine.host].filter(Boolean).join(" · ")}
          </span>
        </div>
        <span className="chip">{code}/{machine.name}</span>
      </div>
      {offline && (
        <p className="machine-note">
          {t("machines.offline_note")}
        </p>
      )}
      <dl className="facts">
        {facts(passport, t).map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <div className="button-row">
        <button type="button" className="button-accent" disabled={offline}
          title={offline ? t("machines.offline_title") : shut ? lockTitle : undefined}
          onClick={() => onOpenTerminal(machine.id, projectId)}>
          {shut && <Lock size={14} />}
          {t("machines.open_terminal")}
        </button>
        {terminals.map((term) => (shut ? (
          // Its card in its tab: the keys, then the terminal from where it is.
          <button key={term.id} type="button" className="button-plain running closed"
            title={t("sidebar.closed_title")}
            aria-label={t("sidebar.closed_terminal", { label: term.label, machine: machine.name })}
            onClick={() => onGoTo(term.id)}>
            <Lock size={14} className="closed-lock" />
            <span className="running-name">{term.label}</span>
          </button>
        ) : (
          <button key={term.id} type="button" className="button-plain running"
            title={t("machines.back_to", { label: term.label })}
            onClick={() => onGoTo(term.id)}>
            <TerminalIcon size={14} />
            {term.label}
          </button>
        )))}
        {manage && (
          <button type="button" className="button-plain quiet push-right"
            title={t("machines.remove_title", { machine: machine.name })}
            onClick={() => onRemove(machine)}>
            <Trash size={14} />
            {t("machines.remove")}
          </button>
        )}
      </div>
    </article>
  );
}

export function Machines(props: Props) {
  const { projects, terminals, closed, onAdd, onOpenTerminal, onGoTo, onRemove, local } = props;
  const t = useT();
  const withMachines = projects.filter((p) => p.machines.length > 0);
  const first = projects.find((p) => p.role === "owner") ?? projects[0];
  return (
    <main className="machines-view">
      <div className="machines-head">
        <h1>{t("machines.title")}</h1>
        {first && (
          <button type="button" className="button-accent big"
            onClick={() => onAdd(first.id)}>
            <Plus size={14} /> {t("machines.add")}
          </button>
        )}
      </div>
      <p className="lead small">
        {t("machines.lead")}
      </p>
      {withMachines.map((project) => (
        <section key={project.id} className="machines-project"
          aria-label={project.name}>
          <h2>
            <span className={`code-badge ${colorClass(project.color)}`}
              aria-hidden="true">{project.code}</span>
            {project.name}
          </h2>
          <div className="machine-list">
            {project.machines.map((machine) => (
              <MachineCard key={machine.id} machine={machine}
                code={project.code} projectId={project.id} onOpenTerminal={onOpenTerminal}
                onGoTo={onGoTo} onRemove={onRemove} shut={closed(machine)}
                manage={canManage(project.role) && !local}
                terminals={terminals.filter((term) => term.machineId === machine.id && (!term.projectId || term.projectId === project.id))} />
            ))}
          </div>
        </section>
      ))}
    </main>
  );
}
