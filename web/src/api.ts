// Talking to the core. Every request that changes something carries the
// x-tterm header: the core refuses such requests without it, which is what
// keeps other sites in other tabs from acting on your behalf.
//
// Everything but signing in needs a session (from 0.0.9). When the core
// answers that there is none, or it ended, the page hears it through
// onSignedOut and asks to sign in; so does the socket (socket.ts).

import { t as say } from "./i18n";

export type Theme = "system" | "light" | "dark";
export type Role = "owner" | "admin" | "member" | "observer";
export type MachineKind = "server" | "computer";
/** A project's color (0.1.1): it marks the project in the sidebar and in
 * tabs, for everyone in it. */
export type ProjectColor =
  | "violet" | "sky" | "teal" | "pink" | "orange" | "lime" | "indigo" | "slate";
/** In the order new projects take them, as the core has it. */
export const PROJECT_COLORS: ProjectColor[] = [
  "violet", "sky", "teal", "pink", "orange", "lime", "indigo", "slate",
];
/** How much of a project's color the sidebar shows: its badge only, or the
 * whole block of the project. Each person's own choice. */
export type ProjectTint = "badge" | "block";

export interface Passport {
  os?: string;
  os_id?: string;
  os_version?: string;
  kernel?: string;
  arch?: string;
  hostname?: string;
  package_manager?: string;
  shell?: string;
  shells?: string[];
  cpus?: number;
  memory_kb?: number;
  disk_total_kb?: number;
  disk_free_kb?: number;
  sudo?: boolean;
  /** sudo is there but asks for a password, as on a person's own Mac. */
  sudo_password?: boolean;
  systemd?: boolean;
  commands_count?: number;
  checked_at?: string;
  /** A computer's agent version, and whose account it runs as. */
  agent?: string;
  user?: string;
}

/** A computer's agent while it is connected. */
export interface AgentInfo {
  version: string;
  /** Connected since, in milliseconds. */
  since: number;
}

export interface Machine {
  id: string;
  kind: MachineKind;
  name: string;
  host: string | null;
  os: string | null;
  passport?: Passport;
  /** A computer is online while its agent is connected. */
  online?: boolean;
  agent?: AgentInfo | null;
  /** When its agent was last connected, in milliseconds. */
  lastSeen?: number | null;
  /** In tTerm for the computer signed in (0.1.6): the computer the app runs
   * on, whose terminals run right here. tTerm Web never sends it. */
  here?: boolean;
  /** How a server opens (0.1.17): with tTerm's certificate (as from Add
   * machine), with the person's own key from their vault, or through their
   * Mac (`via`), while it is on. */
  method?: LoginMethod;
  via?: { id: string; name: string | null } | null;
}

export type LoginMethod = "cert" | "key" | "mac";

/** A machine taken out of tTerm Web. For a server, whether tTerm Web took
 * its access back on the server itself, or the command that does. */
export interface Removed {
  id: string;
  name: string;
  kind: MachineKind;
  /** For a server that did not answer: the command that takes tTerm Web's
   * access back there. */
  cleanup?: string | null;
  /** The same server is in another project too: its access stays. */
  shared?: boolean;
  /** For a server: tTerm Web took its access back there itself (0.0.12). */
  accessRemoved?: boolean;
}

export interface Project {
  id: string;
  name: string;
  code: string;
  color: ProjectColor;
  role: Role;
  /** The person's first project, Personal unless renamed, which is theirs
   * alone (0.1.0) and stays. */
  personal: boolean;
  /** Theirs: they made it (0.1.1). */
  own: boolean;
  /** Nobody else in it: "only you". */
  alone: boolean;
  machines: Machine[];
  /** Its folders of notes, by name (0.1.0). */
  folders: Folder[];
}

/** Someone, as notes name them: who wrote, edited, ticked. */
export interface Who {
  id: string;
  name: string;
  firstName: string;
  initials: string;
}

/** A note as lists show it: no text, only what it is like. */
export interface NoteSummary {
  id: string;
  title: string;
  /** Checklist items, and how many are ticked. */
  total: number;
  done: number;
  /** The start of its text. */
  excerpt: string;
  /** Which save of it this is: of two copies, the higher is the newer. */
  version: number;
  createdBy: Who | null;
  createdAt: number;
  editedBy: Who | null;
  editedAt: number;
}

export interface Folder {
  id: string;
  name: string;
  createdBy: Who | null;
  /** The newest first. */
  notes: NoteSummary[];
}

export type BlockType = "p" | "h" | "li" | "todo" | "code" | "hr";

/** A paragraph, a heading, a list item, a checklist item, code or a
 * divider. A checklist item's tick, who made it and when, are the core's
 * to say: the page sends ticks with tickNote only. */
export interface Block {
  id: string;
  type: BlockType;
  text: string;
  done?: boolean;
  by?: string | null;
  at?: number | null;
}

/** A whole note. */
export interface Note {
  id: string;
  folderId: string;
  folder: string;
  projectId: string;
  title: string;
  blocks: Block[];
  version: number;
  createdBy: Who | null;
  createdAt: number;
  editedBy: Who | null;
  editedAt: number;
  /** Those who ticked its items, by id. */
  people: Record<string, Who>;
  canDelete: boolean;
  canWrite: boolean;
}

/** A save refused because the same things changed elsewhere meanwhile:
 * the note as it is saved now. */
export class NoteConflict extends Error {
  constructor(readonly note: Note) {
    super(say("api.note_changed"));
  }
}

/** The note is not there any more, or not for this person. */
export class NoteGone extends Error {}

export interface Me {
  id: string;
  name: string;
  firstName: string;
  initials: string;
  theme: Theme;
  projectTint: ProjectTint;
  plan: string;
  email: string | null;
  /** One's own photo (0.1.7): where the page loads it from, or null for the
   * initials. The app before signing in sends none. */
  photo?: string | null;
  /** The language chosen (0.1.16), kept in the account, or in the app
   * before signing in on this computer; null until one is chosen. */
  language?: string | null;
  /** In the app (0.6.0): the system's language, when it is one of the
   * twelve; the page takes it until one is chosen. tTerm Web sends none. */
  systemLanguage?: string | null;
  /** Signed in with tTerm for Mac at least once, on a device not forgotten
   * (0.1.18): the menu no longer offers to download it. */
  appSignedIn?: boolean;
}

