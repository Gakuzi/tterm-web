// The log of a machine (0.1.20), in its tab, as on the canvas (version 94):
// a day at a time, what was run on the machine through tTerm. tTerm writes
// the lines and nobody changes them; under a command, notes, by people and
// by an AI on a person's behalf, which stay as written and are answered
// with Reply. The project's owner and admins redact a password or a token
// that got into a line or a note: its words go for good, and the log keeps
// who, when and why. Lines are kept a year, what commands printed 30 days
// (the project's journal_days and output_days).
//
// From 0.1.21 (the canvas, version 95): what a command printed opens under
// its line, here and not in its terminal, which has most likely ended by
// then (every release of tTerm Web ends them). Under the day, a row of
// tools: Find in this log, over every day the log keeps, the order of the
// lines, and which of them show: whose, the failed ones, those with notes,
// one terminal's.
//
// From 0.1.22 (the owner, 02.11): a command's line is one line, the
// command cut short where it is long, and how many notes are under it. A
// click on it opens it: the command in full, what it printed, the notes;
// a click again closes it. What Find in this log found is worked with the
// same way, and stays until it is cleared: a click on a found line opens
// it there, and its day is a step of its own, Open the day.
//
// From 0.1.23 the log is the machine's (the owner, 02.11, 11:25): in the
// project it is in now, all of it, the lines written before it moved
// there too; a move is a line.
//
// Like a note, the log stays on the page behind its tab. While it shows
// today and is in front, it looks again now and then for new lines.

import {
  Fragment, useCallback, useEffect, useRef, useState, type KeyboardEvent as KeyEvent,
  type ReactNode,
} from "react";
import {
  addLogNote, blockOutput, findInLog, loadLog, LogGone, redactLog, type LogDay, type LogEntry,
  type LogFound, type LogNote, type Me, type Project,
} from "./api";
import { duration, shortPath } from "./BlockView";
import { toClipboard } from "./briefly";
import { colorClass, terminalName } from "./colors";
import { Confirm } from "./Confirm";
import { goneThere, useFoundLine, wentThere } from "./found";
import { useT, type Translate } from "./i18n";
import {
  Branch, Bubble, Calendar, ChevronDown, ChevronLeft, ChevronRight, Close, Collapse, Copy, Cross,
  Erase, Folder, History, Lines, Link, Lock, NoteAdd, Order, Search, TerminalIcon,
} from "./icons";
import {
  dayStart, fromIsoDay, isoDay, lineLink, linkedLine, logChanged, onLogChange, plainly,
  redactions, shiftDay, type LogChange,
} from "./logday";
import {
  authorsOf, byDay, failedLine, filtering, hasWords, NO_FILTER, shows, terminalsOf,
  type LogFilter,
} from "./logfilter";
import { RedactedMark, redactedLine, stampOf, Thread, whoOf } from "./LogNotes";
import { marked } from "./marks";
import { MenuButton } from "./Menus";
import { Avatar } from "./ProjectPage";
import { reasonText } from "./reasons";
import { plainText, renderOutput, type Rendered } from "./render";
import { clock } from "./time";

/** While today is in front, how often to look for new lines. */
const LOOK_MS = 30_000;
/** How long a line a link opened stays lit. */
const LIT_MS = 2400;
/** The reason a person ending a terminal gives (core/terminals.py). */
const CLOSED_BY_HAND = "Closed."; // i18n-ignore
/** How long typing in Find in this log may pause before the core is asked. */
const FIND_AFTER_MS = 250;
/** Lines of what a command printed shown before Show all. */
const FOLD_LINES = 12;
/** A click on an open line closes it after this long, unless a second
 * click makes it a double click: a word being chosen. */
const CLOSE_AFTER_MS = 250;
/** The order of the lines, as this browser last had it. */
const ORDER_KEY = "tterm.log.newest";

interface Props {
  machineId: string;
  active: boolean;
  me: Me;
  projects: Project[];
  onCloseTab: () => void;
  notify: (text: string) => void;
}

/** Words to redact: a command's, or a note's. */
type Asking =
  | { kind: "command"; entry: LogEntry }
  | { kind: "note"; entry: LogEntry; note: LogNote };

const formats = new Map<string, Intl.DateTimeFormat>();

/** "Thursday 29 October", and the year when it is not this one: as the
 * language writes a day in full. */
function fullDay(ms: number, t: Translate): string {
  const year = new Date(ms).getFullYear() !== new Date().getFullYear();
  const key = `${t.lang} ${year}`;
  let format = formats.get(key);
  if (!format) {
    format = new Intl.DateTimeFormat(t.lang === "en" ? "en-GB" : t.lang, {
      weekday: "long", day: "numeric", month: "long",
      ...(year ? { year: "numeric" } : {}),
    });
    formats.set(key, format);
  }
  return format.format(new Date(ms));
}

/** "a year", "30 days": how long the project keeps something. */
function kept(days: number, t: Translate): string {
  return days === 365 ? t("log.keep_year") : t("log.keep_days", { n: days });
}

/** A command's words as an open line wraps them (0.1.22): each kept whole,
 * as it is read, so that "-not -path" never reads "-not -" on one line and
 * "path" on the next; one longer than the line breaks inside itself. The
 * words looked for, marked. */
function wrapped(command: string, words: string[]): ReactNode[] {
  return command.split(/(\s+)/).map((part, i) => (part.trim()
    ? <span key={i} className="tok">{words.length ? marked(part, words, "log-hit") : part}</span>
    : part));
}

