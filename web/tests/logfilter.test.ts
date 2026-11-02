// The tools of a machine's log (src/logfilter.ts, 0.1.21): which lines show
// with which filters, who and which terminals there are, the days of what
// Find in this log found; and why a terminal ended, in the page's words
// (src/reasons.ts).
//
//   node --test --experimental-strip-types tests/logfilter.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import type { LogEntry, LogNote, LogPerson } from "../src/api.ts";
import type { Translate } from "../src/i18n.ts";
import {
  authorsOf, byDay, filtering, hasWords, NO_FILTER, shows, terminalsOf,
} from "../src/logfilter.ts";
import { reasonText } from "../src/reasons.ts";

const ME = "u-me";
const person = (id: string, firstName: string): LogPerson =>
  ({ id, name: firstName, firstName, initials: firstName[0], photo: null, me: id === ME }) as LogPerson;
const denis = person(ME, "Denis");
const anna = person("u-anna", "Anna");

const note = (id: number, by: LogPerson, author: "person" | "ai", text: string): LogNote =>
  ({ id, at: 0, by, author, ai: author === "ai" ? "claude" : null, text, redacted: null });

const at = (day: number, hour: number) => new Date(2026, 9, day, hour, 0, 0).getTime();

const opened: LogEntry = {
  id: 1, kind: "terminal.opened", at: at(31, 9), by: denis, author: "person", ai: null,
  terminal: { id: "t1", name: "1" },
};
const pull: LogEntry = {
  id: 2, kind: "command.ran", at: at(31, 9), by: denis, author: "person", ai: null,
  terminal: { id: "t1", name: "1" }, command: "git pull", exit: 0, notes: [],
};
const build: LogEntry = {
  id: 3, kind: "command.ran", at: at(31, 10), by: denis, author: "person", ai: null,
  terminal: { id: "t1", name: "1" }, command: "npm run build", exit: 1,
  notes: [note(10, denis, "ai", "It needs config/production.json.")],
};
const restart: LogEntry = {
  id: 4, kind: "command.ran", at: new Date(2026, 10, 1, 11).getTime(), by: anna, author: "person",
  ai: null, terminal: { id: "t2", name: "1" }, command: "systemctl restart app", exit: 0,
  notes: [note(11, denis, "person", "Restarted after the config.")],
};
const day = [opened, pull, build, restart];
const shown = (f: Partial<typeof NO_FILTER>) =>
  day.filter((e) => shows(e, { ...NO_FILTER, ...f }, ME)).map((e) => e.id);

test("with no filter every line shows, terminals opened too", () => {
  assert.equal(filtering(NO_FILTER), false);
  assert.deepEqual(shown({}), [1, 2, 3, 4]);
});

test("Failed, With notes and one terminal keep to commands", () => {
  assert.deepEqual(shown({ failed: true }), [3]);
  assert.deepEqual(shown({ notes: true }), [3, 4]);
  assert.deepEqual(shown({ terminal: "t2" }), [4]);
  assert.deepEqual(shown({ failed: true, notes: true }), [3]);
  assert.equal(filtering({ ...NO_FILTER, notes: true }), true);
});

test("whose lines: who ran a command, or wrote a note under it", () => {
  assert.deepEqual(shown({ who: "me" }), [2, 3, 4], "a note of mine under Anna's command");
  assert.deepEqual(shown({ who: "u-anna" }), [4]);
  assert.deepEqual(shown({ who: "ai" }), [3], "the AI wrote under the build only");
  assert.deepEqual(shown({ who: "u-sam" }), []);
});

test("who else there is, and the terminals, in the order they come", () => {
  const who = authorsOf(day, ME);
  assert.deepEqual(who.people.map((p) => p.firstName), ["Anna"]);
  assert.equal(who.ai, true);
  assert.equal(authorsOf([pull], ME).ai, false);
  assert.deepEqual(terminalsOf(day).map((x) => [x.id, x.at]), [["t1", pull.at], ["t2", restart.at]]);
});

test("what was found, by the day it is in here", () => {
  const days = byDay([pull, build, restart]);
  assert.deepEqual(days.map((d) => d.entries.map((e) => e.id)), [[2, 3], [4]]);
  assert.equal(days[0].start, new Date(2026, 9, 31).getTime());
  assert.deepEqual(byDay([]), []);
});

test("words, as the core finds them: any case, inside other words", () => {
  assert.equal(hasWords("It needs config/production.json.", ["production", "config"]), true);
  assert.equal(hasWords("It needs config/Production.json.", ["production.json"]), true);
  assert.equal(hasWords("It needs config", ["production"]), false);
  assert.equal(hasWords(null, ["x"]), false);
  assert.equal(hasWords("anything", []), false);
});

const t = Object.assign(
  (key: string, values?: Record<string, unknown>) => `${key}${values ? JSON.stringify(values) : ""}`,
  { rich: () => null, lang: "en" },
) as unknown as Translate;

test("why a terminal ended, in the page's words", () => {
  assert.equal(reasonText("tTerm Web stopped.", t), "reason.stopped");
  assert.equal(reasonText("Closed.", t), "reason.closed");
  assert.equal(reasonText("Closed before it opened.", t), "reason.closed_early");
  assert.equal(reasonText("The shell ended with code 130.", t), 'reason.shell_code{"code":"130"}');
  assert.equal(reasonText("The connection to web-01 was closed.", t),
    'reason.link_closed{"machine":"web-01"}');
  assert.equal(reasonText("The connection to web-01 was lost: [Errno 104] Connection reset", t),
    'reason.link_lost{"machine":"web-01","why":"[Errno 104] Connection reset"}');
  assert.equal(reasonText("db-01 was removed from tTerm Web.", t), 'reason.removed{"machine":"db-01"}');
  assert.equal(reasonText("mini is not connected right now: its agent is not running. Start the " +
    "agent on that computer, then open a terminal again.", t), 'reason.agent_off{"machine":"mini"}');
  assert.equal(reasonText("The Mac is not connected right now. Open it from the Mac, or start " +
    "tTerm for Mac, then open this terminal again.", t), 'reason.mac_off{"mac":"reason.the_mac"}',
    "the Mac whose name the core does not know, in the page's words too");
  assert.equal(reasonText("MacBook-Pro is not connected right now. Open it from the Mac, or " +
    "start tTerm for Mac, then open this terminal again.", t),
    'reason.mac_off{"mac":"MacBook-Pro"}');
  assert.equal(reasonText("mini did not come back within 12 hours: this terminal has ended.", t),
    'reason.away_long{"machine":"mini"}');
  assert.equal(reasonText("mini came back without this terminal: its agent was restarted, or " +
    "the computer was awake and offline for over an hour.", t),
    'reason.came_back_without{"machine":"mini"}');
  assert.equal(reasonText("The agent on mini was stopped: this terminal has ended.", t),
    'reason.agent_stopped{"machine":"mini"}');
  assert.equal(reasonText("Could not open a terminal on mini: the agent could not start the " +
    "shell", t), 'reason.no_open{"machine":"mini","why":"the agent could not start the shell"}');
  assert.equal(reasonText("This terminal is no longer running.", t), "terminal_view.not_running");
});

test("any other reason, an SSH error say, shows as the core wrote it", () => {
  const ssh = "Nothing answers on SSH at 10.0.0.5:22: connection refused. Is SSH listening on port 22?";
  assert.equal(reasonText(ssh, t), ssh);
  assert.equal(reasonText("", t), "");
});
