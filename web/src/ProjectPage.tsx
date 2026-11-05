// A project's page, in a tab of its own, opened from the project's name in
// the sidebar (0.1.0): its machines with the terminals running on them, and
// its notes in folders, as on the approved canvas. From 0.1.1 the pencil
// next to its name changes the name, the code and the color, ⋯ next to a
// machine moves it to another project of one's own, and Delete project is
// at the very end. From 0.1.2 a double click on a terminal's name names it,
// and a note's ⋯ moves it to another project. People and the journal come
// with teams, later. From 0.1.4, in the app before signing in (local.ts),
// its computer has no menu; from 0.1.5 Add machine and the card about
// Personal, with New project, are there as after signing in, and say what
// signing in brings (NeedAccount.tsx). From 0.1.28 (the canvas, version
// 109) a machine closed on this device has the lock in place of the "+" of
// New terminal, as in the sidebar, and its terminals are dimmed, each with
// a lock and "closed on this device" where its folder would be (the core
// sends that device nothing of what they do).

import { useEffect, useState } from "react";
import {
  bindMachineToProject, getMachineProjects, unbindMachineFromProject,
  type Folder, type Machine, type MachineKind, type Me, type NoteSummary, type Project, type TerminalInfo, type Who,
} from "./api";
import { shortPath } from "./BlockView";
import { Face } from "./Face";
import { colorClass, terminalName } from "./colors";
import { useT } from "./i18n";
import {
  Branch, Close, Computer, Doc, Folder as FolderIcon, FolderPlus, Layers, ListCheck, Lock, Pencil, People,
  Plus, Server, Trash,
} from "./icons";
import { FolderMenuItems, MenuButton, NoteMenuItems } from "./Menus";
import { NameInput } from "./NameInput";
import { titled } from "./noteText";
import { ClientInstallerBanner } from "./ClientInstallerBanner";
import { ProjectCollaboration } from "./ProjectCollaboration";
import {
  deletesFolder, deletesNote, manages, writes,
} from "./rights";
import type { Dot } from "./TabBar";
import { ago, agoLong, lastSeen, since } from "./time";

const ROLE_LINE: Record<Project["role"], string> = {
  owner: "projectpage.role_owner",
  admin: "projectpage.role_admin",
  member: "projectpage.role_member",
  observer: "projectpage.role_observer",
};

interface Props {
  project: Project;
  allProjects?: Project[];
  onRefresh?: () => void;
  me: Me;
  /** The app before signing in: this computer only (0.1.4). */
  local?: boolean;
  /** The terminals running now, in every project. */
  terminals: TerminalInfo[];
  dotFor: (terminal: TerminalInfo) => Dot;
  /** A machine closed on this device (0.1.28, keysHere.ts). */
  closed: (machine: Machine) => boolean;
  onAddMachine: (projectId: string, kind?: MachineKind) => void;
  onOpenTerminal: (machineId: string, projectId?: string) => void;
  onGoTo: (terminalId: string) => void;
  onRemoveMachine: (machine: Machine) => void;
  /** Moves a machine to another project of one's own: only when there is
   * another one. */
  onMoveMachine?: (machine: Machine) => void;
  onEditProject: (project: Project) => void;
  onDeleteProject: (project: Project) => void;
  onNewProject: () => void;
  onNewFolder: (project: Project) => void;
  onRenameFolder: (folder: Folder, project: Project) => void;
  onDeleteFolder: (folder: Folder, project: Project) => void;
  onNewNote: (folderId: string) => void;
  onOpenNote: (noteId: string) => void;
  onMoveNote: (noteId: string, folderId: string) => void;
  /** To another project (0.1.2): only when there is one to write in. */
  onMoveNoteOut?: (noteId: string) => void;
  onCopyNote: (noteId: string) => void;
  onDeleteNote: (noteId: string) => void;
  /** The terminal whose name is being typed here, if one is (0.1.2). */
  renaming: string | null;
  onStartRename: (terminalId: string) => void;
  onRename: (terminalId: string, name: string) => void;
  onStopRename: (terminalId: string) => void;
  notYet: (what: string) => void;
}

/** Naming a terminal on the page (0.1.2), as in its tab. */
interface Naming {
  renaming: string | null;
  onStartRename: (terminalId: string) => void;
  onRename: (terminalId: string, name: string) => void;
  onStopRename: (terminalId: string) => void;
}

