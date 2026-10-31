// How long ago, in words: "away for 3 minutes", "last seen 2 hours ago".
// From 0.1.16 in the language shown: each helper takes the component's `t`
// (useT), and the words are strings of i18n/<code>.txt, under time.*; the
// days and months are the language's own (Intl).

import type { Translate } from "./i18n";

function minutesSince(ms: number): number {
  return Math.floor((Date.now() - ms) / 60000);
}

/** "less than a minute", "a minute", "14 minutes", "an hour", "3 hours",
 * "a day", "5 days": the time since `ms`, rounded down, as it goes after
 * "for" ("Away for 3 minutes"). */
export function since(ms: number | null | undefined, t: Translate): string {
  if (!ms) return "";
  const minutes = minutesSince(ms);
  if (minutes < 1) return t("time.for_less");
  if (minutes < 60) return t("time.for_minutes", { n: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t("time.for_hours", { n: hours });
  return t("time.for_days", { n: Math.floor(hours / 24) });
}

/** "just now", "a minute ago", "14 minutes ago", "2 hours ago", "3 days
 * ago": the time since `ms`, in full words. */
export function agoLong(ms: number | null | undefined, t: Translate): string {
  if (!ms) return "";
  const minutes = minutesSince(ms);
  if (minutes < 1) return t("time.ago_now");
  if (minutes < 60) return t("time.ago_minutes", { n: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t("time.ago_hours", { n: hours });
  return t("time.ago_days", { n: Math.floor(hours / 24) });
}

/** "last seen 14 minutes ago", or nothing if it never was. */
export function lastSeen(ms: number | null | undefined, t: Translate): string {
  if (!ms) return "";
  return t("time.last_seen", { ago: agoLong(ms, t) });
}

/** "10:02", as the feed shows times. */
export function clock(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, "0")}:` +
    `${String(d.getMinutes()).padStart(2, "0")}`;
}

const days = new Map<string, Intl.DateTimeFormat>();
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", // i18n-ignore
  "Oct", "Nov", "Dec"]; // i18n-ignore

/** "12 Oct", and "12 Oct 2025" in another year; in another language as it
 * writes a day ("12. Okt.", "10月12日"). */
export function day(ms: number, t: Translate): string {
  const d = new Date(ms);
  const year = d.getFullYear() !== new Date().getFullYear();
  if (t.lang === "en") {
    return `${d.getDate()} ${MONTHS[d.getMonth()]}${year ? ` ${d.getFullYear()}` : ""}`;
  }
  const key = `${t.lang} ${year}`;
  let format = days.get(key);
  if (!format) {
    format = new Intl.DateTimeFormat(t.lang, year
      ? { day: "numeric", month: "short", year: "numeric" }
      : { day: "numeric", month: "short" });
    days.set(key, format);
  }
  return format.format(d);
}

function sameDay(a: Date, b: Date): boolean {
  return a.toDateString() === b.toDateString();
}

/** Calendar days from `ms` to today: 0 today, 1 yesterday. */
function daysBack(ms: number): number {
  const then = new Date(ms);
  const today = new Date();
  then.setHours(12, 0, 0, 0);
  today.setHours(12, 0, 0, 0);
  return Math.round((today.getTime() - then.getTime()) / 86_400_000);
}

/** When, in a few words, as lists of notes say it: "just now", "5 min
 * ago", "2 h ago", "yesterday", "3 days ago", "last week", "2 weeks ago",
 * "on 12 Oct". */
export function ago(ms: number | null | undefined, t: Translate): string {
  if (!ms) return "";
  const minutes = minutesSince(ms);
  if (minutes < 1) return t("time.ago_now");
  if (minutes < 60) return t("time.short_minutes", { n: minutes });
  const hours = Math.floor(minutes / 60);
  const back = daysBack(ms);
  if (back === 0 || hours < 6) return t("time.short_hours", { n: hours });
  if (back === 1) return t("time.yesterday");
  if (back < 7) return t("time.days_ago", { n: back });
  if (back < 14) return t("time.last_week");
  if (back < 56) return t("time.weeks_ago", { n: Math.floor(back / 7) });
  return t("time.on_day", { day: day(ms, t) });
}

/** The day, in a few words: "today", "yesterday", "on 12 Oct". */
export function onDay(ms: number | null | undefined, t: Translate): string {
  if (!ms) return "";
  const back = daysBack(ms);
  return back === 0 ? t("time.today") : back === 1 ? t("time.yesterday")
    : t("time.on_day", { day: day(ms, t) });
}

/** A time today, a day before: "10:02", "12 Oct". */
export function stamp(ms: number, t: Translate): string {
  return sameDay(new Date(ms), new Date()) ? clock(ms) : day(ms, t);
}

/** When something ran, as search shows it (0.1.7): "10:46" today,
 * "yesterday 17:38", "2 Oct 09:12". */
export function when(ms: number | null | undefined, t: Translate): string {
  if (!ms) return "";
  const back = daysBack(ms);
  return back === 0 ? clock(ms)
    : back === 1 ? t("time.yesterday_at", { time: clock(ms) })
      : t("time.day_at", { day: day(ms, t), time: clock(ms) });
}
