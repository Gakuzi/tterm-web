// Projects' colors and codes (0.1.1), as on the canvas: a project's color
// fills its code badge everywhere; the whole block of the project in the
// sidebar is tinted too if the person chose that on the account page (from
// 0.1.4 in Settings). The
// values live in tokens.css under .pc-<color>, one set for each theme.

import { PROJECT_COLORS, type Project, type ProjectColor } from "./api";
import type { Translate } from "./i18n";

/** Each color's name, as strings of i18n/<code>.txt (0.1.16). */
export const COLOR_KEY: Record<ProjectColor, string> = {
  violet: "color.violet",
  sky: "color.sky",
  teal: "color.teal",
  pink: "color.pink",
  orange: "color.orange",
  lime: "color.lime",
  indigo: "color.indigo",
  slate: "color.slate",
};

/** The class that gives an element and what is inside it the project's
 * color: its badge and, where the sidebar tints, the rest. */
export function colorClass(color: ProjectColor | undefined | null): string {
  return color ? `pc-${color}` : "";
}

const WORD = /[\p{L}\p{N}]+/gu;

/** The code a new project is offered, as the core makes it
 * (accounts.suggest_code): the first letters of its words, Client X → CX;
 * with that code taken, a digit after it, CX2. */
export function suggestCode(name: string, taken: string[]): string {
  const words = name.match(WORD) ?? [];
  const base = words.length
    ? words.slice(0, 4).map((w) => [...w][0]).join("").toUpperCase()
    : "P";
  const busy = new Set(taken);
  if (!busy.has(base)) return base;
  const stem = [...base].slice(0, 3).join("");
  for (let digit = 2; digit < 10; digit++) {
    if (!busy.has(`${stem}${digit}`)) return `${stem}${digit}`;
  }
  for (let number = 10; number < 1000; number++) {
    const candidate = `${[...base][0]}${number}`;
    if (!busy.has(candidate)) return candidate;
  }
  return base;
}

/** A code as the core takes it: 1 to 4 letters or digits. */
export function validCode(code: string): boolean {
  return /^[\p{L}\p{N}]{1,4}$/u.test(code);
}

/** The color a new project gets: the first none of the person's own
 * projects has; with all eight taken, the one fewest have. */
export function freeColor(projects: Project[]): ProjectColor {
  const used = projects.filter((p) => p.own).map((p) => p.color);
  const free = PROJECT_COLORS.find((c) => !used.includes(c));
  if (free) return free;
  const count = (c: ProjectColor) => used.filter((u) => u === c).length;
  return PROJECT_COLORS.reduce((best, c) => (count(c) < count(best) ? c : best));
}

/** The name a machine gets where its own is taken, as the core gives it
 * (machines.free_name): web-01, then web-01-2. */
export function freeName(wanted: string, taken: string[]): string {
  const lower = new Set(taken.map((t) => t.toLowerCase()));
  if (!lower.has(wanted.toLowerCase())) return wanted;
  for (let n = 2; n < 1000; n++) {
    const candidate = `${[...wanted].slice(0, 36).join("")}-${n}`;
    if (!lower.has(candidate.toLowerCase())) return candidate;
  }
  return wanted;
}

/** A terminal as lists name it: "terminal 2" while it has its number, or
 * the name its owner gave it. */
export function terminalName(name: string, t: Translate): string {
  return /^\d+$/.test(name) ? t("terminal.numbered", { number: name }) : name;
}
