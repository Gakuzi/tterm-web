// Why a terminal ended (0.1.21), in the page's language. The core writes it
// in English (core/terminals.py, agents.py, server.py, api/page.py), and a terminal
// keeps it as written: the reasons it gives most are known here and said
// in the page's words, with the names and codes in them; any other, an SSH
// error say, shows as the core wrote it.

import type { Translate } from "./i18n";

type Say = (m: RegExpExecArray, t: Translate) => string;

/** The core's words, each with how the page says them. */
const KNOWN: [RegExp, Say][] = [
  [/^tTerm Web stopped\.$/, (_, t) => t("reason.stopped")],
  [/^Closed\.$/, (_, t) => t("reason.closed")],
  [/^Closed before it opened\.$/, (_, t) => t("reason.closed_early")],
  [/^The shell ended with code (-?\d+)\.$/, (m, t) => t("reason.shell_code", { code: m[1] })],
  [/^The connection to (.+) was closed\.$/, (m, t) => t("reason.link_closed", { machine: m[1] })],
  [/^The connection to (.+?) was lost: ([\s\S]*)$/,
    (m, t) => t("reason.link_lost", { machine: m[1], why: m[2] })],
  [/^(.+) was removed from tTerm Web\.$/, (m, t) => t("reason.removed", { machine: m[1] })],
  [/^(.+) is not connected right now: its agent is not running\. Start the agent on that computer, then open a terminal again\.$/,
    (m, t) => t("reason.agent_off", { machine: m[1] })],
  [/^(.+) is not connected right now\. Open it from the Mac, or start tTerm for Mac, then open this terminal again\.$/,
    // The Mac, when the core does not know its name. i18n-ignore
    (m, t) => t("reason.mac_off", { mac: m[1] === "The Mac" ? t("reason.the_mac") : m[1] })],
  // A computer's terminal that waited for its agent (core/agents.py).
  [/^(.+) did not come back within 12 hours: this terminal has ended\.$/,
    (m, t) => t("reason.away_long", { machine: m[1] })],
  [/^(.+) came back without this terminal: its agent was restarted, or the computer was awake and offline for over an hour\.$/,
    (m, t) => t("reason.came_back_without", { machine: m[1] })],
  [/^The agent on (.+) was stopped: this terminal has ended\.$/,
    (m, t) => t("reason.agent_stopped", { machine: m[1] })],
  [/^Could not open a terminal on (.+?): ([\s\S]*)$/,
    (m, t) => t("reason.no_open", { machine: m[1], why: m[2] })],
  [/^This terminal is no longer running\.$/, (_, t) => t("terminal_view.not_running")],
];

export function reasonText(reason: string, t: Translate): string {
  for (const [pattern, say] of KNOWN) {
    const m = pattern.exec(reason);
    if (m) return say(m, t);
  }
  return reason;
}
