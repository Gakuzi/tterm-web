// What this browser can do for the vault (0.1.17), found out once: X25519
// (a new browser's pairing with the Mac), Ed25519 (signing with Ed25519
// keys, and reading them from PKCS#8), and passkeys with PRF (the passkey
// lock). Older browsers lack some: the page says so where it matters.

export interface Support {
  /** WebCrypto's X25519: the Mac can approve this browser. */
  x25519: boolean;
  /** WebCrypto's Ed25519: Ed25519 keys sign here. */
  ed25519: boolean;
  /** WebAuthn is there at all. */
  webauthn: boolean;
  /** A passkey of this device (Touch ID, Windows Hello…), or one from a
   * phone; null when the browser does not say. */
  platform: boolean | null;
  /** The PRF extension: true or false when the browser says, null when only
   * trying tells. */
  prf: boolean | null;
}

async function can(make: () => Promise<unknown>): Promise<boolean> {
  try {
    await make();
    return true;
  } catch {
    return false;
  }
}

let found: Promise<Support> | null = null;

export function support(): Promise<Support> {
  found ??= detect();
  return found;
}

async function detect(): Promise<Support> {
  const subtle = globalThis.crypto?.subtle;
  const x25519 = !!subtle && await can(() => subtle.generateKey({ name: "X25519" }, false, ["deriveBits"]));
  const ed25519 = !!subtle && await can(() => subtle.generateKey({ name: "Ed25519" }, false, ["sign", "verify"]));
  const webauthn = typeof PublicKeyCredential !== "undefined" && !!navigator.credentials?.create;
  let platform: boolean | null = null;
  let prf: boolean | null = null;
  if (webauthn) {
    try {
      platform = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
    } catch {
      platform = null;
    }
    const caps = (PublicKeyCredential as unknown as {
      getClientCapabilities?: () => Promise<Record<string, boolean>>;
    }).getClientCapabilities;
    if (typeof caps === "function") {
      try {
        const got = await caps.call(PublicKeyCredential);
        if (typeof got["extension:prf"] === "boolean") prf = got["extension:prf"];
      } catch {
        prf = null;
      }
    }
  }
  return { x25519, ed25519, webauthn, platform, prf };
}

/** Whether a passkey lock may be tried here: WebAuthn, and PRF not ruled
 * out. */
export function passkeysHere(s: Support | null): boolean {
  return !!s && s.webauthn && s.prf !== false;
}

/** How this computer unlocks, for the words on the buttons: Touch ID on a
 * Mac, Windows Hello on Windows, a passkey elsewhere. */
export type Unlock = "touch" | "hello" | "passkey";

export function unlockOf(userAgent = navigator.userAgent): Unlock {
  if (/iPhone|iPad|Android/.test(userAgent)) return "passkey";
  if (/Macintosh|Mac OS X/.test(userAgent)) return "touch";
  if (/Windows/.test(userAgent)) return "hello";
  return "passkey";
}

/** "Chrome on macOS", as the core labels a device (auth.device_label):
 * the name a lock of this browser goes by. Names, not words to translate:
 * the core's labels are these in every language. */
const BROWSERS: [RegExp, string][] = [
  [/Edg\//, "Edge"], // i18n-ignore
  [/OPR\//, "Opera"], // i18n-ignore
  [/Firefox\/|FxiOS/, "Firefox"], // i18n-ignore
  [/Chrome\/|CriOS/, "Chrome"], // i18n-ignore
  [/Safari\//, "Safari"], // i18n-ignore
];
const SYSTEMS: [RegExp, string][] = [
  [/iPhone/, "iPhone"], // i18n-ignore
  [/iPad/, "iPad"], // i18n-ignore
  [/Android/, "Android"], // i18n-ignore
  [/Macintosh|Mac OS X/, "macOS"],
  [/Windows/, "Windows"],
  [/Linux|X11/, "Linux"],
];

export function deviceLabel(ua = navigator.userAgent): string {
  const browser = BROWSERS.find(([test]) => test.test(ua))?.[1] ?? "A browser"; // i18n-ignore
  const system = SYSTEMS.find(([test]) => test.test(ua))?.[1];
  return system ? `${browser} on ${system}` : browser; // i18n-ignore: as the core names it
}
