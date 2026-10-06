import assert from "node:assert/strict";
import test from "node:test";

import { leadExcerpt } from "../src/utils/excerpt.ts";

test("leadExcerpt：跳過署名段，截到第 N 字之後嘅句末標點，下標對返正文", () => {
  const text = "（亞拙）\n\n哈哈。有個咁嘅野窩。哈哈哈。有個咁嘅古怪野窩。\n\n第二段。";
  assert.deepEqual(leadExcerpt(text, 5), { text: "哈哈。有個咁嘅野窩。", start: 6 });
  assert.deepEqual(leadExcerpt(text, 3), { text: "哈哈。有個咁嘅野窩。", start: 6 });
  assert.deepEqual(leadExcerpt(text, 2), { text: "哈哈。", start: 6 });
});

test("leadExcerpt：段落唔夠長或冇句末標點就成段返回；冇正文返回 null", () => {
  assert.deepEqual(leadExcerpt("短句。", 30), { text: "短句。", start: 0 });
  assert.deepEqual(leadExcerpt("冇標點嘅一段", 2), { text: "冇標點嘅一段", start: 0 });
  assert.deepEqual(leadExcerpt("𠮶字。之後", 1), { text: "𠮶字。", start: 0 });
  assert.equal(leadExcerpt("（署名）", 2), null);
  assert.equal(leadExcerpt("", 2), null);
});