export type TerminalState = "connecting" | "open" | "ended" | "gone";

export interface TerminalInfo {
  id: string;
  machineId: string;
  machine: string;
  /** As tabs show it: P/web-01, or P/web-01 · 2 for the second one. */
  label: string;
  name: string;
  state: TerminalState;
  /** How it ended, in a sentence; null while it runs. */
  reason: string | null;
  /** Open, and its computer asleep or offline: it waits for it, and goes
   * on where it was when it is back. Since when, in milliseconds. */
  away?: boolean;
  awaySince?: number | null;
  shell?: string | null;
  /** Whether the shell prints our markers at its prompts. */
  markers?: boolean;
  /** Whether it marks where each command starts too: then commands become
   * blocks and tTerm's own input line works. */
  blocks?: boolean;
  cwd?: string;
  home?: string;
  branch?: string;
  venv?: string;
  /** The command running now, if any. */
  running?: RunningCommand | null;
  /** A server that opens with the person's own key (0.1.17), while no page
   * or app that can sign with it is there: its login waits, and goes on by
   * itself once one is. */
  vault?: { key: string; keyName: string | null; since: string } | null;
}

export interface RunningCommand {
  command: string;
  cwd: string;
  branch: string;
  seqStart: number;
  cols: number;
  at: number;
}

/** A finished block as the database keeps it, with the end of its output. */
export interface StoredBlock {
  id: number;
  seqStart: number;
  seqEnd: number | null;
  command: string;
  cwd: string;
  branch: string;
  startedAt: number | null;
  finishedAt: number | null;
  exitCode: number | null;
  cols: number | null;
  /** The middle of a long output was not kept. */
  cut: boolean;
  /** Only the end of the output came along. */
  partial: boolean;
  size: number;
  /** Base64. */
  output: string;
  /** Its line in the machine's log (0.1.20), the notes under it, and who
   * redacted it if someone did. Blocks from before 0.1.20 have no line. */
  entry: number | null;
  notes: LogNote[];
  redacted: Redaction | null;
  canNote: boolean;
}

export interface Feed {
  blocks: StoredBlock[];
  /** There are earlier blocks. */
  more: boolean;
}

export interface HistoryEntry {
  command: string;
  /** Run on this machine; otherwise elsewhere in the project. */
  here: boolean;
}

export interface CompleteItem {
  /** The whole word, quoted as it goes into the line. */
  text: string;
  label: string;
  kind: "dir" | "file" | "command" | "branch";
}

export interface Completion {
  start: number;
  end: number;
  quote: string;
  kind: string;
  items: CompleteItem[];
  more: boolean;
}

export interface DirList {
  cwd: string;
  home: string;
  dirs: string[];
}

export interface BranchList {
  current: string;
  local: string[];
  remote: string[];
}

export interface State {
  version: string;
  me: Me;
  projects: Project[];
  /** The terminals running now, the oldest first. */
  terminals: TerminalInfo[];
  /** In tTerm for the computer before signing in (0.1.4): this computer
   * only, see local.ts. tTerm Web never sends it. */
  local?: boolean;
  /** Before signing in, on the app's first start (0.1.6): the welcome with
   * Sign in with your browser and Later. */
  welcome?: boolean;
  /** In tTerm for the computer signed in (0.1.6): its engine brings the
   * cloud to the page, and the computer it runs on is `here`. */
  app?: boolean;
  /** Signed in in the app, and tTerm cannot be reached now: the computer
   * works on, the rest waits for the connection (0.1.6). */
  offline?: boolean;
}

export interface Install {
  id: string;
  command: string;
  /** For a computer: the agent started by hand, for trying one not yet
   * released. */
  byHand?: string | null;
  expiresAt: string;
  minutes: number;
}

export type InstallState =
  | "waiting" | "connecting" | "connected" | "failed" | "expired";

export interface InstallStatus {
  state: InstallState;
  error: string | null;
  expiresAt: string;
  machine: { id: string; name: string; host: string | null;
    os: string | null; label: string } | null;
}

/** The core said no, or something went wrong there: `status` is its HTTP
 * answer. */
export class CoreError extends Error {
  constructor(message: string, readonly status = 0) {
    super(message);
  }
}

/** No session, or it ended: the page asks to sign in. */
export class SignedOut extends CoreError {}

/** A refusal for what was asked (a 4xx): asking again the same way gets the
 * same answer. Anything else, such as no connection or a core that is
 * restarting, may pass. */
export function refused(error: unknown): boolean {
  return error instanceof CoreError && error.status >= 400 &&
    error.status < 500 && error.status !== 408 && error.status !== 429;
}

const signedOutListeners = new Set<() => void>();

/** Calls back when the core says this browser is not signed in (any more). */
export function onSignedOut(listener: () => void): () => void {
  signedOutListeners.add(listener);
  return () => signedOutListeners.delete(listener);
}

export function signedOutNow(): void {
  for (const listener of signedOutListeners) listener();
}

async function check(response: Response): Promise<Response> {
  if (!response.ok) {
    let body: { error?: string; signedOut?: boolean } = {};
    try {
      body = await response.clone().json();
    } catch {
      // Not JSON; the status says enough.
    }
    if (response.status === 401 && body.signedOut) {
      signedOutNow();
      throw new SignedOut(body.error ?? say("api.sign_in"), 401);
    }
    throw new CoreError(body.error || say("api.answered", { status: String(response.status) }),
      response.status);
  }
  return response;
}

function change(method: string, body: unknown): RequestInit {
  return {
    method,
    headers: { "content-type": "application/json", "x-tterm": "1" },
    body: JSON.stringify(body),
  };
}

/** What the page asks by itself, now and then: the core does not count it
 * as something done, so it does not keep a session from ending. */
const BACKGROUND = { "x-tterm-background": "1" };

export async function loadState(background = false): Promise<State> {
  const response = await fetch("/api/state", {
    headers: { accept: "application/json", ...(background ? BACKGROUND : {}) },
    cache: "no-store",
  });
  return (await check(response)).json();
}

// ------------------------------------------------------------ signing in

