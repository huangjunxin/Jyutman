import assert from "node:assert/strict";
import test from "node:test";

import worker from "../server/index.ts";

const ctx = { waitUntil() {}, passThroughOnException() {} };

/** D1 樁：記低 SQL 與綁定參數；命中查詢回罐頭行，COUNT 查詢回總數。 */
function createDb({ hits = [], total = 0 } = {}) {
  const calls = [];
  return {
    calls,
    prepare(sql) {
      return {
        bind(...params) {
          calls.push({ sql, params });
          return {
            async all() {
              return { results: hits, success: true };
            },
            async first() {
              return { total };
            },
            async run() {
              return { success: true, meta: { changes: 0 } };
            },
          };
        },
      };
    },
  };
}

const env = (db) => ({ DB: db, ASSETS: { fetch: async () => new Response("asset") } });

const row = (id) => ({
  id,
  corpus: "gd-vernacular-paper",
  issue: "issue-01",
  page: 9,
  title: null,
  text: "乜野叫做聖藥呢。白話報就係喇。",
});

const search = async (db, query) =>
  worker.fetch(new Request(`https://jyutman.com/api/search?${query}`), env(db), ctx);

test("GET /api/search：默認第 1 頁、page_size 20，LIMIT/OFFSET 正確", async () => {
  const db = createDb({ hits: [row("gdvp-01-009-01")], total: 426 });
  const response = await search(db, "q=%E5%94%94");
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.page, 1);
  assert.equal(body.page_size, 20);
  assert.equal(body.total, 426);
  assert.equal(body.results.length, 1);
  assert.equal(body.more, true, "426 條多過一頁");

  const hit = db.calls.find((call) => call.sql.includes("ORDER BY bm25"));
  assert.deepEqual(hit.params.slice(-2), [20, 0], "LIMIT 20 OFFSET 0");
  const count = db.calls.find((call) => call.sql.includes("COUNT(*)"));
  assert.ok(count, "另有 COUNT 查詢取總數");
  assert.ok(count.sql.includes("WHERE articles_unigram_fts MATCH ?"), "COUNT 用同一個索引與過濾");
});

test("GET /api/search：page=2 用 OFFSET 20，total 由 COUNT 查詢帶出", async () => {
  const db = createDb({ hits: [row("cvh-166-01")], total: 426 });
  const body = await (await search(db, "q=%E5%94%94&page=2")).json();
  assert.equal(body.page, 2);
  assert.equal(body.total, 426);
  const hit = db.calls.find((call) => call.sql.includes("ORDER BY bm25"));
  assert.deepEqual(hit.params.slice(-2), [20, 20]);
});

test("GET /api/search：page_size 可調、上限 50；越界或非法一律 400", async () => {
  const db = createDb({ hits: [], total: 0 });
  const custom = await search(db, "q=abc&page_size=50");
  assert.equal(custom.status, 200);
  assert.equal((await custom.json()).page_size, 50);
  assert.deepEqual(db.calls.find((call) => call.sql.includes("ORDER BY bm25")).params.slice(-2), [50, 0]);

  assert.equal((await search(createDb(), "q=abc&page_size=51")).status, 400);
  assert.equal((await search(createDb(), "q=abc&page=0")).status, 400);
  assert.equal((await search(createDb(), "q=abc&page=abc")).status, 400);
  assert.equal((await search(createDb(), "q=abc&page_size=-3")).status, 400);
});

test("GET /api/search：超出範圍嘅頁回空 results 但 total 照報", async () => {
  const db = createDb({ hits: [], total: 426 });
  const response = await search(db, "q=%E5%94%94&page=30");
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(body.results, []);
  assert.equal(body.total, 426);
  assert.equal(body.more, false, "30 × 20 > 426");
});

test("GET /api/search：corpus 過濾與分頁一齊落 SQL", async () => {
  const db = createDb({ hits: [row("gdvp-01-009-01")], total: 34 });
  const body = await (
    await search(db, "q=%E5%BB%A3%E6%9D%B1&page=2&corpus=gd-vernacular-paper")
  ).json();
  assert.equal(body.total, 34);
  const hit = db.calls.find((call) => call.sql.includes("ORDER BY bm25"));
  assert.ok(hit.sql.includes("a.corpus IN (?)"));
  assert.deepEqual(hit.params, ['seg : "廣東"', "gd-vernacular-paper", 20, 20]);
});
