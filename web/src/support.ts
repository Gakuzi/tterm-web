// What "Attach technical details" sends with a message to support (0.1.25):
// one line, which the form shows before it goes: where tTerm runs, the
// browser and its system, the plan, how many machines. Never commands, what
// they printed or notes. It lives here, with no imports, so that the checks
// run it as it is (tests/support.test.ts).

/** The browser and its system, as people name them: "Chrome 141", "macOS";
 * empty where the User-Agent does not say. Browsers built on Chrome say
 * Chrome too: their own word comes first. */
export function browserOf(userAgent: string): { browser: string; os: string } {
  const os = /iPhone|iPod/.test(userAgent) ? "iOS"
    : /iPad/.test(userAgent) ? "iPadOS"
      : /Android/.test(userAgent) ? "Android" // i18n-ignore
        : /CrOS/.test(userAgent) ? "ChromeOS"
          : /Macintosh|Mac OS X/.test(userAgent) ? "macOS"
            : /Windows/.test(userAgent) ? "Windows"
              : /Linux/.test(userAgent) ? "Linux" : "";
  // The names stay as they are in every language.
  const named: [RegExp, string][] = [
    [/Edg(?:e|A|iOS)?\/(\d+)/, "Edge"], // i18n-ignore
    [/OPR\/(\d+)/, "Opera"], // i18n-ignore
    [/YaBrowser\/(\d+)/, "Yandex Browser"], // i18n-ignore
    [/SamsungBrowser\/(\d+)/, "Samsung Internet"], // i18n-ignore
    [/(?:Firefox|FxiOS)\/(\d+)/, "Firefox"], // i18n-ignore
    [/(?:Chrome|CriOS)\/(\d+)/, "Chrome"], // i18n-ignore
    [/Version\/(\d+)[\d.]*(?: Mobile\/\S+)? Safari\//, "Safari"], // i18n-ignore
  ];
  for (const [pattern, name] of named) {
    const m = pattern.exec(userAgent);
    if (m) return { browser: `${name} ${m[1]}`, os };
  }
  return { browser: "", os };
}

/** "Chrome 141, macOS", or whichever of the two is known. */
export function whereFrom(userAgent: string): string {
  const { browser, os } = browserOf(userAgent);
  return [browser, os].filter(Boolean).join(", ");
}

/** The parts, as the form shows them: "tTerm Web 0.1.25 · Chrome 141,
 * macOS · Free plan · 3 machines". A part not known is left out: an app
 * that does not say its version is "tTerm for Mac" alone. */
export function detailsLine(parts: string[]): string {
  return parts.map((part) => part.trim()).filter(Boolean).join(" · ");
}

/** An address that can be one: something, @, a name with a dot. The core
 * checks it again. */
export function looksLikeEmail(text: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text.trim());
}

/** The longest message, as the core takes it (core/support.py). */
export const TEXT_MAX = 5000;