/** A trusted device: this browser, with a quick code set. */
export interface KnownDevice {
  label: string;
  name: string;
  email: string;
}

/** What the sign-in screens link to. */
export interface Legal {
  terms: string;
  privacy: string;
  /** Support's address. */
  support: string;
}

export interface AuthState {
  signedIn: boolean;
  device: KnownDevice | null;
  legal?: Legal;
}

/** Signed in with a code from email: the quick code may be set now. */
export interface SignedInNow {
  signedIn: true;
  /** The account was made just now. */
  new: boolean;
  /** The first name, to greet with. */
  name: string;
  offerPin: boolean;
  pinDigits: number;
}

/** The code was right, and the address has no account yet: the name and
 * the tick first. */
export interface SignUpFirst {
  signUp: true;
  email: string;
}

export interface Device {
  id: string;
  /** A browser with a quick code, or from 0.1.6 tTerm for the computer,
   * signed in with the browser. */
  kind?: "browser" | "app";
  /** "Chrome on macOS", "tTerm for Mac on MacBook-Pro-Denis". */
  label: string;
  createdAt: number;
  lastUsed: number;
  /** This very browser. */
  current: boolean;
}

/** A sign-in step refused: why, and for codes the tries left or the
 * seconds to wait before asking again. */
export class Refused extends CoreError {
  constructor(message: string, status: number,
    readonly left?: number, readonly wait?: number) {
    super(message, status);
  }
}

async function auth<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(path, change("POST", body ?? {}));
  let data: { error?: string; left?: number; wait?: number } = {};
  try {
    data = await response.json();
  } catch {
    // Not JSON: the status says enough.
  }
  if (!response.ok) {
    throw new Refused(data.error || say("api.answered", { status: String(response.status) }),
      response.status, data.left, data.wait);
  }
  return data as T;
}

export async function authState(): Promise<AuthState> {
  const response = await fetch("/api/auth/state", { cache: "no-store" });
  return (await check(response)).json();
}

/** Sends a code for signing in to the address. */
export function askCode(email: string): Promise<{ email: string; minutes: number }> {
  return auth("/api/auth/code", { email });
}

export function verifyCode(email: string,
  code: string): Promise<SignedInNow | SignUpFirst> {
  return auth("/api/auth/verify", { email, code });
}

/** Makes the account of the address whose code this browser just entered:
 * the person's name, and their yes to the Terms of Service and the Privacy
 * Policy. */
export function signUp(email: string, name: string,
  agree: boolean): Promise<SignedInNow> {
  return auth("/api/auth/signup", { email, name, agree });
}

/** Makes this browser a trusted device with a quick code. */
export function setQuickCode(pin: string): Promise<void> {
  return auth("/api/auth/pin", { pin });
}

export function quickSignIn(pin: string): Promise<void> {
  return auth("/api/auth/pin-login", { pin });
}

/** Sign out (from 0.0.10; from 0.1.4 in the menu of the account at the
 * bottom of the sidebar): this browser forgets the person, so that next
 * time it takes a code from email. */
export function signOut(): Promise<void> {
  return auth("/api/auth/signout");
}

/** Sign in, from tTerm for the computer before signing in (0.1.4): the
 * app signs in with the browser. Its engine answers with the code the
 * browser shows too (0.1.6); an engine from before says why not, and that
 * is what the page shows. `again` opens the page in the browser once more. */
export async function signInApp(again = false): Promise<{ code?: string }> {
  const response = await check(await fetch("/api/auth/link",
    change("POST", again ? { again: true } : {})));
  // An answer with nothing in it is fine too.
  return response.json().catch(() => ({}));
}

/** How signing in the app goes (0.1.6), as its engine says: waiting for
 * the browser, done, or over with why. */
export interface AppLinkState {
  state: "waiting" | "done" | "failed" | "cancelled" | "none";
  error?: string;
}

export async function appLinkState(): Promise<AppLinkState> {
  const response = await fetch("/api/auth/link", { cache: "no-store" });
  return (await check(response)).json();
}

/** Cancel, in the window of the app that waits for the browser. */
export async function cancelAppLink(): Promise<void> {
  await check(await fetch("/api/auth/link", change("DELETE", {})));
}

/** Later, on the app's welcome: it does not come again (0.1.6). */
export async function welcomeSeen(): Promise<void> {
  await check(await fetch("/api/app/welcome", change("POST", { seen: true })));
}

/** This computer, opened from tTerm Web and the phone through the app
 * (0.1.14, with the app 0.4.0): the switch in Settings, and how its link
 * to tTerm Web is. Only the app's engine answers it. */
export interface ThisComputer {
  open: boolean;
  status: "starting" | "off" | "signed-out" | "waiting" | "connecting"
    | "online" | "no-network" | "removed" | "closed";
  /** What tTerm Web calls this computer, once connected. */
  name: string | null;
  /** Why it cannot connect now, or why it went off. */
  problem: string | null;
  /** Terminals opened from tTerm Web running on this computer now. */
  terminals: number;
}

export async function loadThisComputer(): Promise<ThisComputer> {
  const response = await fetch("/api/app/this-computer",
    { cache: "no-store", headers: BACKGROUND });
  return (await check(response)).json();
}

export async function openFromWeb(open: boolean): Promise<ThisComputer> {
  return (await check(await fetch("/api/app/this-computer",
    change("PUT", { open })))).json();
}

/** tTerm for Mac updating itself (0.1.15, with the app 0.5.0): Settings'
 * Updates, Restart to update in the top bar and above the account, and
 * once, tTerm is updated. Only the app's engine answers it. */
export type UpdateMode = "auto" | "ask";

export interface AppUpdate {
  /** The version this app is. */
  version: string;
  /** Update by itself, or Ask me first. */
  mode: UpdateMode;
  state: "idle" | "checking" | "downloading" | "ready" | "installing" | "failed"
    | "unavailable";
  /** The version ready, or on its way. */
  next: string | null;
  /** Its release's page, for What's new. */
  notes: string | null;
  readyAt: number | null;
  checkedAt: number | null;
  /** Why it failed, or why the app cannot update itself here. */
  problem: string | null;
  /** It runs from the disk image: Move to Applications helps. */
  movable: boolean;
  /** Just updated, until the page has said so. */
  updated: { from: string; to: string; notes: string } | null;
  /** A version that did not start here and went back. */
  note: string | null;
}

