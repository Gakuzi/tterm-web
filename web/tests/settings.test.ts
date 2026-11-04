// The Settings window (0.1.27, row 133): the addresses of its sections, and
// its search, in small letters and without the marks over letters
// (src/settingsSearch.ts).
//
//   node --test --experimental-strip-types tests/settings.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  fold, holds, searchWords, sectionsFound, settingsAt,
} from "../src/settingsSearch.ts";

test("the addresses of Settings and its sections", () => {
  assert.equal(settingsAt("/settings"), "");
  assert.equal(settingsAt("/settings/"), "");
  assert.equal(settingsAt("/settings/general"), "general");
  assert.equal(settingsAt("/settings/keys"), "keys");
  assert.equal(settingsAt("/settings/devices/"), "devices");
  assert.equal(settingsAt("/settings/updates"), "updates");
  // A section there is not: Settings, none chosen.
  assert.equal(settingsAt("/settings/billing"), "");
  // The account's page before 0.1.27 is its Account now.
  assert.equal(settingsAt("/account"), "account");
  assert.equal(settingsAt("/account/"), "account");
  // Not Settings.
  for (const path of ["/", "/move", "/t/abc", "/settingsx", "/settings/keys/more",
    "/settings/Keys", "/accounts", "/n/settings"]) {
    assert.equal(settingsAt(path), null, path);
  }
});

test("the search compares small letters without marks", () => {
  assert.equal(fold("Тёмная", "ru"), "темная");
  assert.equal(fold("Préférences", "fr"), "preferences");
  assert.equal(fold("Ayarların bölümleri", "tr"), "ayarlarin bolumleri");
  // Turkish İ is i in Turkish, with its dot taken off as a mark.
  assert.equal(fold("İ", "tr"), "i");
  // An unknown language tag still compares.
  assert.equal(fold("Theme", "xx-not-a-tag-!!"), "theme");
  // Letters with no mark to take off are typed as the plain ones.
  assert.equal(fold("Cały projekt", "pl"), "caly projekt");
  assert.equal(fold("Straße", "de"), "strasse");
  // Turkish small I has no dot: typed as i, it still finds Italiano.
  assert.equal(fold("Italiano", "tr"), "italiano");
  assert.equal(fold("Açık", "tr"), "acik");
  // The marks of Japanese kana make another sound, and stay: デ is not テ.
  assert.notEqual(fold("デバイス", "ja"), fold("テハイス", "ja"));
  assert.ok(holds("デバイス", searchWords("デバ", "ja"), "ja"));
  assert.ok(!holds("デバイス", searchWords("テハ", "ja"), "ja"));
  assert.deepEqual(searchWords("  Тем   цвет ", "ru"), ["тем", "цвет"]);
  assert.deepEqual(searchWords("   ", "en"), []);
});

test("a row or a section holds every word typed", () => {
  assert.ok(holds("Тема Системная тема берётся из настроек", searchWords("тем", "ru"), "ru"));
  assert.ok(holds("Тема", searchWords("ТЕМ", "ru"), "ru"));
  assert.ok(holds("Тёмная", searchWords("темн", "ru"), "ru"));
  assert.ok(holds("Project colors Whole project", searchWords("colors whole", "en"), "en"));
  assert.ok(!holds("Project colors", searchWords("colors theme", "en"), "en"));
  // Nothing typed: everything stays.
  assert.ok(holds("anything", [], "en"));
});

test("the sections the search leaves, in their order", () => {
  const sections = [
    { key: "general", words: "General Appearance Theme Project colors Language" },
    { key: "account", words: "Account Profile Photo Name Email" },
    { key: "keys", words: "Keys ssh keys vault password passphrase servers" },
    { key: "devices", words: "Devices browsers sessions forget sign out" },
  ];
  assert.deepEqual(sectionsFound(sections, "", "en"), ["general", "account", "keys", "devices"]);
  assert.deepEqual(sectionsFound(sections, "theme", "en"), ["general"]);
  assert.deepEqual(sectionsFound(sections, "pass", "en"), ["keys"]);
  assert.deepEqual(sectionsFound(sections, "o", "en"), ["general", "account", "keys", "devices"]);
  assert.deepEqual(sectionsFound(sections, "photo vault", "en"), []);
});