/** A person's initials in a circle, amber for oneself: 26, 22 or 18 pixels
 * across, or the account's 30. */
/** Whose a terminal or a note is. `named`: the name is written next to it,
 * so one's own photo may stand in for the initials (0.1.7, Face.tsx). */
export function Avatar({ who, me, size, named }: {
  who: Who | null;
  me: Me;
  size?: "small" | "tiny" | "xs";
  named?: boolean;
}) {
  const mine = !who || who.id === me.id;
  const className = `${size ?? ""}${mine ? " mine" : ""}`.trim();
  return (
    <Face initials={who?.initials ?? me.initials}
      photo={named && mine ? me.photo : null} className={className} />
  );
}

export function NoteIcon({ note, size = 14 }: { note: NoteSummary; size?: number }) {
  return note.total > 0 ? <ListCheck size={size} /> : <Doc size={size} />;
}

function TerminalRow({ term, me, dot, shut, onGoTo, naming }: {
  term: TerminalInfo;
  me: Me;
  dot: Dot;
  /** Its machine closed on this device (0.1.28): its card in its tab. */
  shut: boolean;
  onGoTo: (id: string) => void;
  naming: Naming;
}) {
  const t = useT();
  if (shut) {
    const name = terminalName(term.name, t);
    return (
      <li className="pp-row closed">
        <Avatar who={null} me={me} size="small" />
        <span className="pp-row-text">
          <strong>{name}</strong>
          <span className="pp-row-sub">
            <Lock size={12} className="closed-lock" />
            <span className="pp-ellipsis">{t("projectpage.closed")}</span>
          </span>
        </span>
        <span className="pp-row-actions">
          <button type="button" className="button-plain small"
            title={t("sidebar.closed_title")}
            aria-label={t("sidebar.closed_terminal", { label: name, machine: term.machine })}
            onClick={() => onGoTo(term.id)}>
            {t("projectpage.open")}
          </button>
        </span>
      </li>
    );
  }
  const canRename = dot !== "ended";
  const where = term.cwd ? shortPath(term.cwd, term.home) : "";
  let text = [where, term.branch].filter(Boolean).join(" · ");
  let when = "";
  if (dot === "busy") {
    text = term.running?.command || t("projectpage.command_running");
    when = term.running?.at
      ? t("projectpage.running_for", { duration: since(term.running.at, t) })
      : t("projectpage.running");
  } else if (dot === "away") {
    when = t("projectpage.waits_for", { machine: term.machine });
  }
  return (
    <li className="pp-row">
      <Avatar who={null} me={me} size="small" />
      <span className="pp-row-text">
        {canRename && naming.renaming === term.id ? (
          <>
            <NameInput id={term.id} name={term.name} className="pp-rename-input"
              describedBy={`pp-rename-${term.id}`} onRename={naming.onRename}
              onStop={() => naming.onStopRename(term.id)} />
            <span className="pp-rename-hint" id={`pp-rename-${term.id}`}>
              {t("projectpage.rename_hint")}
            </span>
          </>
        ) : (
          <>
            <strong className={canRename ? "pp-term-name" : undefined}
              title={canRename ? t("projectpage.double_click") : undefined}
              onDoubleClick={() => {
                if (canRename) naming.onStartRename(term.id);
              }}>
              {terminalName(term.name, t)}
            </strong>
            <span className="pp-row-sub mono">
              <span className={`dot ${dot}`} aria-hidden="true" />
              <span className="pp-ellipsis">{text || "~"}</span>
              {when && <span className={dot === "busy" ? "pp-when busy" : "pp-when"}>{when}</span>}
            </span>
          </>
        )}
      </span>
      <span className="pp-row-actions">
        <button type="button" className="button-plain small" onClick={() => onGoTo(term.id)}>
          {t("projectpage.open")}
        </button>
      </span>
    </li>
  );
}