/** A command as Markdown code, whatever backticks are in it. */
function codeSpan(text: string): string {
  const ticks = (text.match(/`+/g) ?? []).reduce((n, m) => Math.max(n, m.length), 0);
  const fence = "`".repeat(ticks + 1);
  return ticks ? `${fence} ${text} ${fence}` : `${fence}${text}${fence}`;
}

/** Newest first, as this browser last had it: a viewer's convenience. */
function savedNewest(): boolean {
  try {
    return localStorage.getItem(ORDER_KEY) === "1";
  } catch {
    return false;
  }
}

function saveNewest(newest: boolean): void {
  try {
    localStorage.setItem(ORDER_KEY, newest ? "1" : "0");
  } catch {
    // Not kept: the order is then as at first next time.
  }
}

/** Lines as a change elsewhere on the page leaves them: a note written
 * from a terminal's feed, words redacted there. */
function changedLines(entries: LogEntry[], change: LogChange): LogEntry[] {
  return entries.map((e) => {
    if (e.id !== change.entry) return e;
    if (change.kind === "note") {
      return (e.notes ?? []).some((n) => n.id === change.note.id) ? e
        : { ...e, notes: [...(e.notes ?? []), change.note] };
    }
    if (change.what === "command") {
      return { ...e, command: null, redacted: change.redacted, output: false, cols: null };
    }
    return {
      ...e, notes: (e.notes ?? []).map((n) => (n.id === change.id
        ? { ...n, text: null, redacted: change.redacted } : n)),
    };
  });
}

/** What a command printed, under its line (0.1.21): drawn at the width it
 * ran at, as its block in the terminal draws it; a long one folded to its
 * first lines, with Show all; Copy output. */
function OutputBox(props: { entry: LogEntry; notify: (text: string) => void }) {
  const t = useT();
  const { entry } = props;
  const terminalId = entry.terminal?.id ?? null;
  const [rendered, setRendered] = useState<Rendered | null>(null);
  const [gone, setGone] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [all, setAll] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (terminalId === null || entry.seq === undefined) return;
    let live = true;
    setProblem(null);
    blockOutput(terminalId, entry.seq)
      .then(async (data) => {
        if (!live) return;
        if (data === null) {
          setGone(true);
          return;
        }
        const drawn = await renderOutput(data, entry.cols ?? 80);
        if (live) setRendered(drawn);
      })
      .catch((e) => {
        if (live) setProblem((e as Error).message);
      });
    return () => {
      live = false;
    };
  }, [terminalId, entry.seq, entry.cols, attempt]);

  if (problem) {
    return (
      <div className="log-out">
        <div className="log-out-note" role="alert">
          <span>{t("log.output_no", { why: problem })}</span>
          <button type="button" className="log-act" onClick={() => setAttempt((n) => n + 1)}>
            {t("common.try_again")}
          </button>
        </div>
      </div>
    );
  }
  if (gone) {
    return <div className="log-out"><div className="log-out-note">{t("log.output_lost")}</div></div>;
  }
  if (!rendered) {
    return (
      <div className="log-out" aria-busy="true">
        <div className="log-out-note"><span className="spinner" aria-hidden="true" /></div>
      </div>
    );
  }
  const lines = rendered.lines;
  const folded = !all && lines.length > FOLD_LINES;
  const html = (folded ? lines.slice(0, FOLD_LINES) : lines).map((l) => l.html).join("\n");
  const copy = async () => {
    if (!await toClipboard(plainText(rendered))) props.notify(t("feed.copy_refused"));
  };
  return (
    <div className={folded ? "log-out folded" : "log-out"}>
      {lines.length > 0 ? (
        <pre className="out" dangerouslySetInnerHTML={{ __html: html }} />
      ) : (
        <div className="log-out-note">
          {rendered.alt ? t("log.output_screen") : t("log.output_empty")}
        </div>
      )}
      {lines.length > 0 && (
        <div className="log-out-foot">
          <span className="log-out-size">{t("log.output_lines", { n: lines.length })}</span>
          {lines.length > FOLD_LINES && (
            <button type="button" className="log-act" aria-expanded={all}
              onClick={() => setAll((was) => !was)}>
              {all ? <Collapse size={13} /> : <ChevronDown size={13} />}
              {all ? t("log.output_fold") : t("log.output_all", { n: lines.length })}
            </button>
          )}
          <button type="button" className="log-act" onClick={() => void copy()}>
            <Copy size={13} />{t("block.copy_output")}
          </button>
        </div>
      )}
    </div>
  );
}

