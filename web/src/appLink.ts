// tTerm for the computer signs in with the browser (0.1.6). The app opens
// /connect here with what it is (app, name), where it waits (port, on
// 127.0.0.1 of this very computer), its challenge (the SHA-256 of a secret
// only it knows) and its state. The person, signed in, allows it; the page
// then takes the one-time code to the app. See tterm/core/auth.py.
//
// The code both windows show (K7F-3QX) comes from the challenge, so that
// the person sees it is the same request: the app works it out the same
// way. It proves nothing by itself; what keeps someone else's link from
// connecting their computer is that the code goes only to 127.0.0.1 here.

import { t as say, type Translate } from "./i18n";

export interface AppLink {
  app: "mac" | "windows" | "linux";
  name: string;
  port: number;
  challenge: string;
  state: string;
}

/** "tTerm for Mac", as the site names the apps in each language. */
const APPS: Record<AppLink["app"], string> = {
  mac: "app_link.mac", windows: "app_link.windows", linux: "app_link.linux",
};

/** "tTerm for Mac", as the device is called in Devices. */
export function appTitle(link: AppLink, t: Translate = say): string {
  return t(APPS[link.app]);
}

const CHALLENGE = /^[A-Za-z0-9_-]{43}$/;
const STATE = /^[A-Za-z0-9_-]{16,128}$/;

/** What the address says, if it is a whole link of the app; the same rules
 * as the core's (page.py, allow_app). */
export function readLink(search: string): AppLink | null {
  const q = new URLSearchParams(search);
  const app = q.get("app") ?? "";
  const name = (q.get("name") ?? "").split(/\s+/).filter(Boolean).join(" ");
  const portText = q.get("port") ?? "";
  const port = /^\d{4,5}$/.test(portText) ? Number(portText) : NaN;
  const challenge = q.get("challenge") ?? "";
  const state = q.get("state") ?? "";
  // Its own keys only: "constructor" is in every object.
  if (!Object.prototype.hasOwnProperty.call(APPS, app)) return null;
  // Printable, as the core has it: no control characters; counted in
  // characters, as the core counts them, not in UTF-16 units.
  const length = [...name].length;
  if (length < 1 || length > 64 || /\p{C}/u.test(name)) return null;
  if (!(port >= 1024 && port <= 65535)) return null;
  if (!CHALLENGE.test(challenge) || !STATE.test(state)) return null;
  return { app: app as AppLink["app"], name, port, challenge, state };
}

/** Where Cancel takes the browser: the app hears that the person said no,
 * and stops waiting. */
export function cancelAddress(link: AppLink): string {
  const query = new URLSearchParams({ error: "cancelled", state: link.state });
  return `http://127.0.0.1:${link.port}/signed-in?${query}`;
}

/** Crockford's base32: no I, L, O or U to mistake for other signs. */
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/** The code both windows show: the first 30 bits of the SHA-256 of the
 * challenge, six signs of base32, "K7F-3QX". */
export async function linkCode(challenge: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest(
    "SHA-256", new TextEncoder().encode(challenge)));
  const bits = ((digest[0] << 24) | (digest[1] << 16) | (digest[2] << 8) |
    digest[3]) >>> 2;
  let code = "";
  for (let i = 0; i < 6; i++) code += ALPHABET[(bits >>> (25 - 5 * i)) & 31];
  return `${code.slice(0, 3)}-${code.slice(3)}`;
}
