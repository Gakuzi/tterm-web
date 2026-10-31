// The sliding sidebar: one menu for everything, as approved on 11.10, with
// notes beside machines from 0.1.0, as on the canvas of 19.10. Each project
// has its machines with their terminals, and its notes in folders. A machine
// and a folder are the same kind of row: a click folds or unfolds it, and
// its "+" opens a new terminal on the machine or starts a note in the
// folder. The project's name opens its page. What is folded is remembered
// in this browser.
//
// It slides over the page and does not push it, so that opening it never
// changes the terminal's width; pinned, it narrows the page once. A terminal
// pointed at offers End (from 0.0.8), which asks first. The account at the
// bottom opens the account page (from 0.0.10). From 0.1.1 each project's
// badge is in its color, and New project makes one of one's own. From 0.1.2
// a double click on a terminal names it right there. From 0.1.4 the account
// at the bottom opens a menu: Settings, Account, Sign out; and in the app
// before signing in (local.ts) the sidebar has Personal with this computer,
// a card about signing in, and at the bottom Not signed in, whose menu has
// Settings and Sign in. From 0.1.5 + at Machines and New project are there
// before signing in too, and say what signing in brings (NeedAccount.tsx).
// From 0.1.6, in the app signed in, the computer it runs on is marked: its
// icon on an amber square and "this Mac" (variant B, canvas version 70);
// without the connection the cloud's machines are grey, and the account
// says Offline. From 0.1.15, in the app with a new version ready, a card
// above the account says so, with Restart (Updates.tsx). From 0.1.16 the
// account's menu has Language after Settings: the languages slide out
// beside it, the one shown on top with a check (canvas version 90); where
// there is no mouse to point, or no room beside, they take the menu's
// place, with an arrow back.

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Machine, Me, Project, TerminalInfo } from "./api";
import { colorClass, terminalName } from "./colors";
import { LANGUAGES, useT, type Lang } from "./i18n";
import {
  Check, ChevronDown, ChevronLeft, ChevronRight, Close, CloudOff, Computer, Doc,
  Folder as FolderIcon, FolderOpen, Gear, Languages, Logo, Moon, People, Person,
  Pin, Plus, Server, SignIn, SignOut, Sun,
} from "./icons";
import { hereWord, onMac } from "./local";
import { NameInput } from "./NameInput";
import { Avatar, NoteIcon } from "./ProjectPage";
import { Face } from "./Face";
import { titled } from "./noteText";
import { manages, ROLE_KEY, writes } from "./rights";
import type { Dot } from "./TabBar";
import { noteTab, projectTab } from "./tabs";
import type { Shown } from "./theme";
import { lastSeen } from "./time";

interface Props {
  me: Me;
  projects: Project[];
  /** Above the account: a new version of the app ready (0.1.15). */
  updateCard?: ReactNode;
  pinned: boolean;
  shownTheme: Shown;
  onToggleTheme: () => void;
  onTogglePin: () => void;
  onClose: () => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  /** What is folded: p:, m: and f: with the id of a project, a machine or a
   * folder. */
  folded: Set<string>;
  onFold: (key: string) => void;
  /** The tab in front. */
  current: string | null;
  terminals: TerminalInfo[];
  dotFor: (terminal: TerminalInfo) => Dot;
  onOpenProject: (projectId: string) => void;
  onAddMachine: (projectId: string) => void;
  onNewTerminal: (machine: Machine) => void;
  onGoTo: (terminalId: string) => void;
  onEndTerminal: (terminal: TerminalInfo) => void;
  /** The terminal being named here, if one is (0.1.2). */
  renaming: string | null;
  onStartRename: (terminalId: string) => void;
  onRename: (terminalId: string, name: string) => void;
  onStopRename: (terminalId: string) => void;
  /** The second press of a double click: the sidebar stays, a click on a
   * terminal having asked it to slide away. */
  onKeepOpen: () => void;
  onNewFolder: (project: Project) => void;
  onNewNote: (folderId: string) => void;
  onOpenNote: (noteId: string) => void;
  onNewProject: () => void;
  /** The machines page. */
  onHome: () => void;
  notYet: (what: string) => void;
  /** The app before signing in (0.1.4): this computer only. */
  local: boolean;
  /** The app signed in, without the connection to tTerm (0.1.6). */
  cutOff?: boolean;
  /** The page of the account's menu shown now, if one is (0.1.4). */
  page: AccountPage | null;
  onSettings: () => void;
  onAccount: () => void;
  onSignOut: () => void;
  /** In the app before signing in: sign in with the browser. */
  onSignIn: () => void;
  /** The language shown, and another chosen (0.1.16). */
  language: Lang;
  onLanguage: (lang: Lang) => void;
}

