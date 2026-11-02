// The tools of a machine's log (0.1.21), as on the canvas (version 95):
// which lines show, in what order, and the days of what Find in this log
// found. Nothing here asks the core: the day, or what was found, is on the
// page already.

import type { LogEntry, LogPerson } from "./api";
import { dayStart } from "./logday.ts";

/** Which lines show. `who`: everyone ("all"), the viewer ("me"), the AI
 * ("ai": the lines it wrote a note under) or a person by their id; who ran
 * the command, or wrote a note under it. `terminal`: a terminal's id. */
export interface LogFilter {
  who: string;
  failed: boolean;
  notes: boolean;
  terminal: string | null;
}

export const NO_FILTER: LogFilter = { who: "all", failed: false, notes: false, terminal: null };

export function filtering(f: LogFilter): boolean {
  return f.who !== "all" || f.failed || f.notes || f.terminal !== null;
}

export function failedLine(e: LogEntry): boolean {
  return e.exit !== null && e.exit !== undefined && e.exit !== 0;
}

/** A person's own lines: they ran the command, or wrote a note under it
 * themselves (not the AI on their behalf). */
function theirs(e: LogEntry, id: string): boolean {
  return e.by?.id === id ||
    (e.notes ?? []).some((n) => n.author !== "ai" && n.by?.id === id);
}

/** Whether a line shows with these filters. With any of them on, only
 * commands do: a terminal opened or ended is not anyone's line of work. */
export function shows(e: LogEntry, f: LogFilter, me: string): boolean {
  if (!filtering(f)) return true;
  if (e.kind !== "command.ran") return false;
  if (f.failed && !failedLine(e)) return false;
  if (f.notes && !(e.notes ?? []).length) return false;
  if (f.terminal !== null && e.terminal?.id !== f.terminal) return false;
  if (f.who === "all") return true;
  if (f.who === "ai") return (e.notes ?? []).some((n) => n.author === "ai");
  return theirs(e, f.who === "me" ? me : f.who);
}

/** Who else there is in these lines, for Everyone ▾: the people who ran a
 * command or wrote a note, but the viewer, in the order they first come;
 * and whether the AI wrote a note. */
export function authorsOf(entries: LogEntry[], me: string): { people: LogPerson[]; ai: boolean } {
  const people = new Map<string, LogPerson>();
  let ai = false;
  const add = (p: LogPerson | null) => {
    if (p && p.id !== me && !people.has(p.id)) people.set(p.id, p);
  };
  for (const e of entries) {
    if (e.kind !== "command.ran") continue;
    add(e.by);
    for (const n of e.notes ?? []) {
      if (n.author === "ai") ai = true;
      else add(n.by);
    }
  }
  return { people: [...people.values()], ai };
}

/** The terminals the commands of these lines ran in, in the order they
 * first come, each with when its first command here ran. */
export function terminalsOf(entries: LogEntry[]): { id: string; name: string; at: number }[] {
  const seen = new Map<string, { id: string; name: string; at: number }>();
  for (const e of entries) {
    if (e.kind === "command.ran" && e.terminal && !seen.has(e.terminal.id)) {
      seen.set(e.terminal.id, { id: e.terminal.id, name: e.terminal.name, at: e.at });
    }
  }
  return [...seen.values()];
}

/** Lines by the day they are in, here: each day's midnight and its lines,
 * in the order the lines came. */
export function byDay<T extends { at: number }>(entries: T[]): { start: number; entries: T[] }[] {
  const days: { start: number; entries: T[] }[] = [];
  for (const e of entries) {
    const start = dayStart(e.at);
    const last = days[days.length - 1];
    if (last && last.start === start) last.entries.push(e);
    else days.push({ start, entries: [e] });
  }
  return days;
}

/** Whether a text has every word: as the core finds them, any case. */
export function hasWords(text: string | null | undefined, words: string[]): boolean {
  if (!text || !words.length) return false;
  const low = text.toLowerCase();
  return words.every((w) => low.includes(w));
}