function MachineProjectsModal(props: {
  machine: Machine | null;
  allProjects: Project[];
  isOpen: boolean;
  onClose: () => void;
  onRefresh?: () => void;
}) {
  const { machine, allProjects, isOpen, onClose, onRefresh } = props;
  const [boundProjectIds, setBoundProjectIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!isOpen || !machine) return;
    getMachineProjects(machine.id).then((list) => {
      const ids = new Set(list.map((x) => x.project_id));
      setBoundProjectIds(ids);
    }).catch(() => {});
  }, [isOpen, machine]);

  if (!isOpen || !machine) return null;

  const toggleProject = async (p: Project) => {
    const isBound = boundProjectIds.has(p.id);
    if (isBound) {
      await unbindMachineFromProject(machine.id, p.id);
      setBoundProjectIds((prev) => {
        const next = new Set(prev);
        next.delete(p.id);
        return next;
      });
    } else {
      await bindMachineToProject(machine.id, p.id, p.name);
      setBoundProjectIds((prev) => new Set(prev).add(p.id));
    }
    onRefresh?.();
  };

  return (
    <div className="modal-backdrop" onClick={onClose} style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999, backdropFilter: "blur(2px)"
    }}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{
        background: "var(--color-bg-primary, #18181b)", border: "1px solid var(--color-border, #333)",
        borderRadius: "12px", padding: "20px 24px", width: "420px", maxWidth: "90vw", boxShadow: "0 10px 25px rgba(0,0,0,0.4)"
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Layers size={18} />
            <strong style={{ fontSize: 16 }}>
              {/* i18n-ignore */}
              Проекты для {machine.name}
            </strong>
          </div>
          <button type="button" className="button-ghost small" onClick={onClose} style={{ padding: "4px 8px" }}>
            <Close size={16} />
          </button>
        </div>
        <p style={{ fontSize: 13, color: "var(--color-text-secondary, #999)", marginBottom: 14, lineHeight: 1.4 }}>
          {/* i18n-ignore */}
          Выберите проекты, в которых будет доступна эта машина. Терминалы изолированы и принадлежат только проекту, в котором они были открыты.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: "240px", overflowY: "auto", marginBottom: 16 }}>
          {allProjects.map((p) => {
            const checked = boundProjectIds.has(p.id);
            return (
              <label key={p.id} style={{
                display: "flex", alignItems: "center", gap: 10, padding: "8px 12px",
                borderRadius: "8px", background: checked ? "rgba(56, 189, 248, 0.08)" : "rgba(255, 255, 255, 0.03)",
                border: checked ? "1px solid rgba(56, 189, 248, 0.3)" : "1px solid rgba(255, 255, 255, 0.08)",
                cursor: "pointer", fontSize: 13
              }}>
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleProject(p)}
                  style={{ cursor: "pointer", accentColor: "#38bdf8" }}
                />
                <span className={`code-badge ${colorClass(p.color)}`} style={{ fontSize: 11, padding: "1px 6px" }}>{p.code}</span>
                <span style={{ flex: 1, fontWeight: checked ? 600 : 400 }}>{p.name}</span>
                {checked && (
                  <span style={{ fontSize: 11, color: "#38bdf8" }}>
                    Включено {/* i18n-ignore */}
                  </span>
                )}
              </label>
            );
          })}
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button type="button" className="button-accent small" onClick={onClose}>
            Готово {/* i18n-ignore */}
          </button>
        </div>
      </div>
    </div>
  );
}

