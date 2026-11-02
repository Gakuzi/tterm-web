// What search opened (0.1.7): a block of a terminal or of a note, and the
// words searched for. The terminal or the note, in its tab, goes to that
// block and marks it, and the words in it, until search opens something
// else. Kept here rather than in the address: a reload starts without it.
// From 0.1.21 also a line of a machine's log: its log goes to the line's day
// and lights the line.

import { useSyncExternalStore } from "react";

export interface FoundInTerminal {
  terminalId: string;
  /** The block's number (its seqStart). */
  seq: number;
  words: string[];
  /** Found in its output, not in the command: the whole output is wanted
   * to show the place. */
  inOutput: boolean;
  /** Grows with each opening, so that the same block opened again is gone
   * to again. */
  n: number;
}

export interface FoundInNote {
  noteId: string;
  blockId: string | null;
  words: string[];
  n: number;
}

export interface FoundInLog {
  machineId: string;
  /** The line: its id, and when it ran, for its day. */
  entry: number;
  at: number;
  words: string[];
  n: number;
}

let inTerminal: FoundInTerminal | null = null;
let inNote: FoundInNote | null = null;
let inLog: FoundInLog | null = null;
let count = 0;
const listeners = new Set<() => void>();

function changed(): void {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function foundBlock(terminalId: string, seq: number, words: string[],
  inOutput: boolean): void {
  inTerminal = { terminalId, seq, words, inOutput, n: ++count };
  inNote = null;
  inLog = null;
  changed();
}

export function foundNote(noteId: string, blockId: string | null,
  words: string[]): void {
  inNote = { noteId, blockId, words, n: ++count };
  inTerminal = null;
  inLog = null;
  changed();
}

export function foundLine(machineId: string, entry: number, at: number,
  words: string[]): void {
  inLog = { machineId, entry, at, words, n: ++count };
  inTerminal = null;
  inNote = null;
  changed();
}

/** The note was written in: its mark has done its job. */
export function forgetNoteMark(noteId: string): void {
  if (inNote?.noteId !== noteId) return;
  inNote = null;
  changed();
}

export function useFoundBlock(terminalId: string): FoundInTerminal | null {
  return useSyncExternalStore(subscribe,
    () => (inTerminal?.terminalId === terminalId ? inTerminal : null));
}

export function useFoundNote(noteId: string): FoundInNote | null {
  return useSyncExternalStore(subscribe,
    () => (inNote?.noteId === noteId ? inNote : null));
}

export function useFoundLine(machineId: string): FoundInLog | null {
  return useSyncExternalStore(subscribe,
    () => (inLog?.machineId === machineId ? inLog : null));
}

/** The latest opening gone to. The mark stays until search opens something
 * else, but the place is gone to once: not again when its tab comes back
 * to the front, or its view is drawn anew. */
let goneTo = 0;

export function wentThere(n: number): boolean {
  return n <= goneTo;
}

export function goneThere(n: number): void {
  goneTo = Math.max(goneTo, n);
}

/** The latest command put into a line from search: put in once, by
 * whichever view of its terminal there is, and not again when that view is
 * drawn anew (Line and Classic, a tab closed and opened). */
let pasted = 0;

export function takePaste(n: number): boolean {
  if (n <= pasted) return false;
  pasted = n;
  return true;
}
