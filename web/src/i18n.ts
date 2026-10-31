// The page's languages (0.1.16): the twelve of the site (tterm-net/site,
// sitelib.py), in the order of its language menu, each by its own name.
//
// Every text the page shows is a string of i18n/<code>.txt, one a line,
// `key = text`, as on the site. English is the source; every language has
// every key of it, and no others (scripts/strings.mjs checks that, and
// that no text is left in the code: the build stops otherwise). A string
// may hold
//
//   {name}             a value, t("tab.close", { name }); a number is
//                      written as the language writes numbers;
//   one: … | other: …  a form for each plural of the language (Unicode
//                      CLDR), picked by the value n: t("x", { n: 3 });
//   <b>…</b>           a part the code wraps, through t.rich: a link, bold
//                      or code inside a sentence;
//   \n                 a line break.
//
// Which language is shown: the one chosen, kept in the account and, in the
// app before signing in, on this computer; else the browser's (in the app,
// the system's) when it is one of the twelve; else English (App.tsx). A
// choice shows at once: every component that shows text takes its `t` from
// useT() and draws again. English comes with the page; another language is
// a file of its own, loaded once it is wanted.

import { createElement, Fragment, useSyncExternalStore, type ReactNode } from "react";
import englishText from "./i18n/en.txt?raw";

export const LANGUAGES = [
  { code: "en", name: "English" },
  { code: "de", name: "Deutsch" },
  { code: "es", name: "Español" },
  { code: "fr", name: "Français" },
  { code: "it", name: "Italiano" },
  { code: "pl", name: "Polski" },
  { code: "pt-BR", name: "Português" },
  { code: "tr", name: "Türkçe" },
  { code: "ru", name: "Русский" },
  { code: "ja", name: "日本語" },
  { code: "ko", name: "한국어" },
  { code: "zh-CN", name: "简体中文" },
] as const;

export type Lang = (typeof LANGUAGES)[number]["code"];

export function isLanguage(value: unknown): value is Lang {
  return typeof value === "string" && LANGUAGES.some((l) => l.code === value);
}

/** i18n/<code>.txt, read: `key = text` a line; lines starting with # and
 * empty ones are left out; `\n` in a text is a line break, `\\` a
 * backslash. */
export function parse(text: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim() || line.startsWith("#")) continue;
    const match = /^([a-z0-9][a-z0-9_.-]*) =(?: (.*))?$/.exec(line);
    if (!match) continue;
    out.set(match[1], (match[2] ?? "").replace(/\\([n\\])/g,
      (_, c: string) => (c === "n" ? "\n" : "\\")));
  }
  return out;
}

const PLURALS = ["zero", "one", "two", "few", "many", "other"];

/** "one: {n} terminal | other: {n} terminals" as its forms; a string
 * without form names has none. */
export function formsOf(text: string): Map<string, string> | null {
  const parts = text.split(" | ");
  const named = parts.map((p) => /^([a-z]+): ([\s\S]*)$/.exec(p));
  if (!named.every((m) => m && PLURALS.includes(m[1]))) return null;
  return new Map(named.map((m) => [m![1], m![2]]));
}

const english = parse(englishText);
const tables = new Map<Lang, Map<string, string>>([["en", english]]);
const files = import.meta.glob<string>(["./i18n/*.txt", "!./i18n/en.txt"],
  { query: "?raw", import: "default" });

let shown: Lang = "en";
let asked = 0;
const listeners = new Set<() => void>();

/** The language the page shows now. */
export function language(): Lang {
  return shown;
}

/** Shows the page in `next`, once its strings are here; a later call wins
 * over one still loading. A file that does not load leaves the page as it
 * was. */
export async function showLanguage(next: Lang): Promise<void> {
  const ticket = ++asked;
  if (!tables.has(next)) {
    const load = files[`./i18n/${next}.txt`];
    if (!load) return;
    try {
      tables.set(next, parse(await load()));
    } catch {
      return;
    }
  }
  if (ticket !== asked) return;
  document.documentElement.lang = next;
  remember(next);
  if (next === shown) return;
  shown = next;
  for (const listener of [...listeners]) listener();
}

const KEY = "tterm.language";

/** The language last shown in this browser: for the first paint, before
 * the account answers. */
export function rememberedLanguage(): Lang | null {
  try {
    const kept = localStorage.getItem(KEY);
    return isLanguage(kept) ? kept : null;
  } catch {
    return null;
  }
}

function remember(lang: Lang): void {
  try {
    localStorage.setItem(KEY, lang);
  } catch {
    // Storage can be off: the account still has the choice.
  }
}

/** The first of the twelve among the languages the browser or the system
 * prefers (navigator.languages): de-AT is Deutsch, pt-PT Português, any
 * Chinese written in simplified characters 简体中文; Chinese in
 * traditional ones is none of them, and the next is looked at. */
export function pickLanguage(tags: readonly string[] | undefined): Lang | null {
  for (const raw of tags ?? []) {
    const tag = raw.toLowerCase().replace(/_/g, "-");
    const base = tag.split("-")[0];
    if (base === "zh") {
      if (/-(hant|tw|hk|mo)(-|$)/.test(tag)) continue;
      return "zh-CN";
    }
    if (base === "pt") return "pt-BR";
    const found = LANGUAGES.find((l) => l.code === base);
    if (found) return found.code;
  }
  return null;
}

/** The browser's language, when it is one of the twelve. */
export function browserLanguage(): Lang | null {
  return pickLanguage(navigator.languages?.length ? navigator.languages
    : [navigator.language]);
}

