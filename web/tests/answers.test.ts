// What the core and the engine answer about the vault password, in the
// page's words (src/vault/answers.ts; the contract's v2 and its changes
// 35–52, and the security review's L5): the key said, with its values;
// never the core's or the engine's own sentence, and anything of no known
// shape is something that went wrong.
//
//   node --test tests/answers.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  coreSaid, engineSaid, refusedSaid, retryTime, saidAt, triesSaid, type Answer,
} from "../src/vault/answers.ts";
import type { Translate } from "../src/i18n";
import { clock, day } from "../src/time.ts";

const answer = (status: number, body: Record<string, unknown> = {}, message = "x"): Answer =>
  ({ status, body, message });
const SOMETHING = { key: "vault_problem.something" };

/** The page's `t` in English, as far as the times need it. */
const t = Object.assign((key: string, values?: Record<string, string | number>) => {
  if (key === "time.day_at") return `${values?.day} ${values?.time}`;
  if (key === "time.yesterday_at") return `yesterday ${values?.time}`;
  return key;
}, { lang: "en", rich: () => null }) as unknown as Translate;

test("a wrong password: the tries are said when 3 or fewer are left, 0 too", () => {
  for (const left of [9, 4]) {
    assert.deepEqual(coreSaid(answer(403, { error: "x", wrong: true, left })),
      { key: "vault_problem.password_wrong" });
  }
  for (const left of [3, 1, 0]) {
    assert.deepEqual(coreSaid(answer(403, { error: "x", wrong: true, left })), {
      key: "vault_problem.password_wrong",
      then: { key: "vault_problem.password_left", values: { n: left } },
    });
  }
  // Without a number of tries, or a strange one: just wrong.
  assert.deepEqual(coreSaid(answer(403, { wrong: true })), { key: "vault_problem.password_wrong" });
  assert.deepEqual(coreSaid(answer(403, { wrong: true, left: -1 })), { key: "vault_problem.password_wrong" });
  assert.deepEqual(coreSaid(answer(403, { wrong: true, left: "2" })), { key: "vault_problem.password_wrong" });
  // A 403 that is not about the password: something went wrong, not its sentence.
  assert.deepEqual(coreSaid(answer(403, { error: "Forbidden." }, "Forbidden.")), SOMETHING);
});

test("too many: the time to try again, from the core's retryAt", () => {
  const retryAt = "2026-11-02T13:04:05.123456+00:00";
  const ms = Date.UTC(2026, 10, 2, 13, 4, 5, 123);
  assert.equal(retryTime(retryAt), ms);
  assert.equal(retryTime("2026-11-02T13:04:05+00:00"), ms - 123);
  assert.equal(retryTime(undefined, 1000), 1000 + 3_600_000);
  assert.equal(retryTime("soon", 1000), 1000 + 3_600_000);
  assert.deepEqual(coreSaid(answer(429, { error: "x", paused: true, retryAt })),
    { key: "vault_problem.password_paused", values: { time: clock(ms) }, at: ms });
  assert.match(String(triesSaid(answer(429, { paused: true, retryAt }))?.values?.time), /^\d\d:\d\d$/);
  // A 429 that is not the password's pause (the rate of requests).
  assert.deepEqual(coreSaid(answer(429, { error: "Slow down." })), SOMETHING);
});

test("the time to try again: the time today, the day too another day (the daily pause)", () => {
  const now = new Date(2026, 10, 2, 13, 4);
  const at = (h: number, d = 2) => new Date(2026, 10, d, h, 5).getTime();
  // Today: the sentence as it is, with the time.
  assert.deepEqual(saidAt("vault_problem.password_paused", { n: 1 }, at(14), t, now),
    { key: "vault_problem.password_paused", values: { n: 1, time: clock(at(14)) } });
  // The daily pause of 30 wrong ones in a day ends up to a day away: its
  // own sentence, with the day and the time apart.
  const tomorrow = at(12, 3);
  assert.deepEqual(saidAt("vault_problem.password_paused", undefined, tomorrow, t, now),
    { key: "vault_problem.password_paused_day", values: { day: day(tomorrow, t), time: clock(tomorrow) } });
  assert.match(String(day(tomorrow, t)), /^\d{1,2} [A-Z][a-z]{2}( \d{4})?$/);
  // Nothing to say a time for: the key and values as they are.
  assert.deepEqual(saidAt("vault_problem.password_wrong", { n: 2 }, undefined, t, now),
    { key: "vault_problem.password_wrong", values: { n: 2 } });
  // The core's answer, as the page says it a day away.
  const retryAt = new Date(tomorrow).toISOString().replace("Z", "123+00:00");
  const said = coreSaid(answer(429, { paused: true, retryAt }));
  assert.equal(saidAt(said.key, said.values, said.at, t, now).key, "vault_problem.password_paused_day");
});