/** The pages behind the menu of the account at the bottom (0.1.4). */
export type AccountPage = "settings" | "account";

/** The ⌄ before a row: turned while folded. Only for the mouse: the row's
 * name does the same and is the one the keyboard reaches. */
function Chevron({ open, onClick }: { open: boolean; onClick: () => void }) {
  return (
    <button type="button" className="sb-chevron" tabIndex={-1} aria-hidden="true"
      data-open={open} onClick={onClick}>
      <ChevronDown size={13} />
    </button>
  );
}

function Label(props: { text: string; plus?: { title: string; onClick: () => void } }) {
  return (
    <div className="sb-label">
      <span>{props.text}</span>
      {props.plus && (
        <button type="button" className="sb-plus" aria-label={props.plus.title}
          title={props.plus.title} onClick={props.plus.onClick}>
          <Plus size={13} />
        </button>
      )}
    </div>
  );
}

export function Sidebar(props: Props) {
  const { me, projects, pinned, shownTheme, folded, onFold, current, local } = props;
  const { terminals, dotFor } = props;
  const t = useT();
  const themeLabel = shownTheme === "light" ? t("sidebar.theme_dark")
    : t("sidebar.theme_light");

  const machineRows = (m: Machine) => {
    const key = `m:${m.id}`;
    const open = !folded.has(key);
    const mine = terminals.filter((x) => x.machineId === m.id);
    const computer = m.kind === "computer";
    const here = !!m.here;
    // In the app without the connection the cloud's machines wait for it;
    // the computer it runs on works on.
    const waits = !!props.cutOff && !here;
    const offline = (computer && !m.online && !here) || waits;
    const seen = offline && !waits ? lastSeen(m.lastSeen, t) : "";
    return (
      <div key={m.id} className="sb-group">
        <div className="sb-row">
          <Chevron open={open} onClick={() => onFold(key)} />
          <button type="button" className={offline ? "sb-name offline" : "sb-name"}
            aria-expanded={open}
            title={waits
              ? t("sidebar.waits", { name: m.name })
              : offline
              ? (seen ? t("sidebar.offline_seen", { name: m.name, seen })
                : t("sidebar.offline", { name: m.name }))
              : here
              ? t(onMac() ? "sidebar.here.mac" : "sidebar.here.computer", { name: m.name })
              : t(open ? "sidebar.fold" : "sidebar.unfold", { name: m.name })}
            onClick={() => onFold(key)}>
            {here ? (
              <span className="here-mark" aria-hidden="true"><Computer size={13} /></span>
            ) : computer ? <Computer size={14} /> : <Server size={14} />}
            <span className="sb-text">{m.name}</span>
            {here && <span className="here-pill">{hereWord(t)}</span>}
            {!open && mine.length > 0 && <span className="sb-count">{mine.length}</span>}
            {computer && (
              <span className={offline ? "sb-state away" : "sb-state on"}
                aria-hidden="true" />
            )}
          </button>
          <button type="button" className="sb-plus"
            aria-label={t("sidebar.new_terminal_on", { name: m.name })}
            title={t("sidebar.new_terminal")}
            onClick={() => props.onNewTerminal(m)}>
            <Plus size={13} />
          </button>
        </div>
        {open && mine.map((term) => {
          const dot = dotFor(term);
          const canRename = dot !== "ended";
          if (canRename && props.renaming === term.id) {
            return (
              <div key={term.id} className="sb-rename">
                <div className="sb-rename-row">
                  <Avatar who={null} me={me} size="xs" />
                  <NameInput id={term.id} name={term.name} className="sb-rename-input"
                    describedBy={`sb-rename-${term.id}`} onRename={props.onRename}
                    onStop={() => props.onStopRename(term.id)} />
                </div>
                <span className="sb-rename-hint" id={`sb-rename-${term.id}`}>
                  {t("sidebar.rename_hint")}
                </span>
              </div>
            );
          }
          const said = dot === "away"
            ? t("sidebar.go_to_away", { label: term.label, machine: m.name })
            : t("sidebar.go_to", { label: term.label });
          return (
            <div key={term.id} className="sb-leaf-row">
              <button type="button" className="sb-leaf"
                aria-current={current === term.id ? "page" : undefined}
                title={canRename ? `${said}\n${t("sidebar.double_click")}` : said}
                onMouseDown={(e) => {
                  if (e.detail > 1 && canRename) props.onKeepOpen();
                }}
                onClick={(e) => {
                  // The second click of a double one: the name, not again
                  // the terminal.
                  if (e.detail < 2) props.onGoTo(term.id);
                }}
                onDoubleClick={() => {
                  if (canRename) props.onStartRename(term.id);
                }}>
                <Avatar who={null} me={me} size="xs" />
                <span className="sb-text">{terminalName(term.name, t)}</span>
                {dot !== "open" && <span className={`dot ${dot}`} aria-hidden="true" />}
              </button>
              <button type="button" className="tree-action"
                aria-label={t("sidebar.end", { label: term.label })}
                title={t("sidebar.end_title", { label: term.label })}
                onClick={() => props.onEndTerminal(term)}>
                <Close size={13} />
              </button>
            </div>
          );
        })}
      </div>
    );
  };

  const folderRows = (project: Project) => project.folders.map((f) => {
    const key = `f:${f.id}`;
    const open = !folded.has(key);
    return (
      <div key={f.id} className="sb-group">
        <div className="sb-row">
          <Chevron open={open} onClick={() => onFold(key)} />
          <button type="button" className="sb-name" aria-expanded={open}
            title={t(open ? "sidebar.fold" : "sidebar.unfold", { name: f.name })}
            onClick={() => onFold(key)}>
            {open ? <FolderOpen size={14} /> : <FolderIcon size={14} />}
            <span className="sb-text">{f.name}</span>
            {!open && f.notes.length > 0 && <span className="sb-count">{f.notes.length}</span>}
          </button>
          {writes(project) && (
            <button type="button" className="sb-plus"
              aria-label={t("sidebar.new_note_in", { name: f.name })}
              title={t("sidebar.new_note_in", { name: f.name })}
              onClick={() => props.onNewNote(f.id)}>
              <Plus size={13} />
            </button>
          )}
        </div>
        {open && f.notes.map((n) => (
          <button key={n.id} type="button" className="sb-leaf"
            aria-current={current === noteTab(n.id) ? "page" : undefined}
            onClick={() => props.onOpenNote(n.id)}>
            <span className="sb-leaf-icon" aria-hidden="true"><NoteIcon note={n} /></span>
            <span className={n.title.trim() ? "sb-text" : "sb-text untitled"}>
              {titled(n.title, t)}
            </span>
            {n.total > 0 && <span className="sb-progress">{n.done}/{n.total}</span>}
          </button>
        ))}
        {open && f.notes.length === 0 && (
          <div className="sb-none deep">
            {writes(project) ? t("sidebar.empty_folder_writes") : t("sidebar.empty_folder")}
          </div>
        )}
      </div>
    );
  });

  return (
    <aside className="sidebar" aria-label={t("sidebar.label")}
      onMouseEnter={props.onMouseEnter} onMouseLeave={props.onMouseLeave}>
      <div className="sidebar-head">
        <button type="button" className="brand-button" onClick={props.onHome}
          title={t("sidebar.all_machines")}>
          <Logo size={22} />
          <span className="brand">tTerm</span>
        </button>
        <button type="button" className="icon-button small"
          aria-label={t("sidebar.keep_open")} aria-pressed={pinned}
          title={pinned ? t("sidebar.let_slide") : t("sidebar.keep_open_title")}
          onClick={props.onTogglePin}>
          <Pin size={16} />
        </button>
        <button type="button" className="icon-button small"
          aria-label={t("sidebar.close")} onClick={props.onClose}>
          <Close size={16} />
        </button>
      </div>

      <div className="sidebar-body">
        <div className="section-label">{t("sidebar.projects")}</div>
        {projects.map((project) => {
          const key = `p:${project.id}`;
          const open = !folded.has(key);
          return (
            <div key={project.id} className={`sb-project ${colorClass(project.color)}`}>
              <div className="project-row">
                <button type="button" className="chevron" aria-expanded={open}
                  aria-label={t(open ? "sidebar.fold" : "sidebar.unfold", { name: project.name })}
                  onClick={() => onFold(key)}>
                  <ChevronDown size={14} />
                </button>
                <button type="button" className="project-name"
                  aria-current={current === projectTab(project.id) ? "page" : undefined}
                  title={t("sidebar.open_project", { name: project.name })}
                  onClick={() => props.onOpenProject(project.id)}>
                  <span className="code-badge" aria-hidden="true">{project.code}</span>
                  <span className="project-title">{project.name}</span>
                  <span className="role">{t(ROLE_KEY[project.role])}</span>
                </button>
              </div>
              {open && (
                <div className="sb-inside">
                  <Label text={t("sidebar.machines")} plus={manages(project) ? {
                    title: t("sidebar.add_machine"),
                    onClick: () => props.onAddMachine(project.id),
                  } : undefined} />
                  {project.machines.length === 0 && (
                    <div className="sb-none">{t("sidebar.no_machines")}</div>
                  )}
                  {project.machines.map(machineRows)}
                  <Label text={t("sidebar.notes")} plus={writes(project) ? {
                    title: t("sidebar.new_folder"),
                    onClick: () => props.onNewFolder(project),
                  } : undefined} />
                  {project.folders.length === 0 && (
                    <div className="sb-none">
                      {writes(project) ? t("sidebar.no_notes_writes")
                        : t("sidebar.no_notes")}
                    </div>
                  )}
                  {folderRows(project)}
                </div>
              )}
            </div>
          );
        })}
        {/* Before signing in too (0.1.5): it says what signing in brings. */}
        <button type="button" className="new-project" onClick={props.onNewProject}>
          <span className="dashed-tile" aria-hidden="true">
            <Plus size={13} />
          </span>
          {t("sidebar.new_project")}
        </button>
        {local && <SignInCard onSignIn={props.onSignIn} />}
      </div>

      {props.updateCard}
      <div className="sidebar-foot">
        <AccountPlace me={me} local={local} page={props.page}
          cutOff={!!props.cutOff}
          onSettings={props.onSettings} onAccount={props.onAccount}
          onSignOut={props.onSignOut} onSignIn={props.onSignIn}
          language={props.language} onLanguage={props.onLanguage} />
        <button type="button" className="icon-button"
          aria-label={themeLabel} title={themeLabel}
          onClick={props.onToggleTheme}>
          {shownTheme === "light" ? <Moon size={17} /> : <Sun size={17} />}
        </button>
      </div>
    </aside>
  );
}

