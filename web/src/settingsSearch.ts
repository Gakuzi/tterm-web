// The addresses of Settings' sections and the search over them (row 133,
// as on the canvas of 03.11, version 107). /settings/<section> opens the
// window at a section. The search: the sections whose words hold every
// word typed stay on the left, and in a section the rows that do light up.
// Words are compared in small letters and without the marks over letters,
// so "тем" finds "Тема", "ё" is "е" and "e" finds "é"; ł, ı and ß are typed
// as l, i and ss; the marks of Japanese kana stay, as デ is not テ. It lives
// here, with no imports, so that the checks run it as it is
// (tests/settings.test.ts).

/** The sections, as their addresses name them. */
export const SECTIONS = ["general", "account", "plan", "keys", "devices", "computer",
  "updates", "ai"] as const;
export type SettingsSection = (typeof SECTIONS)[number];

/** /settings, or /settings/<section>: null where it is not Settings, the
 * section ("" for none chosen, or one there is not) where it is. /account,
 * before 0.1.27 a page of its own, is the Account section. */
export function settingsAt(path: string): SettingsSection | "" | null {
  if (/^\/account\/?$/.test(path)) return "account";
  const found = /^\/settings(?:\/([a-z]+))?\/?$/.exec(path);
  if (!found) return null;
  const section = found[1] ?? "";
  return (SECTIONS as readonly string[]).includes(section) ? section as SettingsSection : "";
}

/** Letters with no mark to take off that are typed as plain ones. */
const PLAIN: Record<string, string> = { "ł": "l", "ı": "i", "ß": "ss", "đ": "d", "ø": "o" };

/** `text` as the search compares it. */
export function fold(text: string, lang: string): string {
  let lower: string;
  try {
    lower = text.toLocaleLowerCase(lang);
  } catch {
    lower = text.toLowerCase();
  }
  return lower.normalize("NFD")
    .replace(/(?![\u3099\u309a])\p{M}/gu, "")
    .replace(/[łıßđø]/g, (c) => PLAIN[c]);
}

/** The words typed, as the search compares them. */
export function searchWords(query: string, lang: string): string[] {
  return fold(query, lang).split(/\s+/).filter(Boolean);
}

/** Whether `text` holds every one of `words`; any text, when none. */
export function holds(text: string, words: string[], lang: string): boolean {
  if (!words.length) return true;
  const hay = fold(text, lang);
  return words.every((word) => hay.includes(word));
}

/** The sections, in their order, whose words hold every word typed. */
export function sectionsFound<K extends string>(
  sections: { key: K; words: string }[], query: string, lang: string,
): K[] {
  const words = searchWords(query, lang);
  return sections.filter((s) => holds(s.words, words, lang)).map((s) => s.key);
}
