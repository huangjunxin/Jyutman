import assert from "node:assert/strict";
import test from "node:test";

import { CANONICAL_HOST, decideHost, WWW_HOST } from "../src/utils/host-policy.ts";

test("decideHost：規範主機照常服務，唔加 noindex", () => {
  assert.deepEqual(decideHost("jyutman.com", "/read/gd-vernacular-paper/issue-01/003/"), {
    action: "pass",
    location: null,
    noindex: false,
  });
  assert.deepEqual(decideHost("JYUTMAN.COM", "/"), { action: "pass", location: null, noindex: false });
});

test("decideHost：www 別名 301 到規範主機，保留路徑與查詢串", () => {
  assert.deepEqual(decideHost("www.jyutman.com", "/search/", "?q=廣東&corpus=canton-vernacular-handbook"), {
    action: "redirect",
    location: "https://jyutman.com/search/?q=廣東&corpus=canton-vernacular-handbook",
    noindex: false,
  });
  assert.equal(decideHost("WWW.JYUTMAN.COM", "/browse/").location, "https://jyutman.com/browse/");
});

test("decideHost：workers.dev 預覽域照常服務，但一律加 noindex", () => {
  assert.deepEqual(decideHost("jyutman.huangjunxin.workers.dev", "/"), {
    action: "pass",
    location: null,
    noindex: true,
  });
  assert.equal(decideHost("abc-jyutman.huangjunxin.workers.dev", "/api/search").noindex, true);
  assert.equal(decideHost("jyutman.huangjunxin.workers.dev", "/api/search").action, "pass");
});

test("decideHost：異常主機（子域、直連 IP、惡意域）一律 301 回規範主機", () => {
  assert.deepEqual(decideHost("evil.example", "/"), {
    action: "redirect",
    location: "https://jyutman.com/",
    noindex: false,
  });
  assert.equal(decideHost("jyutman.com.evil.example", "/a/b", "?x=1").location, "https://jyutman.com/a/b?x=1");
  assert.equal(decideHost("203.0.113.9", "/search/").location, "https://jyutman.com/search/");
  assert.equal(decideHost("foo.jyutman.com", "/browse/").action, "redirect");
});

test("decideHost：本地開發主機放行，唔跳轉唔加 noindex", () => {
  for (const host of ["localhost", "127.0.0.1", "[::1]", "preview.localhost"]) {
    assert.deepEqual(decideHost(host, "/"), { action: "pass", location: null, noindex: false }, host);
  }
});

test("常量與文檔一致", () => {
  assert.equal(CANONICAL_HOST, "jyutman.com");
  assert.equal(WWW_HOST, "www.jyutman.com");
});