export function LogView(props: Props) {
  const t = useT();
  const { machineId, me, active } = props;
  // The day shown, by its midnight here; a link to a line opens its day.
  const [start, setStart] = useState(() => {
    const linked = location.pathname === `/l/${machineId}` ? linkedLine(location.hash) : null;
    return dayStart(linked ? linked.at : Date.now());
  });
  const [log, setLog] = useState<LogDay | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [gone, setGone] = useState(false);
  const [attempt, setAttempt] = useState(0);
  // A note being written under a line, by the line's id.
  const [writing, setWriting] = useState<number | null>(null);
  const [asking, setAsking] = useState<Asking | null>(null);
  const [reason, setReason] = useState("");
  // The line a link pointed to: gone to once the day is there, and lit.
  const [linked, setLinked] = useState<number | null>(() =>
    location.pathname === `/l/${machineId}` ? linkedLine(location.hash)?.entry ?? null : null);
  const [lit, setLit] = useState<number | null>(null);
  const pick = useRef<HTMLInputElement>(null);
  const [picking, setPicking] = useState(false);
  const page = useRef<HTMLDivElement>(null);
  const asked = useRef(0);
  // Days loaded so far, and how many there were when a line was asked for:
  // the line is looked for in a day loaded after that, not in one kept from
  // before (a tab behind does not look for new lines).
  const loads = useRef(0);
  const linkAfter = useRef(0);
  // The tools (0.1.21): which lines show, their order, what is looked for
  // in the whole log and what was found; the lines open (0.1.22), in the
  // day and among what was found alike.
  const [filter, setFilter] = useState<LogFilter>(NO_FILTER);
  const [newest, setNewest] = useState(savedNewest);
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<LogFound | null>(null);
  const [finding, setFinding] = useState(false);
  const [findProblem, setFindProblem] = useState<string | null>(null);
  const [findAttempt, setFindAttempt] = useState(0);
  // A line a link pointed to is open when its day comes.
  const [opened, setOpened] = useState<ReadonlySet<number>>(() => {
    const linkedTo = location.pathname === `/l/${machineId}` ? linkedLine(location.hash) : null;
    return new Set(linkedTo ? [linkedTo.entry] : []);
  });
  const findField = useRef<HTMLInputElement>(null);
  const looking = query.trim().length > 0;
  const end = shiftDay(start, 1);
  const today = dayStart(Date.now());

  const load = useCallback((background: boolean) => {
    const mine = ++asked.current;
    loadLog(machineId, start, end, background)
      .then((day) => {
        if (mine !== asked.current) return;
        loads.current += 1;
        setLog(day);
        setProblem(null);
        setGone(false);
      })
      .catch((e) => {
        if (mine !== asked.current) return;
        if (e instanceof LogGone) setGone(true);
        else if (!background) setProblem((e as Error).message);
      });
  }, [machineId, start, end]);

  // The day, when it is asked for and whenever the tab comes to the front.
  useEffect(() => {
    if (active) load(false);
  }, [active, load, attempt]);

  // Today, in front: new lines as commands end.
  useEffect(() => {
    if (!active || start !== today) return;
    const timer = window.setInterval(() => load(true), LOOK_MS);
    const look = () => load(true);
    window.addEventListener("focus", look);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", look);
    };
  }, [active, start, today, load]);

  // Find in this log: a moment after typing pauses, and again in the other
  // order. An answer overtaken by a later question is dropped.
  useEffect(() => {
    const text = query.trim();
    if (!text) {
      setFound(null);
      setFindProblem(null);
      setFinding(false);
      return;
    }
    if (!active) return;
    const controller = new AbortController();
    setFinding(true);
    const timer = window.setTimeout(() => {
      findInLog(machineId, text, newest, controller.signal)
        .then((got) => {
          setFound(got);
          setFindProblem(null);
        })
        .catch((e) => {
          if (controller.signal.aborted) return;
          if (e instanceof LogGone) setGone(true);
          else setFindProblem((e as Error).message);
        })
        .finally(() => {
          if (!controller.signal.aborted) setFinding(false);
        });
    }, FIND_AFTER_MS);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query, newest, machineId, active, findAttempt]);

  /** A line asked for by a link or by search: its day, fresh, with nothing
   * filtered out, and the line lit and open. Open the day, from among what
   * was found, keeps the filters: the line shows with them. */
  const goToLine = useCallback((entry: number, at: number, keepFilter = false) => {
    setQuery("");
    setWriting(null);
    if (!keepFilter) setFilter(NO_FILTER);
    setStart(dayStart(at));
    setLinked(entry);
    setOpened((was) => (was.has(entry) ? was : new Set(was).add(entry)));
    linkAfter.current = loads.current;
    setAttempt((n) => n + 1);
  }, []);

  // A link to another line of this log, opened while it is here.
  useEffect(() => {
    if (!active) return;
    const follow = () => {
      if (location.pathname !== `/l/${machineId}`) return;
      const line = linkedLine(location.hash);
      if (!line) return;
      goToLine(line.entry, line.at);
    };
    window.addEventListener("hashchange", follow);
    return () => window.removeEventListener("hashchange", follow);
  }, [active, machineId, goToLine]);

  // A line search opened (0.1.21): its day, and the line lit, once.
  const fromSearch = useFoundLine(machineId);
  useEffect(() => {
    if (!fromSearch || wentThere(fromSearch.n)) return;
    goneThere(fromSearch.n);
    goToLine(fromSearch.entry, fromSearch.at);
  }, [fromSearch, goToLine]);

  // The linked line, once its day is drawn: there, and lit for a moment.
  // Not there yet in a day kept from before: the fresh one is waited for.
  useEffect(() => {
    if (linked === null || !log || !active || log.from !== start || looking) return;
    const el = page.current?.querySelector<HTMLElement>(`#e${linked}`);
    if (!el && loads.current <= linkAfter.current) return;
    setLinked(null);
    if (!el) return;
    el.scrollIntoView({ block: "center" });
    setLit(linked);
  }, [linked, log, active, start, looking]);
  useEffect(() => {
    if (lit === null) return;
    const timer = window.setTimeout(() => setLit(null), LIT_MS);
    return () => window.clearTimeout(timer);
  }, [lit]);

  // What changed elsewhere on this page: a note from a terminal's feed,
  // words redacted there; in the day and in what was found.
  useEffect(() => onLogChange((change) => {
    setLog((day) => day && { ...day, entries: changedLines(day.entries, change) });
    setFound((got) => got && { ...got, entries: changedLines(got.entries, change) });
  }), []);

  // "/" goes to Find in this log, as in many logs and lists, while the keys
  // are not in a field and nothing is open over the page.
  useEffect(() => {
    if (!active) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey ||
          event.defaultPrevented) return;
      const at = document.activeElement;
      if (at?.closest("input, textarea, select, [contenteditable='true']")) return;
      if (document.querySelector(".palette-backdrop, .scrim")) return;
      event.preventDefault();
      findField.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active]);

  const go = (to: number) => {
    setWriting(null);
    setStart(dayStart(to));
  };

  /** A found line's day, with the line lit: what was looked for gives way,
   * as Open the day says; the filters stay, as with the day's own. */
  const openAt = (e: LogEntry) => goToLine(e.id, e.at, true);

  /** A line opened or closed: a click on it, Enter or Space on its command. */
  const toggleLine = (id: number) => {
    setOpened((was) => {
      const next = new Set(was);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  /** A line closed, if it is open: what a click on it does a moment later. */
  const closeLine = (id: number) => {
    setOpened((was) => {
      if (!was.has(id)) return was;
      const next = new Set(was);
      next.delete(id);
      return next;
    });
  };

  // A click on an open line closes it a moment later (a double click
  // chooses a word instead): the lines about to close, by their ids. And
  // whether a menu was open when the button went down: the click closes the
  // menu, not the line.
  const closing = useRef(new Map<number, number>());
  const menuWasOpen = useRef(false);
  useEffect(() => {
    const timers = closing.current;
    return () => {
      for (const timer of timers.values()) window.clearTimeout(timer);
    };
  }, []);

  /** A note started under a line: the line opens, and stays open after. */
  const startNote = (id: number) => {
    setOpened((was) => (was.has(id) ? was : new Set(was).add(id)));
    setWriting(id);
  };

  const turnOrder = () => {
    setNewest((was) => {
      saveNewest(!was);
      return !was;
    });
  };

  const saveNote = async (entry: LogEntry, text: string): Promise<boolean> => {
    try {
      const added = await addLogNote({ entry: entry.id }, text);
      setWriting(null);
      logChanged({ kind: "note", entry: added.entry, terminalId: added.terminalId,
        seq: added.seq, note: added.note });
      return true;
    } catch (e) {
      props.notify(t("log.no_note", { why: (e as Error).message }));
      return false;
    }
  };

  const redact = async () => {
    if (!asking) return;
    const target = asking.kind === "command" ? asking.entry.id : asking.note.id;
    const done = await redactLog(target, reason);
    setAsking(null);
    setReason("");
    for (const change of redactions(done)) logChanged(change);
    // The same command elsewhere in the project went with it.
    if (done.also.length) props.notify(t("log.redacted_also", { n: done.also.length }));
  };

  const copy = async (text: string) => {
    if (!await toClipboard(text)) props.notify(t("feed.copy_refused"));
  };

  const machine = props.projects.flatMap((p) => p.machines).find((m) => m.id === machineId);
  const name = log?.machine.name ?? found?.machine.name ?? machine?.name ?? "";
  const project = props.projects.find((p) => p.id === log?.machine.projectId) ??
    props.projects.find((p) => p.machines.some((m) => m.id === machineId));
  const entries = log?.from === start ? log.entries : [];
  const commands = entries.filter((e) => e.kind === "command.ran");
  const failed = commands.filter(failedLine);
  const noteCount = commands.reduce((n, e) => n + (e.notes?.length ?? 0), 0);
  const lost = commands.some((e) => !e.output && !e.redacted && e.by?.id === me.id);
  const words = looking ? (found?.words ?? []) : [];
  // The lines the tools are for: the day's, or what was found; then those
  // that show, in their order (what was found comes in the order asked).
  const pool = looking ? (found?.entries ?? []) : entries;
  const visible = pool.filter((e) => shows(e, filter, me.id));
  const ordered = !looking && newest ? [...visible].reverse() : visible;
  // A note being written under a line that shows no more (what was found
  // changed, or a filter): let go of, so that its editor does not come back
  // empty with the line and take the keys from where they are.
  useEffect(() => {
    if (writing !== null && !ordered.some((e) => e.id === writing)) setWriting(null);
  }, [writing, ordered]);
  const authors = authorsOf(pool, me.id);
  const terms = terminalsOf(pool);
  const filtered = filtering(filter);

  const dayLabel = (day: number) => day === today
    ? t("log.day_today", { day: fullDay(day, t) })
    : day === shiftDay(today, -1) ? t("log.day_yesterday", { day: fullDay(day, t) })
    : fullDay(day, t);
  const dayName = dayLabel(start);
  const counted = [
    t("log.commands", { n: commands.length }),
    ...(failed.length ? [t("log.failed", { n: failed.length })] : []),
    ...(noteCount ? [t("count.notes", { n: noteCount })] : []),
  ].join(" · ");

  // Who and which terminal, as their chips say them.
  const people = new Map(authors.people.map((p) => [p.id, p.firstName]));
  const whoLabel = filter.who === "all" ? t("log.who_all")
    : filter.who === "me" ? t("log.who_you")
    : filter.who === "ai" ? t("log.who_ai")
    : people.get(filter.who) ?? t("log.someone");
  const termLabel = (x: { name: string; at: number }) => {
    const plain = terminalName(x.name, t);
    // Two terminals of the same name (on different days): when each began.
    return terms.filter((y) => y.name === x.name).length > 1 ? `${plain} · ${stampOf(x.at, t)}` : plain;
  };
  const chosenTerm = terms.find((x) => x.id === filter.terminal);
  const shownFilters = [
    ...(filter.who !== "all" ? [whoLabel] : []),
    ...(filter.failed ? [t("log.only_failed")] : []),
    ...(filter.notes ? [t("log.with_notes")] : []),
    ...(filter.terminal !== null
      ? [chosenTerm ? termLabel(chosenTerm) : t("log.terminals_one")] : []),
  ].join(" · ");

  // The day as Markdown: its lines, and the notes under them.
  const markdown = () => {
    const out = [`# ${name} · ${fullDay(start, t)}`, ""];
    for (const e of entries) {
      const at = clock(e.at);
      if (e.kind !== "command.ran") {
        out.push(`- ${at} ${eventText(e)}`);
        continue;
      }
      const said = e.redacted ? redactedLine(e.redacted, me, t)
        : codeSpan(plainly(e.command ?? ""));
      const side = [
        ...(failedLine(e) ? [t("block.exit", { code: String(e.exit) })] : []),
        ...(e.ms !== null && e.ms !== undefined ? [duration(e.ms)] : []),
        ...(e.cwd ? [shortPath(e.cwd, e.home)] : []),
        ...(e.branch ? [e.branch] : []),
      ];
      out.push(`- ${at} ${[said, ...side].join(" · ")}`);
      for (const n of e.notes ?? []) {
        const note = n.redacted ? redactedLine(n.redacted, me, t) : n.text ?? "";
        out.push(`  - ${noteWho(n)} · ${stampOf(n.at, t)}: ${note.replace(/\n/g, "\n    ")}`);
      }
    }
    return out.join("\n") + "\n";
  };

  const noteWho = (n: LogNote) => n.author === "ai"
    ? (!n.by || n.by.id === me.id ? t("log.ai_for_you") : t("log.ai_for", { who: n.by.firstName }))
    : whoOf(n.by, me, t);

  /** A line of a terminal or of the machine, in words. A sentence starts
   * with a capital (0.1.24): a terminal known by its number, first in it,
   * is "Terminal 1", "Терминал 1"; a name someone gave it stays as written. */
  function eventText(e: LogEntry): string {
    const said = eventWords(e);
    const name = e.terminal?.name ?? "1";
    return /^\d+$/.test(name) && said.startsWith(terminalName(name, t))
      ? said.charAt(0).toLocaleUpperCase(t.lang) + said.slice(1) : said;
  }

  function eventWords(e: LogEntry): string {
    const term = terminalName(e.terminal?.name ?? "1", t);
    const mine = !e.by || e.by.id === me.id;
    if (e.kind === "machine.moved") {
      // The projects by their names then (0.1.23).
      const where = { from: e.from ?? "", to: e.to ?? "" };
      return mine ? t("log.moved_you", where)
        : t("log.moved", { who: e.by!.firstName, ...where });
    }
    if (e.kind === "terminal.opened") {
      return mine ? t("log.opened_you", { name: term })
        : t("log.opened", { who: e.by!.firstName, name: term });
    }
    if (!e.reason || e.reason === CLOSED_BY_HAND) {
      return mine ? t("log.ended_you", { name: term })
        : t("log.ended", { who: e.by!.firstName, name: term });
    }
    return t("log.ended_why", { name: term, why: reasonText(e.reason, t) });
  }

  const noteMenu = (entry: LogEntry, note: LogNote) => note.redacted ? null : (
    <MenuButton label={t("log.note_menu")} className="lmsg-more">
      {(close) => (
        <>
          <button type="button" className="menu-item" role="menuitem"
            onClick={() => {
              close();
              void copy(note.text ?? "");
            }}>
            <Copy size={15} />
            <span className="menu-text">{t("log.copy_note")}</span>
          </button>
          <div className="menu-line" />
          <button type="button" className="menu-item danger" role="menuitem"
            onClick={() => {
              close();
              setReason("");
              setAsking({ kind: "note", entry, note });
            }}>
            <Erase size={15} />
            <span className="menu-text">{t("log.redact")}</span>
          </button>
          <div className="menu-note"><span>{t("log.redact_note")}</span></div>
        </>
      )}
    </MenuButton>
  );

  const line = (e: LogEntry) => {
    if (e.kind !== "command.ran") {
      // A terminal opened or ended; the machine moved to another project.
      const moved = e.kind === "machine.moved";
      const classes = ["log-event", ...(moved ? ["moved"] : []),
        ...(lit === e.id ? ["lit"] : [])].join(" ");
      return (
        <div key={e.id} id={`e${e.id}`} className={classes}>
          <span className="log-time">{clock(e.at)}</span>
          {moved ? <Folder size={14} /> : <TerminalIcon size={14} />}
          <span>{eventText(e)}</span>
        </div>
      );
    }
    const bad = failedLine(e);
    const mine = e.by?.id === me.id;
    const here = writing === e.id;
    // Open: the command in full, what it printed, the notes. A line with a
    // note being written under it stays open until the note is saved or let
    // go of, so that what is typed is not lost to a click.
    const open = here || opened.has(e.id);
    const printed = !!e.output && !!e.terminal && e.seq !== undefined;
    const command = plainly(e.command ?? "");
    const notes = e.notes ?? [];
    // Among what was found: a note under the line has the words.
    const noteHit = words.length > 0 && notes.some((n) => hasWords(n.text, words));
    const toggle = () => {
      if (!here) toggleLine(e.id);
    };
    const keys = (event: KeyEvent<HTMLElement>) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      event.preventDefault();
      // A key held down: once, not on and off.
      if (event.repeat) return;
      toggle();
    };
    // The command, for the keys: a button that opens and closes its line.
    const say = { role: "button", tabIndex: 0, "aria-expanded": open, onKeyDown: keys };
    const classes = ["log-line", ...(lit === e.id ? ["lit"] : []), ...(here ? ["writing"] : []),
      ...(open ? ["open"] : []), ...(looking ? ["found"] : [])].join(" ");
    return (
      <Fragment key={e.id}>
        <div id={looking ? undefined : `e${e.id}`} className={classes}
          onMouseDown={() => {
            menuWasOpen.current = !!page.current?.querySelector(".menu");
          }}
          onClick={(event) => {
            // The line opens or closes. Not when a button of it, its menu or
            // text being selected had the click, nor a click that closed a
            // menu; a second click is a double click, a word being chosen.
            // i18n-ignore
            if ((event.target as Element).closest("button, a, input, textarea, .menu")) return;
            const timers = closing.current;
            if (event.detail > 1) {
              window.clearTimeout(timers.get(e.id));
              timers.delete(e.id);
              return;
            }
            if (menuWasOpen.current || window.getSelection()?.toString()) return;
            if (!open) {
              toggle();
              return;
            }
            if (timers.has(e.id) || here) return;
            timers.set(e.id, window.setTimeout(() => {
              timers.delete(e.id);
              if (!window.getSelection()?.toString()) closeLine(e.id);
            }, CLOSE_AFTER_MS));
          }}>
          <span className="log-time">{clock(e.at)}</span>
          <Avatar who={e.by} me={me} size="xs" />
          <span className="log-mark">
            {bad ? <Cross size={10} /> : <span className="dot" aria-hidden="true" />}
          </span>
          <span className="log-say">
            {e.redacted ? (
              <span className="log-cmd" {...say}>
                <RedactedMark redacted={e.redacted} me={me} />
              </span>
            ) : (
              <code className="log-cmd" {...say}>
                {open ? wrapped(command, words)
                  : words.length ? marked(command, words, "log-hit") : command}
              </code>
            )}
            {!open && notes.length > 0 && (
              <span className={noteHit ? "log-count hit" : "log-count"}
                title={t("count.notes", { n: notes.length })}>
                <Bubble size={12} />
                <span className="log-count-n" aria-hidden="true">{notes.length}</span>
                <span className="visually-hidden">{t("count.notes", { n: notes.length })}</span>
              </span>
            )}
          </span>
          <span className="log-side">
            {bad && <span className="red">{t("block.exit", { code: String(e.exit) })}</span>}
            {e.ms !== null && e.ms !== undefined && <span>{duration(e.ms)}</span>}
            {e.cwd && <span>{shortPath(e.cwd, e.home)}</span>}
            {e.branch && <span className="br"><Branch size={12} />{e.branch}</span>}
            <span className="log-term">{terminalName(e.terminal?.name ?? "1", t)}</span>
            <span className="log-acts">
              {!printed && mine && !e.redacted && (
                <span className="log-gone"
                  title={t("log.output_gone_title", { days: kept(log?.keep.output ?? found?.keep.output ?? 30, t) })}>
                  {t("log.output_gone")}
                </span>
              )}
              {e.canNote && (
                <button type="button" className={here ? "log-act on" : "log-act"}
                  title={t("log.add_note_title")} onClick={() => startNote(e.id)}>
                  <NoteAdd size={13} />{t("log.add_note")}
                </button>
              )}
              <MenuButton label={t("log.line_menu")} className="log-more">
                {(close) => (
                  <>
                    {looking && (
                      <>
                        <button type="button" className="menu-item" role="menuitem"
                          onClick={() => {
                            close();
                            openAt(e);
                          }}>
                          <Calendar size={15} />
                          <span className="menu-text">{t("log.open_day")}</span>
                        </button>
                        <div className="menu-line" />
                      </>
                    )}
                    {!e.redacted && (
                      <button type="button" className="menu-item" role="menuitem"
                        onClick={() => {
                          close();
                          void copy(e.command ?? "");
                        }}>
                        <Copy size={15} />
                        <span className="menu-text">{t("log.copy_command")}</span>
                      </button>
                    )}
                    <button type="button" className="menu-item" role="menuitem"
                      onClick={() => {
                        close();
                        void copy(lineLink(machineId, e.id, e.at));
                      }}>
                      <Link size={15} />
                      <span className="menu-text">{t("log.copy_link")}</span>
                    </button>
                    {e.canRedact && !e.redacted && (
                      <>
                        <div className="menu-line" />
                        <button type="button" className="menu-item danger" role="menuitem"
                          onClick={() => {
                            close();
                            setReason("");
                            setAsking({ kind: "command", entry: e });
                          }}>
                          <Erase size={15} />
                          <span className="menu-text">{t("log.redact")}</span>
                        </button>
                        <div className="menu-note"><span>{t("log.redact_note")}</span></div>
                      </>
                    )}
                  </>
                )}
              </MenuButton>
            </span>
          </span>
        </div>
        {open && printed && <OutputBox entry={e} notify={props.notify} />}
        {open && (
          <Thread notes={notes} me={me} canWrite={!!e.canNote} writing={here}
            onWrite={() => startNote(e.id)} onCancel={() => setWriting(null)}
            onSave={(text) => saveNote(e, text)}
            menuOf={e.canRedact ? (n) => noteMenu(e, n) : undefined}
            words={words}
            className="log-note" />
        )}
      </Fragment>
    );
  };

  const radio = (key: string, on: boolean, label: string, choose: () => void,
    close: () => void) => (
    <button key={key} type="button" className="menu-item" role="menuitemradio"
      aria-checked={on}
      onClick={() => {
        close();
        choose();
      }}>
      <span className="menu-radio" aria-hidden="true" />
      <span className="menu-text">{label}</span>
    </button>
  );

  // The row of tools under the day: the same while Find in this log shows
  // what it found, the filters then for that.
  const tools = (
    <div className="log-tools">
      <label className={looking ? "log-find on" : "log-find"}>
        <Search size={14} />
        <input ref={findField} value={query} placeholder={t("log.find")}
          aria-label={t("log.find")} spellCheck={false} autoComplete="off"
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== "Escape") return;
            event.preventDefault();
            event.stopPropagation();
            if (query) setQuery("");
            else event.currentTarget.blur();
          }} />
        {finding && looking && <span className="spinner" aria-hidden="true" />}
        {query ? (
          <button type="button" className="icon-button small" aria-label={t("log.find_clear")}
            title={t("log.find_clear")}
            onClick={() => {
              setQuery("");
              findField.current?.focus();
            }}>
            <Close size={13} />
          </button>
        ) : (
          <kbd title={t("log.find_key")}>/</kbd>
        )}
      </label>
      <button type="button" className={newest ? "log-chip on" : "log-chip"}
        title={t("log.order_title")} onClick={turnOrder}>
        <Order size={13} />{newest ? t("log.order_new") : t("log.order_old")}
      </button>
      <MenuButton label={t("log.who_title")} align="left" className="log-drop"
        face={{
          // i18n-ignore
          className: filter.who !== "all" ? "log-chip on" : "log-chip",
          content: <>{whoLabel}<ChevronDown size={12} className="down" /></>,
        }}>
        {(close) => (
          <>
            {radio("all", filter.who === "all", t("log.who_all"),
              () => setFilter((f) => ({ ...f, who: "all" })), close)}
            {radio("me", filter.who === "me", t("log.who_you"),
              () => setFilter((f) => ({ ...f, who: "me" })), close)}
            {authors.people.map((p) => radio(p.id, filter.who === p.id, p.name,
              () => setFilter((f) => ({ ...f, who: p.id })), close))}
            {(authors.ai || filter.who === "ai") && radio("ai", filter.who === "ai",
              t("log.who_ai"), () => setFilter((f) => ({ ...f, who: "ai" })), close)}
            <div className="menu-line" />
            <div className="menu-note"><span>{t("log.who_note")}</span></div>
          </>
        )}
      </MenuButton>
      <button type="button" className={filter.failed ? "log-chip on" : "log-chip"}
        aria-pressed={filter.failed}
        onClick={() => setFilter((f) => ({ ...f, failed: !f.failed }))}>
        {t("log.only_failed")}
      </button>
      <button type="button" className={filter.notes ? "log-chip on" : "log-chip"}
        aria-pressed={filter.notes}
        onClick={() => setFilter((f) => ({ ...f, notes: !f.notes }))}>
        {t("log.with_notes")}
      </button>
      {(terms.length > 1 || filter.terminal !== null) && (
        <>
          <span className="sep" aria-hidden="true" />
          <MenuButton label={t("log.terminals_title")} align="left" className="log-drop"
            face={{
              // i18n-ignore
              className: filter.terminal !== null ? "log-chip on" : "log-chip",
              content: (
                <>
                  {filter.terminal === null ? t("log.terminals_all")
                    : chosenTerm ? termLabel(chosenTerm) : t("log.terminals_one")}
                  <ChevronDown size={12} className="down" />
                </>
              ),
            }}>
            {(close) => (
              <>
                {radio("all", filter.terminal === null, t("log.terminals_all"),
                  () => setFilter((f) => ({ ...f, terminal: null })), close)}
                {terms.map((x) => radio(x.id, filter.terminal === x.id, termLabel(x),
                  () => setFilter((f) => ({ ...f, terminal: x.id })), close))}
              </>
            )}
          </MenuButton>
        </>
      )}
    </div>
  );

  // What Find in this log found: how much, and by day.
  const foundNotes = visible.reduce((n, e) =>
    n + (e.notes ?? []).filter((x) => hasWords(x.text, words)).length, 0);
  const foundWhat = foundNotes
    ? t("log.found_both", { commands: t("log.found_commands", { n: visible.length }),
      notes: t("log.found_notes", { n: foundNotes }) })
    : t("log.found_commands", { n: visible.length });
  const groups = looking ? byDay(ordered) : [];
  const back = kept(found?.keep.lines ?? log?.keep.lines ?? 365, t);

  let body;
  if (gone) {
    body = (
      <div className="note-gone" role="status">
        <h1>{t("log.gone_title")}</h1>
        <p>{t("log.gone_text")}</p>
        <div className="button-row">
          <button type="button" className="button-accent big" onClick={props.onCloseTab}>
            {t("app.close_the_tab")}
          </button>
        </div>
      </div>
    );
  } else {
    body = (
      <>
        <div className="note-crumb">
          <span className="note-where">
            <span className={`code-chip ${colorClass(project?.color)}`}
              aria-hidden="true">{project?.code ?? ""}</span>
            <span className="note-where-name">{project?.name ?? ""}</span>
            <span aria-hidden="true">·</span>
            <History size={13} />
            <span className="note-where-name">{t("log.folder")}</span>
          </span>
          <MenuButton label={t("log.menu")} title={t("log.copy_markdown")}
            className="note-menu">
            {(close) => (
              <button type="button" className="menu-item" role="menuitem"
                disabled={!log || looking}
                onClick={() => {
                  close();
                  void copy(markdown());
                }}>
                <Copy size={15} />
                <span className="menu-text">{t("log.copy_markdown")}</span>
              </button>
            )}
          </MenuButton>
        </div>
        <h1 className="log-title">{name}</h1>
        <p className="log-lead">
          <Lock size={12} />
          <span>{t("log.lead", {
            machine: name, lines: kept(log?.keep.lines ?? 365, t),
            output: kept(log?.keep.output ?? 30, t),
          })}</span>
        </p>
        {!looking && (
          <div className="log-day">
            {/* The day before with lines, and the day after with lines, or
                today: a year of days goes by quickly that way. */}
            <button type="button" className="icon-button small" aria-label={t("log.day_before")}
              title={t("log.day_before")}
              disabled={!!log && log.from === start && log.before === null}
              onClick={() => go(log?.from === start && log.before !== null
                ? log.before : shiftDay(start, -1))}>
              <ChevronLeft size={15} />
            </button>
            <button type="button" className="icon-button small" aria-label={t("log.day_after")}
              title={t("log.day_after")} disabled={start >= today}
              onClick={() => go(log?.from === start
                ? (log.after !== null ? Math.min(log.after, today) : today)
                : shiftDay(start, 1))}>
              <ChevronRight size={15} />
            </button>
            <span className="log-day-name">{dayName}</span>
            {start !== today && (
              <button type="button" className="log-chip" onClick={() => go(today)}>
                {t("log.today")}
              </button>
            )}
            <span className={picking ? "log-pick open" : "log-pick"}>
              <button type="button" className="log-chip"
                onClick={() => {
                  const field = pick.current;
                  if (!field) return;
                  // The browser's own calendar; where it has none to open by
                  // itself (Safari before 16), the field in the chip's place.
                  try {
                    field.showPicker();
                  } catch {
                    setPicking(true);
                    window.setTimeout(() => field.focus(), 0);
                  }
                }}>
                <Calendar size={13} />{t("log.pick_day")}
              </button>
              <input ref={pick} type="date" tabIndex={picking ? 0 : -1}
                aria-label={t("log.pick_day")} onBlur={() => setPicking(false)}
                value={isoDay(start)} max={isoDay(today)}
                onChange={(e) => {
                  const chosen = fromIsoDay(e.target.value);
                  if (chosen !== null && chosen <= today) {
                    setPicking(false);
                    go(chosen);
                  }
                }} />
            </span>
            {entries.length > 0 && (
              <span className="log-day-count">
                {filtered ? (
                  <>
                    <b>{t("log.shown", {
                      shown: String(visible.filter((e) => e.kind === "command.ran").length),
                      n: commands.length,
                    })}</b>
                    {` · ${shownFilters}`}
                    <button type="button" className="log-clear" onClick={() => setFilter(NO_FILTER)}>
                      {t("log.clear")}
                    </button>
                  </>
                ) : counted}
              </span>
            )}
          </div>
        )}
        {tools}
        {problem && !looking && (
          <div className="error-box" role="alert">
            <span>{t("log.no_open", { why: problem })}</span>
            <button type="button" className="button-plain"
              onClick={() => {
                setProblem(null);
                setAttempt((n) => n + 1);
              }}>
              {t("common.try_again")}
            </button>
          </div>
        )}
        {looking ? (
          <>
            {findProblem && (
              <div className="error-box" role="alert">
                <span>{t("log.no_find", { why: findProblem })}</span>
                <button type="button" className="button-plain"
                  onClick={() => {
                    setFindProblem(null);
                    setFindAttempt((n) => n + 1);
                  }}>
                  {t("common.try_again")}
                </button>
              </div>
            )}
            {found && (
              <div className="log-found">
                {visible.length ? (
                  <span>{found.cut ? t.rich("log.found_among", {
                    b: (inner) => <b>{inner}</b>, machine: name, n: found.entries.length,
                    what: foundWhat, days: t("log.found_days", { n: groups.length }),
                  }) : t.rich("log.found", {
                    b: (inner) => <b>{inner}</b>, machine: name, back, what: foundWhat,
                    days: t("log.found_days", { n: groups.length }),
                  })}</span>
                ) : (
                  <span>{found.entries.length && filtered ? t("log.none_shown")
                    : t("log.found_none", { text: query.trim(), machine: name, back })}</span>
                )}
                {filtered && (
                  <button type="button" className="log-clear" onClick={() => setFilter(NO_FILTER)}>
                    {t("log.clear")}
                  </button>
                )}
                <button type="button" className="log-clear back" onClick={() => setQuery("")}>
                  {t("log.back_to_day")}
                </button>
              </div>
            )}
            {groups.length > 0 && (
              <div className="log-list">
                {groups.map((g) => (
                  <Fragment key={g.start}>
                    <div className="log-dayhead">
                      <span>{dayLabel(g.start)}</span>
                      <span className="rule" aria-hidden="true" />
                      <button type="button" className="log-clear"
                        onClick={() => {
                          setQuery("");
                          go(g.start);
                        }}>
                        {t("log.open_day")}
                      </button>
                    </div>
                    {g.entries.map(line)}
                  </Fragment>
                ))}
              </div>
            )}
            {found?.cut && (
              <p className="log-empty">{t("log.found_cut", { n: found.entries.length })}</p>
            )}
          </>
        ) : (
          <>
            {lost && log && (
              <div className="log-banner">
                <Lines size={15} />
                <span>{t.rich("log.old_banner", {
                  b: (inner) => <b>{inner}</b>,
                  output: kept(log.keep.output, t), lines: kept(log.keep.lines, t),
                })}</span>
              </div>
            )}
            {log?.from === start && (ordered.length ? (
              <div className="log-list">{ordered.map(line)}</div>
            ) : (
              <p className="log-empty">
                {entries.length && filtered ? t("log.none_shown")
                  : log.before === null && start === today
                  ? t("log.nothing_yet", { machine: name })
                  : t("log.nothing_day", { machine: name })}
              </p>
            ))}
            {log?.from === start && log.cut && (
              <p className="log-empty">{t("log.cut", { n: entries.length })}</p>
            )}
            {!log && !problem && <div className="note-loading" aria-busy="true" />}
          </>
        )}
      </>
    );
  }

  const askedAt = asking ? (asking.kind === "command" ? asking.entry.at : asking.note.at) : 0;
  const where = asking ? t("log.redact_where", {
    machine: name,
    when: dayStart(askedAt) === today ? t("log.when_today", { time: clock(askedAt) })
      : t("log.when_on", { day: fullDay(askedAt, t), time: clock(askedAt) }),
    name: terminalName(asking.entry.terminal?.name ?? "1", t),
  }) : "";

  return (
    <div ref={page} className={active ? "note-view log-view" : "note-view log-view behind"}
      inert={!active}>
      <div className="note-page log-page">{body}</div>
      {asking && (
        <Confirm
          title={asking.kind === "command" ? t("log.redact_command_title")
            : t("log.redact_note_title")}
          sub={where} confirm={t("log.redact_button")}
          start="#rd-why" ready={!!reason.trim()}
          onConfirm={redact} onCancel={() => setAsking(null)}>
          <code className="ask-code">
            {asking.kind === "command" ? plainly(asking.entry.command ?? "")
              : asking.note.text}
          </code>
          <p>{asking.kind === "command" ? t("log.redact_command_text")
            : t("log.redact_note_text")}</p>
          <label className="field-label" htmlFor="rd-why">{t("log.why")}</label>
          <input id="rd-why" className="text-input" value={reason} maxLength={200}
            autoComplete="off" placeholder={t("log.why_placeholder")}
            onChange={(e) => setReason(e.target.value)} />
        </Confirm>
      )}
    </div>
  );
}
