// The space between two sentences or words put side by side (src/gap.ts,
// i18n.ts's gap()): a space in the languages that write with spaces, none
// in Chinese and Japanese, but where Latin letters or digits touch. Node
// runs it as it is (type stripping):
//
//   node --test tests/gap.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";

import { gapIn } from "../src/gap.ts";

test("languages that write with spaces get one", () => {
  assert.equal(gapIn("en", "Opens on Chrome on macOS.", "Add another Mac or browser…"), " ");
  assert.equal(gapIn("en", "or", "approve on MacBook-Pro-Denis"), " ");
  assert.equal(gapIn("ko", "macOS의 Chrome에서 열립니다.", "다른 Mac이나 브라우저를…"), " ");
  for (const lang of ["de", "es", "fr", "it", "pl", "pt-BR", "tr", "ru", "ko"] as const) {
    assert.equal(gapIn(lang, "Eins.", "Zwei."), " ", lang);
  }
});

test("Chinese and Japanese get none between their own characters", () => {
  assert.equal(gapIn("zh-CN", "在 macOS 上的 Chrome 中打开。", "你可以在…"), "");
  assert.equal(gapIn("zh-CN", "或", "使用恢复码"), "");
  assert.equal(gapIn("ja", "macOS の Chrome で開きます。", "ほかの Mac やブラウザーは…"), "");
  assert.equal(gapIn("ja", "または", "復旧コードを使う"), "");
});

test("but a space where Latin letters or digits touch", () => {
  assert.equal(gapIn("zh-CN", "或", "MacBook-Pro-Denis 上批准"), " ");
  assert.equal(gapIn("ja", "または", "MacBook-Pro-Denis で承認"), " ");
  assert.equal(gapIn("zh-CN", "打开 Chrome", "中的"), " ");
  assert.equal(gapIn("zh-CN", "共 24", "台"), " ");
  assert.equal(gapIn("ja", "あと", "2 分"), " ");
});
