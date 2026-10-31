// The page inside tTerm for the computer before signing in (from 0.1.4),
// as approved on the canvas of 21.10 (version 63). The app's engine says so
// in /api/state ("local": true); tTerm Web itself never does, so in the
// browser the page is always signed in. Before signing in there is this
// computer only: Personal with it and its terminals; the account at the
// bottom of the sidebar says Not signed in, and its menu has Settings and
// Sign in. New project and Add machine are there as after signing in, and
// from 0.1.5 say what signing in brings (canvas of 22.10, version 65;
// NeedAccount.tsx).
//
// From 0.1.6 the app signs in with the browser (AppSignIn.tsx, Connect.tsx).
// Signed in, its engine says "app": true and marks the computer it runs on
// "here", as on the canvas of 23.10 (version 70, variant B): only that
// computer is marked, on an amber square and with "this Mac", in the
// sidebar and on its tabs; everything else looks as in the browser. Without
// the connection ("offline") a strip says so and the cloud's machines wait.

import { createContext } from "react";
import type { Translate } from "./i18n";

/** True in the app before signing in. */
export const LocalOnly = createContext(false);

/** In the app, signed in or not (0.1.8). Its window does not load
 * addresses of tTerm itself, such as a photo's: the page's requests go
 * through the app, so a photo is fetched there (Face.tsx), again when the
 * connection is back (`online`). */
export const InApp = createContext({ inApp: false, online: true });

/** Whether the page runs on a Mac: the app's own computer is "this Mac"
 * there, "this computer" elsewhere. A sentence that names it comes in
 * both, as strings of their own (.mac and .computer), since languages
 * change the words around it. */
export function onMac(): boolean {
  return /Macintosh|Mac OS X/.test(navigator.userAgent); // i18n-ignore
}

/** What the app's own computer is called on the page, alone: "this Mac". */
export function hereWord(t: Translate): string {
  return onMac() ? t("here.mac") : t("here.computer");
}
