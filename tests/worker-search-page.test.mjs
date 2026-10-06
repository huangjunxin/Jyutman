import assert from "node:assert/strict";
import test from "node:test";

import worker from "../server/index.ts";

const ctx = { waitUntil() {}, passThroughOnException() {} };

/**
 * D1 樁：記低 SQL 與綁定參數；命中查詢回罐頭行，GROUP BY 查詢回逐語料篇數。
 * 只傳 total 時當全部命中都喺廣東白話報。
 */
function createDb({ hits = [], total = 0, facets = { "gd-vernacular-paper": total } } = {}) {
  const facetRows = Object.entries(facets).map(([corpus, n]) => ({ corpus, n }));
  const calls = [];
  return {
    calls,
    prepare(sql) {
      return {
        bind(...params) {
          calls.push({ sql, params });
          return {
            async all() {
              return { results: sql.includes("GROUP BY a.corpus") ? facetRows : hits, success: true };
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
  status: "verified",
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
  const count = db.calls.find((call) => call.sql.includes("GROUP BY a.corpus"));
  assert.ok(count, "另有 GROUP BY 查詢取逐語料篇數");
  assert.ok(count.sql.includes("WHERE articles_unigram_fts MATCH ?"), "計數用同一個索引");
  assert.equal(body.results[0].status, "verified", "命中帶頁級 status");
  assert.deepEqual(body.facets, { "gd-vernacular-paper": 426 });
});

test("GET /api/search：page=2 用 OFFSET 20，total 由計數查詢帶出", async () => {
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

test("GET /api/search：facets 唔受 corpus 過濾影響，total 只計篩選中嘅語料", async () => {
  const facets = { "gd-vernacular-paper": 71, "canton-vernacular-handbook": 1 };
  const db = createDb({ hits: [row("gdvp-01-003-01")], facets });
  const all = await (await search(db, "q=%E5%B9%BF%E4%B8%9C")).json();
  assert.equal(all.total, 72, "冇過濾：全部語料加埋");
  assert.deepEqual(all.facets, facets);

  const filteredDb = createDb({ hits: [row("cvh-020-01")], facets });
  const filtered = await (
    await search(filteredDb, "q=%E5%B9%BF%E4%B8%9C&corpus=canton-vernacular-handbook")
  ).json();
  assert.equal(filtered.total, 1, "過濾後只計 cvh");
  assert.deepEqual(filtered.facets, facets, "pill 計數照舊係全庫");
  const count = filteredDb.calls.find((call) => call.sql.includes("GROUP BY a.corpus"));
  assert.ok(!count.sql.includes("a.corpus IN"), "計數查詢唔加 corpus 過濾");
  assert.deepEqual(count.params, ['seg : "廣東"']);
  assert.ok(filteredDb.calls.find((call) => call.sql.includes("ORDER BY bm25")).sql.includes("a.status"));
});
