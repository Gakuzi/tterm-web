// The windows of projects of one's own (0.1.1), as on the canvas: a new
// project and the pencil, with the name, the code and the color and how
// they will look; moving a machine to another project; deleting a project.
// From 0.1.2 also moving a note to another project. From 0.1.28 a machine
// closed on this device moves only once the window has opened the keys.

import {
  useEffect, useRef, useState, type FormEvent, type KeyboardEvent as KeyEvent,
  type ReactNode,
} from "react";
import {
  PROJECT_COLORS, type Folder, type Machine, type Project, type ProjectColor,
  type ProjectFields,
} from "./api";
import {
  COLOR_KEY, colorClass, freeColor, freeName, suggestCode, validCode,
} from "./colors";
import { list, useT } from "./i18n";
import {
  Check, Close, Folder as FolderIcon, FolderPlus, People, Server,
} from "./icons";
import { KeysHere } from "./KeysClosed";
import { alone } from "./rights";
import { useVaultWindowUp, vaultWindowUp } from "./VaultDialogs";

/** Esc closes the window, whatever has the keys inside it; a vault window
 * over it (opening the keys, 0.1.28) takes Esc itself. */
function useEscape(onClose: () => void) {
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !vaultWindowUp()) {
        event.preventDefault();
        close.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}

const STEPS: Record<string, number> = {
  ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1,
};

/** The arrow keys move the choice in a group of radio buttons, as in any
 * other such group; Tab stops only at the chosen one. */
function radioKeys<T>(values: readonly T[], value: T, choose: (v: T) => void) {
  return (event: KeyEvent<HTMLElement>) => {
    const step = STEPS[event.key];
    if (!step || !values.length) return;
    event.preventDefault();
    const next = (Math.max(values.indexOf(value), 0) + step + values.length) %
      values.length;
    choose(values[next]);
    event.currentTarget.querySelectorAll<HTMLElement>('[role="radio"]')[next]?.focus();
  };
}

/** Enter and Esc while a word is being composed (Japanese, Chinese) are
 * the input method's. */
function composing(event: KeyEvent): boolean {
  return event.nativeEvent.isComposing || event.keyCode === 229;
}

function Window(props: {
  id: string;
  title: string;
  sub?: string;
  className?: string;
  role?: "dialog" | "alertdialog";
  onClose: () => void;
  children: ReactNode;
}) {
  const t = useT();
  return (
    <div className="scrim">
      <section className={`dialog ${props.className ?? ""}`} role={props.role ?? "dialog"}
        aria-modal="true" aria-labelledby={props.id}>
        <div className="dialog-head">
          <div className="dialog-title">
            <h2 id={props.id}>{props.title}</h2>
            {props.sub && <p className="dialog-note">{props.sub}</p>}
          </div>
          <button type="button" className="icon-button small"
            aria-label={t("common.close")} onClick={props.onClose}>
            <Close size={16} />
          </button>
        </div>
        {props.children}
      </section>
    </div>
  );
}