function AttachExistingMachineModal(props: {
  project: Project;
  availableMachines: Machine[];
  isOpen: boolean;
  onClose: () => void;
  onRefresh?: () => void;
}) {
  const { project, availableMachines, isOpen, onClose, onRefresh } = props;
  const [attachingId, setAttachingId] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleAttach = async (m: Machine) => {
    setAttachingId(m.id);
    await bindMachineToProject(m.id, project.id, project.name);
    setAttachingId(null);
    onRefresh?.();
    onClose();
  };

  return (
    <div className="modal-backdrop" onClick={onClose} style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999, backdropFilter: "blur(2px)"
    }}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{
        background: "var(--color-bg-primary, #18181b)", border: "1px solid var(--color-border, #333)",
        borderRadius: "12px", padding: "20px 24px", width: "440px", maxWidth: "90vw", boxShadow: "0 10px 25px rgba(0,0,0,0.4)"
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Server size={18} />
            <strong style={{ fontSize: 16 }}>
              {/* i18n-ignore */}
              Подключить существующую машину
            </strong>
          </div>
          <button type="button" className="button-ghost small" onClick={onClose} style={{ padding: "4px 8px" }}>
            <Close size={16} />
          </button>
        </div>
        <p style={{ fontSize: 13, color: "var(--color-text-secondary, #999)", marginBottom: 14, lineHeight: 1.4 }}>
          {/* i18n-ignore */}
          Подключите машину к проекту «{project.name}». Машина появится в списке, а её терминалы в этом проекте будут изолированы.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: "240px", overflowY: "auto", marginBottom: 16 }}>
          {availableMachines.length === 0 ? (
            <div style={{ padding: "16px", textAlign: "center", color: "var(--color-text-secondary, #888)", fontSize: 13 }}>
              {/* i18n-ignore */}
              Все доступные машины уже добавлены в этот проект.
            </div>
          ) : (
            availableMachines.map((m) => (
              <div key={m.id} style={{
                display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px",
                borderRadius: "8px", background: "rgba(255, 255, 255, 0.03)", border: "1px solid rgba(255, 255, 255, 0.08)"
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {m.kind === "computer" ? <Computer size={16} /> : <Server size={16} />}
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{m.name}</div>
                    <div style={{ fontSize: 11, color: "var(--color-text-secondary, #888)" }}>
                      {[m.os, m.host].filter(Boolean).join(" · ")}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  className="button-accent small"
                  disabled={attachingId === m.id}
                  onClick={() => handleAttach(m)}
                >
                  {/* i18n-ignore */}
                  {attachingId === m.id ? "Подключение..." : "Подключить"}
                </button>
              </div>
            ))
          )}
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button type="button" className="button-ghost small" onClick={onClose}>
            Отмена {/* i18n-ignore */}
          </button>
        </div>
      </div>
    </div>
  );
}

function MachineCard(props: {
  machine: Machine;
  project: Project;
  me: Me;
  terminals: TerminalInfo[];
  dotFor: (terminal: TerminalInfo) => Dot;
  /** Closed on this device (0.1.28). */
  shut: boolean;
  onOpenTerminal: (machineId: string, projectId?: string) => void;
  onGoTo: (terminalId: string) => void;
  onRemoveMachine: (machine: Machine) => void;
  onMoveMachine?: (machine: Machine) => void;
  onManageProjects?: (machine: Machine) => void;
  onUnbindMachine?: (machine: Machine) => void;
  naming: Naming;
  notYet: (what: string) => void;
  /** The app before signing in: the computer it runs on stays. */
  local?: boolean;
}) {
  const { machine: m, project, shut } = props;
  const t = useT();
  const computer = m.kind === "computer";
  const offline = computer && !m.online;
  const seen = offline ? lastSeen(m.lastSeen, t) : "";
  return (
    <div className="pp-card">
      <div className="pp-card-head">
        <span className="pp-card-name">
          {computer ? <Computer size={16} /> : <Server size={16} />}
          {m.name}
        </span>
        {m.shared && (
          <span style={{ fontSize: 11, background: "rgba(56, 189, 248, 0.15)", color: "#38bdf8", padding: "2px 6px", borderRadius: 4, fontWeight: 500 }}>
            Общая {/* i18n-ignore */}
          </span>
        )}
        {m.host && <span className="pp-mono">{m.host}</span>}
        {m.os && <span className="pp-dim">{m.os}</span>}
        {computer && (
          <span className="pp-dim pp-state">
            <span className={offline ? "dot away" : "dot open"} aria-hidden="true" />
            {offline ? (seen ? t("projectpage.last_seen", { ago: agoLong(m.lastSeen, t) })
              : t("projectpage.offline")) : t("projectpage.online")}
          </span>
        )}
        <span className="pp-card-actions">
          <button type="button" className={shut && !offline ? "button-ghost small closed" : "button-ghost small"}
            title={offline ? t("projectpage.offline_title", { machine: m.name })
              : shut ? (computer ? t("sidebar.keys_closed_mac")
                : t("sidebar.keys_closed_new", { name: m.name }))
              : t("projectpage.new_terminal_title", { machine: m.name })}
            onClick={() => (offline
              ? props.notYet(seen
                ? t("projectpage.offline_wait_seen", { machine: m.name, seen })
                : t("projectpage.offline_wait", { machine: m.name }))
              : props.onOpenTerminal(m.id, props.project.id))}>
            {shut && !offline ? <Lock size={14} /> : <Plus size={14} />}
            {t("projectpage.new_terminal")}
          </button>
          {manages(project) && !props.local && (
            <MenuButton label={t("projectpage.machine_menu", { machine: m.name })}
              title={props.onMoveMachine ? t("projectpage.machine_menu_title")
                : t("projectpage.remove_machine")}>
              {(close) => (
                <>
                  {props.onManageProjects && (
                    <button type="button" className="menu-item" role="menuitem"
                      onClick={() => {
                        close();
                        props.onManageProjects?.(m);
                      }}>
                      <Layers size={15} />
                      <span className="menu-text">
                        Проекты машины... {/* i18n-ignore */}
                      </span>
                    </button>
                  )}
                  {props.onMoveMachine && (
                    <button type="button" className="menu-item" role="menuitem"
                      onClick={() => {
                        close();
                        props.onMoveMachine?.(m);
                      }}>
                      <FolderIcon size={15} />
                      <span className="menu-text">{t("projectpage.move_machine")}</span>
                    </button>
                  )}
                  {m.shared && props.onUnbindMachine && (
                    <button type="button" className="menu-item" role="menuitem"
                      onClick={() => {
                        close();
                        props.onUnbindMachine?.(m);
                      }}>
                      <Close size={15} />
                      <span className="menu-text">
                        Отвязать от проекта {/* i18n-ignore */}
                      </span>
                    </button>
                  )}
                  <button type="button" className="menu-item danger" role="menuitem"
                    onClick={() => {
                      close();
                      props.onRemoveMachine(m);
                    }}>
                    <Trash size={15} />
                    <span className="menu-text">{t("projectpage.remove_machine")}</span>
                  </button>
                </>
              )}
            </MenuButton>
          )}
        </span>
      </div>
      <ul className="pp-rows">
        {props.terminals.map((term) => (
          <TerminalRow key={term.id} term={term} me={props.me} dot={props.dotFor(term)}
            shut={shut} onGoTo={props.onGoTo} naming={props.naming} />
        ))}
        {props.terminals.length === 0 && (
          <li className="pp-empty">{t("projectpage.no_terminals")}</li>
        )}
      </ul>
    </div>
  );
}