test("the core: no password (404); anything else is something that went wrong", () => {
  assert.deepEqual(coreSaid(answer(404, { error: "This vault has no password." })),
    { key: "vault_problem.no_password" });
  assert.deepEqual(coreSaid(answer(422, { error: "auth" })), SOMETHING);
  assert.deepEqual(coreSaid(answer(500)), SOMETHING);
  assert.deepEqual(coreSaid(answer(0, {}, "Failed to fetch")), SOMETHING);
});

test("the core refuses a vault made here, or a password set: never its sentence", () => {
  assert.deepEqual(refusedSaid(answer(409, {}, "This account has a vault already."), "make"),
    { key: "vault_problem.exists" });
  assert.deepEqual(refusedSaid(answer(404, {}, "This account has no vault."), "set"),
    { key: "vault_problem.no_vault" });
  for (const status of [400, 403, 409, 413, 422, 429, 500, 502, 503]) {
    if (status !== 409) assert.deepEqual(refusedSaid(answer(status, {}, "Bad kdf."), "make"), SOMETHING);
    assert.deepEqual(refusedSaid(answer(status, {}, "Bad kdf."), "set"), SOMETHING);
  }
  assert.deepEqual(refusedSaid(answer(404, {}, "x"), "make"), SOMETHING);
});

test("the engine: open with a password", () => {
  assert.deepEqual(engineSaid(answer(422, { wrong: true, left: 2 }), "password"), {
    key: "vault_problem.password_wrong",
    then: { key: "vault_problem.password_left", values: { n: 2 } },
  });
  const ms = Date.UTC(2026, 10, 2, 13, 4, 5);
  assert.deepEqual(engineSaid(answer(429, { paused: true, retryAt: "2026-11-02T13:04:05Z" }), "password"),
    { key: "vault_problem.password_paused", values: { time: clock(ms) }, at: ms });
  // Outside the rule: 422 without `wrong`, no try spent; told by the
  // engine's sentence (its change 45).
  assert.deepEqual(engineSaid(answer(422, {}, "The password needs at least 12 characters."), "password"),
    { key: "vault_problem.password_short" });
  assert.deepEqual(engineSaid(answer(422, {}, "The password can have at most 256 characters."), "password"),
    { key: "vault_problem.password_wrong" });
  // A 422 the engine passes on from tTerm is not the rule's.
  assert.deepEqual(engineSaid(answer(422, {}, "That proof is not one."), "password"), SOMETHING);
  assert.deepEqual(engineSaid(answer(409, {}, "Your vault has no password yet: open it with your recovery code."),
    "password"), { key: "vault_problem.no_password" });
  assert.deepEqual(engineSaid(answer(409, {}, "This computer cannot open the vault."), "password"), SOMETHING);
  assert.deepEqual(engineSaid(answer(502, {}, "tTerm keeps your vault password with settings…"), "password"),
    SOMETHING);
  assert.deepEqual(engineSaid(answer(401, { signedOut: true }, "Signed out."), "password"), SOMETHING);
  // A 409 to an open without the password is the caller's (this Mac has no
  // lock): as it came.
  assert.equal(engineSaid(answer(409, { error: "x" }), null), null);
});

test("the engine: Touch ID, the recovery code, a vault made and a password set", () => {
  const touch = answer(403, {}, "Touch ID or your Mac's password did not go through (cancelled). The vault stays as it was.");
  for (const what of [null, "code", "password", "new"] as const) {
    assert.deepEqual(engineSaid(touch, what), { key: "vault_problem.touch_failed" });
  }
  assert.equal(engineSaid(answer(403, {}, "Another thing."), null), null);
  assert.deepEqual(engineSaid(answer(403, {}, "Another thing."), "new"), SOMETHING);
  assert.deepEqual(engineSaid(answer(422, {}, "That recovery code does not open your vault."), "code"),
    { key: "vault_problem.code_wrong_app" });
  assert.deepEqual(engineSaid(answer(422, {}, "That is not a recovery code."), "code"), SOMETHING);
  assert.deepEqual(engineSaid(answer(409, {}, "Your vault has a password now, and no recovery code."), "code"),
    SOMETHING);
  // A vault made, a password set: only the rule's 422 says short.
  assert.deepEqual(engineSaid(answer(422, {}, "The password needs at least 12 characters."), "new"),
    { key: "vault_problem.password_short" });
  assert.deepEqual(engineSaid(answer(422, { error: "short" }, "short"), "new"), SOMETHING);
  assert.deepEqual(engineSaid(answer(422, {}, "That kdf is not one tTerm takes."), "new"), SOMETHING);
  assert.deepEqual(engineSaid(answer(409, {}, "This Mac has no lock on your vault yet."), "new"), SOMETHING);
  assert.deepEqual(engineSaid(answer(500), "new"), SOMETHING);
});