/** A new project, or the pencil on a project's page. */
export function ProjectDialog(props: {
  /** The project to change; none for a new one. */
  project?: Project;
  /** All of the person's projects: the codes and colors already theirs. */
  projects: Project[];
  onSave: (fields: ProjectFields) => Promise<void>;
  onCancel: () => void;
}) {
  const { project } = props;
  const t = useT();
  const editing = !!project;
  const own = props.projects.filter((p) => p.own && p.id !== project?.id);
  const taken = own.map((p) => p.code);
  const [name, setName] = useState(project?.name ?? "");
  const [code, setCode] = useState(project?.code ?? "");
  /** The code typed by hand: from then on it no longer follows the name. */
  const [codeTyped, setCodeTyped] = useState(editing);
  const [color, setColor] = useState<ProjectColor>(project?.color ??
    freeColor(props.projects));
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const nameInput = useRef<HTMLInputElement>(null);
  useEscape(props.onCancel);

  useEffect(() => {
    nameInput.current?.focus();
    if (editing) nameInput.current?.select();
  }, [editing]);

  const shownCode = codeTyped ? code : suggestCode(name, taken);
  const clean = name.trim();
  const ready = !!clean && validCode(shownCode) && !busy;
  const alone = !project || project.personal || project.alone;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!ready) {
      if (clean && !validCode(shownCode)) {
        setProblem(t("project_dialog.code_invalid"));
      }
      return;
    }
    setBusy(true);
    setProblem(null);
    try {
      await props.onSave({ name: clean, code: shownCode, color });
    } catch (e) {
      setProblem((e as Error).message || t("project_dialog.no_answer"));
      setBusy(false);
    }
  };

  return (
    <Window id="pd-title" className="project-dialog"
      title={editing ? t("project_dialog.edit_title") : t("project_dialog.new_title")}
      sub={editing ? (alone ? undefined : t("project_dialog.edit_sub"))
        : t("project_dialog.new_sub")}
      onClose={props.onCancel}>
      <form className="project-form" onSubmit={(e) => void submit(e)}>
        <div className="pd-fields">
          <div className="pd-field">
            <label htmlFor="pd-name">{t("project_dialog.name")}</label>
            <input id="pd-name" ref={nameInput} className="text-input" value={name}
              maxLength={80} autoComplete="off" spellCheck={false}
              placeholder={t("project_dialog.name_example")}
              onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="pd-field code">
            <label htmlFor="pd-code">{t("project_dialog.code")}</label>
            <input id="pd-code" className="text-input" value={shownCode}
              maxLength={4} autoComplete="off" spellCheck={false}
              onChange={(e) => {
                setCodeTyped(true);
                setCode(e.target.value.toUpperCase().replace(/\s/g, ""));
              }} />
          </div>
        </div>
        <p className="pd-help">
          {editing
            ? (alone ? t("project_dialog.code_help_alone")
              : t("project_dialog.code_help_shared"))
            : t("project_dialog.code_help_new")}
        </p>
        <div className="pd-colors">
          <span className="pd-label" id="pd-color">{t("project_dialog.color")}</span>
          <div className="swatches" role="radiogroup" aria-labelledby="pd-color"
            onKeyDown={radioKeys(PROJECT_COLORS, color, setColor)}>
            {PROJECT_COLORS.map((c) => (
              <button key={c} type="button" role="radio" aria-checked={c === color}
                tabIndex={c === color ? 0 : -1}
                className={`swatch ${colorClass(c)}`} aria-label={t(COLOR_KEY[c])}
                title={t(COLOR_KEY[c])} onClick={() => setColor(c)}>
                {c === color && <Check size={15} />}
              </button>
            ))}
          </div>
          <p className="pd-help">
            {!editing
              ? t("project_dialog.color_help_new")
              : alone
              ? t("project_dialog.color_help_alone")
              : t("project_dialog.color_help_shared")}
          </p>
        </div>
        <div className={`pd-preview ${colorClass(color)}`} aria-hidden="true">
          <span className="pd-preview-label">{t("project_dialog.preview")}</span>
          <span className="pd-preview-project">
            <span className="code-badge">{shownCode || "?"}</span>
            {clean || t("project_dialog.preview_name")}
          </span>
          <span className="pd-preview-tab">
            <span className="dot open" />
            {/* i18n-ignore */}
            <span><span className="tab-code">{shownCode || "?"}/</span>web-01</span>
          </span>
        </div>
        {!editing && (
          <div className="pd-note">
            <Server size={16} />
            <span>{t("project_dialog.new_next")}</span>
          </div>
        )}
        {problem && <div className="error-box" role="alert">{problem}</div>}
        <div className="button-row end">
          <button type="button" className="button-plain" onClick={props.onCancel}>
            {t("common.cancel")}
          </button>
          <button type="submit" className="button-accent big" disabled={!ready}>
            {editing ? t("common.save") : t("project_dialog.create")}
          </button>
        </div>
      </form>
    </Window>
  );
}

