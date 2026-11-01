// The log of a machine (0.1.20), in its tab, as on the canvas (version 94):
// a day at a time, what was run on the machine through tTerm. tTerm writes
// the lines and nobody changes them; under a command, notes, by people and
// by an AI on a person's behalf, which stay as written and are answered
// with Reply. The project's owner and admins redact a password or a token
// that got into a line or a note: its words go for good, and the log keeps
// who, when and why. Lines are kept a year, what commands printed 30 days
// (the project's journal_days and output_days).
//
// Like a note, the log stays on the page behind its tab. While it shows
// today and is in front, it looks again now and then for new lines.

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import {
  addLogNote, loadLog, LogGone, redactLog, type LogDay, type LogEntry, type LogNote, type Me,
  type Project,
} from "./api";
import { duration, shortPath } from "./BlockView";
import { toClipboard } from "./briefly";
import { colorClass, terminalName } from "./colors";
import { Confirm } from "./Confirm";
import { useT, type Translate } from "./i18n";
import {
  Branch, Calendar, ChevronLeft, ChevronRight, Copy, Cross, Erase, History, Lines, Link,
  Lock, NoteAdd, TerminalIcon,
} from "./icons";
import {
  dayStart, fromIsoDay, isoDay, lineLink, linkedLine, logChanged, onLogChange, plainly,
  redactions, shiftDay,
} from "./logday";
import { RedactedMark, redactedLine, stampOf, Thread, whoOf } from "./LogNotes";
import { MenuButton } from "./Menus";
import { Avatar } from "./ProjectPage";
import { clock } from "./time";

/** While today is in front, how often to look for new lines. */
const LOOK_MS = 30_000;
/** How long a line a link opened stays lit. */
const LIT_MS = 2400;
/** The reason a person ending a terminal gives (core/terminals.py). */
const CLOSED_BY_HAND = "Closed."; // i18n-ignore

