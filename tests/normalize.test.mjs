import assert from "node:assert/strict";
import test from "node:test";

import {
  normalize,
  stripSpaces,
  toTraditional,
} from "../src/utils/normalize.ts";

test("toTraditional：简化字按映射转成繁体", () => {
  assert.equal(toTraditional("发"), "發");
  assert.equal(toTraditional("后来"), "後來");
  assert.equal(toTraditional("里云"), "裡雲");
  assert.equal(toTraditional("广东白话报"), "廣東白話報");
});

test("toTraditional：未收录字符原样保留", () => {
  assert.equal(toTraditional("廣東白話報"), "廣東白話報");
  assert.equal(toTraditional("abc 123，。"), "abc 123，。");
});

test("stripSpaces：去掉全部空白", () => {
  assert.equal(stripSpaces("唔 係 你 好"), "唔係你好");
  assert.equal(stripSpaces("a\nb\tc"), "abc");
  assert.equal(stripSpaces("abc"), "abc");
});

test("normalize：先繁简归一再去空白", () => {
  assert.equal(normalize("广东 白话 报"), "廣東白話報");
  assert.equal(normalize("发现 后来"), "發現後來");
});
