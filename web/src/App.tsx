import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AddMachine } from "./AddMachine";
import { AppLinkWindow, AppWelcome } from "./AppSignIn";
import {
  acceptProjectInvite, CoreError, createFolder, createNote, createProject, deleteFolder, deleteNote,
  deleteProject, editProject, endTerminal, loadLogToday, loadNote, loadState, moveMachine,
  moveNote, NoteGone, onSignedOut, openTerminal, removeMachine, renameFolder,
  renameMachine, renameTerminal, saveLanguage, saveProjectTint, saveTheme, SignedOut, signInApp, signOut,
  validateInviteToken, welcomeSeen, type Folder, type FoundBlock, type FoundNote,
  type InviteValidationResult, type Machine, type MachineKind, type Note, type NoteSummary, type Project,
  type ProjectFields, type ProjectTint, type State, type TerminalInfo,
  type Theme,
} from "./api";
import { colorClass, terminalName } from "./colors";
import { Confirm, Removed } from "./Confirm";
import { Finder, type FinderGroup, type FinderItem } from "./Finder";
import { foundBlock, foundLine, foundNote } from "./found";
import {
  ChevronRight, Close, CloudOff, CloudUp, Computer, Doc, Folder as FolderIcon, Gear, ListCheck,
  Moon, Pencil, Person, Pin, Plus, Server, SignIn as SignInIcon,
  SignOut as SignOutIcon, Sun, Trash,
} from "./icons";
import {
  languageOf, list, showLanguage, t as say, useT, type Lang, type Translate,
} from "./i18n";
import { hereWord, onMac } from "./local";
import { InApp, LocalOnly } from "./local";
import { LogView } from "./LogView";
import { Machines } from "./Machines";
import { MoveToCloud } from "./MoveToCloud";
import { MoveContext, type MoveFrame } from "./SshStrip";
import { VaultDialogHost } from "./VaultDialogs";
import { useVault, vaultStore } from "./vault/store";
import { closedHere, logClosedHere } from "./keysHere";
import { KeysClosed, KeysHere } from "./KeysClosed";
import { FolderDialog } from "./Menus";
import { NeedAccount, type Need } from "./NeedAccount";
import { forgetSupportDraft, SupportDialog } from "./SupportDialog";
import { draftsOf, forgetDrafts, markDeleted } from "./drafts";
import { initNotificationBot } from "./notifications";
import { NotificationPromptBanner } from "./NotificationPromptBanner";
import { NotificationHttpNoticeModal } from "./NotificationHttpNoticeModal";
import { TelegramLinkBanner } from "./TelegramLinkBanner";
import { NoteView, primeNote, type SaveState, type Typed } from "./NoteView";
import { summary, titled, toMarkdown } from "./noteText";
import {
  DeleteProjectDialog, MoveDialog, MoveNoteDialog, ProjectDialog, type NoteTarget,
} from "./ProjectDialog";
import { ProjectPage } from "./ProjectPage";
import { Search, type LocalEntry } from "./Search";
import { alone, deletesNote, manages, writes } from "./rights";
import { Settings } from "./Settings";
import { settingsAt, type SettingsSection } from "./settingsSearch";
import { Sidebar, type AccountPage } from "./Sidebar";
import { SignIn } from "./SignIn";
import { socket } from "./socket";
import { TabBar, type Dot, type SaveLine, type TabView } from "./TabBar";
import {
  isTerminalTab, keysTab, logTab, noteTab, projectTab, rememberedFolds, rememberedTabs,
  rememberFolds, rememberTabs, shortcut, tabKind, tabOfPath, tabPath,
  tabTarget, TABS_MAX,
} from "./tabs";
import { TerminalView, type TabStatus } from "./TerminalView";
import { UpdateCard, UpdatePill, UpdateState, UpdatedToast, useAppUpdate } from "./Updates";
import {
  applyTheme, onSystemThemeChange, rememberedPin, rememberPin, shown,
  type Shown,
} from "./theme";
import { ago, lastSeen } from "./time";
import { Welcome } from "./Welcome";

/** Hovering the ⟩ opens the sidebar after this pause, so that a mouse merely
 * passing by does not throw it open. */
const OPEN_DELAY_MS = 180;
/** Leaving the sidebar closes it after this pause, forgiving a sloppy mouse. */
const CLOSE_DELAY_MS = 250;
/** A terminal clicked in the sidebar: the sidebar slides away after this,
 * so that a second click can still name the terminal (0.1.2). */
const DOUBLE_CLICK_MS = 500;
const TOAST_MS = 3200;
/** How often the page asks whether computers came online or went. */
const COMPUTERS_MS = 10_000;
/** Without computers, how often it asks what changed elsewhere: notes
 * written on another device, say. */
const LISTS_MS = 60_000;

/** /t/<id> is a terminal, /n/<id> a note, /p/<id> a project's page (tabs.ts),
 * in the app /move Move to cloud (0.1.17); anything else is the machines
 * page. /settings/<section> is the Settings window over the page it was
 * opened on (from 0.1.27, Settings.tsx; /account, the account's page until
 * then, is its Account). */
const PAGE_PATH = /^\/(move)\/?$/;

/** The page of the account's menu at this address, if it is one. */
function pageOf(path: string): AccountPage | null {
  const found = PAGE_PATH.exec(path);
  return found ? (found[1] as AccountPage) : null;
}

/** The sign-in screen's note when a session ends with nothing done here:
 * eight hours away, or signed out from another device. A key: said in the
 * language shown when it ends. */
const SESSION_ENDED = "app.session_ended";

/** The core is on this very computer (the owner's laptop): then it is the
 * window running it that is worth a look. */
const LOCAL = ["localhost", "127.0.0.1", "[::1]"].includes(location.hostname);

/** A first guess at the window in characters, for the shell to start with;
 * the terminal measures itself exactly as soon as it is on screen. */
function guessSize(): { cols: number; rows: number } {
  return {
    cols: Math.max(20, Math.floor((window.innerWidth - 32) / 7.8)),
    rows: Math.max(5, Math.floor((window.innerHeight - 64) / 15)),
  };
}

function withTab(tabs: string[], id: string): string[] {
  if (tabs.includes(id)) return tabs;
  // Past the most there may be, the oldest tab goes; its terminal stays.
  return [...tabs, id].slice(-TABS_MAX);
}

/** A tab's dot: what the page has heard of it, or else what the list says. */
function dotOf(status: TabStatus | undefined, known: TerminalInfo | undefined,
  missing: boolean): Dot {
  const state = status?.state ?? known?.state ?? (missing ? "gone" : "connecting");
  if (state === "ended" || state === "gone") return "ended";
  if (status ? status.away : known?.away) return "away";
  if (state === "connecting" || status?.running) return "busy";
  return "open";
}

/** The step in the history of Settings or Move to cloud: where it was
 * opened from. */
interface PageMark {
  pageFrom: string;
}

/** What waits for a yes before it is done. */
type Asking =
  | { kind: "remove"; machine: Machine }
  | { kind: "end"; terminal: TerminalInfo }
  | { kind: "note"; noteId: string; title: string; folder: Folder; project: Project }
  | { kind: "folder"; folder: Folder; project: Project };

/** A terminal being named: in its tab, from 0.1.2 also in the sidebar or
 * on its project's page. */
interface Renaming {
  id: string;
  where: "tab" | "side" | "page";
}

/** A note on its way to another project (0.1.2): asked from its tab or
 * from its project's page. */
interface MovingNote {
  noteId: string;
  from: "tab" | "page";
}

/** The window that names a folder: a new one, or one renamed. */
type Naming =
  | { kind: "new"; project: Project }
  | { kind: "rename"; folder: Folder; project: Project };

/** What lists show of a note while it is open, ahead of the lists from the
 * core: its title as it is typed, and who saved it last, as of a version. */
type Live = Partial<Typed & Pick<NoteSummary, "editedAt" | "editedBy">>;

function sameStatus(a: TabStatus | undefined, b: TabStatus): boolean {
  return !!a && a.label === b.label && a.machine === b.machine &&
    a.where === b.where && a.state === b.state && a.away === b.away &&
    a.running === b.running;
}

/** A note as lists show it, from the whole of it. */
function listedNote(note: Note): NoteSummary {
  return {
    id: note.id, title: note.title, ...summary(note.blocks), version: note.version,
    createdBy: note.createdBy, createdAt: note.createdAt,
    editedBy: note.editedBy, editedAt: note.editedAt,
  };
}

function byName(a: Folder, b: Folder): number {
  return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
}

/** The state with one project's folders changed. */
function withFolders(state: State, projectId: string,
  change: (folders: Folder[]) => Folder[]): State {
  return { ...state, projects: state.projects.map((p) =>
    (p.id === projectId ? { ...p, folders: change(p.folders) } : p)) };
}

/** The state with every folder changed the same way. */
function eachFolder(state: State, change: (folder: Folder) => Folder): State {
  return { ...state, projects: state.projects.map((p) =>
    ({ ...p, folders: p.folders.map(change) })) };
}

/** The note moved in the lists: out of wherever it was, into its folder,
 * which the lists may not have yet: one made for it in another project. */
function moveListed(state: State, note: Note): State {
  let entry: NoteSummary | undefined;
  let without = eachFolder(state, (f) => {
    const found = f.notes.find((n) => n.id === note.id);
    if (!found) return f;
    entry = found;
    return { ...f, notes: f.notes.filter((n) => n.id !== note.id) };
  });
  if (!state.projects.some((p) => p.folders.some((f) => f.id === note.folderId))) {
    const { id, name, firstName, initials } = state.me;
    without = withFolders(without, note.projectId, (fs) => [...fs, {
      id: note.folderId, name: note.folder, notes: [],
      createdBy: { id, name, firstName, initials },
    }].sort(byName));
  }
  const item = entry ?? listedNote(note);
  return eachFolder(without, (f) => (f.id === note.folderId
    ? { ...f, notes: [...f.notes, item].sort((a, b) => b.createdAt - a.createdAt) }
    : f));
}

/** Where the lists have a note: its folder and its project. */
function findNote(projects: Project[], noteId: string):
  { note: NoteSummary; folder: Folder; project: Project } | null {
  for (const project of projects) {
    for (const folder of project.folders) {
      const note = folder.notes.find((n) => n.id === noteId);
      if (note) return { note, folder, project };
    }
  }
  return null;
}

/** The projects as the core sent them, with what open notes have typed:
 * unless the lists know a newer version, saved elsewhere, which a note
 * behind its tab has not seen yet. */
function withLive(projects: Project[], live: Record<string, Live>): Project[] {
  if (!Object.keys(live).length) return projects;
  const ahead = (n: NoteSummary) => {
    const l = live[n.id];
    return !!l && (l.version ?? 0) >= n.version;
  };
  return projects.map((p) => ({
    ...p,
    folders: p.folders.map((f) => (f.notes.some(ahead) ? {
      ...f, notes: f.notes.map((n) => (ahead(n) ? { ...n, ...live[n.id] } : n)),
    } : f)),
  }));
}

/** What to unfold in the sidebar to see the tab's terminal, note or project. */
function revealKeys(tab: string, state: State): string[] {
  const id = tabTarget(tab);
  const kind = tabKind(tab);
  if (kind === "project") return [`p:${id}`];
  if (kind === "keys") {
    const project = state.projects.find((p) => p.machines.some((m) => m.id === id));
    return project ? [`p:${project.id}`, `m:${id}`] : [];
  }
  if (kind === "log") {
    const project = state.projects.find((p) => p.machines.some((m) => m.id === id));
    return project ? [`p:${project.id}`, `l:${project.id}`] : [];
  }
  if (kind === "note") {
    const where = findNote(state.projects, id);
    return where ? [`p:${where.project.id}`, `f:${where.folder.id}`] : [];
  }
  const terminal = state.terminals.find((t) => t.id === id);
  const project = terminal && state.projects.find((p) =>
    p.machines.some((m) => m.id === terminal.machineId));
  return terminal && project ? [`p:${project.id}`, `m:${terminal.machineId}`] : [];
}

/** Copies text that is still on its way. Safari lets a page copy only
 * within the click itself, which a promise in a ClipboardItem keeps. */
async function copyLater(text: Promise<string>): Promise<void> {
  if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
    try {
      await navigator.clipboard.write([new ClipboardItem({
        "text/plain": text.then((t) => new Blob([t], { type: "text/plain" })),
      })]);
      return;
    } catch (error) {
      if (error instanceof CoreError) throw error;
      // The browser takes text only: below.
    }
  }
  await navigator.clipboard.writeText(await text);
}

/** How saving goes in the note in front, for the line on top. */
function saveLine(state: SaveState | undefined, t: Translate): SaveLine | null {
  if (state === "saved") return { text: t("app.saved"), kind: "saved" };
  if (state === "saving" || state === "unsaved") return { text: t("app.saving"), kind: "saving" };
  if (state === "offline") return { text: t("app.not_saved_offline"), kind: "warn" };
  if (state === "refused" || state === "conflict") return { text: t("app.not_saved"), kind: "warn" };
  return null;
}


