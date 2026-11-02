// Get help and About us in the account's menu (0.1.25): the line Attach
// technical details sends, as the form shows it (src/support.ts), and the
// addresses of the site and of What's new in each language (src/links.ts).
//
//   node --test --experimental-strip-types tests/support.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { browserOf, detailsLine, looksLikeEmail, whereFrom } from "../src/support.ts";
import { sitePage, TELEGRAM, whatsNewPage } from "../src/links.ts";

const MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit";
const WIN = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit";
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit";
const ANDROID = "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit";

test("the browser and its system, as people name them", () => {
  const cases: [string, string, string][] = [
    [`${MAC}/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36`, "Chrome 141", "macOS"],
    [`${MAC}/605.1.15 (KHTML, like Gecko) Version/18.6 Safari/605.1.15`, "Safari 18", "macOS"],
    ["Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:144.0) Gecko/20100101 Firefox/144.0",
      "Firefox 144", "Windows"],
    [`${WIN}/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.3537.71`,
      "Edge 141", "Windows"],
    [`${WIN}/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 YaBrowser/25.8.0.0 Safari/537.36`,
      "Yandex Browser 25", "Windows"],
    [`${WIN}/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 OPR/124.0.0.0`,
      "Opera 124", "Windows"],
    [`${IPHONE}/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1`,
      "Safari 18", "iOS"],
    [`${IPHONE}/605.1.15 (KHTML, like Gecko) CriOS/141.0.7390.96 Mobile/15E148 Safari/604.1`,
      "Chrome 141", "iOS"],
    [`${IPHONE}/605.1.15 (KHTML, like Gecko) FxiOS/144.0 Mobile/15E148 Safari/605.1.15`,
      "Firefox 144", "iOS"],
    [`${IPHONE}/605.1.15 (KHTML, like Gecko) EdgiOS/141.0.3537.71 Mobile/15E148 Safari/605.1.15`,
      "Edge 141", "iOS"],
    [`${ANDROID}/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36`,
      "Chrome 141", "Android"],
    ["Mozilla/5.0 (Linux; Android 10; SM-G981B) AppleWebKit/537.36 (KHTML, like Gecko) "
      + "SamsungBrowser/28.0 Chrome/130.0.0.0 Mobile Safari/537.36", "Samsung Internet 28", "Android"],
    ["Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) "
      + "Chrome/141.0.0.0 Safari/537.36", "Chrome 141", "ChromeOS"],
    ["Mozilla/5.0 (X11; Linux x86_64; rv:144.0) Gecko/20100101 Firefox/144.0", "Firefox 144", "Linux"],
    ["Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) "
      + "HeadlessChrome/141.0.7390.37 Safari/537.36", "Chrome 141", "Linux"],
    // tTerm for Mac's own window says no browser.
    [`${MAC}/605.1.15 (KHTML, like Gecko)`, "", "macOS"],
    ["", "", ""],
  ];
  for (const [agent, browser, os] of cases) {
    assert.deepEqual(browserOf(agent), { browser, os }, agent);
  }
});

test("the line as the form shows it, and as it goes", () => {
  assert.equal(whereFrom(`${MAC}/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36`),
    "Chrome 141, macOS");
  assert.equal(whereFrom(`${MAC}/605.1.15 (KHTML, like Gecko)`), "macOS");
  assert.equal(whereFrom("curl/8.5.0"), "");
  assert.equal(detailsLine(["tTerm Web 0.1.25", "Chrome 141, macOS", "Free plan", "3 machines"]),
    "tTerm Web 0.1.25 · Chrome 141, macOS · Free plan · 3 machines");
  // What is not known is left out, not shown empty.
  assert.equal(detailsLine(["tTerm for Mac 0.8.0", "", " ", "not signed in"]),
    "tTerm for Mac 0.8.0 · not signed in");
  assert.equal(detailsLine(["tTerm for Mac ", "macOS"]), "tTerm for Mac · macOS");
});

test("an address that can be one", () => {
  for (const good of ["anna@example.com", "  anna@example.com ", "a@b.cd", "Bob.Smith+tterm@mail.example.org"]) {
    assert.ok(looksLikeEmail(good), good);
  }
  for (const bad of ["", "anna", "anna@example", "@example.com", "anna@.com.", "anna smith@example.com",
    "anna@exa mple.com"]) {
    assert.ok(!looksLikeEmail(bad), bad);
  }
});

test("the site, the channel and What's new, in the page's language", () => {
  assert.equal(sitePage("en"), "https://tterm.net/");
  assert.equal(sitePage("ru"), "https://tterm.net/ru/");
  assert.equal(sitePage("pt-BR", "download/"), "https://tterm.net/pt/download/");
  assert.equal(sitePage("zh-CN", "download/"), "https://tterm.net/zh/download/");
  assert.equal(TELEGRAM, "https://t.me/tTermBlog");
  assert.equal(whatsNewPage("en", "web"), "https://docs.tterm.net/whats-new/web/");
  assert.equal(whatsNewPage("en", "mac"), "https://docs.tterm.net/whats-new/mac/");
  assert.equal(whatsNewPage("ru", "mac"), "https://docs.tterm.net/ru/whats-new/mac/");
  assert.equal(whatsNewPage("pt-BR", "web"), "https://docs.tterm.net/pt/whats-new/web/");
});
