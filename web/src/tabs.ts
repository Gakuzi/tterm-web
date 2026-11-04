// The tabs this browser keeps open, in the order they were opened: terminals
// from any project, notes, and projects' pages (notes and pages from 0.1.0).
// A tab is only a view. Closing it leaves a terminal running in tTerm Web,
// in the sidebar under its machine, and a note in its folder, where either
// can be opened again.
//
// A terminal's tab is its id, as before 0.1.0, so that the tabs a browser
// kept then are still there; a note's is n:<id>, a project's page p:<id>,
// from 0.1.20 a machine's log l:<id of the machine>, and from 0.1.28 a new
// terminal asked for on a machine closed on this device, k:<id of the
// machine>: its card opens the keys, then the terminal comes in its place.
//
// And the page's own shortcuts: Cmd on a Mac, Ctrl+Shift elsewhere. Plain
// Ctrl stays the terminal's: Ctrl+C, Ctrl+R and Ctrl+K belong to the shell.

const TABS_KEY = "tterm.tabs";
const ID = /^[0-9a-f-]{36}$/;
const TAB = /^(?:[nplk]:)?[0-9a-f-]{36}$/;
/** Tabs at once, at most: each terminal is on the page's one connection,
 * which takes 64. */
export const TABS_MAX = 32;

export type TabKind = "terminal" | "note" | "project" | "log" | "keys";

export function tabKind(tab: string): TabKind {
  if (tab.startsWith("n:")) return "note";
  if (tab.startsWith("p:")) return "project";
  if (tab.startsWith("l:")) return "log";
  if (tab.startsWith("k:")) return "keys";
  return "terminal";
}

/** The id of the terminal, the note or the project. */
export function tabTarget(tab: string): string {
  return tab.includes(":") ? tab.slice(2) : tab;
}

export const noteTab = (id: string) => `n:${id}`;
export const projectTab = (id: string) => `p:${id}`;
export const logTab = (machineId: string) => `l:${machineId}`;
export const keysTab = (machineId: string) => `k:${machineId}`;

/** The address of a tab: /t/<id>, /n/<id>, /p/<id>, /l/<id>, /k/<id>. */
export function tabPath(tab: string): string {
  const kind = tabKind(tab);
  const id = tabTarget(tab);
  return kind === "note" ? `/n/${id}` : kind === "project" ? `/p/${id}`
    : kind === "log" ? `/l/${id}` : kind === "keys" ? `/k/${id}` : `/t/${id}`;
}

const PATH = /^\/([tnplk])\/([0-9a-f-]{36})\/?$/;

/** The tab an address shows, if it shows one. */
export function tabOfPath(path: string): string | null {
  const m = PATH.exec(path);
  if (!m) return null;
  return m[1] === "t" ? m[2] : `${m[1]}:${m[2]}`;
}

export function rememberedTabs(): string[] {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(TABS_KEY) ?? "[]");
    if (!Array.isArray(raw)) return [];
    const ids = raw.filter((x): x is string => typeof x === "string" && TAB.test(x));
    return [...new Set(ids)].slice(0, TABS_MAX);
  } catch {
    return [];
  }
}

export function rememberTabs(ids: string[]): void {
  try {
    localStorage.setItem(TABS_KEY, JSON.stringify(ids));
  } catch {
    // A convenience: without it the tabs are the running terminals.
  }
}

export function isTerminalTab(tab: string): boolean {
  return ID.test(tab);
}

/** Not "tterm.folded": that one is the feed's folded blocks (0.0.8). */
const FOLDED_KEY = "tterm.sidebar";

/** What is folded in the sidebar: projects (p:), machines (m:), folders
 * of notes (f:) and from 0.1.20 the Logs folder of a project (l:) by id.
 * Everything else is unfolded. */
export function rememberedFolds(): Set<string> {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(FOLDED_KEY) ?? "[]");
    if (!Array.isArray(raw)) return new Set();
    return new Set(raw.filter((x): x is string =>
      typeof x === "string" && /^[pmfl]:[0-9a-f-]{36}$/.test(x)).slice(0, 2000));
  } catch {
    return new Set();
  }
}

export function rememberFolds(folded: Set<string>): void {
  try {
    localStorage.setItem(FOLDED_KEY, JSON.stringify([...folded]));
  } catch {
    // A convenience: without it everything opens unfolded.
  }
}

export const MAC = /Mac|iPhone|iPad/.test(navigator.platform ||
  navigator.userAgent);

/** Whether the key is our shortcut with this letter, in any keyboard
 * layout: with a Russian one the key K types Л. */
export function shortcut(event: KeyboardEvent, letter: string): boolean {
  const key = event.key.toLowerCase() === letter ||
    event.code === `Key${letter.toUpperCase()}`;
  if (event.altKey || !key) return false;
  return MAC ? event.metaKey && !event.ctrlKey && !event.shiftKey
    : event.ctrlKey && event.shiftKey && !event.metaKey;
}

export const JUMP_KEYS = MAC ? "⌘K" : "Ctrl+Shift+K";
