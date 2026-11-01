// Where the page runs (src/platform.ts): tTerm for Mac is offered only in a
// Mac's browser (0.1.18).
//
//   node --test tests/platform.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { macBrowser } from "../src/platform.ts";

const MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";
const SAFARI_MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15";
const WINDOWS = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";
const LINUX = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1";

test("a Mac's browsers are a Mac", () => {
  assert.equal(macBrowser(MAC, 0), true);
  assert.equal(macBrowser(SAFARI_MAC, 0), true);
});

test("Windows, Linux and the iPhone are not", () => {
  assert.equal(macBrowser(WINDOWS, 0), false);
  assert.equal(macBrowser(LINUX, 0), false);
  assert.equal(macBrowser(IPHONE, 5), false);
});

test("an iPad that says Macintosh is not: it has a touch screen", () => {
  assert.equal(macBrowser(SAFARI_MAC, 5), false);
});