/** The language to show for the person signed in, or in the app before
 * signing in: the one chosen, in the account or on this computer; else the
 * system's in the app (its engine says which), the browser's in a
 * browser; else English. */
export function languageOf(me: { language?: string | null; systemLanguage?: string | null }): Lang {
  if (isLanguage(me.language)) return me.language;
  if (isLanguage(me.systemLanguage)) return me.systemLanguage;
  return browserLanguage() ?? "en";
}

// ---------------------------------------------------------------- strings

export type Values = Record<string, string | number>;
export type RichValues = Record<string, ReactNode | ((inner: ReactNode) => ReactNode)>;

export interface Translate {
  /** The string `key` in this language, with its values. */
  (key: string, values?: Values): string;
  /** The same, as nodes: `<tag>…</tag>` wrapped by the function `tag` of
   * `values`, `{name}` a node of them. */
  rich(key: string, values: RichValues): ReactNode;
  /** The language, for Intl (dates, lists, numbers). */
  readonly lang: Lang;
}

const rules = new Map<Lang, Intl.PluralRules>();

/** The plural form of n in a language: "one", "few", "other"… */
export function pluralOf(n: number, lang: Lang): string {
  let found = rules.get(lang);
  if (!found) {
    found = new Intl.PluralRules(lang);
    rules.set(lang, found);
  }
  return found.select(n);
}

function raw(lang: Lang, key: string, n: unknown): string {
  const text = tables.get(lang)?.get(key) ?? english.get(key);
  if (text === undefined) {
    if (import.meta.env.DEV) console.warn(`tterm: no string ${key}`);
    return key;
  }
  const forms = formsOf(text);
  if (!forms) return text;
  // A count picks the form; the forms a language has are its own (Russian
  // one, few, many), and "other" stands for any it leaves out.
  const form = typeof n === "number" ? pluralOf(n, lang) : "other";
  return forms.get(form) ?? forms.get("other") ?? forms.get("many") ??
    [...forms.values()][0];
}

function written(value: string | number, lang: Lang): string {
  return typeof value === "number" ? new Intl.NumberFormat(lang).format(value)
    : value;
}

const PLACE = /\{([A-Za-z][A-Za-z0-9_]*)\}/g;

function fill(text: string, values: Values | undefined, lang: Lang): string {
  if (!values) return text;
  return text.replace(PLACE, (whole, name: string) =>
    name in values ? written(values[name], lang) : whole);
}

const PART = /<([a-z][a-z0-9]*)>([\s\S]*?)<\/\1>|\{([A-Za-z][A-Za-z0-9_]*)\}/g;

function nodes(text: string, values: RichValues, lang: Lang): ReactNode {
  const out: ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(PART)) {
    if (m.index > last) out.push(text.slice(last, m.index));
    if (m[1] !== undefined) {
      const wrap = values[m[1]];
      const inner = nodes(m[2], values, lang);
      out.push(typeof wrap === "function" ? wrap(inner) : inner);
    } else {
      const value = values[m[3]];
      out.push(value === undefined ? m[0]
        : typeof value === "number" ? written(value, lang)
          : typeof value === "function" ? m[0] : value);
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return createElement(Fragment, null, ...out);
}

const translators = new Map<Lang, Translate>();

/** The strings of one language: the same function each time, so that one
 * for another language is a change React sees (in a hook's dependencies). */
export function translator(lang: Lang): Translate {
  let found = translators.get(lang);
  if (!found) {
    const said = (key: string, values?: Values) =>
      fill(raw(lang, key, values?.n), values, lang);
    found = Object.assign(said, {
      rich: (key: string, values: RichValues) =>
        nodes(raw(lang, key, values.n), values, lang),
      lang,
    });
    translators.set(lang, found);
  }
  return found;
}

/** The strings of the language shown now: for what is said outside a
 * component, such as an error's message. A component takes useT(). */
export const t = ((key: string, values?: Values) =>
  translator(shown)(key, values)) as Translate;
Object.defineProperties(t, {
  rich: { value: (key: string, values: RichValues) => translator(shown).rich(key, values) },
  lang: { get: () => shown },
});

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The strings of the language shown, for a component: it draws again in
 * another language as soon as one is chosen. */
export function useT(): Translate {
  return translator(useSyncExternalStore(subscribe, language, language));
}

/** "web-01, web-02 and db", as the language lists things; English without
 * a comma before "and", as before (Safari before 14.1 has no
 * Intl.ListFormat: commas there). Chinese puts 和 between the last two
 * with no space, and a space where Latin letters or digits touch it, as
 * Chinese text does everywhere ("50 台机器和 24 个终端"); the items stay as
 * they are. */
export function list(items: string[], lang: Lang = shown): string {
  if (typeof Intl.ListFormat !== "function") return items.join(", ");
  const parts = new Intl.ListFormat(lang === "en" ? "en-GB" : lang,
    { style: "long", type: "conjunction" }).formatToParts(items);
  if (lang !== "zh-CN") return parts.map((p) => p.value).join("");
  return parts.map((p, i) => {
    if (p.type !== "literal" || !/^[一-鿿]+$/.test(p.value)) return p.value;
    const before = /[A-Za-z0-9]$/.test(parts[i - 1]?.value ?? "") ? " " : "";
    const after = /^[A-Za-z0-9]/.test(parts[i + 1]?.value ?? "") ? " " : "";
    return before + p.value + after;
  }).join("");
}
