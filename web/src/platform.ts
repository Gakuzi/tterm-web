// Where the page runs (0.1.18), for what it offers there: tTerm for Mac
// only in a Mac's browser.

/** A Mac's browser: macOS in the User-Agent, and not an iPad, whose Safari
 * says Macintosh too but has a touch screen. */
export function macBrowser(
  userAgent: string = navigator.userAgent,
  touchPoints: number = navigator.maxTouchPoints ?? 0,
): boolean {
  return /Macintosh|Mac OS X/.test(userAgent) && !/iPhone|iPad/.test(userAgent) && touchPoints <= 1;
}
