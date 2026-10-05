import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const css = readFileSync(new URL("../src/styles/global.css", import.meta.url), "utf8");

test("全域 CSS：appearance 重置唔可以落喺裸 input 選擇器（會令 checkbox 隱形）", () => {
  const blocks = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/gu)];
  const offenders = [];
  for (const [, selector, body] of blocks) {
    if (!/appearance\s*:\s*none/u.test(body)) continue;
    for (const part of selector.split(",")) {
      const trimmed = part.trim();
      if (!/(^|[\s>+~])input(\b|$)/u.test(trimmed)) continue;
      if (trimmed.includes("::")) continue; // 偽元素（如 ::-webkit-search-cancel-button）唔算裸 input
      if (/input\[type=/u.test(trimmed)) continue;
      offenders.push(trimmed);
    }
  }
  assert.deepEqual(offenders, [], `以下選擇器會令 checkbox 無咗外觀：${offenders.join(" | ")}`);
});
