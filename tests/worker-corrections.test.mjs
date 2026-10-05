import assert from "node:assert/strict";
import test from "node:test";

import worker from "../server/index.ts";
import { bearerToken, safeEqual } from "../server/lib/auth.ts";

const ADMIN = "test-admin-token";

/** D1 樁：記低每次 prepare/bind，按 SQL 內容回罐頭結果。 */
function createDb(overrides = {}) {
  const calls = [];
  const db = {
    calls,
    prepare(sql) {
      return {
        bind(...params) {
          calls.push({ sql, params });
          return {
            async all() {
              return { results: overrides.all?.(sql, params) ?? [], success: true };
            },
            async first() {
              return overrides.first?.(sql, params) ?? null;
            },
            async run() {
              return overrides.run?.(sql, params) ?? { success: true, meta: { last_row_id: 1, changes: 1 } };
            },
          };
        },
      };
    },
  };
  return db;
}

function makeEnv(db, token = ADMIN) {
  return {
    DB: db,
    ASSETS: { fetch: async () => new Response("asset") },
    ADMIN_TOKEN: token,
  };
}

const ctx = { waitUntil() {}, passThroughOnException() {} };

const validPayload = {
  article_id: "gdvp-01-009-01",
  selected_text: "聖藥",
  fragment: "乜野叫做聖藥呢。白話報就係喇。",
  type: "錯字",
  suggestion: "似係「聖葯」",
  paragraph_index: 1,
};