export async function loadUpdate(): Promise<AppUpdate> {
  const response = await fetch("/api/app/update", { cache: "no-store", headers: BACKGROUND });
  return (await check(response)).json();
}

export async function setUpdateMode(mode: UpdateMode): Promise<AppUpdate> {
  return (await check(await fetch("/api/app/update", change("PUT", { mode })))).json();
}

export async function checkUpdate(): Promise<AppUpdate> {
  return (await check(await fetch("/api/app/update/check", change("POST", {})))).json();
}

/** The app asks first when terminals would end, then quits for it. */
export async function restartToUpdate(): Promise<AppUpdate> {
  return (await check(await fetch("/api/app/update/restart", change("POST", {})))).json();
}

/** From the disk image: the app moves itself, after asking. */
export async function moveToApplications(): Promise<AppUpdate> {
  return (await check(await fetch("/api/app/update/move", change("POST", {})))).json();
}

/** tTerm is updated, said: not again. */
export async function updateSeen(): Promise<AppUpdate> {
  return (await check(await fetch("/api/app/update/seen", change("POST", {})))).json();
}

/** Allowing an app takes a sign-in made just now: the person confirms it
 * is them first (0.1.6). */
export class ConfirmFirst extends CoreError {}

/** This browser is signed in to another account than the page asked about
 * (0.1.8): another tab signed someone else in meanwhile. */
export class AccountChanged extends CoreError {}

/** The browser, signed in, allows the app that opened /connect (0.1.6) for
 * the account the page asked about (`account`, from 0.1.8): the app's own
 * address on 127.0.0.1, where the page goes next. */
export async function allowApp(link: {
  app: string; name: string; port: number; challenge: string; state: string;
}, account: string): Promise<{ redirect: string }> {
  const response = await fetch("/api/auth/app/allow",
    change("POST", { ...link, account }));
  if (response.status === 403 || response.status === 409) {
    const body: { error?: string; confirm?: boolean; changed?: boolean } =
      await response.clone().json().catch(() => ({}));
    if (body.confirm) {
      throw new ConfirmFirst(body.error ?? say("api.confirm_first"), 403);
    }
    if (body.changed) {
      throw new AccountChanged(body.error ?? say("api.account_changed"), 409);
    }
  }
  return (await check(response)).json();
}

/** Ends this session only, keeping a trusted browser trusted: to confirm
 * with a sign-in made just now (0.1.6). */
export async function endSession(): Promise<void> {
  await check(await fetch("/api/auth/end-session", change("POST", {})));
}

/** Forget all devices: every session ends and no browser is trusted any
 * more. */
export async function forgetAllDevices(): Promise<void> {
  await check(await fetch("/api/auth/signout-everywhere", change("POST", {})));
}

/** What Account and Settings show besides the name and the address: the
 * plan on Account, the devices and the documents on Settings (0.1.4). */
export interface AccountInfo {
  plan: {
    id: string;
    name: string;
    /** The most there may be; null where the plan sets no limit. */
    limits: { machines: number | null; terminals: number | null };
  };
  /** What counts against the limits now. */
  usage: { machines: number; terminals: number };
  devices: Device[];
  legal: Legal;
}

export async function loadAccount(): Promise<AccountInfo> {
  const response = await fetch("/api/account", { cache: "no-store" });
  return (await check(response)).json();
}

/** The name as the person changed it, tidied by the core. */
export async function saveName(name: string): Promise<{
  name: string; firstName: string; initials: string;
}> {
  return (await check(await fetch("/api/me", change("PATCH", { name })))).json();
}

export async function listDevices(): Promise<Device[]> {
  const response = await fetch("/api/devices", { cache: "no-store" });
  return (await (await check(response)).json()).devices;
}

/** Forgets a trusted device; forgetting this very one signs out here. */
export async function forgetDevice(id: string): Promise<{ current: boolean }> {
  const response = await fetch(`/api/devices/${id}`,
    { method: "DELETE", headers: { "x-tterm": "1" } });
  return (await check(response)).json();
}

export async function saveTheme(theme: Theme): Promise<void> {
  await check(await fetch("/api/me", change("PATCH", { theme })));
}

export async function saveProjectTint(projectTint: ProjectTint): Promise<void> {
  await check(await fetch("/api/me", change("PATCH", { projectTint })));
}

/** The language chosen (0.1.16): to the account, or in the app before
 * signing in to this computer. */
export async function saveLanguage(language: string): Promise<void> {
  await check(await fetch("/api/me", change("PATCH", { language })));
}

/** One's own photo (0.1.7): the JPEG the page made, 256 pixels square.
 * Where it is loaded from now. */
export async function savePhoto(jpeg: Blob): Promise<{ photo: string }> {
  return (await check(await fetch("/api/me/photo", {
    method: "PUT",
    headers: { "content-type": "image/jpeg", "x-tterm": "1" },
    body: jpeg,
  }))).json();
}

export async function removePhoto(): Promise<void> {
  await check(await fetch("/api/me/photo",
    { method: "DELETE", headers: { "x-tterm": "1" } }));
}

// ------------------------------------------- search over everything (0.1.7)

/** A command found, or one whose output has the words: where it ran, how it
 * ended, and lines of its output (its start, or around the place). */
export interface FoundBlock {
  terminalId: string;
  seq: number;
  command: string;
  cwd: string;
  home: string;
  branch: string;
  exitCode: number | null;
  startedAt: number | null;
  finishedAt: number | null;
  machineId: string;
  machine: string;
  machineKind: MachineKind;
  /** The machine was taken out of tTerm Web; its history stays. */
  removed: boolean;
  projectId: string;
  code: string;
  project: string;
  /** Its terminal as the tab names it: P/web-01 · deploy. */
  terminal: string;
  ended: boolean;
  endedAt: number | null;
  /** Commands only: how many times it ran there. */
  runs?: number;
  /** Output only: the line with the words. */
  line?: string;
  lines: string[];
  /** Which of `lines` has the words; -1 for none. */
  hit: number;
  /** Output only: the line's number in the output, as search reads it. */
  lineNo?: number;
}

