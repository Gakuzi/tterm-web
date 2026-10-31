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
// signing in brings (NeedAccount.tsx).

import { useEffect, useState } from "react";
import type {
  Folder, Machine, MachineKind, Me, NoteSummary, Project, TerminalInfo, Who,
} from "./api";
import { shortPath } from "./BlockView";
import { Face } from "./Face";
import { colorClass, terminalName } from "./colors";
import { useT } from "./i18n";
import {
  Computer, Doc, Folder as FolderIcon, FolderPlus, ListCheck, Lock, Pencil,
  Plus, Server, Trash,
} from "./icons";
import { FolderMenuItems, MenuButton, NoteMenuItems } from "./Menus";
import { NameInput } from "./NameInput";
import { titled } from "./noteText";
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
  me: Me;
  /** The app before signing in: this computer only (0.1.4). */
  local?: boolean;
  /** The terminals running now, in every project. */
  terminals: TerminalInfo[];
  dotFor: (terminal: TerminalInfo) => Dot;
  onAddMachine: (projectId: string, kind?: MachineKind) => void;
  onOpenTerminal: (machineId: string) => void;
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

function TerminalRow({ term, me, dot, onGoTo, naming }: {
  term: TerminalInfo;
  me: Me;
  dot: Dot;
  onGoTo: (id: string) => void;
  naming: Naming;
}) {
  const t = useT();
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

function MachineCard(props: {
  machine: Machine;
  project: Project;
  me: Me;
  terminals: TerminalInfo[];
  dotFor: (terminal: TerminalInfo) => Dot;
  onOpenTerminal: (machineId: string) => void;
  onGoTo: (terminalId: string) => void;
  onRemoveMachine: (machine: Machine) => void;
  onMoveMachine?: (machine: Machine) => void;
  naming: Naming;
  notYet: (what: string) => void;
  /** The app before signing in: the computer it runs on stays. */
  local?: boolean;
}) {
  const { machine: m, project } = props;
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
          <button type="button" className="button-ghost small"
            title={offline ? t("projectpage.offline_title", { machine: m.name })
              : t("projectpage.new_terminal_title", { machine: m.name })}
            onClick={() => (offline
              ? props.notYet(seen
                ? t("projectpage.offline_wait_seen", { machine: m.name, seen })
                : t("projectpage.offline_wait", { machine: m.name }))
              : props.onOpenTerminal(m.id))}>
            <Plus size={14} />
            {t("projectpage.new_terminal")}
          </button>
          {manages(project) && !props.local && (
            <MenuButton label={t("projectpage.machine_menu", { machine: m.name })}
              title={props.onMoveMachine ? t("projectpage.machine_menu_title")
                : t("projectpage.remove_machine")}>
              {(close) => (
                <>
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
            onGoTo={props.onGoTo} naming={props.naming} />
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

  // "5 min ago" and "running for 3 minutes" go on counting.
  useEffect(() => {
    const every = window.setInterval(() => setTick((n) => n + 1), 30_000);
    return () => window.clearInterval(every);
  }, []);

  const machineIds = new Set(project.machines.map((m) => m.id));
  const running = props.terminals.filter((term) => machineIds.has(term.machineId));
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

      <section className="pp-section" aria-labelledby="pp-machines">
        <div className="pp-section-head">
          <div className="pp-section-title">
            <h2 id="pp-machines">{t("projectpage.machines")}</h2>
            <span>{alone ? t("projectpage.machines_alone")
              : t("projectpage.machines_shared")}</span>
          </div>
          {addsMachines && (
            <button type="button" className="button-plain small"
              onClick={() => props.onAddMachine(project.id)}>
              <Plus size={14} />
              {t("projectpage.add_machine")}
            </button>
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
                dotFor={props.dotFor} onOpenTerminal={props.onOpenTerminal}
                onGoTo={props.onGoTo} onRemoveMachine={props.onRemoveMachine}
                onMoveMachine={props.onMoveMachine} naming={naming}
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
    </main>
  );
}
