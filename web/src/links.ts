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
 * for each, #0124 for 0.1.24. */
export function whatsNew(lang: Lang, version: string): string {
  return docsPage(lang, `whats-new/web/#${version.replace(/[^0-9]/g, "")}`);
}
