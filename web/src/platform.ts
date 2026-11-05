// Where the page runs (0.1.18), for what it offers there: tTerm for Mac,
// Windows, or Linux browsers.

export type ClientOS = "windows" | "mac" | "linux" | "other";

/** A Mac's browser: macOS in the User-Agent, and not an iPad, whose Safari
 * says Macintosh too but has a touch screen. */
export function macBrowser(
  userAgent: string = navigator.userAgent,
  touchPoints: number = navigator.maxTouchPoints ?? 0,
): boolean {
  return /Macintosh|Mac OS X/.test(userAgent) && !/iPhone|iPad/.test(userAgent) && touchPoints <= 1;
}

/** A Windows browser. */
export function windowsBrowser(userAgent: string = navigator.userAgent): boolean {
  return /Windows|Win32|Win64/.test(userAgent);
}

/** A Linux browser (excluding Android). */
export function linuxBrowser(userAgent: string = navigator.userAgent): boolean {
  return /Linux/.test(userAgent) && !/Android/.test(userAgent);
}

/** Automatically detects the client operating system. */
export function detectClientOS(): ClientOS {
  if (typeof navigator === "undefined") return "other";
  if (windowsBrowser()) return "windows";
  if (macBrowser()) return "mac";
  if (linuxBrowser()) return "linux";
  return "other";
}