/** In the app before signing in, under Personal: what signing in adds. */
function SignInCard(props: { onSignIn: () => void }) {
  const t = useT();
  return (
    <div className="sb-signin">
      <span className="sb-signin-icons" aria-hidden="true">
        <Server size={15} />
        <Doc size={15} />
        <People size={15} />
      </span>
      <strong>{t("sidebar.signin_title")}</strong>
      <span>{t("sidebar.signin_text")}</span>
      <button type="button" className="button-accent" onClick={props.onSignIn}>
        {t("common.sign_in")}
      </button>
    </div>
  );
}

function MenuItem(props: {
  icon: ReactNode;
  text: string;
  current?: boolean;
  accent?: boolean;
  onClick: () => void;
}) {
  return (
    <button type="button" role="menuitem"
      className={props.accent ? "menu-item accent" : "menu-item"}
      aria-current={props.current ? "page" : undefined} onClick={props.onClick}>
      {props.icon}
      <span className="menu-text">{props.text}</span>
    </button>
  );
}

/** Where the languages show (0.1.16): beside the menu, where a mouse points
 * and there is room right of the sidebar; else in the menu's place. */
type LanguageList = "shut" | "beside" | "inside";

/** The list beside the menu, as wide as on the canvas, and the room it
 * wants right of the sidebar. */