/** A machine moved to another project of one's own. */
export function MoveDialog(props: {
  machine: Machine;
  /** The projects it may go to: the person's own, but its own. */
  targets: Project[];
  /** Closed on this device (0.1.28): the keys first, right here. */
  closed?: boolean;
  onMove: (projectId: string) => Promise<void>;
  onCancel: () => void;
}) {
  const { machine, targets } = props;
  const t = useT();
  const [to, setTo] = useState(targets[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const group = useRef<HTMLDivElement>(null);
  useEscape(props.onCancel);
  useEffect(() => {
    group.current?.querySelector<HTMLElement>('[aria-checked="true"]')?.focus();
  }, []);
  // The keys opened in the window, or a vault window over it closed (the
  // Keep question after the password): the chosen project has the keys
  // again, as when it opened, unless something in the window has them.
  const covered = useVaultWindowUp();
  useEffect(() => {
    const here = group.current?.closest("section");
    if (covered || props.closed || !here || here.contains(document.activeElement)) return;
    group.current?.querySelector<HTMLElement>('[aria-checked="true"]')?.focus();
  }, [covered, props.closed]);
  const target = targets.find((p) => p.id === to);
  const name = target
    ? freeName(machine.name, target.machines.map((m) => m.name)) : machine.name;

  const move = async () => {
    if (!target || busy || props.closed) return;
    setBusy(true);
    setProblem(null);
    try {
      await props.onMove(target.id);
    } catch (e) {
      setProblem((e as Error).message || t("project_dialog.no_answer"));
      setBusy(false);
    }
  };

  return (
    <Window id="mv-title" className="confirm-dialog move-dialog"
      title={t("project_dialog.move_title", { machine: machine.name })}
      sub={t("project_dialog.move_sub")}
      onClose={props.onCancel}>
      <div className="move-targets" role="radiogroup" aria-labelledby="mv-title"
        ref={group} onKeyDown={radioKeys(targets.map((p) => p.id), to, setTo)}>
        {targets.map((p) => (
          <button key={p.id} type="button" role="radio" aria-checked={p.id === to}
            tabIndex={p.id === to ? 0 : -1}
            className={`move-target ${colorClass(p.color)}`} onClick={() => setTo(p.id)}>
            <span className="move-radio" aria-hidden="true" />
            <span className="code-badge" aria-hidden="true">{p.code}</span>
            <span className="move-name">{p.name}</span>
            <span className="move-sub">{p.alone || p.personal
              ? t("project_dialog.only_you") : t("project_dialog.with_others")}</span>
          </button>
        ))}
      </div>
      {target && (
        <div className="pd-note">
          <Server size={16} />
          <span>{name === machine.name
            ? t("project_dialog.move_becomes", { project: target.name,
              code: target.code, name })
            : t("project_dialog.move_becomes_taken", { project: target.name,
              code: target.code, name, machine: machine.name })}</span>
        </div>
      )}
      {props.closed && (
        <KeysHere text={t("project_dialog.move_closed", { machine: machine.name })} />
      )}
      {problem && <div className="error-box" role="alert">{problem}</div>}
      <div className="button-row end">
        <button type="button" className="button-plain" onClick={props.onCancel}>
          {t("common.cancel")}
        </button>
        {!props.closed && (
          <button type="button" className="button-accent big" disabled={!target || busy}
            onClick={() => void move()}>
            {target ? t("project_dialog.move_to", { project: target.name })
              : t("project_dialog.move")}
          </button>
        )}
      </div>
    </Window>
  );
}

/** Where a note goes in another project: one of its folders, or the
 * project alone, for a folder there named as the note's own. */
export type NoteTarget = { folderId: string } | { projectId: string };

/** A note moved to another project (0.1.2), as on the canvas: each project
 * the person writes notes in, with its folders, or with a new folder named
 * as the note's own when it has none; who sees the note there, and who no
 * longer sees it here. */
export function MoveNoteDialog(props: {
  title: string;
  /** Where it is now. */
  project: Project;
  folder: Folder;
  /** The projects it may go to. */
  targets: Project[];
  onMove: (to: NoteTarget) => Promise<void>;
  onCancel: () => void;
}) {
  const { project, folder, targets } = props;
  const t = useT();
  const choices = targets.flatMap((p) => (p.folders.length
    ? p.folders.map((f) => ({
      key: f.id, project: p, name: f.name, made: false,
      sub: f.notes.length ? t("count.notes", { n: f.notes.length })
        : t("project_dialog.folder_empty"),
      to: { folderId: f.id } as NoteTarget,
    }))
    : [{
      key: `new:${p.id}`, project: p, name: folder.name, made: true,
      sub: t("project_dialog.folder_new"), to: { projectId: p.id } as NoteTarget,
    }]));
  const [pick, setPick] = useState(choices[0]?.key ?? "");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const group = useRef<HTMLDivElement>(null);
  useEscape(props.onCancel);
  useEffect(() => {
    group.current?.querySelector<HTMLElement>('[aria-checked="true"]')?.focus();
  }, []);
  // The lists may change meanwhile (a folder made there elsewhere): the
  // first one then, never none.
  const chosen = choices.find((c) => c.key === pick) ?? choices[0];

  const move = async () => {
    if (!chosen || busy) return;
    setBusy(true);
    setProblem(null);
    try {
      await props.onMove(chosen.to);
    } catch (e) {
      setProblem((e as Error).message || t("project_dialog.no_answer"));
      setBusy(false);
    }
  };

  return (
    <Window id="mn-title" className="confirm-dialog move-note-dialog"
      title={t("project_dialog.move_note_title", { note: props.title })}
      sub={t("project_dialog.move_note_sub", { project: project.name,
        folder: folder.name })}
      onClose={props.onCancel}>
      <div className="mn-groups" role="radiogroup" aria-labelledby="mn-title"
        ref={group}
        onKeyDown={radioKeys(choices.map((c) => c.key), chosen?.key ?? "", setPick)}>
        {targets.map((p) => (
          <div key={p.id} className={`mn-group ${colorClass(p.color)}`}>
            <div className="mn-group-head">
              <span className="code-badge" aria-hidden="true">{p.code}</span>
              <span className="mn-group-name">{p.name}</span>
              <span className="mn-group-sub">{alone(p) ? t("project_dialog.only_you")
                : t("project_dialog.with_others")}</span>
            </div>
            {choices.filter((c) => c.project.id === p.id).map((c) => (
              <button key={c.key} type="button" role="radio"
                aria-checked={c.key === chosen?.key}
                tabIndex={c.key === chosen?.key ? 0 : -1}
                className="mn-folder" onClick={() => setPick(c.key)}>
                <span className="move-radio" aria-hidden="true" />
                {c.made ? <FolderPlus size={15} /> : <FolderIcon size={15} />}
                <span className="mn-folder-name">{c.name}</span>
                <span className="mn-folder-sub">{c.sub}</span>
              </button>
            ))}
          </div>
        ))}
      </div>
      {chosen && (
        <div className="pd-note">
          <People size={16} />
          <span className="mn-who">
            <span>{alone(chosen.project)
              ? t("project_dialog.note_alone", { project: chosen.project.name })
              : t("project_dialog.note_shared", { project: chosen.project.name })}</span>
            {!alone(project) && (
              <span>{t("project_dialog.note_leaves", { project: project.name })}</span>
            )}
          </span>
        </div>
      )}
      <p className="mn-keeps">
        {t("project_dialog.note_keeps")}
      </p>
      {problem && <div className="error-box" role="alert">{problem}</div>}
      <div className="button-row end">
        <button type="button" className="button-plain" onClick={props.onCancel}>
          {t("common.cancel")}
        </button>
        <button type="button" className="button-accent big" disabled={!chosen || busy}
          onClick={() => void move()}>
          {!chosen ? t("project_dialog.move") : chosen.made
            ? t("project_dialog.move_to_new_folder", { folder: chosen.name })
            : t("project_dialog.move_to_folder", { folder: chosen.name })}
        </button>
      </div>
    </Window>
  );
}

/** Deleting a project: one with machines in it says what to do first; an
 * empty one asks for its name, since its notes go with it. */
export function DeleteProjectDialog(props: {
  project: Project;
  onDelete: () => Promise<void>;
  onCancel: () => void;
}) {
  const { project } = props;
  const t = useT();
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  useEscape(props.onCancel);
  useEffect(() => (input.current ?? close.current)?.focus(), []);
  const machines = project.machines.map((m) => m.name);
  const notes = project.folders.reduce((n, f) => n + f.notes.length, 0);
  const matches = typed.trim() === project.name;

  const go = async () => {
    if (!matches || busy) return;
    setBusy(true);
    setProblem(null);
    try {
      await props.onDelete();
    } catch (e) {
      setProblem((e as Error).message || t("project_dialog.no_answer"));
      setBusy(false);
    }
  };

  if (machines.length) {
    return (
      <Window id="dp-title" className="confirm-dialog" role="alertdialog"
        title={t("project_dialog.delete_title", { project: project.name })}
        onClose={props.onCancel}>
        <div className="confirm-body">
          <p className="ink">
            {machines.length === 1
              ? t("project_dialog.delete_machine_first", { machine: machines[0] })
              : t("project_dialog.delete_machines_first",
                { machines: list(machines, t.lang) })}
          </p>
          <p>
            {t("project_dialog.delete_how")}
          </p>
        </div>
        <div className="button-row">
          <button type="button" className="button-plain" ref={close}
            onClick={props.onCancel}>
            {t("common.close")}
          </button>
        </div>
      </Window>
    );
  }

  return (
    <Window id="dp-title" className="confirm-dialog" role="alertdialog"
      title={t("project_dialog.delete_title", { project: project.name })}
      onClose={props.onCancel}>
      <div className="confirm-body">
        <p className="ink">{t("project_dialog.cant_undo")}</p>
        <p>
          {project.folders.length
            ? t("project_dialog.delete_folders", { n: project.folders.length,
              notes: t("project_dialog.delete_notes", { n: notes }) })
            : t("project_dialog.delete_no_notes")}
        </p>
        <label htmlFor="dp-name">
          {t("project_dialog.delete_type", { project: project.name })}
        </label>
        <input id="dp-name" ref={input} className="text-input" value={typed}
          autoComplete="off" spellCheck={false} placeholder={project.name}
          onChange={(e) => setTyped(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !composing(e)) void go();
          }} />
      </div>
      {problem && <div className="error-box" role="alert">{problem}</div>}
      <div className="button-row">
        <button type="button" className="button-danger big" disabled={!matches || busy}
          onClick={() => void go()}>
          {t("project_dialog.delete_button", { project: project.name })}
        </button>
        <button type="button" className="button-plain" onClick={props.onCancel}>
          {t("common.cancel")}
        </button>
      </div>
    </Window>
  );
}