export interface FoundNote {
  noteId: string;
  title: string;
  folderId: string;
  folder: string;
  projectId: string;
  code: string;
  project: string;
  editedAt: number | null;
  /** The words are all in its title. */
  inTitle: boolean;
  /** The block where the words are, and its first line. */
  blockId: string | null;
  text: string;
  lines: { text: string; type: BlockType; done: boolean }[];
  hit: number;
}

/** Where a line of a log is (0.1.21): its machine and that machine's
 * project, as search names them. */
interface FoundInLog {
  machineId: string;
  machine: string;
  machineKind: MachineKind;
  projectId: string;
  code: string;
  project: string;
}

/** A command found in a log: the latest run of it on its machine. */
export interface FoundLogLine extends FoundInLog {
  kind: "line";
  entry: number;
  at: number;
  by: LogPerson | null;
  command: string;
  exit: number | null;
  cwd: string;
  home: string;
  branch: string;
  terminal: string;
  runs: number;
  /** Notes under it, and the first of them. */
  notes: number;
  note: LogNote | null;
}

/** A note found in a log, under its line. */
export interface FoundLogNote extends FoundInLog {
  kind: "note";
  id: number;
  at: number;
  by: LogPerson | null;
  author: "person" | "ai" | "tterm";
  ai: string | null;
  text: string;
  entry: number;
  lineAt: number;
  /** The line's command; null when it was redacted. */
  command: string | null;
}

export type FoundLog = FoundLogLine | FoundLogNote;

export interface Found {
  /** The words searched for, in lower case. */
  words: string[];
  commands: FoundBlock[];
  output: FoundBlock[];
  notes: FoundNote[];
  /** The machines' logs (0.1.21). */
  logs: FoundLog[];
  /** Nothing typed: the commands run most on the machine asked about. */
  recent: FoundBlock[];
  more: { commands?: boolean; output?: boolean; notes?: boolean; logs?: boolean };
}

export async function searchAll(query: string, near: string | null,
  signal?: AbortSignal): Promise<Found> {
  const params = new URLSearchParams({ q: query });
  if (near) params.set("near", near);
  const response = await fetch(`/api/search?${params}`,
    { cache: "no-store", signal });
  return (await check(response)).json();
}

// ----------------------------------------------------- projects (0.1.1)

/** A project of one's own, as the sidebar lists it. */
export async function createProject(name: string, code: string,
  color: ProjectColor): Promise<Project> {
  return (await check(await fetch("/api/projects",
    change("POST", { name, code, color })))).json();
}

export interface ProjectFields {
  name: string;
  code: string;
  color: ProjectColor;
}

/** The name, the code or the color changed: the project as it is now. */
export async function editProject(id: string,
  fields: Partial<ProjectFields>): Promise<ProjectFields & { id: string }> {
  return (await check(await fetch(`/api/projects/${id}`,
    change("PATCH", fields)))).json();
}

/** Deletes a project with no machines in it, with its notes. */
export async function deleteProject(id: string): Promise<{
  id: string; name: string; folders: number; notes: number;
}> {
  return (await check(await fetch(`/api/projects/${id}`,
    { method: "DELETE", headers: { "x-tterm": "1" } }))).json();
}

/** A machine moved to another project of one's own. */
export interface Moved {
  id: string;
  /** Its name there: with a number, where its own was taken. */
  name: string;
  kind: MachineKind;
  projectId: string;
  project: string;
  code: string;
  /** The project it came from. */
  from: string;
}

export async function moveMachine(id: string, projectId: string): Promise<Moved> {
  return (await check(await fetch(`/api/machines/${id}/move`,
    change("POST", { projectId })))).json();
}

/** A name for a terminal instead of its number. */
export async function renameTerminal(id: string,
  name: string): Promise<TerminalInfo> {
  return (await check(await fetch(`/api/terminals/${id}`,
    change("PATCH", { name })))).json();
}

export async function newInstall(projectId: string,
  kind: MachineKind = "server"): Promise<Install> {
  const response = await fetch("/api/installs",
    change("POST", { projectId, kind }));
  return (await check(response)).json();
}

/** Asked every few seconds while the dialog waits: in the background. */
export async function installStatus(id: string): Promise<InstallStatus> {
  const response = await fetch(`/api/installs/${id}`,
    { cache: "no-store", headers: BACKGROUND });
  return (await check(response)).json();
}

/** A message to support (0.1.25): `details` the line shown under Attach
 * technical details, null when not ticked; `email` only in the app before
 * signing in. Where the answer goes, and whether a copy went there. */
export async function sendSupport(message: {
  text: string;
  details: string | null;
  email?: string;
}): Promise<{ sent: boolean; email: string; copy: boolean }> {
  const response = await fetch("/api/support", change("POST", message));
  return (await check(response)).json();
}

/** `cwd` (0.1.24): the folder to start in, the one an ended terminal was
 * in; the core starts there if it can, and at home otherwise. */
export async function openTerminal(machineId: string, cols: number,
  rows: number, cwd?: string): Promise<TerminalInfo> {
  const response = await fetch("/api/terminals",
    change("POST", cwd ? { machineId, cols, rows, cwd } : { machineId, cols, rows }));
  return (await check(response)).json();
}

export async function terminalInfo(id: string): Promise<TerminalInfo | null> {
  const response = await fetch(`/api/terminals/${id}`, { cache: "no-store" });
  if (response.status === 404) return null;
  return (await check(response)).json();
}

/** Ends the terminal: its shell gets a hangup, as when a window closes. */
export async function endTerminal(id: string): Promise<TerminalInfo | null> {
  const response = await fetch(`/api/terminals/${id}`,
    { method: "DELETE", headers: { "x-tterm": "1" } });
  if (response.status === 404) return null;
  return (await check(response)).json();
}

/** Takes a machine out of tTerm Web: its terminals end, a computer's agent
 * stops, the history stays. */
export async function removeMachine(id: string): Promise<Removed> {
  const response = await fetch(`/api/machines/${id}`,
    { method: "DELETE", headers: { "x-tterm": "1" } });
  return (await check(response)).json();
}

