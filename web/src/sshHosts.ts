// The servers and keys this Mac knows (0.1.17, the engine's GET
// /api/app/ssh), as the strip after `ssh <host>` and Move to cloud read
// them: which key a server opens with, its address as `ssh` shows it, and
// whether tTerm Web reaches it (or its bastion) from the cloud.

import {
  CoreError, reachableFromCloud, type Machine, type Project, type SshHost, type SshInventory,
  type SshKeyFile,
} from "./api";

/** The core checks at most so many addresses a minute per person: past
 * that it says 429, and the check waits a little and asks again. */
const BUSY_WAIT_MS = 5_000;
const BUSY_TRIES = 14;

/** ssh's options that take a value: what follows them is not the host. */
const WITH_VALUE = new Set(["-b", "-B", "-c", "-D", "-E", "-e", "-F", "-I", "-i", "-J", "-L",
  "-l", "-m", "-O", "-o", "-p", "-P", "-Q", "-R", "-S", "-W", "-w"]);

/** The host of `ssh [options] [user@]host [command]`, as typed; null for
 * any other command. */
export function sshTarget(command: string): string | null {
  const words = command.trim().split(/\s+/);
  if (words[0] !== "ssh" || words.length < 2) return null;
  for (let i = 1; i < words.length; i++) {
    const w = words[i];
    if (w === "--") return hostOf(words[i + 1] ?? "");
    if (w.startsWith("-")) {
      // -p22 carries its value; -p 22 takes the next word.
      if (WITH_VALUE.has(w)) i++;
      continue;
    }
    return hostOf(w);
  }
  return null;
}

function hostOf(word: string): string | null {
  let w = word.replace(/^ssh:\/\//, "");
  w = w.slice(w.lastIndexOf("@") + 1).replace(/:\d+$/, "").replace(/\/.*$/, "");
  return /^[A-Za-z0-9._:[\]-]+$/.test(w) ? w : null;
}

/** The server of the inventory `ssh <target>` went to: by its alias, or
 * by its address. */
export function hostFor(inventory: SshInventory | null, target: string): SshHost | null {
  if (!inventory) return null;
  return inventory.hosts.find((h) => h.alias === target) ??
    inventory.hosts.find((h) => h.host === target) ?? null;
}

/** The key a server opens with: the one the engine names (`key`: the first
 * of its `ssh -G` identity files that is a file on this Mac and can be
 * moved, what ssh offers first), else the first of its identity files that
 * is a key in ~/.ssh. */
export function keyFor(inventory: SshInventory, host: SshHost): SshKeyFile | null {
  if (host.key) {
    const known = inventory.keys.find((k) => samePath(k.path, host.key!) || k.name === host.key);
    if (known) return known;
  }
  for (const file of host.identityFiles) {
    const found = inventory.keys.find((k) => samePath(k.path, file));
    if (found) return found;
  }
  return null;
}

/** "~/.ssh/id_ed25519" for a path under a home folder. */
export function tilde(path: string): string {
  return path.replace(/^\/(Users|home)\/[^/]+\//, "~/").replace(/^\/root\//, "~/");
}

/** The same file, written `~/…` or in full. */
export function samePath(a: string, b: string): boolean {
  return a === b || tilde(a) === tilde(b);
}

/** "root@203.0.113.7", with the port where it is not 22. */
export function address(host: SshHost): string {
  const at = host.user ? `${host.user}@${host.host}` : host.host;
  return host.port && host.port !== 22 ? `${at}:${host.port}` : at;
}

/** The first hop of a ProxyJump: [user@]host[:port]. */
export function jumpOf(host: SshHost): { host: string; port: number } | null {
  const first = (host.proxyJump ?? "").split(",")[0]?.trim();
  if (!first || first === "none") return null;
  const bare = first.replace(/^ssh:\/\//, "");
  const hostPort = bare.slice(bare.lastIndexOf("@") + 1);
  const m = /^\[?([^\]]+?)\]?(?::(\d+))?$/.exec(hostPort);
  return m ? { host: m[1], port: m[2] ? Number(m[2]) : 22 } : null;
}

/** Whether the cloud reaches the server, or its bastion when it has one.
 * Many servers at once (Move to cloud) meet the core's limit: then it waits
 * and asks again, rather than call a server unreachable. */
export async function cloudReaches(host: SshHost): Promise<boolean> {
  const jump = jumpOf(host);
  for (let tries = 0; ; tries++) {
    try {
      return await reachableFromCloud(jump ? jump.host : host.host, jump ? jump.port : host.port || 22);
    } catch (error) {
      if (error instanceof CoreError && error.status === 429 && tries < BUSY_TRIES) {
        await new Promise((resolve) => window.setTimeout(resolve, BUSY_WAIT_MS));
        continue;
      }
      return false;
    }
  }
}

/** The machine of tTerm that is this server already, if it was moved. */
export function inTterm(projects: Project[], host: SshHost): Machine | null {
  for (const p of projects) {
    const found = p.machines.find((m) => m.kind === "server" &&
      (m.name === host.alias || (m.host && m.host === host.host && m.method !== "mac")));
    if (found) return found;
  }
  return null;
}

/** When ssh ran there last, in milliseconds. */
export function lastUsedMs(host: SshHost): number | null {
  if (typeof host.lastUsed === "number") return host.lastUsed < 1e12 ? host.lastUsed * 1000 : host.lastUsed;
  if (typeof host.lastUsed === "string") {
    const ms = Date.parse(host.lastUsed);
    return Number.isNaN(ms) ? null : ms;
  }
  return null;
}

const ASKED_KEY = "tterm.ssh.asked";

/** The strip asks once per host; Don't ask, never again (in this app). */
export function askedAbout(alias: string): "seen" | "never" | null {
  try {
    const all = JSON.parse(localStorage.getItem(ASKED_KEY) ?? "{}") as Record<string, string>;
    const said = all[alias];
    return said === "seen" || said === "never" ? said : null;
  } catch {
    return null;
  }
}

export function rememberAsked(alias: string, said: "seen" | "never"): void {
  try {
    const all = JSON.parse(localStorage.getItem(ASKED_KEY) ?? "{}") as Record<string, string>;
    all[alias] = said;
    localStorage.setItem(ASKED_KEY, JSON.stringify(all));
  } catch {
    // Not kept: it asks again next time.
  }
}