const LIST_WIDTH = 220;
/** How long the list waits for the mouse on its way from Language to it. */
const LEAVE_MS = 250;

/** The account at the bottom of the sidebar: the name and the plan, and in
 * the app before signing in Not signed in. A click opens its menu above it,
 * which closes on a choice, a click elsewhere, or Esc; the arrow keys walk
 * its items. It lights up under the mouse, and while one of its pages is
 * open. Its Language (0.1.16) shows the languages beside the menu while the
 * mouse is on it or on them; with the keys, → or Enter opens them and ← or
 * Esc goes back. */
function AccountPlace(props: {
  me: Me;
  local: boolean;
  /** In the app without the connection: Offline instead of the plan. */
  cutOff: boolean;
  page: AccountPage | null;
  onSettings: () => void;
  onAccount: () => void;
  onSignOut: () => void;
  onSignIn: () => void;
  language: Lang;
  onLanguage: (lang: Lang) => void;
}) {
  const { me, local } = props;
  const t = useT();
  const [open, setOpen] = useState(false);
  const [list, setList] = useState<LanguageList>("shut");
  const box = useRef<HTMLDivElement>(null);
  const leave = useRef(0);
  const plan = me.plan === "free" ? t("account_menu.free_plan") : me.plan;

  // The menu shut, its languages too.
  useEffect(() => {
    if (open) return;
    window.clearTimeout(leave.current);
    setList("shut");
  }, [open]);
  useEffect(() => () => window.clearTimeout(leave.current), []);

  /** Focus on what matches, once it is drawn. */
  const focusOn = (selector: string) => {
    window.requestAnimationFrame(() =>
      box.current?.querySelector<HTMLElement>(selector)?.focus());
  };
  const roomBeside = () => {
    const foot = box.current?.closest(".sidebar-foot") ?? box.current;
    const right = foot?.getBoundingClientRect().right ?? 0;
    return !!window.matchMedia?.("(hover: hover) and (pointer: fine)").matches &&
      window.innerWidth - right >= LIST_WIDTH + 12;
  };
  const showList = (withKeys: boolean) => {
    window.clearTimeout(leave.current);
    const where = roomBeside() ? "beside" : "inside";
    setList(where);
    if (withKeys || where === "inside") focusOn("[role='menuitemradio'][aria-checked='true']");
  };
  const hideList = () => {
    window.clearTimeout(leave.current);
    setList("shut");
    focusOn(".lang-item");
  };
  const leaveSoon = () => {
    window.clearTimeout(leave.current);
    leave.current = window.setTimeout(
      () => setList((was) => (was === "beside" ? "shut" : was)), LEAVE_MS);
  };

  useEffect(() => {
    if (!open) return;
    const away = (event: MouseEvent) => {
      if (!box.current?.contains(event.target as Node)) setOpen(false);
    };
    const keys = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        if (list !== "shut") {
          hideList();
          return;
        }
        setOpen(false);
        box.current?.querySelector<HTMLButtonElement>(".account")?.focus();
        return;
      }
      if (!box.current?.contains(document.activeElement)) return;
      const inList = !!box.current.querySelector(".lang-list")?.contains(document.activeElement);
      if (event.key === "ArrowLeft" && (inList || list === "inside")) {
        event.preventDefault();
        hideList();
        return;
      }
      if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
      // The list beside, while the keys are in it; else the menu, which
      // is the list in its place.
      const scope = inList ? box.current.querySelector(".lang-list")
        : box.current.querySelector(".menu.up");
      const items = [...(scope?.querySelectorAll<HTMLButtonElement>(
        "[role='menuitem'], [role='menuitemradio']") ?? [])];
      if (!items.length) return;
      event.preventDefault();
      const at = items.indexOf(document.activeElement as HTMLButtonElement);
      const next = event.key === "ArrowDown" ? (at + 1) % items.length
        : at < 0 ? items.length - 1 : (at - 1 + items.length) % items.length;
      items[next].focus();
    };
    const left = (event: FocusEvent) => {
      const next = event.relatedTarget as Node | null;
      if (next && !box.current?.contains(next)) setOpen(false);
    };
    const anchor = box.current;
    document.addEventListener("mousedown", away);
    window.addEventListener("keydown", keys, true);
    anchor?.addEventListener("focusout", left);
    return () => {
      document.removeEventListener("mousedown", away);
      window.removeEventListener("keydown", keys, true);
      anchor?.removeEventListener("focusout", left);
    };
  }, [open, list]);

  const pick = (then: () => void) => () => {
    setOpen(false);
    then();
  };
  const choose = (lang: Lang) => {
    setOpen(false);
    box.current?.querySelector<HTMLButtonElement>(".account")?.focus();
    props.onLanguage(lang);
  };

  // The language shown on top, with its check; under a line the others,
  // in the order of the site; each in its own name and language.
  const current = LANGUAGES.find((l) => l.code === props.language) ?? LANGUAGES[0];
  const languages = (
    <>
      <button type="button" role="menuitemradio" aria-checked="true"
        lang={current.code} className="menu-item lang-choice shown"
        onClick={() => choose(current.code)}>
        <span className="menu-text">{current.name}</span>
        <Check size={15} />
      </button>
      <div className="menu-line" role="separator" />
      {LANGUAGES.filter((l) => l.code !== current.code).map((l) => (
        <button key={l.code} type="button" role="menuitemradio" aria-checked="false"
          lang={l.code} className="menu-item lang-choice"
          onClick={() => choose(l.code)}>
          <span className="menu-text">{l.name}</span>
        </button>
      ))}
    </>
  );
  const languageItem = (
    <button type="button" role="menuitem" aria-haspopup="menu"
      aria-expanded={list === "beside"}
      className={list === "beside" ? "menu-item lang-item open" : "menu-item lang-item"}
      onMouseEnter={() => {
        if (roomBeside()) showList(false);
      }}
      onMouseLeave={() => {
        if (list === "beside") leaveSoon();
      }}
      // A click from the keys (Enter, Space) has no detail: the focus goes
      // into the list.
      onClick={(event) => showList(event.detail === 0)}
      onKeyDown={(event) => {
        if (event.key !== "ArrowRight") return;
        event.preventDefault();
        showList(true);
      }}>
      <Languages size={15} />
      <span className="menu-text">{t("language.item")}</span>
      <ChevronRight size={14} className="menu-more" />
    </button>
  );

  return (
    <div className="account-box" ref={box}>
      <button type="button" className={open ? "account open" : "account"}
        aria-haspopup="menu" aria-expanded={open}
        aria-current={props.page ? "page" : undefined}
        title={local ? t("account_menu.title_local") : t("account_menu.title")}
        onClick={(event) => {
          // Safari does not give a clicked button the keys: here it takes
          // them, for the menu's arrows and Esc, and so that the terminal
          // in front does not.
          event.currentTarget.focus();
          setOpen((was) => !was);
        }}>
        {local ? (
          <>
            <span className="avatar nobody" aria-hidden="true"><Person size={15} /></span>
            <span className="account-text">
              <strong>{t("account_menu.not_signed_in")}</strong>
              <span>{t("account_menu.only_here")}</span>
            </span>
          </>
        ) : (
          <>
            <Face initials={me.initials} photo={me.photo} className="mine" />
            <span className="account-text">
              <strong>{me.firstName}</strong>
              {props.cutOff ? (
                <span className="account-offline">
                  <CloudOff size={13} />{t("account_menu.offline")}
                </span>
              ) : <span>{plan}</span>}
            </span>
          </>
        )}
      </button>
      {/* After the button, so that Tab goes from it into the menu. */}
      {open && (
        <div className="menu up" role="menu"
          aria-labelledby={list === "inside" ? undefined : "account-menu-name"}
          aria-label={list === "inside" ? t("language.item") : undefined}
          aria-describedby={list !== "inside" && (local || me.email) ? "account-menu-note" : undefined}>
          {list === "inside" ? (
            <>
              <button type="button" role="menuitem" className="menu-item lang-back"
                title={t("common.back")} onClick={hideList}>
                <ChevronLeft size={16} />
                <span className="menu-text">{t("language.item")}</span>
              </button>
              <div className="menu-line" role="separator" />
              {languages}
            </>
          ) : local ? (
            <>
              <div className="menu-head">
                <strong id="account-menu-name">{t("account_menu.not_signed_in")}</strong>
                <span id="account-menu-note">{t("account_menu.local_note")}</span>
              </div>
              <div className="menu-line" role="separator" />
              <MenuItem icon={<Gear size={15} />} text={t("settings.title")}
                current={props.page === "settings"} onClick={pick(props.onSettings)} />
              {languageItem}
              <div className="menu-line" role="separator" />
              <MenuItem icon={<SignIn size={15} />} text={t("common.sign_in")} accent
                onClick={pick(props.onSignIn)} />
            </>
          ) : (
            <>
              <div className="menu-head with-avatar">
                <Face initials={me.initials} photo={me.photo} className="mine menu-avatar" />
                <span className="menu-head-text">
                  <strong id="account-menu-name">{me.name}</strong>
                  {me.email && <span id="account-menu-note">{me.email}</span>}
                </span>
              </div>
              <div className="menu-line" role="separator" />
              <MenuItem icon={<Gear size={15} />} text={t("settings.title")}
                current={props.page === "settings"} onClick={pick(props.onSettings)} />
              {languageItem}
              <MenuItem icon={<Person size={15} />} text={t("account.title")}
                current={props.page === "account"} onClick={pick(props.onAccount)} />
              <div className="menu-line" role="separator" />
              <MenuItem icon={<SignOut size={15} />} text={t("account_menu.sign_out")}
                onClick={pick(props.onSignOut)} />
            </>
          )}
        </div>
      )}
      {open && list === "beside" && (
        <div className="menu lang-list" role="menu" aria-label={t("language.item")}
          onMouseEnter={() => window.clearTimeout(leave.current)}
          onMouseLeave={leaveSoon}>
          {languages}
        </div>
      )}
    </div>
  );
}