export async function loadFeed(id: string, before?: number,
  limit = 60): Promise<Feed | null> {
  const query = new URLSearchParams({ limit: String(limit) });
  if (before !== undefined) query.set("before", String(before));
  const response = await fetch(`/api/terminals/${id}/blocks?${query}`,
    { cache: "no-store" });
  if (response.status === 404) return null;
  return (await check(response)).json();
}

export async function blockOutput(id: string,
  seqStart: number): Promise<Uint8Array | null> {
  const response = await fetch(`/api/terminals/${id}/blocks/${seqStart}/output`,
    { cache: "no-store" });
  if (response.status === 404) return null;
  return new Uint8Array(await (await check(response)).arrayBuffer());
}

export async function loadHistory(id: string): Promise<HistoryEntry[]> {
  const response = await fetch(`/api/terminals/${id}/history`,
    { cache: "no-store" });
  if (response.status === 404) return [];
  return (await (await check(response)).json()).commands;
}

export async function completeWord(id: string, line: string,
  cursor: number): Promise<Completion> {
  const response = await fetch(`/api/terminals/${id}/complete`,
    change("POST", { line, cursor }));
  return (await check(response)).json();
}

export async function listDirs(id: string): Promise<DirList> {
  const response = await fetch(`/api/terminals/${id}/dirs`, change("POST", {}));
  return (await check(response)).json();
}

export async function listBranches(id: string): Promise<BranchList> {
  const response = await fetch(`/api/terminals/${id}/branches`,
    change("POST", {}));
  return (await check(response)).json();
}

// ------------------------------------------------- machines' logs (0.1.20)

/** Someone in a machine's log: who ran a command, wrote a note, redacted. */
export interface LogPerson extends Who {
  photo: string | null;
  me: boolean;
}

/** Words redacted: who did it, when, and why. */
export interface Redaction {
  by: LogPerson | null;
  at: number;
  reason: string;
}

/** A note under a line, by a person or by an AI on a person's behalf
 * (`by`); its words, or null once redacted. */
export interface LogNote {
  id: number;
  at: number;
  by: LogPerson | null;
  author: "person" | "ai" | "tterm";
  ai: string | null;
  text: string | null;
  redacted: Redaction | null;
}

export type LogKind = "terminal.opened" | "command.ran" | "terminal.closed" | "machine.moved";

/** A line of the log: a terminal opened or ended, or a command that ran,
 * with how it ended, where, and the notes under it. */
export interface LogEntry {
  id: number;
  kind: LogKind;
  at: number;
  by: LogPerson | null;
  author: string;
  ai: string | null;
  terminal: { id: string; name: string } | null;
  command?: string | null;
  redacted?: Redaction | null;
  exit?: number | null;
  ms?: number | null;
  cwd?: string;
  home?: string;
  branch?: string;
  seq?: number;
  /** What it printed is still kept, in the person's own terminal. */
  output?: boolean;
  /** The width it ran at, when what it printed is kept: it opens under
   * the line drawn at that width (0.1.21). */
  cols?: number | null;
  notes?: LogNote[];
  canNote?: boolean;
  canRedact?: boolean;
  /** Why a terminal ended. */
  reason?: string;
  /** A move to another project (0.1.23): the projects by their names then. */
  from?: string;
  to?: string;
}

export interface LogDay {
  machine: {
    id: string; name: string; kind: MachineKind; projectId: string;
    code: string; project: string;
  };
  role: Role;
  /** Days the project keeps lines, and what commands printed. */
  keep: { lines: number; output: number };
  from: number;
  to: number;
  /** The nearest lines before the day and after it, if any. */
  before: number | null;
  after: number | null;
  entries: LogEntry[];
  /** More lines that day than are shown. */
  cut: boolean;
}

export class LogGone extends CoreError {}

/** Find in this log (0.1.21): the machine's commands, as far back as they
 * are kept, with every word in the command or in the notes under it. */
export interface LogFound {
  machine: LogDay["machine"];
  role: Role;
  keep: LogDay["keep"];
  /** The words looked for, in lower case. */
  words: string[];
  entries: LogEntry[];
  /** More was found than is sent. */
  cut: boolean;
}

/** Commands each machine ran since this browser's midnight, by its id: the
 * Logs folder of the sidebar. */
export async function loadLogToday(): Promise<Record<string, number>> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const response = await fetch(`/api/logs/today?since=${today.getTime()}`, {
    headers: { accept: "application/json", ...BACKGROUND },
    cache: "no-store",
  });
  return (await (await check(response)).json()).counts;
}

export async function loadLog(machineId: string, start: number,
  end: number, background = false): Promise<LogDay> {
  const response = await fetch(
    `/api/machines/${machineId}/log?start=${start}&end=${end}`, {
      headers: { accept: "application/json", ...(background ? BACKGROUND : {}) },
      cache: "no-store",
    });
  if (response.status === 404) return logGone(response);
  return (await check(response)).json();
}

async function logGone(response: Response): Promise<never> {
  let why = "";
  try {
    why = (await response.json()).error ?? "";
  } catch {
    // The status says it.
  }
  throw new LogGone(why, 404);
}

export async function findInLog(machineId: string, query: string,
  newest: boolean, signal?: AbortSignal): Promise<LogFound> {
  const params = new URLSearchParams({ q: query });
  if (newest) params.set("newest", "1");
  const response = await fetch(`/api/machines/${machineId}/log/find?${params}`,
    { headers: { accept: "application/json" }, cache: "no-store", signal });
  if (response.status === 404) {
    // The log is gone when the core says so; a core without Find in this
    // log answers 404 too, and that is only a search that did not work.
    let why: string | undefined;
    try {
      why = (await response.clone().json()).error;
    } catch {
      // Not the core's answer.
    }
    if (why !== undefined) return logGone(response);
  }
  return (await check(response)).json();
}

/** Where a note goes: under a line of the log, or, from a terminal's feed,
 * under the line of a block. */
export type NoteUnder = { entry: number } | { terminalId: string; seq: number };

export interface NoteAdded {
  entry: number;
  terminalId: string;
  seq: number;
  note: LogNote;
}

export async function addLogNote(under: NoteUnder, text: string): Promise<NoteAdded> {
  return (await check(await fetch("/api/log/notes",
    change("POST", { ...under, text })))).json();
}

