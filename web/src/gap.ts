// The space between two words or sentences put side by side (0.1.17): none
// in Chinese and Japanese, which write without spaces, except where Latin
// letters or digits touch, as list() does in Chinese ("50 台机器和 24 个终端").
// i18n.ts gives it as gap(), in the language shown; it lives here, with no
// imports, so that the checks run it as it is (tests/gap.test.ts).

import type { Lang } from "./i18n";

export function gapIn(lang: Lang, before: string, after: string): string {
  if (lang !== "zh-CN" && lang !== "ja") return " ";
  return /[A-Za-z0-9]$/.test(before) || /^[A-Za-z0-9]/.test(after) ? " " : "";
}
