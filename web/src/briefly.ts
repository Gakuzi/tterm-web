// What a pressed button did, shown on the button itself for a moment (0.1.13,
// the canvas, version 81; the owner, 28.10: "нажимаешь кнопку, например
// скопировать, и ставится галочка – ты понимаешь, что ты её нажал"). A copy
// puts a check where the button's icon was, in the button's own colour, and
// Copy says Copied; then the button is as it was, ready to be pressed again.

import { useCallback, useEffect, useRef, useState } from "react";

/** How long a button shows what it did. */
export const PRESSED_MS = 1500;

/** A value that is there for PRESSED_MS after `show`, then gone; `hide`
 * takes it away at once. */
export function useBriefly<T>(): [T | null, (value: T) => void, () => void] {
  const [value, setValue] = useState<T | null>(null);
  const timer = useRef(0);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const show = useCallback((next: T) => {
    window.clearTimeout(timer.current);
    setValue(next);
    timer.current = window.setTimeout(() => setValue(null), PRESSED_MS);
  }, []);
  const hide = useCallback(() => {
    window.clearTimeout(timer.current);
    setValue(null);
  }, []);
  return [value, show, hide];
}

import { copyToClipboard } from "./clipboard";

/** Puts text on the clipboard: whether the browser let the page do it. */
export async function toClipboard(text: string): Promise<boolean> {
  return copyToClipboard(text);
}