export interface Redacted {
  id: number;
  what: "command" | "note";
  /** The line: the command's, or the one the note is under. */
  entry: number;
  terminalId: string | null;
  seq: number | null;
  redacted: Redaction;
  /** Other lines of the project with the same command, redacted with it. */
  also: { id: number; terminalId: string | null; seq: number | null }[];
}

export async function redactLog(id: number, reason: string): Promise<Redacted> {
  return (await check(await fetch(`/api/log/${id}/redact`,
    change("POST", { reason })))).json();
}

// ------------------------------------------------------- notes (0.1.0)

export async function createFolder(projectId: string,
  name: string): Promise<Folder> {
  return (await check(await fetch("/api/folders",
    change("POST", { projectId, name })))).json();
}

export async function renameFolder(id: string,
  name: string): Promise<{ id: string; name: string }> {
  return (await check(await fetch(`/api/folders/${id}`,
    change("PATCH", { name })))).json();
}

/** Deletes the folder with the notes in it: how many there were. */
export async function deleteFolder(id: string): Promise<{
  name: string; notes: number;
}> {
  return (await check(await fetch(`/api/folders/${id}`,
    { method: "DELETE", headers: { "x-tterm": "1" } }))).json();
}

export async function createNote(folderId: string): Promise<Note> {
  return (await check(await fetch("/api/notes",
    change("POST", { folderId })))).json();
}

/** The whole note; in the background when the page only looks again. */
export async function loadNote(id: string, background = false): Promise<Note> {
  const response = await fetch(`/api/notes/${id}`, {
    cache: "no-store", headers: background ? BACKGROUND : {},
  });
  if (response.status === 404) throw new NoteGone(say("app.note_gone"));
  return (await check(response)).json();
}

/** Saves the title and the blocks, made from `baseVersion`. The core merges
 * them with what was saved since; where it cannot, it answers NoteConflict
 * with the note as it is now, and the page merges on its own. */
export async function saveNote(id: string, baseVersion: number, title: string,
  blocks: Block[]): Promise<Note> {
  const response = await fetch(`/api/notes/${id}`,
    change("PUT", { baseVersion, title, blocks }));
  if (response.status === 404) throw new NoteGone(say("app.note_gone"));
  if (response.status === 409) {
    const body = await response.json();
    if (body.conflict && body.note) throw new NoteConflict(body.note);
  }
  return (await check(response)).json();
}

export async function tickNote(id: string, blockId: string,
  done: boolean): Promise<Note> {
  const response = await fetch(`/api/notes/${id}/tick`,
    change("POST", { blockId, done }));
  // An item that went answers 422; 404 is the note.
  if (response.status === 404) throw new NoteGone(say("app.note_gone"));
  return (await check(response)).json();
}

/** To another folder of its project, or from 0.1.2 to another project: one
 * of its folders, or the project alone, for a folder there named as the
 * note's own, made for it. */
export async function moveNote(id: string,
  to: { folderId: string } | { projectId: string }): Promise<Note> {
  return (await check(await fetch(`/api/notes/${id}`,
    change("PATCH", to)))).json();
}

export async function deleteNote(id: string): Promise<{ title: string }> {
  return (await check(await fetch(`/api/notes/${id}`,
    { method: "DELETE", headers: { "x-tterm": "1" } }))).json();
}

// ------------------------------------------------- the vault (0.1.17)
//
// The person's SSH keys, sealed on their own devices (src/vault, and
// vault-design.md). Nothing here carries a key or the vault key in the
// clear: the core has only what is sealed, the wraps and the salts.

export type VaultKeyType = "ssh-ed25519" | "ecdsa-sha2-nistp256" | "ecdsa-sha2-nistp384" | "ssh-rsa";

export interface VaultLock {
  id: string;
  /** A browser's passkey, or tTerm for Mac's lock in its keychain. */
  kind: "passkey" | "app";
  /** "Chrome on macOS", "tTerm for Mac on MacBook-Pro-Denis". */
  label: string;
  credentialId: string | null;
  /** VK wrapped with this lock's KEK. */
  wrap: string;
  createdAt: number;
  lastUsedAt: number | null;
  /** The lock of this very device (a trusted browser's). */
  thisDevice: boolean;
}

export interface VaultKey {
  id: string;
  name: string;
  type: VaultKeyType;
  publicKey: string;
  fingerprint: string;
  sealed: string;
  /** Saved from a Mac, or added from a file. */
  source: "mac" | "file";
  sourceLabel: string;
  createdAt: number;
  lastUsedAt: number | null;
  /** The servers that open with it. */
  servers: { id: string; name: string; project: string }[];
}

export interface Vault {
  id: string;
  prfSalt: string;
  createdAt: number;
  recoveryAt: number | null;
  locks: VaultLock[];
  keys: VaultKey[];
}

export async function loadVault(): Promise<Vault | null> {
  const response = await fetch("/api/vault", { cache: "no-store", headers: BACKGROUND });
  return (await (await check(response)).json()).vault;
}

export interface NewLock {
  id: string;
  kind: "passkey";
  credentialId: string;
  wrap: string;
  label: string;
}

/** The vault, made in this browser: its recovery code's salt and wrap; its
 * passkey lock comes after (addVaultLock), from the prfSalt made here. */
export async function createVault(body: { id: string; recoverySalt: string;
  recoveryWrap: string }): Promise<Vault> {
  return (await (await check(await fetch("/api/vault", change("POST", body)))).json()).vault;
}

export async function vaultRecovery(): Promise<{ recoverySalt: string; recoveryWrap: string }> {
  return (await check(await fetch("/api/vault/recovery", { cache: "no-store" }))).json();
}

/** Make a new recovery code: the one before stops working. */
export async function setVaultRecovery(body: { recoverySalt: string; recoveryWrap: string }): Promise<void> {
  await check(await fetch("/api/vault/recovery", change("PUT", body)));
}

export async function addVaultLock(lock: NewLock): Promise<Vault> {
  return (await (await check(await fetch("/api/vault/locks", change("POST", lock)))).json()).vault;
}

export async function vaultLockUsed(id: string): Promise<void> {
  await check(await fetch(`/api/vault/locks/${id}/used`, change("POST", {})));
}