const post = (path, body, env, headers = {}) =>
  worker.fetch(
    new Request(`https://jyutman.com${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
    }),
    env,
    ctx,
  );

test("POST /api/correct：有效上報寫入 pending，page_id 由文章推出", async () => {
  const db = createDb({
    first: (sql) => (sql.includes("FROM articles") ? { corpus: "gd-vernacular-paper", issue: "issue-01", page: 9 } : null),
    run: () => ({ success: true, meta: { last_row_id: 42, changes: 1 } }),
  });
  const response = await post("/api/correct", validPayload, makeEnv(db));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, id: 42 });
  assert.equal(response.headers.get("Cache-Control"), "no-store");

  const insert = db.calls.find((call) => call.sql.includes("INSERT INTO corrections"));
  assert.ok(insert, "有寫入 corrections");
  assert.equal(insert.params[0], "gdvp-01-009-01");
  assert.equal(insert.params[1], "gd-vernacular-paper/issue-01/009", "page_id 由 articles 推出");
  assert.equal(insert.params[2], validPayload.fragment);
  assert.equal(insert.params[3], "聖藥");
  assert.equal(insert.params[4], 1);
  assert.equal(insert.params[5], "錯字");
  assert.equal(insert.params[6], "似係「聖葯」");
  assert.equal(insert.params[7], null, "冇送區間就寫 NULL（舊客戶端照用得）");
  assert.equal(insert.params[8], null);
  assert.ok(insert.sql.includes("'pending'"), "狀態寫死 pending");
  assert.ok(!insert.sql.includes("submitter"), "匿名制，唔存任何提交者資料");
});

test("POST /api/correct：span_start / span_end 寫入區間欄位", async () => {
  const db = createDb();
  const response = await post("/api/correct", { ...validPayload, span_start: 12, span_end: 14 }, makeEnv(db));
  assert.equal(response.status, 200);
  const insert = db.calls.find((call) => call.sql.includes("INSERT INTO corrections"));
  assert.match(insert.sql, /suggestion, span_start, span_end/u);
  assert.equal(insert.params[7], 12);
  assert.equal(insert.params[8], 14);

  const empty = createDb();
  const same = await post("/api/correct", { ...validPayload, span_start: "5", span_end: "5", website: "" }, makeEnv(empty));
  assert.equal(same.status, 200, "起點等於終點、數字字串都接受");
  const row = empty.calls.find((call) => call.sql.includes("INSERT INTO corrections"));
  assert.deepEqual([row.params[7], row.params[8]], [5, 5]);

  const nulls = createDb();
  assert.equal((await post("/api/correct", { ...validPayload, span_start: null, span_end: null }, makeEnv(nulls))).status, 200);
});

test("POST /api/correct：區間唔合法一律 400，唔寫入", async () => {
  const db = createDb();
  const env = makeEnv(db);
  const cases = [
    { span_start: 3 },
    { span_end: 3 },
    { span_start: 9, span_end: 3 },
    { span_start: -1, span_end: 3 },
    { span_start: 0, span_end: 100001 },
    { span_start: 1.5, span_end: 3 },
    { span_start: "一", span_end: 3 },
  ];
  for (const span of cases) {
    const response = await post("/api/correct", { ...validPayload, ...span }, env);
    assert.equal(response.status, 400, JSON.stringify(span));
    assert.match((await response.json()).error, /區間/u);
  }
  assert.equal(db.calls.length, 0, "校驗失敗時唔會寫入");
});

test("POST /api/correct：缺欄位或類型唔合法一律 400", async () => {
  const db = createDb();
  const env = makeEnv(db);

  const missing = await post("/api/correct", { ...validPayload, selected_text: "" }, env);
  assert.equal(missing.status, 400);
  assert.match((await missing.json()).error, /所選文字/u);

  const badType = await post("/api/correct", { ...validPayload, type: "亂寫" }, env);
  assert.equal(badType.status, 400);
  assert.match((await badType.json()).error, /問題類型/u);

  const badIndex = await post("/api/correct", { ...validPayload, paragraph_index: -3 }, env);
  assert.equal(badIndex.status, 400);

  const tooLong = await post("/api/correct", { ...validPayload, fragment: "字".repeat(700) }, env);
  assert.equal(tooLong.status, 400);

  const notJson = await worker.fetch(
    new Request("https://jyutman.com/api/correct", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "唔係 JSON",
    }),
    env,
    ctx,
  );
  assert.equal(notJson.status, 400);
  assert.equal(db.calls.length, 0, "校驗失敗時唔會寫入");
});

test("POST /api/correct：蜜罐填咗即當成功但唔入庫", async () => {
  const db = createDb();
  const response = await post("/api/correct", { ...validPayload, website: "https://spam.example" }, makeEnv(db));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, id: null });
  assert.equal(db.calls.length, 0, "蜜罐命中時零 SQL");
});

test("GET /api/reports：返回該篇待審上報形狀", async () => {
  const db = createDb({
    all: () => [
      {
        id: 7,
        fragment: "乜野叫做聖藥呢。白話報就係喇。",
        selected_text: "聖藥",
        paragraph_index: 1,
        type: "錯字",
        suggestion: null,
        created_at: "2026-10-03T00:00:00.000Z",
      },
    ],
  });
  const response = await worker.fetch(
    new Request("https://jyutman.com/api/reports?article_id=gdvp-01-009-01"),
    makeEnv(db),
    ctx,
  );
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.article_id, "gdvp-01-009-01");
  assert.equal(body.reports.length, 1);
  assert.deepEqual(Object.keys(body.reports[0]).sort(), [
    "created_at",
    "fragment",
    "id",
    "paragraph_index",
    "selected_text",
    "suggestion",
    "type",
  ]);
  assert.equal((await worker.fetch(new Request("https://jyutman.com/api/reports"), makeEnv(db), ctx)).status, 400);
});

test("GET /api/queue：無 token 或錯 token 一律 401，正確 token 見隊列", async () => {
  const db = createDb({
    all: () => [
      {
        id: 3,
        article_id: "gdvp-01-009-01",
        page_id: "gd-vernacular-paper/issue-01/009",
        type: "錯字",
        fragment: "乜野叫做聖藥呢。",
        selected_text: "聖藥",
        paragraph_index: 1,
        suggestion: "似係「聖葯」",
        note: null,
        status: "pending",
        created_at: "2026-10-03T00:00:00.000Z",
        corpus: "gd-vernacular-paper",
        issue: "issue-01",
        page: 9,
        title: "白話報係中國人嘅聖藥",
      },
    ],
  });

  const anon = await worker.fetch(new Request("https://jyutman.com/api/queue"), makeEnv(db), ctx);
  assert.equal(anon.status, 401);

  const wrong = await worker.fetch(
    new Request("https://jyutman.com/api/queue", { headers: { authorization: "Bearer wrong-token" } }),
    makeEnv(db),
    ctx,
  );
  assert.equal(wrong.status, 401);

  const ok = await worker.fetch(
    new Request("https://jyutman.com/api/queue?status=pending&corpus=gd-vernacular-paper", {
      headers: { authorization: `Bearer ${ADMIN}` },
    }),
    makeEnv(db),
    ctx,
  );
  assert.equal(ok.status, 200);
  const body = await ok.json();
  assert.equal(body.items.length, 1);
  assert.equal(body.items[0].corpus, "gd-vernacular-paper");
  assert.equal(body.items[0].page, 9);
  const select = db.calls.find((call) => call.sql.includes("LEFT JOIN articles"));
  assert.deepEqual(select.params, ["pending", "gd-vernacular-paper"], "status / corpus 兩個過濾都落 SQL");
});

test("POST /api/adjudicate：需維護權杖；正確 token 更新狀態", async () => {
  const db = createDb({ run: () => ({ success: true, meta: { changes: 1 } }) });
  const env = makeEnv(db);

  assert.equal((await post("/api/adjudicate", { id: 3, action: "accept" }, env)).status, 401);
  assert.equal(
    (await post("/api/adjudicate", { id: 3, action: "accept" }, env, { authorization: "Bearer wrong" })).status,
    401,
  );

  const ok = await post("/api/adjudicate", { id: 3, action: "accept" }, env, {
    authorization: `Bearer ${ADMIN}`,
  });
  assert.equal(ok.status, 200);
  assert.deepEqual(await ok.json(), { ok: true, id: 3, status: "accepted" });
  const update = db.calls.find((call) => call.sql.includes("UPDATE corrections"));
  assert.deepEqual(update.params, ["accepted", 3]);

  const defer = await post("/api/adjudicate", { id: 3, action: "defer" }, env, {
    authorization: `Bearer ${ADMIN}`,
  });
  assert.deepEqual(await defer.json(), { ok: true, id: 3, status: "deferred" });

  const badAction = await post("/api/adjudicate", { id: 3, action: "destroy" }, env, {
    authorization: `Bearer ${ADMIN}`,
  });
  assert.equal(badAction.status, 400);

  const missing = await post("/api/adjudicate", { id: 999, action: "reject" }, makeEnv(createDb({ run: () => ({ success: true, meta: { changes: 0 } }) })), {
    authorization: `Bearer ${ADMIN}`,
  });
  assert.equal(missing.status, 404);
});

test("safeEqual 與 bearerToken：定長比較與標頭解析", () => {
  assert.equal(safeEqual("abc", "abc"), true);
  assert.equal(safeEqual("abc", "abd"), false);
  assert.equal(safeEqual("abc", "abcd"), false);
  assert.equal(bearerToken("Bearer token-123"), "token-123");
  assert.equal(bearerToken("bearer  spaced"), "spaced");
  assert.equal(bearerToken("Basic token"), null);
  assert.equal(bearerToken(undefined), null);
});

test("維護接口未設 ADMIN_TOKEN 時一律 401", async () => {
  const db = createDb();
  const env = { ...makeEnv(db), ADMIN_TOKEN: undefined };
  const response = await worker.fetch(
    new Request("https://jyutman.com/api/queue", { headers: { authorization: `Bearer ${ADMIN}` } }),
    env,
    ctx,
  );
  assert.equal(response.status, 401);
});
