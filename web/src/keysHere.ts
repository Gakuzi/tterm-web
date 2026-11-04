// What is closed on this device while its keys are not open here (0.1.28,
// vault-design.md v3, the owner's decisions of 03.11): the same rule as the
// core's (tterm/core/vault.py: guarded, exempt, guarding), so that the page
// shows a lock where the core would refuse.
//
// Guarded are a server that opens with the person's key, one through their
// Mac, and a computer (the Mac seen from a browser or a phone). tTerm's own
// line is not: signing in is enough for it. In the app, its own computer
// and the servers through it are not guarded for the app itself. And
// nothing is closed while the person's vault could prove nothing (none, or
// one with neither a password nor a key): whoever signed in could make one.

import type { Machine, Vault } from "./api";
import type { VaultState } from "./vault/store";

/** The person's keys guard something: a vault a device can prove open. */
export function guarding(vault: Vault | null): boolean {
  return !!vault && (!!vault.password || vault.keys.length > 0);
}

export function guarded(machine: Machine): boolean {
  return machine.kind === "computer" || machine.method === "key" || machine.method === "mac";
}

/** In the app: the computer it runs on, and the servers through it. */
export function exempt(machine: Machine, byId: Map<string, Machine>): boolean {
  if (machine.here) return true;
  return machine.method === "mac" && !!machine.via && !!byId.get(machine.via.id)?.here;
}

/** The keys are not open on this device, for the core. */
export function keysShut(v: VaultState): boolean {
  return v.proofs && guarding(v.vault) && !v.proven;
}

/** Nothing of this machine reaches this device now: its "+" is a lock and
 * its terminals show their card. */
export function closedHere(machine: Machine, v: VaultState, byId: Map<string, Machine>): boolean {
  return keysShut(v) && guarded(machine) && !exempt(machine, byId);
}

/** Its log is closed here too: the person's own machine's (other members
 * read a log by their role). */
export function logClosedHere(machine: Machine, v: VaultState, byId: Map<string, Machine>): boolean {
  return machine.mine !== false && closedHere(machine, v, byId);
}