export async function addVaultKey(body: { id: string; name: string; type: VaultKeyType;
  publicKey: string; fingerprint: string; sealed: string; source: "file";
  sourceLabel: string }): Promise<Vault> {
  return (await (await check(await fetch("/api/vault/keys", change("POST", body)))).json()).vault;
}

/** Takes a key out of the vault: its servers stay, and cannot open until
 * another way in is chosen. */
export async function removeVaultKey(id: string): Promise<void> {
  await check(await fetch(`/api/vault/keys/${id}`,
    { method: "DELETE", headers: { "x-tterm": "1" } }));
}

/** A new browser asks the Mac to open the vault for it (pairing). */
export interface Pairing {
  id: string;
  state: "waiting" | "answered" | "revealed" | "approved" | "denied" | "expired";
  commit: string;
  pubA: string | null;
  pubB: string | null;
  sealed: string | null;
  /** The new browser, "Chrome on Windows", and how it signed in. */
  device: string;
  method: string;
  ip: string;
  createdAt: number | null;
  expiresAt: string;
}

export async function startPairing(commit: string): Promise<{ id: string; expiresAt: string }> {
  return (await check(await fetch("/api/vault/pairings", change("POST", { commit })))).json();
}

/** Asked every few seconds while the new browser waits: in the background. */
export async function loadPairing(id: string): Promise<Pairing | null> {
  const response = await fetch(`/api/vault/pairings/${id}`,
    { cache: "no-store", headers: BACKGROUND });
  if (response.status === 404) return null;
  return (await check(response)).json();
}

export async function revealPairing(id: string, pubB: string): Promise<void> {
  await check(await fetch(`/api/vault/pairings/${id}/reveal`, change("POST", { pubB })));
}

// ------------------------- tTerm for Mac's vault and servers (0.1.17)
//
// Only the app's engine answers these (the contract's "Engine local API"):
// in the app the vault opens in the engine, which signs on the page's
// socket itself; the page asks it.

export interface AppVault {
  /** The Mac has what the vault needs (macOS's keychain and Touch ID). */
  available: boolean;
  exists: boolean;
  open: boolean;
  /** The fingerprints it can sign for now. */
  keys: string[];
}

export async function loadAppVault(): Promise<AppVault> {
  return (await check(await fetch("/api/app/vault", { cache: "no-store", headers: BACKGROUND }))).json();
}

/** The vault made on this Mac with Touch ID: its recovery code, shown once. */
export async function createAppVault(): Promise<{ recoveryCode: string }> {
  return (await check(await fetch("/api/app/vault/create", change("POST", {})))).json();
}

/** Opens the vault on this Mac, with Touch ID; with `recoveryCode`, a vault
 * made elsewhere that this Mac has no lock of yet (see "Changes"). */
export async function openAppVault(recoveryCode?: string): Promise<{ open: boolean }> {
  return (await check(await fetch("/api/app/vault/open",
    change("POST", recoveryCode ? { recoveryCode } : {})))).json();
}

export async function lockAppVault(): Promise<void> {
  await check(await fetch("/api/app/vault/lock", change("POST", {})));
}

export async function appRecoveryCode(): Promise<{ recoveryCode: string }> {
  return (await check(await fetch("/api/app/vault/recovery", change("POST", {})))).json();
}

/** The Mac's side of a new browser's request: its key posted, then the six
 * digits both show. */
export async function answerAppPairing(id: string): Promise<{ sas: string }> {
  return (await check(await fetch(`/api/app/vault/pairings/${id}/answer`, change("POST", {})))).json();
}

/** Allow, with Touch ID: the engine seals the vault key for that browser. */
export async function approveAppPairing(id: string): Promise<void> {
  await check(await fetch(`/api/app/vault/pairings/${id}/approve`, change("POST", {})));
}

/** It's not me: that browser's session ends. */
export async function denyAppPairing(id: string): Promise<void> {
  await check(await fetch(`/api/app/vault/pairings/${id}/deny`, change("POST", {})));
}

/** A server this Mac knows (~/.ssh/config, known_hosts, the ssh run in its
 * terminals). */
export interface SshHost {
  alias: string;
  host: string;
  port: number;
  user: string;
  identityFiles: string[];
  proxyJump: string | null;
  from: ("config" | "known_hosts" | "history")[];
  /** When ssh to it ran here last: milliseconds or an ISO time. */
  lastUsed: number | string | null;
  /** A git host and the like, with no terminal to open. */
  noTerminal: boolean;
  hostKeys: string[];
  /** The key ssh offers it first: the first of its identity files that is a
   * file on this Mac and can be moved; null when none is. */
  key?: string | null;
}

export interface SshKeyFile {
  path: string;
  name: string;
  type: string;
  fingerprint: string;
  comment: string;
  encrypted: boolean;
  movable: boolean;
  why?: "security key" | "agent only" | "type" | null;
}

export interface SshInventory {
  hosts: SshHost[];
  keys: SshKeyFile[];
}

export async function loadAppSsh(): Promise<SshInventory> {
  return (await check(await fetch("/api/app/ssh", { cache: "no-store" }))).json();
}

/** Whether tTerm Web, in the cloud, reaches the host and port. */
export async function reachableFromCloud(host: string, port: number): Promise<boolean> {
  const response = await fetch("/api/app/ssh/reachable", change("POST", { host, port }));
  return !!(await (await check(response)).json()).ok;
}

export type MoveMethod = "key" | "cert" | "mac";

export interface MoveResult {
  alias: string;
  ok: boolean;
  machine?: { id: string; name: string; projectId?: string; code?: string; method?: string };
  error?: string;
}

/** Move to cloud: each server in order, the way chosen for it; nothing is
 * saved for one that fails. `keys`: the ticked keys of `key` servers, which
 * go to the vault, and the keys with a passphrase that Let tTerm in signs in
 * with (only a `key` server's key goes to the vault). */
export async function moveToCloud(body: { project: string;
  servers: { alias: string; method: MoveMethod }[];
  keys: { path: string; passphrase?: string }[] }): Promise<MoveResult[]> {
  return (await (await check(await fetch("/api/app/move", change("POST", body)))).json()).results;
}
