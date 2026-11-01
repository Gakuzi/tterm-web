// The machines' logs on this page (0.1.20): days as this browser has them,
// from one midnight to the next, and what changed in a log, so that a note
// written or words redacted in one place (a log, a terminal's feed) show in
// the other at once.

import type { LogNote, Redacted, Redaction } from "./api";

/** Marks that turn text around or wall part of it off (U+202E): shown in
 * a command as what they are, so that its line reads as what ran. */
const STEER = /[\u202a-\u202e\u2066-\u2069]/g;

export function plainly(text: string): string {
  return text.replace(STEER, (c) => `<U+${c.codePointAt(0)!.toString(16).toUpperCase()}>`);
}

/** Midnight of the day `ms` is in, here. */
export function dayStart(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** The midnight `days` days after the one of `start`: 23 or 25 hours
 * where the clocks change. */
export function shiftDay(start: number, days: number): number {
  const d = new Date(start);
  d.setDate(d.getDate() + days);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** "2026-10-29": a day as a date field has it. */
export function isoDay(start: number): string {
  const d = new Date(start);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-` +
    `${String(d.getDate()).padStart(2, "0")}`;
}

/** A date field's day, as its midnight here; null if it is not one. */
export function fromIsoDay(value: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d.getTime();
}

/** A link to a line: /l/<machine>#e<line>-<when>, so that the log opens on
 * the line's day wherever the link is opened. */
export function lineLink(machineId: string, entry: number, at: number): string {
  return `${location.origin}/l/${machineId}#e${entry}-${at}`;
}

/** The line a link points to, from the address's #. */
export function linkedLine(hash: string): { entry: number; at: number } | null {
  const m = /^#e(\d+)-(\d+)$/.exec(hash);
  return m ? { entry: Number(m[1]), at: Number(m[2]) } : null;
}

export type LogChange =
  | { kind: "note"; entry: number; terminalId: string; seq: number; note: LogNote }
  | { kind: "redacted"; what: "command" | "note"; id: number; entry: number;
      terminalId: string | null; seq: number | null; redacted: Redaction };

/** A redaction as the core did it: the line asked for, and the other lines
 * of the project with the same command, each as a change. */
export function redactions(done: Redacted): LogChange[] {
  return [
    { kind: "redacted", what: done.what, id: done.id, entry: done.entry,
      terminalId: done.terminalId, seq: done.seq, redacted: done.redacted },
    ...done.also.map((x): LogChange => ({
      kind: "redacted", what: "command", id: x.id, entry: x.id,
      terminalId: x.terminalId, seq: x.seq, redacted: done.redacted })),
  ];
}

const listeners = new Set<(change: LogChange) => void>();

/** Tells every view on this page what changed in a log. */
export function logChanged(change: LogChange): void {
  for (const listener of [...listeners]) listener(change);
}

export function onLogChange(listener: (change: LogChange) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