function NoteRow(props: {
  note: NoteSummary;
  folder: Folder;
  project: Project;
  me: Me;
  onOpenNote: (noteId: string) => void;
  onMoveNote: (noteId: string, folderId: string) => void;
  onMoveNoteOut?: (noteId: string) => void;
  onCopyNote: (noteId: string) => void;
  onDeleteNote: (noteId: string) => void;
}) {
  const { note: n, me, project } = props;
  const t = useT();
  const canDelete = deletesNote(project, n, me.id);
  const moveOut = !!props.onMoveNoteOut && canDelete;
  const editor = n.editedBy ?? n.createdBy;
  const edited = ago(n.editedAt, t);
  const byline = !editor || editor.id === me.id
    ? t("projectpage.edited_you", { ago: edited })
    : t("projectpage.edited_by", { name: editor.firstName, ago: edited });
  // Who may delete it, said when this person may not; nobody known, "Someone".
  const author = !n.createdBy ? null : n.createdBy.id === me.id ? t("projectpage.you")
    : n.createdBy.firstName;
  const sub = n.total ? t("projectpage.done", { n: n.done, total: n.total })
    : n.excerpt || t("projectpage.note_empty");
  return (
    <li className="pp-note-row">
      <button type="button" className="pp-note" onClick={() => props.onOpenNote(n.id)}>
        <span className="pp-note-tile" aria-hidden="true"><NoteIcon note={n} /></span>
        <span className="pp-row-text">
          <strong className={n.title.trim() ? undefined : "untitled"}>{titled(n.title, t)}</strong>
          <span className="pp-row-sub">
            {n.total > 0 && (
              <span className="pp-progress" aria-hidden="true">
                <span style={{ width: `${Math.round((100 * n.done) / n.total)}%` }} />
              </span>
            )}
            <span className="pp-ellipsis">{sub}</span>
          </span>
        </span>
        <span className="pp-who">
          <Avatar who={editor} me={me} size="tiny" named />
          {byline}
        </span>
      </button>
      <MenuButton label={t("projectpage.note_menu", { note: titled(n.title, t) })}
        title={moveOut ? t("projectpage.note_menu_title_move")
          : t("projectpage.note_menu_title")}>
        {(close) => (
          <NoteMenuItems folders={project.folders} folderId={props.folder.id}
            canWrite={writes(project)} canDelete={canDelete}
            elsewhere={!!props.onMoveNoteOut} author={author} close={close}
            onMove={(folderId) => props.onMoveNote(n.id, folderId)}
            onMoveOut={() => props.onMoveNoteOut?.(n.id)}
            onCopy={() => props.onCopyNote(n.id)}
            onDelete={() => props.onDeleteNote(n.id)} />
        )}
      </MenuButton>
    </li>
  );
}

