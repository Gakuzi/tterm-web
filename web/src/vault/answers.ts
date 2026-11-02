// What the core and the engine answer about the vault, in the page's words
// (0.1.26, the contract's v2 and its changes 35–52): the key of
// i18n/en.txt to say, with its values, and a sentence after it. The core's
// and the engine's sentences are never shown for these (the security
// review's L5): they are in English only, and what they say is known only
// by its status and flags; the page says the tries left and the time to try
// again in the person's language. An answer of no known shape is something
// that went wrong.
//
// Kept to erasable TypeScript, as the rest of src/vault, so that the checks
// run it in Node as it is (web/tests); the store makes VaultErrors of it.

import type { Translate, Values } from "../i18n";
import { clock, day, when } from "../time.ts";

/** An answer that was not a success: the HTTP status, the sentence, and
 * the rest of the body (CoreError has all three). */
export interface Answer {
  status: number;
  message: string;
  body: Record<string, unknown>;
}

export interface Said {
  key: string;
  values?: Values;
  then?: { key: string; values?: Values };
  /** The moment `{time}` names (when to try again): said with its day when
   * it is not today (saidAt). */
  at?: number;
}

const SOMETHING: Said = { key: "vault_problem.something" };

/** The tries left are said only when there are few. */
export const TRIES_SAID = 3;

/** When the pause ends: the core writes microseconds and an offset
 * ("2026-11-02T13:04:05.123456+00:00"), which not every browser's
 * Date.parse takes; the milliseconds are enough. Without a time, an hour
 * from now: the pause is an hour after the last wrong one. */
export function retryTime(retryAt: unknown, now: number = Date.now()): number {
  const at = typeof retryAt === "string" ? Date.parse(retryAt.replace(/(\.\d{3})\d+/, "$1")) : NaN;
  return Number.isFinite(at) ? at : now + 60 * 60 * 1000;
}

/** What to say for a Said with a moment: its key and values, `{time}`
 * "13:04" today. The core pauses for an hour after ten wrong ones, and for
 * up to a day after thirty in a day: a pause that ends another day says
 * that day too, in a sentence of its own (password_paused_day: "on 3 Nov
 * at 13:04"), since "at" before a date is wrong in most languages. */
export function saidAt(key: string, values: Values | undefined, at: number | undefined,
  t: Translate, now: Date = new Date()): { key: string; values: Values | undefined } {
  if (at === undefined) return { key, values };
  const then = new Date(at);
  const today = then.getFullYear() === now.getFullYear() && then.getMonth() === now.getMonth()
    && then.getDate() === now.getDate();
  if (today) return { key, values: { ...values, time: clock(at) } };
  if (key === "vault_problem.password_paused") {
    return { key: "vault_problem.password_paused_day", values: { ...values, day: day(at, t), time: clock(at) } };
  }
  return { key, values: { ...values, time: when(at, t) } };
}

/** A wrong password (the core's 403, the engine's 422, both with `wrong`)
 * with the tries left when 3 or fewer (the tenth wrong one says 0); too
 * many (429 with `paused`, for the right password too) with the time to
 * try again. */
export function triesSaid(answer: Answer): Said | null {
  const body = answer.body;
  if ((answer.status === 403 || answer.status === 422) && body.wrong === true) {
    const left = typeof body.left === "number" && Number.isInteger(body.left) && body.left >= 0
      ? body.left : null;
    return left !== null && left <= TRIES_SAID
      ? { key: "vault_problem.password_wrong", then: { key: "vault_problem.password_left", values: { n: left } } }
      : { key: "vault_problem.password_wrong" };
  }
  if (answer.status === 429 && body.paused === true) {
    const at = retryTime(body.retryAt);
    return { key: "vault_problem.password_paused", values: { time: clock(at) }, at };
  }
  return null;
}

/** The core's answer to POST /api/vault/password/open: wrong, or too many;
 * no password (404); anything else (a proof it cannot read, 422, which this
 * page never sends; a status it does not give for this) went wrong. */
export function coreSaid(answer: Answer): Said {
  const tries = triesSaid(answer);
  if (tries) return tries;
  if (answer.status === 404) return { key: "vault_problem.no_password" };
  return SOMETHING;
}

/** The core's refusal of a vault made in this browser (POST /api/vault) or
 * of a password set (PUT /api/vault/password): a vault there already
 * (409, a make), none (404, a set); anything else went wrong. */
export function refusedSaid(answer: Answer, what: "make" | "set"): Said {
  if (what === "make" && answer.status === 409) return { key: "vault_problem.exists" };
  if (what === "set" && answer.status === 404) return { key: "vault_problem.no_vault" };
  return SOMETHING;
}

// The engine's sentences that tell apart answers of one status (its
// changes 45, 47, 48): known by their start, as Touch ID's is.
const TOUCH_FAILED = "Touch ID or your Mac's password did not go through"; // i18n-ignore: the engine's words
const CODE_WRONG = "That recovery code does not open your vault"; // i18n-ignore: the engine's words
const RULE_SHORT = "The password needs at least 12 characters"; // i18n-ignore: the engine's words
const RULE_LONG = "The password can have at most 256 characters"; // i18n-ignore: the engine's words
const NO_PASSWORD = "Your vault has no password yet"; // i18n-ignore: the engine's words

/** The engine's answers to the vault's local API: Touch ID or the Mac's
 * password not gone through (403, known by its sentence, so that another
 * 403 is not taken for it). With a recovery code: one that does not open
 * the vault (422, by its sentence). With a password at open: wrong, or too
 * many (by their flags); outside the rule (422 without `wrong`, by its
 * sentence: under 12 is short, over 256 is no password of the vault, as the
 * page says itself); a vault with no password (409, by its sentence). A
 * vault made or a password set: under 12 (422, by its sentence). Anything
 * else of these three went wrong: a 422 the engine passes on from tTerm is
 * not the rule's. A Touch ID open (`null`) keeps what it does not know, as
 * it came: its caller tells this Mac's missing lock by the 409. */
export function engineSaid(answer: Answer, what: "code" | "password" | "new" | null): Said | null {
  const { status, message } = answer;
  if (status === 403 && message.startsWith(TOUCH_FAILED)) return { key: "vault_problem.touch_failed" };
  if (what === null) return null;
  if (what === "code") {
    if (status === 422 && message.startsWith(CODE_WRONG)) return { key: "vault_problem.code_wrong_app" };
    return SOMETHING;
  }
  const rule = status === 422 && answer.body.wrong !== true;
  if (what === "password") {
    const tries = triesSaid(answer);
    if (tries) return tries;
    if (rule && message.startsWith(RULE_SHORT)) return { key: "vault_problem.password_short" };
    if (rule && message.startsWith(RULE_LONG)) return { key: "vault_problem.password_wrong" };
    if (status === 409 && message.startsWith(NO_PASSWORD)) return { key: "vault_problem.no_password" };
    return SOMETHING;
  }
  if (rule && message.startsWith(RULE_SHORT)) return { key: "vault_problem.password_short" };
  return SOMETHING;
}
