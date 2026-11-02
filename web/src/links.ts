// Addresses on tTerm's own sites, in the language the page shows. The site
// (tterm.net) and the documentation (docs.tterm.net, from 0.1.24) keep
// their languages in folders alike: English at the root, Portuguese in pt,
// Chinese in zh, the others by their code. A page of the documentation not
// translated yet shows English there.

import type { Lang } from "./i18n";

const FOLDER: Partial<Record<Lang, string>> = { en: "", "pt-BR": "pt", "zh-CN": "zh" };

/** The folder of `lang` on the site and in the documentation. */
export function folderOf(lang: Lang): string {
  return FOLDER[lang] ?? lang;
}

/** A page of the documentation: `path` as "whats-new/web/". */
export function docsPage(lang: Lang, path: string): string {
  const folder = folderOf(lang);
  return `https://docs.tterm.net/${folder ? `${folder}/` : ""}${path}`;
}

/** What's new in a version of tTerm Web: the documentation has an entry
 * for each, #0124 for 0.1.24. From 0.1.26 tTerm for Mac's too (`mac`, #080
 * for 0.8.0): its What's new after an update goes there, no longer to the
 * release on GitHub (the owner, 02.11, 12:37). */
export function whatsNew(lang: Lang, version: string, product: "web" | "mac" = "web"): string {
  return docsPage(lang, `whats-new/${product}/#${version.replace(/[^0-9]/g, "")}`);
}

/** A page of the site, tterm.net: `path` as "download/". */
export function sitePage(lang: Lang, path = ""): string {
  const folder = folderOf(lang);
  return `https://tterm.net/${folder ? `${folder}/` : ""}${path}`;
}

/** tTerm's channel in Telegram, @tTermBlog. */
export const TELEGRAM = "https://t.me/tTermBlog";

/** What's new in the documentation (0.1.25, About us in the account's
 * menu): tTerm Web's page in a browser, tTerm for Mac's in the app. */
export function whatsNewPage(lang: Lang, product: "web" | "mac"): string {
  return docsPage(lang, `whats-new/${product}/`);
}