export function ProjectPage(props: Props) {
  const { project, me } = props;
  const t = useT();
  const [, setTick] = useState(0);
  const [activeTab, setActiveTab] = useState<"overview" | "git_notes" | "team_ai" | "containers">("overview");
  const [managingProjectsMachine, setManagingProjectsMachine] = useState<Machine | null>(null);
  const [attachExistingOpen, setAttachExistingOpen] = useState(false);

  // "5 min ago" and "running for 3 minutes" go on counting.
  useEffect(() => {
    const every = window.setInterval(() => setTick((n) => n + 1), 30_000);
    return () => window.clearInterval(every);
  }, []);

  const machineIds = new Set(project.machines.map((m) => m.id));
  const running = props.terminals.filter((term) => machineIds.has(term.machineId) && (!term.projectId || term.projectId === project.id));
  // Nobody else in it: Personal, and until people come, every project.
  const alone = project.personal || project.alone;
  const line = [
    t("count.machines", { n: project.machines.length }),
    t("count.terminals_open", { n: running.length }),
    alone ? t("projectpage.only_you") : t(ROLE_LINE[project.role]),
  ].join(" · ");
  const manage = manages(project);
  // Before signing in too: App says what signing in brings (0.1.5).
  const addsMachines = manage;
  const write = writes(project);
  const naming: Naming = {
    renaming: props.renaming, onStartRename: props.onStartRename,
    onRename: props.onRename, onStopRename: props.onStopRename,
  };

  const allProjects = props.allProjects || [project];
  const currentMachineIds = new Set(project.machines.map((m) => m.id));
  const availableOtherMachines: Machine[] = [];
  const seenOther = new Set<string>();
  for (const p of allProjects) {
    for (const m of p.machines) {
      if (!currentMachineIds.has(m.id) && !seenOther.has(m.id)) {
        seenOther.add(m.id);
        availableOtherMachines.push(m);
      }
    }
  }

  return (
    <main className="project-view" aria-labelledby="pp-title">
      <div className="pp-head">
        <div className={`pp-title-row ${colorClass(project.color)}`}>
          <h1 id="pp-title">{project.name}</h1>
          <span className="pp-code" title={t("projectpage.short_code")}>{project.code}</span>
          {manage && (
            <button type="button" className="icon-button small"
              aria-label={t("projectpage.edit")}
              title={t("projectpage.edit")}
              onClick={() => props.onEditProject(project)}>
              <Pencil size={16} />
            </button>
          )}
        </div>
        <p>{line}</p>
      </div>

      <div className="pp-tabs-nav" style={{
        display: "flex",
        gap: 8,
        borderBottom: "1px solid var(--sep, #2d3139)",
        marginBottom: 20,
        paddingBottom: 8,
        flexWrap: "wrap",
      }}>
        <button
          type="button"
          className={activeTab === "overview" ? "button-accent small" : "button-ghost small"}
          onClick={() => setActiveTab("overview")}
          style={{ display: "flex", alignItems: "center", gap: 6 }}
        >
          <Server size={14} />
          <span>Обзор (Машины и Заметки) {/* i18n-ignore */}</span>
        </button>
        <button
          type="button"
          className={activeTab === "git_notes" ? "button-accent small" : "button-ghost small"}
          onClick={() => setActiveTab("git_notes")}
          style={{ display: "flex", alignItems: "center", gap: 6 }}
        >
          <Branch size={14} />
          <span>Git & Заметки GitHub {/* i18n-ignore */}</span>
        </button>
        <button
          type="button"
          className={activeTab === "team_ai" ? "button-accent small" : "button-ghost small"}
          onClick={() => setActiveTab("team_ai")}
          style={{ display: "flex", alignItems: "center", gap: 6 }}
        >
          <People size={14} />
          <span>Команда и Доступ ИИ {/* i18n-ignore */}</span>
        </button>
        <button
          type="button"
          className={activeTab === "containers" ? "button-accent small" : "button-ghost small"}
          onClick={() => setActiveTab("containers")}
          style={{ display: "flex", alignItems: "center", gap: 6 }}
        >
          <Layers size={14} />
          <span>Контейнеры & Порты {/* i18n-ignore */}</span>
        </button>
      </div>

      {activeTab === "overview" && (
        <>
          <ClientInstallerBanner />

      <section className="pp-section" aria-labelledby="pp-machines">
        <div className="pp-section-head">
          <div className="pp-section-title">
            <h2 id="pp-machines">{t("projectpage.machines")}</h2>
            <span>{alone ? t("projectpage.machines_alone")
              : t("projectpage.machines_shared")}</span>
          </div>
          {addsMachines && (
            <div style={{ display: "flex", gap: "8px" }}>
              <button type="button" className="button-plain small"
                onClick={() => props.onAddMachine(project.id)}>
                <Plus size={14} />
                {t("projectpage.add_machine")}
              </button>
              {availableOtherMachines.length > 0 && (
                <button type="button" className="button-plain small"
                  onClick={() => setAttachExistingOpen(true)}
                  title="Подключить машину из другого проекта" /* i18n-ignore */>
                  <Layers size={14} />
                  Подключить имеющуюся машину {/* i18n-ignore */}
                </button>
              )}
            </div>
          )}
        </div>
        {project.machines.length === 0 ? (
          <div className="pp-kinds">
            <button type="button" className="pp-kind" disabled={!addsMachines}
              onClick={() => props.onAddMachine(project.id, "server")}>
              <span className="tile" aria-hidden="true"><Server size={20} /></span>
              <span className="pp-kind-text">
                <strong>{t("projectpage.server")}</strong>
                <span>{t("projectpage.server_text")}</span>
              </span>
            </button>
            <button type="button" className="pp-kind" disabled={!addsMachines}
              onClick={() => props.onAddMachine(project.id, "computer")}>
              <span className="tile" aria-hidden="true"><Computer size={20} /></span>
              <span className="pp-kind-text">
                <strong>{t("projectpage.computer")}</strong>
                <span>{t("projectpage.computer_text")}</span>
              </span>
            </button>
          </div>
        ) : (
          <div className="pp-cards">
            {project.machines.map((m) => (
              <MachineCard key={m.id} machine={m} project={project} me={me}
                terminals={running.filter((term) => term.machineId === m.id)}
                dotFor={props.dotFor} shut={props.closed(m)} onOpenTerminal={props.onOpenTerminal}
                onGoTo={props.onGoTo} onRemoveMachine={props.onRemoveMachine}
                onMoveMachine={props.onMoveMachine}
                onManageProjects={(mach) => setManagingProjectsMachine(mach)}
                onUnbindMachine={async (mach) => {
                  await unbindMachineFromProject(mach.id, project.id);
                  props.onRefresh?.();
                }}
                naming={naming}
                notYet={props.notYet} local={props.local} />
            ))}
          </div>
        )}
        {project.machines.length === 0 && !project.personal && addsMachines && (
          <p className="pp-hint">
            {t("projectpage.move_hint")}
          </p>
        )}
      </section>

      {project.personal && (
        <div className="pp-wide">
          <span className="tile" aria-hidden="true"><Lock size={20} /></span>
          <span className="pp-wide-text">
            <strong>{t("projectpage.personal_title", { project: project.name })}</strong>
            <span>{t("projectpage.personal_text")}</span>
          </span>
          <button type="button" className="button-plain" onClick={props.onNewProject}>
            {t("projectpage.new_project")}
          </button>
        </div>
      )}

      <section className="pp-section" aria-labelledby="pp-notes">
        <div className="pp-section-head">
          <div className="pp-section-title">
            <h2 id="pp-notes">{t("projectpage.notes")}</h2>
            <span>{alone
              ? t("projectpage.notes_alone", { project: project.name })
              : t("projectpage.notes_shared", { project: project.name })}</span>
          </div>
          {write && (
            <button type="button" className="button-plain small"
              onClick={() => props.onNewFolder(project)}>
              <FolderPlus size={14} />
              {t("projectpage.new_folder")}
            </button>
          )}
        </div>
        {project.folders.length === 0 ? (
          <div className="pp-wide">
            <span className="tile" aria-hidden="true"><FolderIcon size={20} /></span>
            <span className="pp-wide-text">
              <strong>{t("projectpage.no_notes")}</strong>
              <span>{t("projectpage.no_notes_text")}</span>
            </span>
            {write && (
              <button type="button" className="button-accent big"
                onClick={() => props.onNewFolder(project)}>
                <FolderPlus size={15} />
                {t("projectpage.new_folder")}
              </button>
            )}
          </div>
        ) : (
          <div className="pp-cards">
            {project.folders.map((f) => (
              <div key={f.id} className="pp-card">
                <div className="pp-card-head">
                  <span className="pp-card-name">
                    <FolderIcon size={16} />
                    {f.name}
                  </span>
                  <span className="pp-dim">
                    {f.notes.length ? t("count.notes", { n: f.notes.length })
                      : t("projectpage.folder_empty")}
                  </span>
                  {!alone && f.createdBy && (
                    <span className="pp-faint">
                      {f.createdBy.id === me.id ? t("projectpage.made_by_you")
                        : t("projectpage.made_by", { name: f.createdBy.firstName })}
                    </span>
                  )}
                  <span className="pp-card-actions">
                    {write && (
                      <button type="button" className="button-ghost small"
                        onClick={() => props.onNewNote(f.id)}>
                        <Plus size={14} />
                        {t("projectpage.new_note")}
                      </button>
                    )}
                    {write && (
                      <MenuButton label={t("projectpage.folder_menu", { folder: f.name })}
                        title={t("projectpage.folder_menu_title")}>
                        {(close) => (
                          <FolderMenuItems canWrite={write}
                            canDelete={deletesFolder(project, f, me.id)} close={close}
                            onRename={() => props.onRenameFolder(f, project)}
                            onDelete={() => props.onDeleteFolder(f, project)} />
                        )}
                      </MenuButton>
                    )}
                  </span>
                </div>
                <ul className="pp-rows">
                  {f.notes.map((n) => (
                    <NoteRow key={n.id} note={n} folder={f} project={project} me={me}
                      onOpenNote={props.onOpenNote} onMoveNote={props.onMoveNote}
                      onMoveNoteOut={props.onMoveNoteOut}
                      onCopyNote={props.onCopyNote} onDeleteNote={props.onDeleteNote} />
                  ))}
                  {f.notes.length === 0 && (
                    <li className="pp-empty">
                      {write ? t("projectpage.folder_no_notes_writes")
                        : t("projectpage.no_notes")}
                    </li>
                  )}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>

      {project.own && !project.personal && (
        <section className="pp-section" aria-labelledby="pp-delete">
          <div className="pp-wide pp-danger">
            <span className="pp-wide-text">
              <strong id="pp-delete">
                {t("projectpage.delete_title", { project: project.name })}
              </strong>
              <span>{t("projectpage.delete_text")}</span>
            </span>
            <button type="button" className="button-danger-line"
              onClick={() => props.onDeleteProject(project)}>
              {t("projectpage.delete_project")}
            </button>
          </div>
        </section>
      )}
      </>
      )}

      {activeTab !== "overview" && (
        <ProjectCollaboration
          project={project}
          terminals={running}
          me={me}
          activeSection={activeTab}
          onRefresh={props.onRefresh}
        />
      )}

      <MachineProjectsModal
        machine={managingProjectsMachine}
        allProjects={allProjects}
        isOpen={managingProjectsMachine !== null}
        onClose={() => setManagingProjectsMachine(null)}
        onRefresh={props.onRefresh}
      />
      <AttachExistingMachineModal
        project={project}
        availableMachines={availableOtherMachines}
        isOpen={attachExistingOpen}
        onClose={() => setAttachExistingOpen(false)}
        onRefresh={props.onRefresh}
      />
    </main>
  );
}