export function App() {
  const t = useT();
  const [state, setState] = useState<State | null>(null);
  /** Commands each machine ran today, for the Logs folder (0.1.20): asked
   * with the lists, apart from them, and not in the app before signing in,
   * which has no logs. */
  const [logToday, setLogToday] = useState<Record<string, number>>({});
  const countToday = useCallback((local: boolean | undefined) => {
    if (local) return;
    loadLogToday().then(setLogToday).catch(() => {});
  }, []);
  const [problem, setProblem] = useState<string | null>(null);
  const [theme, setTheme] = useState<Theme>("system");
  /** How much of a project's color the sidebar shows (0.1.1). */
  const [tint, setTint] = useState<ProjectTint>("badge");
  const [shownTheme, setShownTheme] = useState<Shown>(() =>
    document.documentElement.classList.contains("tt-light") ? "light" : "dark");
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(rememberedPin);
  const [toast, setToast] = useState<string | null>(null);
  const [adding, setAdding] =
    useState<{ projectId: string; kind: MachineKind } | null>(null);
  const [path, setPath] = useState(location.pathname);
  const [tabs, setTabs] = useState<string[]>(rememberedTabs);
  const [statuses, setStatuses] = useState<Record<string, TabStatus>>({});
  const [picking, setPicking] = useState(false);
  const [palette, setPalette] = useState(false);
  /** A command search put into a terminal's line (0.1.7). */
  const [paste, setPaste] =
    useState<{ terminalId: string; text: string; n: number } | null>(null);
  const pasteN = useRef(0);
  const [online, setOnline] = useState(true);
  const [asking, setAsking] = useState<Asking | null>(null);
  const [naming, setNaming] = useState<Naming | null>(null);
  /** The window of a new project, or the pencil on a project (0.1.1). */
  const [projectWindow, setProjectWindow] = useState<{ project?: Project } | null>(null);
  /** New project or Add machine before signing in (0.1.5): what signing in
   * brings, in place of their own windows. */
  const [needAccount, setNeedAccount] = useState<Need | null>(null);
  /** Get help > Write to support, open (0.1.25). */
  const [supporting, setSupporting] = useState(false);
  const [moving, setMoving] = useState<Machine | null>(null);
  const [deleting, setDeleting] = useState<Project | null>(null);

  // Project Invite Acceptance state for authenticated users
  const [activeInviteToAccept, setActiveInviteToAccept] = useState<{
    token: string;
    info: InviteValidationResult;
  } | null>(null);
  const [isAcceptingInvite, setIsAcceptingInvite] = useState(false);
  /** The terminal being named, and where. */
  const [renaming, setRenaming] = useState<Renaming | null>(null);
  const renamingRef = useRef(renaming);
  renamingRef.current = renaming;
  const [renamingMachine, setRenamingMachine] = useState<string | null>(null);
  const pinnedRef = useRef(pinned);
  pinnedRef.current = pinned;
  /** The mouse is over the sidebar. */
  const overSidebar = useRef(false);
  const [movingNote, setMovingNote] = useState<MovingNote | null>(null);
  /** Notes moved to another project from their tab: what the tab says. */
  const [movedHere, setMovedHere] = useState<Record<string, string>>({});
  const [removed, setRemoved] = useState<{ name: string; cleanup: string } | null>(null);
  const [folded, setFolded] = useState<Set<string>>(rememberedFolds);
  const [live, setLive] = useState<Record<string, Live>>({});
  const [saveStates, setSaveStates] = useState<Record<string, SaveState>>({});
  /** Not signed in: the sign-in screen, with a note on why, if there is one. */
  const [signedOut, setSignedOut] = useState<{ note: string | null } | null>(null);
  /** In the app before signing in (0.1.6): the window that waits for the
   * browser, with the code the browser shows too. */
  const [linking, setLinking] = useState<string | null>(null);
  /** The app's welcome, once Later or Sign in was pressed on it. */
  const [welcomeGone, setWelcomeGone] = useState(false);
  const openTimer = useRef<number | undefined>(undefined);
  const closeTimer = useRef<number | undefined>(undefined);
  const toastTimer = useRef<number | undefined>(undefined);
  const pruned = useRef(false);
  /** Notes made on this page: their tab puts the caret in the title. */
  const fresh = useRef(new Set<string>());
  /** The address of the page shown: with the Settings window open, the one
   * it was opened on, which stays under it. Opened by its address, the page
   * it was opened from, if this tab remembers one, or the machines page. */
  const lastView = useRef(settingsAt(location.pathname) === null ? location.pathname
    : (history.state as PageMark | null)?.pageFrom ?? "/");
  /** The tab last shown in the sidebar, unfolded. Not the one the page
   * opens with: what was folded stays so over a reload. */
  const revealed = useRef<string | null>(tabOfPath(lastView.current));
  /** Who was signed in on this page last, and with which address. */
  const lastUser = useRef<string | null>(null);
  const lastEmail = useRef<string | null>(null);
  /** Each opening of Move to cloud shows it afresh; the Settings window is
   * new each time it opens anyway: devices that came or went meanwhile,
   * what the plan counts now. */
  const [pageVisit, setPageVisit] = useState(0);
  const stateNow = useRef<State | null>(null);
  stateNow.current = state;
  // Keys open on this device (0.1.28): whether a machine is closed here,
  // and the machines by id, for the callbacks below (set once the lists
  // are there).
  const closedRef = useRef<(machine: Machine) => boolean>(() => false);
  const byIdRef = useRef(new Map<string, Machine>());

  const load = useCallback(() => {
    setProblem(null);
    loadState()
      .then((loaded) => {
        // Drafts of notes are this person's only.
        draftsOf(loaded.me.id);
        if (lastUser.current && lastUser.current !== loaded.me.id) {
          // Someone else signed in on this page: nothing of the one before.
          pruned.current = true;
          setTabs([]);
          setStatuses({});
          setLive({});
          setSaveStates({});
          history.replaceState(null, "", "/");
          setPath("/");
        }
        lastUser.current = loaded.me.id;
        setState(loaded);
        countToday(loaded.local);
        void showLanguage(languageOf(loaded.me));
        setTheme(loaded.me.theme);
        setTint(loaded.me.projectTint ?? "badge");
        if (!pruned.current) {
          // Tabs left from before: those of terminals still running, and of
          // notes and projects still there, stay.
          pruned.current = true;
          const terminals = new Set(loaded.terminals.map((t) => t.id));
          const notes = new Set(loaded.projects.flatMap((p) =>
            p.folders.flatMap((f) => f.notes.map((n) => n.id))));
          const projects = new Set(loaded.projects.map((p) => p.id));
          const machines = new Set(loaded.projects.flatMap((p) => p.machines.map((m) => m.id)));
          const here = tabOfPath(lastView.current);
          setTabs((ts) => ts.filter((tab) => {
            if (tab === here) return true;
            const kind = tabKind(tab);
            if (kind === "terminal") return terminals.has(tab);
            if (kind === "log" || kind === "keys") return machines.has(tabTarget(tab));
            return (kind === "note" ? notes : projects).has(tabTarget(tab));
          }));
        }
      })
      .catch((error) => {
        // Not signed in: onSignedOut below shows the sign-in screen.
        if (error instanceof SignedOut) return;
        setProblem(LOCAL ? "app.not_answering_local" : "app.not_answering");
      });
  }, []);

  useEffect(load, [load]);

  // The person's vault (0.1.17): this person's, signed in; in the app the
  // engine holds it.
  const meId = state?.me.id ?? null;
  const vaultApp = !!state?.app;
  const vaultLocal = !!state?.local;
  const vaultProofs = !!state?.proofs;
  useEffect(() => {
    const me = stateNow.current?.me;
    if (!meId || vaultLocal || !me) return;
    vaultStore.start({ id: me.id, name: me.name, email: me.email }, vaultApp, vaultProofs);
  }, [meId, vaultApp, vaultLocal, vaultProofs]);

  /** The session is over: the sign-in screen, and nothing of the page
   * behind it. A note from Sign out itself wins over one from the socket
   * closing because of it. */
  const endSession = useCallback((note: string | null, firm = true) => {
    // The vault leaves this page's memory with the session (0.1.17).
    vaultStore.stop();
    // In the app signed in (0.1.6) the page starts over instead: the engine
    // has this computer only then, as before signing in.
    if (stateNow.current?.app) {
      location.reload();
      return;
    }
    lastEmail.current = stateNow.current?.me.email ?? lastEmail.current;
    setSignedOut((was) => (firm || !was ? { note } : was));
    setState(null);
    setAdding(null);
    setAsking(null);
    setNaming(null);
    setProjectWindow(null);
    setMoving(null);
    setDeleting(null);
    setRenaming(null);
    setMovingNote(null);
    setRemoved(null);
    setPalette(false);
    setPicking(false);
    setSupporting(false);
  }, []);

  useEffect(() => onSignedOut(() =>
    endSession(lastUser.current ? say(SESSION_ENDED) : null, false)), [endSession]);

  const signedIn = useCallback(() => {
    socket.signedIn();
    setSignedOut(null);
    pruned.current = false;
    load();

    const pending = sessionStorage.getItem("tterm_pending_invite");
    if (pending) {
      sessionStorage.removeItem("tterm_pending_invite");
      acceptProjectInvite(pending)
        .then((res) => {
          if (res.accepted) {
            load();
          }
        })
        .catch(() => {});
    }
  }, [load]);

  /** After a machine connects, a terminal opens or ends, a note or a folder
   * changes: the sidebar and the pages learn of it. Asked in the
   * background: it is not something the person did, and keeps no session
   * on. */
  const asked = useRef(0);
  /** Notes whose tab closed and whose last save is done: the next lists
   * from the core have them as they are. */
  const settled = useRef(new Set<string>());
  const refresh = useCallback(() => {
    const mine = ++asked.current;
    const done = [...settled.current];
    return loadState(true)
      .then((loaded) => {
        // An answer overtaken by a later question is old news: a note just
        // made, moved or deleted would come back from it for a while.
        if (mine !== asked.current) return;
        setState(loaded);
        countToday(loaded.local);
        if (!done.length) return;
        for (const id of done) settled.current.delete(id);
        const open = new Set(shownRef.current.filter((tab) => tabKind(tab) === "note")
          .map(tabTarget));
        const drop = done.filter((id) => !open.has(id));
        if (!drop.length) return;
        const without = <T,>(was: Record<string, T>) => {
          const rest = { ...was };
          for (const id of drop) delete rest[id];
          return rest;
        };
        setLive(without);
        setSaveStates(without);
      })
      .catch(() => {});
  }, []);

  // Check URL hash/query for project invitations when signed in
  useEffect(() => {
    const checkInvite = () => {
      let token = "";
      const hash = window.location.hash || "";
      const search = window.location.search || "";
      const query = new URLSearchParams(search);

      if (query.get("invite")) {
        token = query.get("invite")!;
      } else if (hash.includes("token=")) {
        const match = hash.match(/token=([^&]+)/);
        if (match) token = match[1];
      } else if (hash.includes("invite=")) {
        const match = hash.match(/invite=([^&]+)/);
        if (match) token = match[1];
      }

      if (!token) {
        token = sessionStorage.getItem("tterm_pending_invite") || "";
      }

      if (token && state) {
        validateInviteToken(token)
          .then(async (res) => {
            if (res.valid) {
              // Instantly auto-accept for logged in user
              try {
                const acceptRes = await acceptProjectInvite(token);
                if (acceptRes.accepted) {
                  sessionStorage.removeItem("tterm_pending_invite");
                  if (window.location.hash.includes("invite") || window.location.hash.includes("token")) {
                    window.history.replaceState(null, "", window.location.pathname);
                  }
                  await refresh();
                  setToast(`Вы успешно присоединились к проекту «${res.project?.name || "Проект"}»!`); // i18n-ignore
                  return;
                }
              } catch {
                // Fallback to manual acceptance modal if auto-accept fails
              }
              setActiveInviteToAccept({ token, info: res });
            } else {
              sessionStorage.removeItem("tterm_pending_invite");
            }
          })
          .catch(() => {});
      }
    };

    checkInvite();
    window.addEventListener("hashchange", checkInvite);
    return () => window.removeEventListener("hashchange", checkInvite);
  }, [state]);

  const handleAcceptInvite = async () => {
    if (!activeInviteToAccept) return;
    setIsAcceptingInvite(true);
    try {
      const res = await acceptProjectInvite(activeInviteToAccept.token);
      if (res.accepted) {
        sessionStorage.removeItem("tterm_pending_invite");
        setActiveInviteToAccept(null);
        if (window.location.hash.includes("invite") || window.location.hash.includes("token")) {
          window.history.replaceState(null, "", window.location.pathname);
        }
        await refresh();
        setToast("Вы успешно присоединились к проекту!"); // i18n-ignore
      } else {
        alert(res.error || "Не удалось принять приглашение"); // i18n-ignore
      }
    } catch {
      alert("Сетевая ошибка при принятии приглашения"); // i18n-ignore
    } finally {
      setIsAcceptingInvite(false);
    }
  };

  // A computer comes online when its agent starts and goes when it stops,
  // with nothing done on this page; notes change on other devices. Ask now
  // and then, often while there are computers, and whenever the window
  // comes back into view.
  const ready = !!state;
  const computers = !!state?.projects.some((p) =>
    p.machines.some((m) => m.kind === "computer"));
  useEffect(() => {
    if (!ready) return;
    const timer = window.setInterval(refresh, computers ? COMPUTERS_MS : LISTS_MS);
    window.addEventListener("focus", refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, [ready, computers, refresh]);

  // Addresses: back and forward move between the machines page and tabs
  // the way they would between pages. In place, the address takes the
  // current one's step in the history instead of adding one.
  const navigate = useCallback((to: string, inPlace = false,
    mark: PageMark | null = null) => {
    if (to !== location.pathname) {
      if (inPlace) history.replaceState(mark, "", to);
      else history.pushState(mark, "", to);
    }
    setPath(to);
  }, []);
  useEffect(() => {
    const onPop = () => setPath(location.pathname);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // The Settings window (0.1.27) is over the page it was opened on, which
  // stays as it was under it.
  const settingsSection = settingsAt(path);
  const settingsOpen = settingsSection !== null;
  const settingsOpenNow = useRef(settingsOpen);
  settingsOpenNow.current = settingsOpen;
  if (!settingsOpen) lastView.current = path;
  const viewPath = settingsOpen ? lastView.current : path;
  // Closed, it gives the keys back to the terminal under it, as the
  // terminal's tab coming to the front would; not to one under a dialog.
  const [refocus, setRefocus] = useState(0);
  const wasOpen = useRef(settingsOpen);
  useEffect(() => {
    if (wasOpen.current && !settingsOpen &&
        !document.querySelector(".scrim, .palette-backdrop")) setRefocus((n) => n + 1);
    wasOpen.current = settingsOpen;
  }, [settingsOpen]);

  // A terminal, a note or a project's page opened by its address gets a
  // tab; the tabs are remembered.
  const current = tabOfPath(viewPath);
  useEffect(() => {
    if (current) setTabs((ts) => withTab(ts, current));
  }, [current]);
  useEffect(() => rememberTabs(tabs), [tabs]);
  const shownTabs = current ? withTab(tabs, current) : tabs;
  const shownRef = useRef(shownTabs);
  shownRef.current = shownTabs;
  const currentRef = useRef(current);
  currentRef.current = current;

  // What is folded in the sidebar, remembered.
  useEffect(() => rememberFolds(folded), [folded]);
  const fold = useCallback((key: string) => setFolded((was) => {
    const next = new Set(was);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    return next;
  }), []);
  const unfold = useCallback((...keys: string[]) => setFolded((was) =>
    (keys.some((k) => was.has(k)) ? new Set([...was].filter((k) => !keys.includes(k)))
      : was)), []);

  // The tab in front shows in the sidebar, unfolded down to it.
  useEffect(() => {
    if (!state || !current || revealed.current === current) return;
    const keys = revealKeys(current, state);
    if (!keys.length) return;
    revealed.current = current;
    unfold(...keys);
  }, [current, state, unfold]);

  const onStatus = useCallback((id: string, status: TabStatus) => {
    setStatuses((all) => (sameStatus(all[id], status) ? all
      : { ...all, [id]: status }));
  }, []);

  // The page's connection to tTerm Web.
  useEffect(() => socket.onConnection(setOnline), []);

  // The theme: apply the choice, and follow the system while it says so.
  useEffect(() => {
    if (!state) return;
    applyTheme(theme);
    setShownTheme(shown(theme));
    if (theme !== "system") return;
    return onSystemThemeChange(() => {
      applyTheme("system");
      setShownTheme(shown("system"));
    });
  }, [theme, state]);

  const notYet = useCallback((what: string) => {
    setToast(what);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), TOAST_MS);
  }, []);

  // Web Bot & Multi-Device Push Broadcast: connects background SSE stream across all devices
  useEffect(() => {
    return initNotificationBot(state?.me?.id, notYet);
  }, [state?.me?.id, notYet]);

  /** A tab in front: opened if it was not. */
  const openTab = useCallback((tab: string) => {
    setTabs((ts) => withTab(ts, tab));
    navigate(tabPath(tab));
  }, [navigate]);

  /** Closes tabs. The one in front gives way to its neighbour, the one after
   * it or else before it; `inPlace` when what was in it is gone, so that
   * Back does not bring it up again. */
  const closeTabs = useCallback((gone: string[], inPlace = false) => {
    const all = shownRef.current;
    setTabs(all.filter((x) => !gone.includes(x)));
    setStatuses((was) => {
      if (!gone.some((g) => was[g])) return was;
      const rest = { ...was };
      for (const g of gone) delete rest[g];
      return rest;
    });
    setMovedHere((was) => {
      const ids = gone.filter((g) => tabKind(g) === "note").map(tabTarget);
      if (!ids.some((id) => was[id])) return was;
      const rest = { ...was };
      for (const id of ids) delete rest[id];
      return rest;
    });
    const now = currentRef.current;
    if (now && gone.includes(now)) {
      const at = all.indexOf(now);
      const next = all.slice(at + 1).find((x) => !gone.includes(x)) ??
        all.slice(0, Math.max(at, 0)).reverse().find((x) => !gone.includes(x));
      navigate(next ? tabPath(next) : "/", inPlace);
    }
  }, [navigate]);
  const closeTab = useCallback((tab: string) => closeTabs([tab]), [closeTabs]);

  /** A lock pressed, or a new terminal asked for on a machine closed on
   * this device (0.1.28, the owner's decisions of 03.11): a tab of its own
   * whose card opens the keys; then the terminal comes in its place. One
   * request at a time: another one replaces it. */
  const askKeys = useCallback((machine: Machine) => {
    const tab = keysTab(machine.id);
    const others = shownRef.current.filter((x) => tabKind(x) === "keys" && x !== tab);
    setTabs((ts) => withTab(ts.filter((x) => !others.includes(x)), tab));
    navigate(tabPath(tab));
  }, [navigate]);

  /** A new terminal on the machine, in a new tab. Opened from an ended
   * terminal (`instead`), it takes that one's tab and its address: Back
   * does not bring the ended one back; and from 0.1.24 it starts in the
   * folder that one was in (`cwd`). On a machine closed on this device
   * (0.1.28) the keys are asked for first; `failed`, when it could not be
   * made. */
  const startTerminal = useCallback((machineId: string, instead?: string,
    then?: (terminalId: string) => void, cwd?: string, failed?: () => void,
    projectId?: string) => {
    const machine = byIdRef.current.get(machineId);
    const asked = !!instead && tabKind(instead) === "keys";
    if (machine && !asked && closedRef.current(machine)) {
      askKeys(machine);
      return;
    }
    const { cols, rows } = guessSize();
    const project = projectId
      ? stateNow.current?.projects.find((p) => p.id === projectId)
      : stateNow.current?.projects.find((p) => p.machines.some((m) => m.id === machineId));
    if (project) unfold(`p:${project.id}`, `m:${machineId}`);
    openTerminal(machineId, cols, rows, cwd, projectId || project?.id)
      .then((terminal) => {
        setStatuses((all) => {
          const next = { ...all, [terminal.id]: {
            label: terminal.label, machine: terminal.machine, where: "",
            state: terminal.state, away: false, running: false } };
          if (instead) delete next[instead];
          return next;
        });
        setTabs((ts) => (instead && ts.includes(instead)
          ? ts.map((id) => (id === instead ? terminal.id : id))
          : withTab(ts, terminal.id)));
        navigate(`/t/${terminal.id}`,
          !!instead && location.pathname === tabPath(instead));
        refresh();
        then?.(terminal.id);
      })
      .catch((e: Error) => {
        // Closed here after all, for the core: the card asks for the keys.
        if (e instanceof CoreError && e.status === 423 && machine && !asked) {
          askKeys(machine);
          return;
        }
        notYet(say("app.no_terminal", { why: e.message }));
        failed?.();
      });
  }, [navigate, refresh, notYet, unfold, askKeys]);

  /** A new terminal from a machine's "+": an offline computer says so. */
  const newTerminal = useCallback((machine: Machine, projectId?: string) => {
    if (machine.kind === "computer" && !machine.online) {
      const seen = lastSeen(machine.lastSeen, say);
      notYet(seen ? say("app.offline_seen", { name: machine.name, seen })
        : say("app.offline", { name: machine.name }));
      return;
    }
    startTerminal(machine.id, undefined, undefined, undefined, undefined, projectId);
  }, [notYet, startTerminal]);

  // Removing a machine and ending a terminal ask first (Confirm).
  const askRemove = useCallback((machine: Machine) => {
    setPicking(false);
    setPalette(false);
    setAsking({ kind: "remove", machine });
  }, []);
  const askEnd = useCallback((terminal: TerminalInfo) => {
    setPicking(false);
    setPalette(false);
    setAsking({ kind: "end", terminal });
  }, []);
  const remove = useCallback(async (machine: Machine) => {
    // A refusal comes back as an error, which the dialog shows.
    const result = await removeMachine(machine.id);
    setAsking(null);
    refresh();
    if (result.cleanup) setRemoved({ name: result.name, cleanup: result.cleanup });
    else if (result.shared) {
      notYet(say("app.removed_shared", { name: result.name }));
    } else if (result.accessRemoved) {
      notYet(say("app.removed_access", { name: result.name }));
    } else notYet(say("app.removed", { name: result.name }));
  }, [refresh, notYet]);
  const end = useCallback(async (terminal: TerminalInfo) => {
    await endTerminal(terminal.id);
    setAsking(null);
    refresh();
  }, [refresh]);

  // ------------------------------------------------------- notes (0.1.0)

  /** A new note in the folder, in a tab of its own, the caret in its title. */
  const newNote = useCallback((folderId: string) => {
    createNote(folderId)
      .then((note) => {
        primeNote(note);
        fresh.current.add(note.id);
        setState((s) => s && withFolders(s, note.projectId, (fs) => fs.map((f) =>
          (f.id === folderId ? { ...f, notes: [listedNote(note),
            ...f.notes.filter((n) => n.id !== note.id)] } : f))));
        unfold(`p:${note.projectId}`, `f:${folderId}`);
        openTab(noteTab(note.id));
        refresh();
      })
      .catch((e: Error) => notYet(say("app.no_note", { why: e.message })));
  }, [notYet, openTab, refresh, unfold]);

  const saveFolder = useCallback(async (asked: Naming, name: string) => {
    // A refusal comes back as an error, which the window shows.
    if (asked.kind === "new") {
      const folder = await createFolder(asked.project.id, name);
      setState((s) => s && withFolders(s, asked.project.id, (fs) =>
        [...fs.filter((f) => f.id !== folder.id), folder].sort(byName)));
      unfold(`p:${asked.project.id}`, `f:${folder.id}`);
    } else {
      const renamed = await renameFolder(asked.folder.id, name);
      setState((s) => s && withFolders(s, asked.project.id, (fs) =>
        fs.map((f) => (f.id === renamed.id ? { ...f, name: renamed.name } : f))
          .sort(byName)));
    }
    setNaming(null);
    refresh();
  }, [refresh, unfold]);

  const askDeleteNote = useCallback((noteId: string, title?: string) => {
    const where = stateNow.current && findNote(stateNow.current.projects, noteId);
    if (!where) return;
    setPalette(false);
    setAsking({ kind: "note", noteId, title: title ?? where.note.title,
      folder: where.folder, project: where.project });
  }, []);
  const removeNote = useCallback(async (asked: { noteId: string; folder: Folder;
    project: Project }) => {
    const result = await deleteNote(asked.noteId);
    setAsking(null);
    markDeleted(asked.noteId);
    closeTabs([noteTab(asked.noteId)], true);
    setState((s) => s && eachFolder(s, (f) =>
      ({ ...f, notes: f.notes.filter((n) => n.id !== asked.noteId) })));
    notYet(say(alone(asked.project) ? "app.note_deleted" : "app.note_deleted_journal",
      { title: titled(result.title, say), folder: asked.folder.name }));
    refresh();
  }, [closeTabs, notYet, refresh]);

  const askDeleteFolder = useCallback((folder: Folder, project: Project) => {
    setAsking({ kind: "folder", folder, project });
  }, []);
  const removeFolder = useCallback(async (asked: { folder: Folder;
    project: Project }) => {
    const result = await deleteFolder(asked.folder.id);
    setAsking(null);
    const inside = stateNow.current?.projects.flatMap((p) => p.folders)
      .find((f) => f.id === asked.folder.id)?.notes ?? asked.folder.notes;
    for (const n of inside) markDeleted(n.id);
    closeTabs(inside.map((n) => noteTab(n.id)), true);
    setState((s) => s && withFolders(s, asked.project.id, (fs) =>
      fs.filter((f) => f.id !== asked.folder.id)));
    const n = result.notes;
    const journal = !alone(asked.project);
    notYet(n === 0
      ? say(journal ? "app.folder_deleted_journal" : "app.folder_deleted", { name: result.name })
      : say(journal ? "app.folder_notes_deleted_journal" : "app.folder_notes_deleted",
        { name: result.name, n }));
    refresh();
  }, [closeTabs, notYet, refresh]);

  /** A note moved to another folder, from its tab or from the project's
   * page: the lists follow at once. */
  const moved = useCallback((note: Note) => {
    setState((s) => s && moveListed(s, note));
    unfold(`f:${note.folderId}`);
    notYet(say("app.moved_to", { folder: note.folder }));
    refresh();
  }, [notYet, refresh, unfold]);
  const moveFromList = useCallback((noteId: string, folderId: string) => {
    moveNote(noteId, { folderId })
      .then(moved)
      .catch((e: Error) => notYet(say("app.no_move", { why: e.message })));
  }, [moved, notYet]);

  /** A note to another project (0.1.2): first the window that asks where. */
  const askMoveNote = useCallback((noteId: string, from: MovingNote["from"]) => {
    setPalette(false);
    setPicking(false);
    setMovingNote({ noteId, from });
  }, []);
  /** Moved: the lists follow at once. Its tab, if it was moved from there,
   * says where it came from; the project's page says where it went. */
  const moveNoteOut = useCallback(async (asked: MovingNote, to: NoteTarget) => {
    const was = stateNow.current && findNote(stateNow.current.projects, asked.noteId);
    // A refusal comes back as an error, which the window shows.
    const note = await moveNote(asked.noteId, to);
    setMovingNote(null);
    setState((s) => s && moveListed(s, note));
    unfold(`p:${note.projectId}`, `f:${note.folderId}`);
    if (asked.from === "tab" && was) {
      setMovedHere((m) => ({ ...m, [note.id]: say(alone(was.project)
        ? "app.moved_here" : "app.moved_here_journal", { project: was.project.name }) }));
    } else {
      const there = stateNow.current?.projects.find((p) => p.id === note.projectId);
      notYet(there ? say("app.moved_to_project", { project: there.name, folder: note.folder })
        : say("app.moved_to_other", { folder: note.folder }));
    }
    refresh();
  }, [notYet, refresh, unfold]);

  const copyNote = useCallback((noteId: string) => {
    copyLater(loadNote(noteId).then((n) => toMarkdown(n.title, n.blocks)))
      .then(() => notYet(say("app.copied_markdown")))
      .catch((e: Error) => notYet(e instanceof NoteGone ? say("app.note_gone")
        : e instanceof CoreError ? say("app.no_copy", { why: e.message })
        : say("app.no_copy_browser")));
  }, [notYet]);

  // ---------------------------------------------------- projects (0.1.1)

  /** A new project, opened on its page; or the pencil's changes. */
  const saveProject = useCallback(async (asked: { project?: Project },
    fields: ProjectFields) => {
    // A refusal comes back as an error, which the window shows.
    const was = asked.project;
    if (!was) {
      const made = await createProject(fields.name, fields.code, fields.color);
      setState((s) => s && { ...s,
        projects: [...s.projects.filter((p) => p.id !== made.id), made] });
      setProjectWindow(null);
      unfold(`p:${made.id}`);
      openTab(projectTab(made.id));
    } else {
      const change: Partial<ProjectFields> = {};
      if (fields.name !== was.name) change.name = fields.name;
      if (fields.code !== was.code) change.code = fields.code;
      if (fields.color !== was.color) change.color = fields.color;
      if (Object.keys(change).length) {
        const changed = await editProject(was.id, change);
        setState((s) => s && { ...s, projects: s.projects.map((p) =>
          (p.id === changed.id ? { ...p, name: changed.name, code: changed.code,
            color: changed.color } : p)) });
      }
      setProjectWindow(null);
    }
    refresh();
  }, [openTab, refresh, unfold]);

  const removeProject = useCallback(async (asked: Project) => {
    const project = stateNow.current?.projects.find((p) => p.id === asked.id) ?? asked;
    const result = await deleteProject(project.id);
    setDeleting(null);
    const inside = project.folders.flatMap((f) => f.notes.map((n) => n.id));
    for (const id of inside) markDeleted(id);
    closeTabs([projectTab(project.id), ...inside.map(noteTab)], true);
    setState((s) => s && { ...s, projects: s.projects.filter((p) => p.id !== project.id) });
    notYet(result.notes ? say("app.project_deleted_notes", { name: result.name, n: result.notes })
      : say("app.project_deleted", { name: result.name }));
    refresh();
  }, [closeTabs, notYet, refresh]);

  /** A machine moved to another project of one's own: the lists follow at
   * once, its terminals keep running. */
  const moveTo = useCallback(async (machine: Machine, projectId: string) => {
    const moved = await moveMachine(machine.id, projectId);
    setMoving(null);
    const byName = (a: Machine, b: Machine) =>
      a.name.toLowerCase().localeCompare(b.name.toLowerCase());
    setState((s) => s && { ...s, projects: s.projects.map((p) => {
      const without = p.machines.filter((m) => m.id !== machine.id);
      if (p.id === moved.projectId) {
        return { ...p, machines: [...without, { ...machine, name: moved.name }].sort(byName) };
      }
      return without.length === p.machines.length ? p : { ...p, machines: without };
    }) });
    unfold(`p:${moved.projectId}`, `m:${moved.id}`);
    notYet(say("app.machine_moved", { name: machine.name, project: moved.project,
      label: `${moved.code}/${moved.name}` }));
    refresh();
  }, [notYet, refresh, unfold]);

  /** The naming of this terminal over, and of no other begun meanwhile:
   * with `asked`, only that very naming, not one of the same terminal begun
   * elsewhere while its name was on its way. Named in the sidebar, which no
   * mouse points at now: it slides away, as it would have. */
  const stopRenaming = useCallback((id: string, asked?: Renaming | null) => {
    const was = renamingRef.current;
    if (was?.id !== id || (asked !== undefined && asked !== was)) return;
    setRenaming(null);
    if (was.where === "side" && !pinnedRef.current && !overSidebar.current) {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = window.setTimeout(() => setOpen(false), CLOSE_DELAY_MS);
    }
  }, []);
  /** A terminal named: in its tab, in the sidebar or on its project's page. */
  const renameTab = useCallback((id: string, name: string) => {
    const asked = renamingRef.current;
    renameTerminal(id, name)
      .then((info) => {
        stopRenaming(id, asked);
        setStatuses((all) => (all[id] ? { ...all, [id]: { ...all[id], label: info.label } }
          : all));
        setState((s) => s && { ...s, terminals: s.terminals.map((t) =>
          (t.id === id ? { ...t, name: info.name, label: info.label } : t)) });
        refresh();
      })
      .catch((e: Error) => {
        stopRenaming(id, asked);
        notYet(say("app.no_rename", { why: e.message }));
      });
  }, [notYet, refresh, stopRenaming]);

  /** A machine named in the sidebar. */
  const onRenameMachine = useCallback((id: string, name: string) => {
    renameMachine(id, name)
      .then((info) => {
        setRenamingMachine(null);
        setState((s) => s && {
          ...s,
          projects: s.projects.map((p) => ({
            ...p,
            machines: p.machines.map((m) => (m.id === id ? { ...m, name: info.name } : m)),
          })),
        });
        refresh();
      })
      .catch((e: Error) => {
        setRenamingMachine(null);
        notYet(say("app.no_rename", { why: e.message }));
      });
  }, [notYet, refresh]);

  // What open notes tell of themselves.
  const onSummary = useCallback((noteId: string, typed: Typed) => {
    setLive((was) => ({ ...was, [noteId]: { ...was[noteId], ...typed } }));
  }, []);
  const onNote = useCallback((note: Note) => {
    setLive((was) => ({ ...was, [note.id]: { ...was[note.id],
      editedAt: note.editedAt, editedBy: note.editedBy,
      version: Math.max(was[note.id]?.version ?? 0, note.version) } }));
  }, []);
  const onSaveState = useCallback((noteId: string, saving: SaveState) => {
    setSaveStates((was) => (was[noteId] === saving ? was
      : { ...was, [noteId]: saving }));
  }, []);
  /** A note's tab closed and what was left in it saved: the lists from the
   * core have it now. */
  const onSettled = useCallback((noteId: string) => {
    // Opened again later, it is no longer new: the caret stays out of the
    // title.
    fresh.current.delete(noteId);
    settled.current.add(noteId);
    void refresh();
  }, [refresh]);

  /** Sign out, in the menu of the account at the bottom of the sidebar
   * (0.1.4): this browser forgets the person. */
  const signOutHere = useCallback(() => signOut()
    .then(() => {
      // The browser forgets the person: their unsaved notes too, and what
      // they began to write to support.
      forgetDrafts();
      forgetSupportDraft();
      endSession(say("app.signed_out"));
    })
    .catch((error) => {
      notYet(say("app.no_sign_out"));
      throw error;
    }), [endSession, notYet]);

  const chooseTheme = useCallback((next: Theme) => {
    setTheme(next);
    saveTheme(next).catch(() => notYet(say("app.no_theme")));
  }, [notYet]);
  /** Another language (0.1.16): shown at once, then kept in the account
   * (in the app before signing in, on this computer). */
  const chooseLanguage = useCallback((next: Lang) => {
    void showLanguage(next);
    setState((was) => (was ? { ...was, me: { ...was.me, language: next } } : was));
    saveLanguage(next).catch(() => notYet(say("app.no_language")));
  }, [notYet]);
  const toggleTheme = useCallback(() => {
    chooseTheme(shown(theme) === "light" ? "dark" : "light");
  }, [theme, chooseTheme]);
  const chooseTint = useCallback((next: ProjectTint) => {
    setTint(next);
    saveProjectTint(next).catch(() => notYet(say("app.no_tints")));
  }, [notYet]);

  /** The name changed on the account page: the sidebar and the greetings
   * follow at once. */
  const renamed = useCallback((named: {
    name: string; firstName: string; initials: string;
  }) => {
    setState((was) => (was ? { ...was, me: { ...was.me, ...named } } : was));
  }, []);

  // The sidebar.
  const cancelTimers = () => {
    window.clearTimeout(openTimer.current);
    window.clearTimeout(closeTimer.current);
  };
  const hoverOpen = () => {
    cancelTimers();
    openTimer.current = window.setTimeout(() => setOpen(true), OPEN_DELAY_MS);
  };
  const hoverAway = () => {
    overSidebar.current = false;
    cancelTimers();
    // A name being typed there keeps it open.
    if (!pinned && renamingRef.current?.where !== "side") {
      closeTimer.current = window.setTimeout(() => setOpen(false),
        CLOSE_DELAY_MS);
    }
  };
  const togglePin = () => {
    const next = !pinned;
    setPinned(next);
    rememberPin(next);
    setOpen(true);
  };
  const closeSidebar = () => {
    cancelTimers();
    setOpen(false);
    setPinned(false);
    rememberPin(false);
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !pinned && !adding && !naming &&
        !projectWindow && !moving && !deleting && !renaming && !movingNote &&
        !needAccount && !supporting) {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pinned, adding, naming, projectWindow, moving, deleting, renaming,
    movingNote, needAccount, supporting]);

  // The palette: Cmd+K on a Mac, Ctrl+Shift+K elsewhere, before the
  // terminal hears it.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!shortcut(event, "k")) return;
      event.preventDefault();
      event.stopPropagation();
      // The Settings window is over everything: the palette waits for it
      // to close.
      if (settingsOpenNow.current) return;
      setPicking(false);
      setPalette((was) => !was);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  useEffect(() => () => {
    cancelTimers();
    window.clearTimeout(toastTimer.current);
  }, []);

  /** Signed in in the app, and tTerm cannot be reached now (0.1.6). */
  const cutOff = !!state?.app && !!state?.offline;

  // The lists as shown: what the core sent, with what open notes typed.
  const projects = useMemo(() => (state ? withLive(state.projects, live) : []),
    [state, live]);

  // Keys open on this device (0.1.28, keysHere.ts): what is closed here
  // while they are not.
  const keys = useVault();
  const byId = useMemo(() => new Map(projects.flatMap((p) => p.machines)
    .map((m): [string, Machine] => [m.id, m])), [projects]);
  const isClosed = useCallback((m: Machine) => closedHere(m, keys, byId), [keys, byId]);
  const isLogClosed = useCallback((m: Machine) => logClosedHere(m, keys, byId), [keys, byId]);
  closedRef.current = isClosed;
  byIdRef.current = byId;
  // The keys opened or closed here: the lists again, as the core gives them
  // now (its terminals in full or by name, the logs' counts of today).
  const provenNow = keys.proven;
  const provedBefore = useRef(provenNow);
  useEffect(() => {
    if (provedBefore.current === provenNow) return;
    provedBefore.current = provenNow;
    refresh();
  }, [provenNow, refresh]);
  /** A terminal's machine is closed here: as the lists say, or as the core
   * said of a terminal on a machine they do not have. */
  const terminalClosed = (terminal: TerminalInfo | undefined) => {
    if (!terminal) return false;
    const machine = byId.get(terminal.machineId);
    return machine ? isClosed(machine) : !!terminal.locked;
  };

  // The request for a new terminal (0.1.28): once the keys are open here,
  // the terminal is made, only if its tab is in front; one left behind
  // another tab goes (the owner, 03.11, 22:25).
  const requestTab = shownTabs.find((tab) => tabKind(tab) === "keys") ?? null;
  const requestMachine = requestTab ? byId.get(tabTarget(requestTab)) : undefined;
  const requestOpen = !!requestMachine && !isClosed(requestMachine);
  const fulfilled = useRef<string | null>(null);
  useEffect(() => {
    if (!requestTab || !state) return;
    if (!requestMachine) {
      closeTabs([requestTab], true);
      return;
    }
    // Not before the vault is known: until then a machine looks open, and a
    // page loaded on a request's address would make it, and be refused.
    if (!keys.ready || !requestOpen) return;
    const once = `${requestTab}:${keys.provenN}`;
    if (fulfilled.current === once) return;
    fulfilled.current = once;
    if (current === requestTab) {
      startTerminal(requestMachine.id, requestTab, undefined, undefined,
        () => closeTabs([requestTab], true));
    } else {
      closeTabs([requestTab], true);
    }
  }, [requestTab, requestMachine, requestOpen, current, state, keys.provenN, keys.ready,
    closeTabs, startTerminal]);

  // Each tab as the bar shows it.
  const liveTerminals = useMemo(() => state?.terminals ?? [], [state]);
  const tabViews: TabView[] = shownTabs.map((tab): TabView => {
    const kind = tabKind(tab);
    const id = tabTarget(tab);
    if (kind === "note") {
      const where = findNote(projects, id);
      const title = live[id]?.title ?? where?.note.title ?? "";
      return {
        id: tab, kind, code: where?.project.code ?? "", color: where?.project.color,
        label: titled(title, t),
        untitled: !title.trim(), checklist: (live[id]?.total ?? where?.note.total ?? 0) > 0,
        title: where ? t("app.tab.note_in", { folder: where.folder.name }) : t("app.tab.note"),
        closeTitle: t("app.tab.close_note"),
      };
    }
    if (kind === "project") {
      const project = projects.find((p) => p.id === id);
      return {
        id: tab, kind, code: project?.code ?? "", color: project?.color,
        label: project?.name ?? t("app.tab.project"),
        title: project ? t("app.tab.project_title", { name: project.name }) : t("app.tab.project"),
        closeTitle: t("app.tab.close_page"),
      };
    }
    if (kind === "log") {
      const project = projects.find((p) => p.machines.some((m) => m.id === id));
      const found = project?.machines.find((m) => m.id === id);
      const machine = found?.name ?? "";
      return {
        id: tab, kind, code: project?.code ?? "", color: project?.color,
        label: t("log.tab", { machine }), title: t("log.tab_title", { machine }),
        closeTitle: t("log.close_tab"), locked: !!found && isLogClosed(found),
      };
    }
    if (kind === "keys") {
      const project = projects.find((p) => p.machines.some((m) => m.id === id));
      const machine = project?.machines.find((m) => m.id === id)?.name ?? "";
      return {
        id: tab, kind, code: project?.code ?? "", color: project?.color,
        label: t("keys_closed.tab", { machine }), title: t("keys_closed.tab_title", { machine }),
        closeTitle: t("keys_closed.close_tab"), locked: true,
      };
    }
    const known = liveTerminals.find((t) => t.id === tab);
    // A terminal closed here (0.1.28) is its name and machine as the lists
    // give them: not what its view said of it before (its folder, what ran,
    // or the placeholder of a view that never attached).
    const status = known && terminalClosed(known) ? undefined : statuses[tab];
    const full = status?.label ?? known?.label ?? t("app.tab.terminal");
    const machine = status?.machine || known?.machine || "";
    const dot = dotOf(status, known, !!state && !known && !status);
    const where = status?.where ? ` · ${status.where}` : "";
    const slash = full.indexOf("/");
    const home = known && projects.find((p) => p.machines.some((m) => m.id === known.machineId));
    const canRename = !!known && dot !== "ended";
    const said = dot === "away"
      ? (machine ? t("app.tab.away", { label: full, machine })
        : t("app.tab.away_unknown", { label: full }))
      : dot === "ended" ? t("app.tab.ended", { label: full })
      : dot === "busy" && status?.running ? t("app.tab.running", { label: `${full}${where}` })
      : `${full}${where}`;
    const there = home?.machines.find((m) => m.id === known?.machineId);
    return {
      id: tab, kind, code: slash > 0 ? full.slice(0, slash) : "", color: home?.color,
      label: slash > 0 ? full.slice(slash + 1) : full, dot,
      here: !!there?.here, cutOff: cutOff && !!there && !there.here,
      machine, name: known?.name, canRename: canRename && !terminalClosed(known),
      title: terminalClosed(known) ? t("sidebar.closed_title")
        : canRename ? `${said}\n${t("sidebar.double_click")}` : said,
      closeTitle: t("app.tab.close_terminal"), locked: terminalClosed(known),
    };
  });
  const front = tabViews.find((t) => t.id === current);
  // A terminal being named that can be named no more, its terminal ended or
  // the tab, the sidebar or the project's page gone: the naming is over too.
  const renamable = !!renaming && (renaming.where === "tab"
    ? tabViews.some((t) => t.id === renaming.id && t.canRename)
    : liveTerminals.some((t) => t.id === renaming.id &&
        dotOf(statuses[t.id], t, false) !== "ended") &&
      (renaming.where === "side" ? open || pinned
        : !!current && tabKind(current) === "project"));
  useEffect(() => {
    if (renaming && !renamable) stopRenaming(renaming.id);
  }, [renaming, renamable, stopRenaming]);
  // A note asked to move that is gone meanwhile: the window goes too.
  const moveAsked = !movingNote || !state ||
    !!findNote(state.projects, movingNote.noteId);
  useEffect(() => {
    if (!moveAsked) setMovingNote(null);
  }, [moveAsked]);
  // In the app before signing in there is no account: Settings only.
  const local = !!state?.local;
  const inAppNow = local || !!state?.app;
  const onlineNow = !state?.offline;
  const inApp = useMemo(() => ({ inApp: inAppNow, online: onlineNow }), [inAppNow, onlineNow]);
  // The computer the app runs on, signed in: This computer in Settings.
  const hereMachine = useMemo(() => {
    if (!state?.app) return null;
    for (const p of state.projects) {
      const m = p.machines.find((one) => one.here);
      if (m) return { name: m.name, project: p.name };
    }
    return null;
  }, [state]);
  const shownPage = current ? null : pageOf(viewPath);
  // Move to cloud is the app's, signed in (0.1.17).
  const pageOpen = shownPage === "move" && (local || !state?.app) ? null : shownPage;
  const title = settingsOpen ? `${t("settings.title")} · tTerm`
    : front
    ? `${front.kind === "terminal" && front.code ? `${front.code}/` : ""}${front.label} · tTerm`
    : pageOpen === "move" ? `${t("move.title")} · tTerm` : "tTerm";
  useEffect(() => {
    document.title = title;
  }, [title]);
  // Move to cloud outside the app gives way to the machines page.
  const appNow = !!state?.app;
  useEffect(() => {
    if (!state || settingsOpen) return;
    if (shownPage === "move" && (local || !appNow)) navigate("/", true);
  }, [local, shownPage, navigate, appNow, state, settingsOpen]);
  // /account, the account's page until 0.1.27, is Settings › Account now:
  // the address says so, in the same step of the history.
  useEffect(() => {
    if (/^\/account\/?$/.test(path)) {
      navigate("/settings/account", true, history.state as PageMark | null);
    }
  }, [path, navigate]);
  // Signed in meanwhile: New project and Add machine are themselves again.
  useEffect(() => {
    if (!local) setNeedAccount(null);
  }, [local]);
  // The app updating itself (0.1.15, Updates.tsx); and tTerm's menu's
  // Check for Updates…, which opens Settings at Updates (the app's shim).
  const updates = useAppUpdate(inAppNow);
  const openSettingsNow = useRef<(section: SettingsSection | "") => void>(() => {});
  useEffect(() => {
    const onApp = (event: Event) => {
      const action = (event as CustomEvent<{ action?: string }>).detail?.action;
      if (action !== "updates") return;
      openSettingsNow.current("updates");
      updates.look();
    };
    window.addEventListener("tterm-app", onApp);
    return () => window.removeEventListener("tterm-app", onApp);
  }, [updates.look]);

  useEffect(() => {
    const handleOpenSection = (event: Event) => {
      const ce = event as CustomEvent<{ section?: SettingsSection }>;
      if (ce.detail?.section) {
        openSettingsNow.current(ce.detail.section);
      }
    };
    window.addEventListener("tterm:open-settings-section", handleOpenSection);
    return () => window.removeEventListener("tterm:open-settings-section", handleOpenSection);
  }, []);

  if (signedOut) {
    return (
      <SignIn note={signedOut.note} email={lastEmail.current ?? undefined}
        onSignedIn={signedIn} />
    );
  }

  if (problem) {
    return (
      <div className="status-page">
        <div className="status-card" role="alert">
          <h1>{t("app.no_connection")}</h1>
          <p>{t(problem)}</p>
          <button type="button" className="button-accent" onClick={load}>
            {t("common.try_again")}
          </button>
        </div>
      </div>
    );
  }

  if (!state) {
    return <div className="status-page" aria-busy="true" />;
  }

  const sidebarShown = open || pinned;
  const personal = projects.find((p) => p.personal) ??
    projects.find((p) => p.role === "owner");
  const canAddTo = projects.find((p) =>
    p.role === "owner" || p.role === "admin");
  const anyMachine = projects.some((p) => p.machines.length > 0);
  /** Before signing in (local.ts), New project and Add machine are there
   * as after it, and say what signing in brings (0.1.5). */
  const needSignIn = (need: Need) => {
    if (!pinned) setOpen(false);
    setPalette(false);
    setPicking(false);
    setNeedAccount(need);
  };
  const startAdding = (projectId: string, kind: MachineKind = "server") => {
    if (local) {
      needSignIn("machine");
      return;
    }
    if (!pinned) setOpen(false);
    setAdding({ projectId, kind });
  };
  const startProject = () => {
    if (local) needSignIn("project");
    else setProjectWindow({});
  };
  const goTo = (id: string) => navigate(`/t/${id}`);
  /** From the sidebar: it slides away unless it is pinned. */
  const away = (then: () => void) => () => {
    if (!pinned) setOpen(false);
    then();
  };
  /** Move to cloud, from the menu of the account or the palette. Opened
   * from the Settings window, it takes the window's place in the history,
   * so that Close goes back to where the window was opened from. */
  const openPage = (which: AccountPage) => {
    if (!pinned) setOpen(false);
    setPalette(false);
    setPicking(false);
    setPageVisit((n) => n + 1);
    const was = pageOf(location.pathname);
    if (was === which) return;
    const mark = history.state as PageMark | null;
    if (was || settingsAt(location.pathname) !== null) navigate(`/${which}`, true, mark);
    else navigate(`/${which}`, false, { pageFrom: location.pathname });
  };
  /** The Settings window (0.1.27), at a section ("" for the first), over the
   * page shown: from the menu of the account, the palette or the app's own
   * menu. Opening takes a step in the history, so that Back closes it;
   * another section, open already, takes the same step. */
  const openSettings = (section: SettingsSection | "") => {
    // Not over another window, which would stay over it or under it in the
    // order they are drawn, not the one they opened in: the palette, under
    // such a window anyway, and the app's Check for Updates… wait for it.
    if (document.querySelector(".scrim:not(.settings-scrim)")) return;
    if (!pinned) setOpen(false);
    setPalette(false);
    setPicking(false);
    const to = section ? `/settings/${section}` : "/settings";
    if (settingsAt(location.pathname) !== null) {
      navigate(to, true, history.state as PageMark | null);
    } else {
      navigate(to, false, { pageFrom: location.pathname });
    }
  };
  openSettingsNow.current = openSettings;
  /** Back to where the page or the window was opened from: the step before
   * it in the history, which its entry remembers (Back and Forward keep
   * that right). Opened by its address, as a bookmark, to the page under
   * the window, or else the machines page, never out of tTerm. */
  const closePage = () => {
    const mark = history.state as PageMark | null;
    if (mark?.pageFrom) history.back();
    else navigate(settingsOpen ? lastView.current : "/", true);
  };
  /** Sign in, in the app before signing in: its engine signs in with the
   * browser, or says why it cannot yet. */
  const signInHere = () => {
    if (!pinned) setOpen(false);
    setPalette(false);
    signInApp()
      .then((started) => {
        // An engine before 0.3.0 gives no code: then only the words.
        if (started.code) setLinking(started.code);
        else notYet(say("app.go_on_in_browser"));
      })
      .catch((error: Error) => notYet(error.message));
  };
  const linkWindow = linking && (
    <AppLinkWindow code={linking} onDone={() => location.reload()}
      onOver={(why) => {
        setLinking(null);
        if (why) notYet(why);
      }} />
  );
  // The app's first start, before signing in: its welcome.
  if (local && state.welcome && !welcomeGone) {
    const leave = () => {
      setWelcomeGone(true);
      welcomeSeen().catch(() => {});
    };
    return (
      <>
        <AppWelcome onLater={leave} onSignIn={() => {
          leave();
          signInHere();
        }} />
        {toast && <div className="toast" role="status">{toast}</div>}
      </>
    );
  }
  const frontKind = current ? tabKind(current) : null;
  const runningHere = frontKind === "terminal"
    ? liveTerminals.find((t) => t.id === current) : undefined;
  const pageProject = frontKind === "project"
    ? projects.find((p) => p.id === tabTarget(current!)) : undefined;
  const machineIds = new Set(projects.flatMap((p) => p.machines.map((m) => m.id)));
  // In the app, this Mac's own machines: their terminals get the strip after
  // `ssh <host>` (0.1.17).
  const hereIds = new Set(state.app ? projects.flatMap((p) =>
    p.machines.filter((m) => m.here).map((m) => m.id)) : []);
  const moveFrame: MoveFrame = { enabled: !!state.app && !local, projects, personal: personal ?? null,
    notify: notYet, refresh: () => void refresh() };
  const dotFor = (t: TerminalInfo): Dot => dotOf(statuses[t.id], t, false);

  const sidebarButton = !pinned && (
    <button type="button" className="icon-button"
      aria-label={t("app.open_sidebar")} aria-expanded={sidebarShown}
      onClick={() => (sidebarShown ? closeSidebar() : setOpen(true))}
      onMouseEnter={hoverOpen}
      onMouseLeave={() => window.clearTimeout(openTimer.current)}>
      <ChevronRight />
    </button>
  );

  // What "+" and the palette offer: a new terminal on any machine.
  const machineGroups = (): FinderGroup[] => projects
    .filter((p) => p.machines.length > 0)
    .map((p) => ({
      title: `${p.code} · ${p.name}`,
      items: p.machines.map((m): FinderItem => {
        const offline = m.kind === "computer" && !m.online;
        // In the app without the connection, the cloud's machines wait too.
        const waits = cutOff && !m.here;
        return {
          key: `m-${m.id}`,
          label: `${p.code}/${m.name}`,
          hint: m.here ? hereWord(t)
            : waits ? t("app.machine.no_connection")
            : offline ? (m.lastSeen ? t("app.machine.offline_seen", { seen: lastSeen(m.lastSeen, t) })
              : t("app.machine.offline"))
            : m.os ?? m.host ?? undefined,
          icon: m.kind === "server" ? <Server size={15} /> : <Computer size={15} />,
          muted: offline || waits,
          words: [m.name, m.host, m.os, m.kind].filter(Boolean).join(" "),
          run: () => newTerminal(m, p.id),
        };
      }),
    }));
  const addItem: FinderItem[] = canAddTo ? [{
    key: "add-machine",
    label: t("app.action.add_machine"),
    hint: t("app.action.add_machine_hint"),
    icon: <Plus size={15} />,
    words: t("app.action.add_machine_words"),
    run: () => startAdding(canAddTo.id),
  }] : [];

  // What search finds on the page itself (0.1.7, Search.tsx): terminals,
  // notes as the lists show them, machines, projects, and things to do; and
  // what was open last, for before anything is typed. Commands, what they
  // printed and notes, whole, come from the core.
  const searchSources = (): { entries: LocalEntry[]; recent: LocalEntry[] } => {
    const listedTabs = new Set(shownTabs);
    const stateOf = (dot: Dot) => (dot === "away" ? t("app.search.state_away")
      : dot === "ended" ? t("app.search.state_ended") : dot === "busy" ? t("app.search.state_busy")
        : t("app.search.state_prompt"));
    const terminalEntry = (id: string, label: string, machine: string, dot: Dot,
      tab: boolean, machineId?: string, name?: string): LocalEntry => ({
      key: `t-${id}`, kind: "terminals", title: label,
      sub: [tab ? (id === current ? t("app.search.this_tab") : t("app.search.tab"))
        : t("app.search.no_tab"), stateOf(dot)].join(" · "),
      words: `${t("app.search.terminal_words")} ${machine} ${name ?? ""}`,
      icon: <span className={`dot ${dot}`} aria-hidden="true" />,
      rows: ([[t("app.search.row_machine"), machine],
        [t("app.search.row_folder"), statuses[id]?.where ?? ""],
        [t("app.search.row_now"), stateOf(dot)]] as [string, string][]).filter((r) => r[1]),
      run: () => goTo(id), act: t("app.search.open"), machineId,
    });
    const terminals: LocalEntry[] = [
      ...tabViews.filter((v) => v.kind === "terminal").map((v) => {
        const known = liveTerminals.find((x) => x.id === v.id);
        return terminalEntry(v.id, `${v.code ? `${v.code}/` : ""}${v.label}`,
          v.machine ?? "", v.dot ?? "open", true, known?.machineId, known?.name);
      }),
      ...liveTerminals.filter((x) => !listedTabs.has(x.id)).map((x) =>
        terminalEntry(x.id, x.label, x.machine, dotFor(x), false, x.machineId, x.name)),
    ];
    const notes: LocalEntry[] = projects.flatMap((p) => p.folders.flatMap((f) =>
      f.notes.map((n): LocalEntry => ({
        key: `n-${n.id}`, kind: "notes", noteId: n.id, title: titled(n.title, t),
        sub: `${p.name} / ${f.name}${listedTabs.has(noteTab(n.id)) ? ` · ${t("app.search.tab")}` : ""}`,
        words: `${t("app.search.note_words")} ${f.name} ${n.excerpt}`,
        icon: n.total > 0 ? <ListCheck size={15} /> : <Doc size={15} />,
        rows: [[t("app.search.row_in"), `${p.name} / ${f.name}`],
          [t("app.search.row_edited"), ago(n.editedAt, t)]],
        run: () => openTab(noteTab(n.id)), act: t("app.search.open_note"), at: n.editedAt,
      }))));
    const machines: LocalEntry[] = projects.flatMap((p) => p.machines.map((m): LocalEntry => {
      const offline = m.kind === "computer" && !m.online;
      const waits = cutOff && !m.here;
      const status = m.here ? hereWord(t) : waits ? t("app.machine.no_connection")
        : offline ? (m.lastSeen ? t("app.machine.offline_seen", { seen: lastSeen(m.lastSeen, t) })
          : t("app.machine.offline"))
        : m.kind === "computer" ? t("app.machine.online") : "";
      const open = liveTerminals.filter((x) => x.machineId === m.id).length;
      return {
        key: `m-${m.id}`, kind: "machines", title: m.name,
        sub: [p.name, m.os, m.host, status].filter(Boolean).join(" · "),
        words: [p.code, m.kind, m.host, m.os].filter(Boolean).join(" "),
        icon: m.kind === "server" ? <Server size={15} /> : <Computer size={15} />,
        rows: ([[t("app.search.row_project"), p.name], [t("app.search.row_system"), m.os ?? ""],
          [t("app.search.row_address"), m.host ?? ""], [t("app.search.row_status"), status],
          [t("app.search.row_terminals"), open ? t("app.search.open_count", { n: open }) : ""]] as
          [string, string][]).filter((r) => r[1]),
        run: () => newTerminal(m, p.id), act: t("sidebar.new_terminal"), machineId: m.id,
        muted: offline || waits,
      };
    }));
    const pages: LocalEntry[] = projects.map((p): LocalEntry => {
      const count = p.folders.reduce((n, f) => n + f.notes.length, 0);
      return {
        key: `p-${p.id}`, kind: "projects", title: p.name,
        sub: [p.code, t("count.machines", { n: p.machines.length }),
          t("count.notes", { n: count })].join(" · "),
        words: `${t("app.search.project_words")} ${p.code}`,
        icon: <span className={`code-chip ${colorClass(p.color)}`} aria-hidden="true">{p.code}</span>,
        rows: [[t("app.search.row_code"), p.code],
          [t("sidebar.machines"), String(p.machines.length)],
          [t("sidebar.notes"), String(count)]],
        run: () => openTab(projectTab(p.id)), act: t("app.search.open_page"),
      };
    });
    const noteHere = frontKind === "note" ? findNote(projects, tabTarget(current!)) : null;
    const actions: FinderItem[] = [
      ...addItem,
      {
        key: "new-project",
        label: t("sidebar.new_project"),
        hint: t("app.action.new_project_hint"),
        icon: <Plus size={15} />,
        words: t("app.action.new_project_words"),
        run: startProject,
      },
      ...(pageProject && manages(pageProject) ? [{
        key: "edit-project",
        label: t("app.action.edit_project", { name: pageProject.name }),
        hint: t("app.action.edit_project_hint"),
        icon: <Pencil size={15} />,
        words: t("app.action.edit_project_words"),
        run: () => setProjectWindow({ project: pageProject }),
      }] : []),
      ...projects.filter((p) => p.role !== "observer").map((p): FinderItem => ({
        key: `folder-${p.id}`,
        label: projects.length > 1 ? t("app.action.new_folder_in", { name: p.name })
          : t("sidebar.new_folder"),
        hint: t("app.action.new_folder_hint"),
        icon: <FolderIcon size={15} />,
        words: t("app.action.new_folder_words"),
        run: () => setNaming({ kind: "new", project: p }),
      })),
      {
        key: "machines",
        label: t("sidebar.all_machines"),
        icon: <Server size={15} />,
        words: t("app.action.machines_words"),
        run: () => navigate("/"),
      },
      ...(current ? [{
        key: "close-tab",
        label: t("app.action.close_tab"),
        hint: frontKind === "terminal" ? t("app.action.close_tab_terminal")
          : frontKind === "note" ? t("app.action.close_tab_note") : undefined,
        icon: <Close size={15} />,
        words: t("app.action.close_tab_words"),
        run: () => closeTab(current),
      }] : []),
      ...(runningHere ? [{
        key: "rename-terminal",
        label: t("app.action.rename_terminal"),
        hint: t("app.action.rename_terminal_hint"),
        icon: <Pencil size={15} />,
        words: t("app.action.rename_terminal_words"),
        run: () => setRenaming({ id: runningHere.id, where: "tab" }),
      }, {
        key: "end-terminal",
        label: t("app.action.end_terminal"),
        hint: t("app.action.end_terminal_hint"),
        icon: <Close size={15} />,
        words: t("app.action.end_terminal_words"),
        run: () => askEnd(runningHere),
      }] : []),
      ...(noteHere && deletesNote(noteHere.project, noteHere.note, state.me.id) ? [{
        key: "delete-note",
        label: t("app.action.delete_note"),
        hint: t("app.action.delete_note_hint", { folder: noteHere.folder.name }),
        icon: <Trash size={15} />,
        words: t("app.action.delete_note_words"),
        run: () => askDeleteNote(noteHere.note.id),
      }] : []),
      {
        key: "theme",
        label: shownTheme === "light" ? t("app.action.theme_dark")
          : t("app.action.theme_light"),
        icon: shownTheme === "light" ? <Moon size={15} /> : <Sun size={15} />,
        words: t("app.action.theme_words"),
        run: toggleTheme,
      },
      {
        key: "pin",
        label: pinned ? t("sidebar.let_slide") : t("sidebar.keep_open_title"),
        icon: <Pin size={15} />,
        words: t("app.action.pin_words"),
        run: togglePin,
      },
      {
        key: "settings",
        label: t("settings.title"),
        hint: local ? t("app.action.settings_hint_local") : t("app.action.settings_hint"),
        icon: <Gear size={15} />,
        words: local ? t("app.action.settings_words_local") : t("app.action.settings_words"),
        run: () => openSettings(""),
      },
      ...(state.app && !local ? [{
        key: "move",
        label: t("account_menu.move"),
        hint: t("account_menu.move_note"),
        icon: <CloudUp size={15} />,
        words: t("app.action.move_words"),
        run: () => openPage("move"),
      }] : []),
      ...(local ? [{
        key: "sign-in",
        label: t("common.sign_in"),
        hint: t("app.action.sign_in_hint"),
        icon: <SignInIcon size={15} />,
        words: t("app.action.sign_in_words"),
        run: signInHere,
      }] : [{
        key: "account",
        label: t("account.title"),
        hint: t("app.action.account_hint"),
        icon: <Person size={15} />,
        words: t("app.action.account_words"),
        run: () => openSettings("account"),
      }, {
        key: "sign-out",
        label: t("account_menu.sign_out"),
        hint: t("app.action.sign_out_hint"),
        icon: <SignOutIcon size={15} />,
        words: t("app.action.sign_out_words"),
        run: () => {
          setPalette(false);
          void signOutHere().catch(() => {});
        },
      }]),
    ];
    const things: LocalEntry[] = actions.map((a): LocalEntry => ({
      key: `a-${a.key}`, kind: "actions", title: a.label, sub: a.hint ?? "",
      words: a.words ?? "", icon: a.icon, rows: a.hint ? [[t("app.search.row_does"), a.hint]] : [],
      run: a.run, act: t("app.search.do_it"), muted: a.muted,
    }));
    const entries = [...terminals, ...notes, ...machines, ...pages, ...things];
    const byKey = new Map(entries.map((e) => [e.key, e]));
    const recent = [...shownTabs].reverse().map((tab) => {
      const kind = tabKind(tab);
      const id = tabTarget(tab);
      return byKey.get(kind === "note" ? `n-${id}` : kind === "project" ? `p-${id}` : `t-${id}`);
    }).filter((e): e is LocalEntry => !!e);
    return { entries, recent };
  };

  // The machine of the terminal in front: search offers the commands run
  // most there, and ranks what is on it first among equals.
  const frontTerminal = frontKind === "terminal"
    ? liveTerminals.find((t) => t.id === current) : undefined;
  const near = frontTerminal
    ? { id: frontTerminal.machineId, name: frontTerminal.machine } : null;

  /** A command found: in its terminal, at its block, marked (0.1.7). */
  const openFoundBlock = (block: FoundBlock, words: string[], inOutput: boolean) => {
    foundBlock(block.terminalId, block.seq, words, inOutput);
    openTab(block.terminalId);
  };
  const openFoundNote = (note: FoundNote, words: string[]) => {
    foundNote(note.noteId, note.blockId, words);
    openTab(noteTab(note.noteId));
  };
  /** A line of a machine's log search found (0.1.21): the log, at the
   * line's day, the line lit. */
  const openFoundLine = (machineId: string, entry: number, at: number, words: string[]) => {
    foundLine(machineId, entry, at, words);
    openTab(logTab(machineId));
  };
  /** Cmd+Enter: the command into the line of the terminal in front, even on
   * another machine (the owner, 24.10); with none in front, of a terminal of
   * yours on its machine, or of a new one there. Not run. */
  const pasteFound = (block: Pick<FoundBlock, "command" | "machineId" | "machine">) => {
    const put = (terminalId: string) => {
      pasteN.current += 1;
      setPaste({ terminalId, text: block.command, n: pasteN.current });
      openTab(terminalId);
    };
    if (frontTerminal && statuses[frontTerminal.id]?.running) {
      // Its line is the running program's: what goes in would go to it.
      notYet(t("app.paste_busy"));
      return;
    }
    if (frontTerminal && dotFor(frontTerminal) !== "ended") {
      put(frontTerminal.id);
      return;
    }
    const there = [...liveTerminals].reverse().find((t) =>
      t.machineId === block.machineId && dotFor(t) === "open");
    if (there) {
      put(there.id);
      return;
    }
    const machine = projects.flatMap((p) => p.machines).find((m) => m.id === block.machineId);
    if (!machine) {
      notYet(t("app.paste_gone", { machine: block.machine }));
      return;
    }
    if (machine.kind === "computer" && !machine.online) {
      newTerminal(machine);
      return;
    }
    startTerminal(machine.id, undefined, put);
  };

  return (
    <InApp.Provider value={inApp}>
    <LocalOnly.Provider value={local}>
    <UpdateState.Provider value={updates}>
    <MoveContext.Provider value={moveFrame}>
    <div className={`${pinned ? "app pinned" : "app"}${tint === "block" ? " tint-block" : ""}`}>
      <TabBar sidebarButton={sidebarButton} tabs={tabViews} inert={settingsOpen}
        update={<UpdatePill />}
        current={current} onSelect={(tab) => navigate(tabPath(tab))}
        onClose={closeTab}
        picking={picking}
        onPlus={() => {
          setPalette(false);
          setPicking((was) => !was);
        }}
        renderPicker={(around) => (
          <Finder className="machine-picker" label={t("sidebar.new_terminal")}
            placeholder={t("app.picker.placeholder")} around={around}
            groups={[...machineGroups(),
              ...(addItem.length ? [{ title: t("common.more"), items: addItem }] : [])]}
            onClose={() => setPicking(false)} />
        )}
        onJump={() => {
          setPicking(false);
          setPalette(true);
        }}
        saving={frontKind === "note" ? saveLine(saveStates[tabTarget(current!)], t) : null}
        renaming={renaming?.where === "tab" ? renaming.id : null}
        onStartRename={(id) => {
          setPicking(false);
          setRenaming({ id, where: "tab" });
        }}
        onRename={renameTab}
        onStopRename={stopRenaming} />

      <NotificationPromptBanner notify={notYet} />
      <TelegramLinkBanner notify={notYet} onOpenSettings={openSettings} />

      {/* Under the Settings window the page stays as it was, but Tab does
          not reach it: nothing typed there goes to a terminal under it. */}
      <div className="stage" inert={settingsOpen}>
        {shownTabs.filter(isTerminalTab).map((id) => {
          const known = liveTerminals.find((x) => x.id === id);
          if (known && terminalClosed(known)) {
            // Closed on this device (0.1.28): its card, and nothing of it.
            return (
              <div key={id} className={id === current ? "terminal-view" : "terminal-view behind"}
                inert={id !== current}>
                <KeysClosed what={{ kind: "terminal", machine: known.machine,
                  name: terminalName(known.name, t) }} />
              </div>
            );
          }
          const knownTerminal = liveTerminals.find((x) => x.id === id);
          const terminalProject = knownTerminal
            ? projects.find((p) => p.machines.some((m) => m.id === knownTerminal.machineId))
            : undefined;
          return (
          <TerminalView key={id} terminalId={id} active={id === current}
            refocus={refocus}
            projectId={terminalProject?.id}
            projectName={terminalProject?.name}
            shownTheme={shownTheme} onStatus={onStatus} onCloseTab={closeTab}
            onOpenNew={(machineId, instead, cwd) =>
              startTerminal(machineId, instead, undefined, cwd)}
            onOpenLog={(machineId) => openTab(logTab(machineId))}
            onChanged={refresh} notify={notYet}
            machineThere={(machineId) => machineIds.has(machineId)}
            paste={paste?.terminalId === id ? paste : null} me={state.me}
            here={hereIds.has(knownTerminal?.machineId ?? "")} />
          );
        })}
        {shownTabs.filter((tab) => tabKind(tab) === "keys").map((tab) => {
          const machine = byId.get(tabTarget(tab));
          if (!machine) return null;
          const opens = machine.kind === "computer" ? "mac" : machine.method === "key" ? "key" : "via";
          return (
            <div key={tab} className={tab === current ? "terminal-view" : "terminal-view behind"}
              inert={tab !== current}>
              {isClosed(machine) ? (
                <KeysClosed what={{ kind: "new", machine: machine.name, opens,
                  mac: machine.via?.name ?? undefined }} />
              ) : (
                <div className="terminal-note" role="status">
                  <span className="spinner" aria-hidden="true" />
                  {t("terminal_view.connecting", { machine: machine.name })}
                </div>
              )}
            </div>
          );
        })}
        {shownTabs.filter((tab) => tabKind(tab) === "note").map((tab) => (
          <NoteView key={tab} noteId={tabTarget(tab)} active={tab === current}
            me={state.me} projects={projects}
            fresh={fresh.current.has(tabTarget(tab))}
            onSummary={onSummary} onNote={onNote} onSaveState={onSaveState}
            onSettled={onSettled} onMoved={moved}
            onMoveOut={(noteId) => askMoveNote(noteId, "tab")}
            moved={movedHere[tabTarget(tab)]}
            onDelete={(noteId, noteTitle) => askDeleteNote(noteId, noteTitle)}
            onCloseTab={(tab, gone) => closeTabs([tab], gone)} notify={notYet} />
        ))}
        {shownTabs.filter((tab) => tabKind(tab) === "log").map((tab) => {
          const machine = byId.get(tabTarget(tab));
          if (machine && isLogClosed(machine)) {
            return (
              <div key={tab} className={tab === current ? "terminal-view" : "terminal-view behind"}
                inert={tab !== current}>
                <KeysClosed what={{ kind: "log", machine: machine.name }} />
              </div>
            );
          }
          return (
            <LogView key={tab} machineId={tabTarget(tab)} active={tab === current}
              me={state.me} projects={projects}
              onCloseTab={() => closeTabs([tab], true)} notify={notYet} />
          );
        })}
        {frontKind === "project" && (
          <div className="page-scroll">
            {pageProject ? (
              <ProjectPage project={pageProject} allProjects={projects} me={state.me}
                terminals={liveTerminals} dotFor={dotFor} closed={isClosed}
                local={local} onRefresh={refresh}
                onAddMachine={startAdding}
                onOpenTerminal={(machineId, projectId) =>
                  startTerminal(machineId, undefined, undefined, undefined, undefined, projectId)}
                onGoTo={goTo} onRemoveMachine={askRemove}
                onMoveMachine={pageProject.own && projects.some((p) => p.own &&
                  p.role === "owner" && p.id !== pageProject.id)
                  ? (machine) => setMoving(machine) : undefined}
                onEditProject={(project) => setProjectWindow({ project })}
                onDeleteProject={(project) => setDeleting(project)}
                onNewProject={startProject}
                onNewFolder={(project) => setNaming({ kind: "new", project })}
                onRenameFolder={(folder, project) =>
                  setNaming({ kind: "rename", folder, project })}
                onDeleteFolder={askDeleteFolder}
                onNewNote={newNote}
                onOpenNote={(noteId) => openTab(noteTab(noteId))}
                onMoveNote={moveFromList}
                onMoveNoteOut={projects.some((p) => p.id !== pageProject.id && writes(p))
                  ? (noteId) => askMoveNote(noteId, "page") : undefined}
                onCopyNote={copyNote}
                onDeleteNote={(noteId) => askDeleteNote(noteId)}
                renaming={renaming?.where === "page" ? renaming.id : null}
                onStartRename={(id) => setRenaming({ id, where: "page" })}
                onRename={renameTab} onStopRename={stopRenaming}
                notYet={notYet} />
            ) : (
              <div className="status-page">
                <div className="status-card" role="status">
                  <h1>{t("app.no_project")}</h1>
                  <p>{t("app.no_project_text")}</p>
                  <button type="button" className="button-plain"
                    onClick={() => closeTab(current!)}>
                    {t("app.close_the_tab")}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
        {pageOpen === "move" && (
          <div className="page-scroll">
            <MoveToCloud key={pageVisit} onClose={closePage}
              onOpenTerminal={(machineId) => startTerminal(machineId)} />
          </div>
        )}
        {!current && !pageOpen && (
          <div className="page-scroll">
            {anyMachine || local ? (
              <Machines projects={projects} terminals={state.terminals} local={local}
                closed={isClosed}
                onRefresh={refresh}
                onAdd={(projectId) => startAdding(projectId)}
                onOpenTerminal={(machineId, projectId) =>
                  startTerminal(machineId, undefined, undefined, undefined, undefined, projectId)}
                onGoTo={goTo}
                onRemove={askRemove} />
            ) : (
              <Welcome me={state.me} personal={personal}
                onAdd={(kind) => personal && startAdding(personal.id, kind)} />
            )}
          </div>
        )}
        {!online && shownTabs.some(isTerminalTab) && (
          <div className="lost-strip" role="status">
            {t("app.connection_lost")}
          </div>
        )}
        {cutOff && (
          <div className="offline-strip" role="status">
            <CloudOff size={17} />
            <span>
              {t.rich(onMac() ? "app.cut_off.mac" : "app.cut_off.computer", {
                b: (inner) => <strong>{inner}</strong>,
              })}
            </span>
          </div>
        )}
      </div>

      {sidebarShown && (
        <Sidebar
          me={state.me}
          projects={projects}
          logToday={logToday}
          updateCard={<UpdateCard />}
          pinned={pinned}
          shownTheme={shownTheme}
          onToggleTheme={toggleTheme}
          onTogglePin={togglePin}
          onClose={closeSidebar}
          onMouseEnter={() => {
            overSidebar.current = true;
            cancelTimers();
          }}
          onMouseLeave={hoverAway}
          folded={folded}
          onFold={fold}
          current={current}
          terminals={state.terminals}
          dotFor={dotFor}
          closed={isClosed}
          logClosed={isLogClosed}
          onOpenProject={(projectId) => away(() => openTab(projectTab(projectId)))()}
          onAddMachine={(projectId) => startAdding(projectId)}
          onNewTerminal={(machine, projId) => away(() => newTerminal(machine, projId))()}
          onGoTo={(id) => {
            goTo(id);
            // It slides away a moment later: a second click names the
            // terminal right there.
            if (!pinned) {
              cancelTimers();
              closeTimer.current = window.setTimeout(() => setOpen(false),
                DOUBLE_CLICK_MS);
            }
          }}
          onEndTerminal={askEnd}
          renamingMachine={renamingMachine}
          onStartRenameMachine={(id) => {
            cancelTimers();
            setPicking(false);
            setRenamingMachine(id);
          }}
          onRenameMachine={onRenameMachine}
          onStopRenameMachine={() => setRenamingMachine(null)}
          renaming={renaming?.where === "side" ? renaming.id : null}
          onStartRename={(id) => {
            cancelTimers();
            setPicking(false);
            setRenaming({ id, where: "side" });
          }}
          onRename={renameTab} onStopRename={stopRenaming}
          onKeepOpen={cancelTimers}
          onNewFolder={(project) => setNaming({ kind: "new", project })}
          onNewNote={(folderId) => away(() => newNote(folderId))()}
          onOpenNote={(noteId) => away(() => openTab(noteTab(noteId)))()}
          onOpenLog={(machineId) => away(() => openTab(logTab(machineId)))()}
          onNewProject={() => away(startProject)()}
          local={local}
          cutOff={cutOff}
          page={settingsOpen ? "settings" : pageOpen}
          inert={settingsOpen}
          onSettings={() => openSettings("")}
          onAccount={() => openSettings("account")}
          onSignOut={() => void signOutHere().catch(() => {})}
          onSignIn={signInHere}
          language={t.lang}
          onLanguage={chooseLanguage}
          inApp={!!state.app && !local}
          onMove={() => openPage("move")}
          onSupport={() => setSupporting(true)}
          onHome={away(() => navigate("/"))}
          notYet={notYet}
        />
      )}

      {palette && (() => {
        const { entries, recent } = searchSources();
        return (
          <Search entries={entries} recent={recent} near={near}
            onOpenBlock={openFoundBlock} onPaste={pasteFound}
            onOpenNote={openFoundNote} onOpenLine={openFoundLine}
            onClose={() => setPalette(false)} />
        );
      })()}

      {adding && (
        <AddMachine projects={projects} projectId={adding.projectId}
          kind={adding.kind} onClose={() => setAdding(null)}
          onConnected={refresh} notYet={notYet}
          onOpenTerminal={(machineId) => {
            setAdding(null);
            startTerminal(machineId);
          }} />
      )}

      {naming && (
        <FolderDialog
          title={naming.kind === "new"
            ? t("app.folder.new_title", { name: naming.project.name })
            : t("app.folder.rename_title")}
          initial={naming.kind === "rename" ? naming.folder.name : ""}
          action={naming.kind === "new" ? t("app.folder.create") : t("common.save")}
          help={naming.kind === "new"
            ? (alone(naming.project) ? t("app.folder.new_help_alone")
              : t("app.folder.new_help", { name: naming.project.name }))
            : alone(naming.project) ? t("app.folder.rename_help_alone")
            : t("app.folder.rename_help", { name: naming.project.name })}
          onSave={(name) => saveFolder(naming, name)}
          onCancel={() => setNaming(null)} />
      )}

      {linkWindow}

      {/* Before Write to support, which opens from it (Delete account). */}
      {settingsSection !== null && (
        <Settings section={settingsSection}
          onSection={(section) => navigate(section ? `/settings/${section}` : "/settings",
            true, history.state as PageMark | null)}
          onClose={closePage} local={local} here={hereMachine} me={state.me}
          theme={theme} onTheme={chooseTheme} tint={tint} onTint={chooseTint}
          language={t.lang} onLanguage={chooseLanguage} onRenamed={renamed}
          onPhoto={(photo) => setState((was) => (was
            ? { ...was, me: { ...was.me, photo } } : was))}
          onSignedOut={(note) => {
            // This device forgotten: nothing of the person stays here.
            forgetDrafts();
            forgetSupportDraft();
            endSession(note);
          }}
          notify={notYet} projects={projects} onSupport={() => setSupporting(true)} />
      )}

      {supporting && (
        <SupportDialog me={state.me} local={local} inApp={inAppNow}
          version={state.version} appVersion={updates.update?.version ?? null}
          machines={state.projects.reduce((n, p) => n + p.machines.length, 0)}
          onClose={() => setSupporting(false)} />
      )}

      {activeInviteToAccept && (
        <div className="scrim" onClick={() => setActiveInviteToAccept(null)}>
          <section
            className="dialog"
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
            style={{ width: "480px", maxWidth: "100%", padding: "24px" }}
          >
            <div className="dialog-head">
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 24 }}>🤝</span>
                <div className="dialog-title">
                  <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0, color: "var(--ink)" }}>
                    Приглашение в проект {/* i18n-ignore */}
                  </h2>
                  <p style={{ fontSize: 12, color: "var(--dim)", margin: "2px 0 0" }}>
                    Командный доступ к проекту и его терминалам {/* i18n-ignore */}
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="icon-button small"
                onClick={() => setActiveInviteToAccept(null)}
                aria-label="Закрыть" // i18n-ignore
              >
                <Close size={16} />
              </button>
            </div>

            <div style={{
              padding: "16px",
              borderRadius: 8,
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.08)",
              margin: "16px 0",
            }}>
              <div style={{ fontSize: 16, fontWeight: 600, color: "var(--ink)", marginBottom: 8 }}>
                {activeInviteToAccept.info.project?.name || "Проект"} {/* i18n-ignore */}
              </div>
              <div style={{ fontSize: 13, color: "var(--dim)", marginBottom: 6 }}>
                Пригласил: <strong style={{ color: "var(--ink)" }}>{activeInviteToAccept.info.project?.creator_name || "Владелец"}</strong> {/* i18n-ignore */}
              </div>
              <div style={{ fontSize: 13, color: "var(--dim)" }}>
                Предоставляемая роль: <strong style={{ // i18n-ignore
                  color: activeInviteToAccept.info.invite?.role === "admin" ? "#f87171" : "#60a5fa",
                  fontWeight: 600,
                }}>
                  {activeInviteToAccept.info.invite?.role === "admin"
                    ? "Администратор (admin)" // i18n-ignore
                    : activeInviteToAccept.info.invite?.role === "observer"
                      ? "Наблюдатель (observer)" // i18n-ignore
                      : "Участник (member)"} {/* i18n-ignore */}
                </strong>
              </div>
            </div>

            <p style={{ fontSize: 12, color: "var(--faint)", margin: "0 0 16px 0" }}>
              После подключения этот проект появится в вашем списке проектов, и вы сможете работать с его машинами и терминалами. {/* i18n-ignore */}
            </p>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button
                type="button"
                className="button"
                onClick={() => setActiveInviteToAccept(null)}
                disabled={isAcceptingInvite}
              >
                Отклонить {/* i18n-ignore */}
              </button>
              <button
                type="button"
                className="button-accent"
                onClick={handleAcceptInvite}
                disabled={isAcceptingInvite}
              >
                {isAcceptingInvite ? "Подключение..." : "Присоединиться к проекту"} {/* i18n-ignore */}
              </button>
            </div>
          </section>
        </div>
      )}

      {needAccount && (
        <NeedAccount key={needAccount} need={needAccount}
          onClose={() => setNeedAccount(null)}
          onSignIn={() => {
            setNeedAccount(null);
            signInHere();
          }} />
      )}

      {projectWindow && (
        // A window for another project, opened from the palette over this
        // one, starts again with that project's own values.
        <ProjectDialog key={projectWindow.project?.id ?? "new"}
          project={projectWindow.project} projects={projects}
          onSave={(fields) => saveProject(projectWindow, fields)}
          onCancel={() => setProjectWindow(null)} />
      )}

      {moving && (() => {
        const from = projects.find((p) => p.machines.some((m) => m.id === moving.id));
        return (
          <MoveDialog machine={moving}
            targets={projects.filter((p) => p.own && p.role === "owner" && p.id !== from?.id)}
            closed={isClosed(moving)}
            onMove={(projectId) => moveTo(moving, projectId)}
            onCancel={() => setMoving(null)} />
        );
      })()}

      {movingNote && (() => {
        const where = findNote(projects, movingNote.noteId);
        return where && (
          <MoveNoteDialog title={titled(where.note.title, t)} project={where.project}
            folder={where.folder}
            targets={projects.filter((p) => p.id !== where.project.id && writes(p))}
            onMove={(to) => moveNoteOut(movingNote, to)}
            onCancel={() => setMovingNote(null)} />
        );
      })()}

      {deleting && (
        <DeleteProjectDialog
          project={projects.find((p) => p.id === deleting.id) ?? deleting}
          onDelete={() => removeProject(deleting)}
          onCancel={() => setDeleting(null)} />
      )}

      {asking?.kind === "remove" && (
        // A machine closed on this device (0.1.28): the window opens the
        // keys first, then it is the usual one.
        <Confirm title={t("app.remove.title", { name: asking.machine.name })}
          confirm={t("app.remove.confirm", { name: asking.machine.name })}
          blocked={isClosed(asking.machine)}
          onConfirm={() => remove(asking.machine)}
          onCancel={() => setAsking(null)}>
          <p>{t("app.remove.text")}</p>
          {asking.machine.kind === "computer" ? (
            <p className="hint">{t("app.remove.computer")}</p>
          ) : (
            <p className="hint">{t("app.remove.server")}</p>
          )}
          {isClosed(asking.machine) && (
            <KeysHere text={t("app.remove.closed", { name: asking.machine.name })} />
          )}
        </Confirm>
      )}

      {asking?.kind === "end" && (
        <Confirm title={t("app.end.title", { label: asking.terminal.label })}
          confirm={t("app.end.confirm")}
          onConfirm={() => end(asking.terminal)}
          onCancel={() => setAsking(null)}>
          <p>{t("app.end.text")}</p>
        </Confirm>
      )}

      {asking?.kind === "note" && (
        <Confirm title={t("app.delete_note.title", { title: titled(asking.title, t) })}
          sub={t("app.delete_note.sub", { folder: asking.folder.name })}
          confirm={t("app.delete_note.confirm")}
          onConfirm={() => removeNote(asking)}
          onCancel={() => setAsking(null)}>
          <p>
            {alone(asking.project) ? t("app.delete_note.alone")
              : t("app.delete_note.shared", { project: asking.project.name })}
          </p>
        </Confirm>
      )}

      {asking?.kind === "folder" && (() => {
        const inside = asking.folder.notes;
        const titles = inside.map((n) => titled(n.title, t));
        const named = titles.length > 5
          ? list([...titles.slice(0, 4), t("count.more", { n: titles.length - 4 })], t.lang)
          : list(titles, t.lang);
        return (
          <Confirm title={t("app.delete_folder.title", { name: asking.folder.name })}
            confirm={inside.length
              ? t("app.delete_folder.confirm_notes", { n: inside.length })
              : t("app.delete_folder.confirm")}
            onConfirm={() => removeFolder(asking)}
            onCancel={() => setAsking(null)}>
            <p className="ink">
              {inside.length
                ? t("app.delete_folder.notes_go", { n: inside.length, names: named })
                : t("app.delete_folder.empty")}
            </p>
            {inside.length > 0 && !alone(asking.project) && (
              <p>{t("app.delete_folder.shared", { project: asking.project.name })}</p>
            )}
            {inside.length > 0 && (
              <p className="keep-note">
                <FolderIcon size={15} />
                <span>{t("app.delete_folder.keep")}</span>
              </p>
            )}
          </Confirm>
        );
      })()}

      {removed && (
        <Removed name={removed.name} cleanup={removed.cleanup}
          onClose={() => setRemoved(null)} notify={notYet} />
      )}

      <NotificationHttpNoticeModal
        notify={notYet}
        onConfigureTelegram={() => openSettings("telegram")}
      />

      <VaultDialogHost />

      {toast && <div className="toast" role="status">{toast}</div>}
      {!toast && <UpdatedToast />}
    </div>
    </MoveContext.Provider>
    </UpdateState.Provider>
    </LocalOnly.Provider>
    </InApp.Provider>
  );
}