interface Props {
  machineId: string;
  active: boolean;
  me: Me;
  projects: Project[];
  /** Output: the terminal of a line, at its block. */
  onOutput: (terminalId: string, seq: number) => void;
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

/** A command as Markdown code, whatever backticks are in it. */
function codeSpan(text: string): string {
  const ticks = (text.match(/`+/g) ?? []).reduce((n, m) => Math.max(n, m.length), 0);
  const fence = "`".repeat(ticks + 1);
  return ticks ? `${fence} ${text} ${fence}` : `${fence}${text}${fence}`;
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
  const end = shiftDay(start, 1);
  const today = dayStart(Date.now());

  const load = useCallback((background: boolean) => {
    const mine = ++asked.current;
    loadLog(machineId, start, end, background)
      .then((day) => {
        if (mine !== asked.current) return;
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

  // A link to another line of this log, opened while it is here.
  useEffect(() => {
    if (!active) return;
    const follow = () => {
      if (location.pathname !== `/l/${machineId}`) return;
      const line = linkedLine(location.hash);
      if (!line) return;
      setStart(dayStart(line.at));
      setLinked(line.entry);
    };
    window.addEventListener("hashchange", follow);
    return () => window.removeEventListener("hashchange", follow);
  }, [active, machineId]);

  // The linked line, once its day is drawn: there, and lit for a moment.
  useEffect(() => {
    if (linked === null || !log || !active || log.from !== start) return;
    const el = page.current?.querySelector<HTMLElement>(`#e${linked}`);
    setLinked(null);
    if (!el) return;
    el.scrollIntoView({ block: "center" });
    setLit(linked);
  }, [linked, log, active, start]);
  useEffect(() => {
    if (lit === null) return;
    const timer = window.setTimeout(() => setLit(null), LIT_MS);
    return () => window.clearTimeout(timer);
  }, [lit]);

  // What changed elsewhere on this page: a note from a terminal's feed,
  // words redacted there.
  useEffect(() => onLogChange((change) => {
    setLog((day) => day && {
      ...day,
      entries: day.entries.map((e) => {
        if (e.id !== change.entry) return e;
        if (change.kind === "note") {
          return (e.notes ?? []).some((n) => n.id === change.note.id) ? e
            : { ...e, notes: [...(e.notes ?? []), change.note] };
        }
        if (change.what === "command") {
          return { ...e, command: null, redacted: change.redacted, output: false };
        }
        return {
          ...e, notes: (e.notes ?? []).map((n) => (n.id === change.id
            ? { ...n, text: null, redacted: change.redacted } : n)),
        };
      }),
    });
  }), []);

  const go = (to: number) => {
    setWriting(null);
    setStart(dayStart(to));
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
  const name = log?.machine.name ?? machine?.name ?? "";
  const project = props.projects.find((p) => p.id === log?.machine.projectId) ??
    props.projects.find((p) => p.machines.some((m) => m.id === machineId));
  const entries = log?.from === start ? log.entries : [];
  const commands = entries.filter((e) => e.kind === "command.ran");
  const failed = commands.filter((e) => e.exit !== null && e.exit !== undefined && e.exit !== 0);
  const noteCount = commands.reduce((n, e) => n + (e.notes?.length ?? 0), 0);
  const lost = commands.some((e) => !e.output && !e.redacted && e.by?.id === me.id);

  const dayName = start === today ? t("log.day_today", { day: fullDay(start, t) })
    : start === shiftDay(today, -1) ? t("log.day_yesterday", { day: fullDay(start, t) })
    : fullDay(start, t);
  const counted = [
    t("log.commands", { n: commands.length }),
    ...(failed.length ? [t("log.failed", { n: failed.length })] : []),
    ...(noteCount ? [t("count.notes", { n: noteCount })] : []),
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
      const words = e.redacted ? redactedLine(e.redacted, me, t)
        : codeSpan(plainly(e.command ?? ""));
      const side = [
        ...(e.exit !== null && e.exit !== undefined && e.exit !== 0
          ? [t("block.exit", { code: String(e.exit) })] : []),
        ...(e.ms !== null && e.ms !== undefined ? [duration(e.ms)] : []),
        ...(e.cwd ? [shortPath(e.cwd, e.home)] : []),
        ...(e.branch ? [e.branch] : []),
      ];
      out.push(`- ${at} ${[words, ...side].join(" · ")}`);
      for (const n of e.notes ?? []) {
        const said = n.redacted ? redactedLine(n.redacted, me, t) : n.text ?? "";
        out.push(`  - ${noteWho(n)} · ${stampOf(n.at, t)}: ${said.replace(/\n/g, "\n    ")}`);
      }
    }
    return out.join("\n") + "\n";
  };

  const noteWho = (n: LogNote) => n.author === "ai"
    ? (!n.by || n.by.id === me.id ? t("log.ai_for_you") : t("log.ai_for", { who: n.by.firstName }))
    : whoOf(n.by, me, t);

  function eventText(e: LogEntry): string {
    const term = terminalName(e.terminal?.name ?? "1", t);
    const mine = !e.by || e.by.id === me.id;
    if (e.kind === "terminal.opened") {
      return mine ? t("log.opened_you", { name: term })
        : t("log.opened", { who: e.by!.firstName, name: term });
    }
    if (!e.reason || e.reason === CLOSED_BY_HAND) {
      return mine ? t("log.ended_you", { name: term })
        : t("log.ended", { who: e.by!.firstName, name: term });
    }
    return t("log.ended_why", { name: term, why: e.reason });
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
      return (
        <div key={e.id} id={`e${e.id}`} className={lit === e.id ? "log-event lit" : "log-event"}>
          <span className="log-time">{clock(e.at)}</span>
          <TerminalIcon size={14} />
          <span>{eventText(e)}</span>
        </div>
      );
    }
    const bad = e.exit !== null && e.exit !== undefined && e.exit !== 0;
    const mine = e.by?.id === me.id;
    const here = writing === e.id;
    return (
      <Fragment key={e.id}>
        <div id={`e${e.id}`}
          className={`log-line${lit === e.id ? " lit" : ""}${here ? " writing" : ""}`}>
          <span className="log-time">{clock(e.at)}</span>
          <Avatar who={e.by} me={me} size="xs" />
          <span className="log-mark">
            {bad ? <Cross size={10} /> : <span className="dot" aria-hidden="true" />}
          </span>
          {e.redacted ? (
            <span className="log-cmd" tabIndex={0}>
              <RedactedMark redacted={e.redacted} me={me} />
            </span>
          ) : (
            <code className="log-cmd" tabIndex={0} title={plainly(e.command ?? "")}>
              {plainly(e.command ?? "")}
            </code>
          )}
          <span className="log-side">
            {bad && <span className="red">{t("block.exit", { code: String(e.exit) })}</span>}
            {e.ms !== null && e.ms !== undefined && <span>{duration(e.ms)}</span>}
            {e.cwd && <span>{shortPath(e.cwd, e.home)}</span>}
            {e.branch && <span className="br"><Branch size={12} />{e.branch}</span>}
            <span className="log-term">{terminalName(e.terminal?.name ?? "1", t)}</span>
            <span className="log-acts">
              {e.output && e.terminal && e.seq !== undefined ? (
                <button type="button" className="log-act" title={t("log.output_title")}
                  onClick={() => props.onOutput(e.terminal!.id, e.seq!)}>
                  <Lines size={13} />{t("log.output")}
                </button>
              ) : mine && !e.redacted && (
                <span className="log-gone"
                  title={t("log.output_gone_title", { days: kept(log?.keep.output ?? 30, t) })}>
                  {t("log.output_gone")}
                </span>
              )}
              {e.canNote && (
                <button type="button" className={here ? "log-act on" : "log-act"}
                  title={t("log.add_note_title")} onClick={() => setWriting(e.id)}>
                  <NoteAdd size={13} />{t("log.add_note")}
                </button>
              )}
              <MenuButton label={t("log.line_menu")} className="log-more">
                {(close) => (
                  <>
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
        <Thread notes={e.notes ?? []} me={me} canWrite={!!e.canNote} writing={here}
          onWrite={() => setWriting(e.id)} onCancel={() => setWriting(null)}
          onSave={(text) => saveNote(e, text)}
          menuOf={e.canRedact ? (n) => noteMenu(e, n) : undefined}
          className="log-note" />
      </Fragment>
    );
  };

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
                disabled={!log}
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
          {entries.length > 0 && <span className="log-day-count">{counted}</span>}
        </div>
        {problem && (
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
        {lost && log && (
          <div className="log-banner">
            <Lines size={15} />
            <span>{t.rich("log.old_banner", {
              b: (inner) => <b>{inner}</b>,
              output: kept(log.keep.output, t), lines: kept(log.keep.lines, t),
            })}</span>
          </div>
        )}
        {log?.from === start && (entries.length ? (
          <div className="log-list">{entries.map(line)}</div>
        ) : (
          <p className="log-empty">
            {log.before === null && start === today
              ? t("log.nothing_yet", { machine: name })
              : t("log.nothing_day", { machine: name })}
          </p>
        ))}
        {log?.from === start && log.cut && (
          <p className="log-empty">{t("log.cut", { n: entries.length })}</p>
        )}
        {!log && !problem && <div className="note-loading" aria-busy="true" />}
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
