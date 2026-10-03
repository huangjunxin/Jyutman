import assert from "node:assert/strict";
import test from "node:test";

import worker from "../server/index.ts";

const htmlResponse = () =>
  new Response("<html>ok</html>", { status: 200, headers: { "content-type": "text/html" } });

const env = {
  DB: {
    prepare: (sql) => ({
      bind: () => ({
        all: async () => ({
          results: sql.includes("COUNT(*)")
            ? []
            : [
                {
                  id: "gdvp-01-009-01",
                  corpus: "gd-vernacular-paper",
                  issue: "issue-01",
                  page: 9,
                  title: null,
                  text: "乜野叫做聖藥呢。白話報就係喇。",
                },
              ],
        }),
        first: async () => ({ total: 1 }),
      }),
    }),
  },
  ASSETS: { fetch: async () => htmlResponse() },
};

const ctx = { waitUntil() {}, passThroughOnException() {} };

test("Worker：規範主機直出資產，唔加 noindex", async () => {
  const response = await worker.fetch(new Request("https://jyutman.com/read/gd-vernacular-paper/issue-01/009/"), env, ctx);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("X-Robots-Tag"), null);
  assert.equal(await response.text(), "<html>ok</html>");
});

test("Worker：workers.dev 預覽域所有響應加 X-Robots-Tag: noindex", async () => {
  const page = await worker.fetch(new Request("https://jyutman.huangjunxin.workers.dev/"), env, ctx);
  assert.equal(page.status, 200);
  assert.equal(page.headers.get("X-Robots-Tag"), "noindex");
  assert.equal(await page.text(), "<html>ok</html>", "加頭之後正文照舊");

  const api = await worker.fetch(
    new Request("https://jyutman.huangjunxin.workers.dev/api/search?q=白話報"),
    env,
    ctx,
  );
  assert.equal(api.status, 200);
  assert.equal(api.headers.get("X-Robots-Tag"), "noindex");
  const payload = await api.json();
  assert.equal(payload.results[0].highlight, "白話報");
});

test("Worker：www 與異常主機 301 回規範主機，保留路徑與查詢串", async () => {
  const www = await worker.fetch(new Request("https://www.jyutman.com/search/?q=廣東"), env, ctx);
  assert.equal(www.status, 301);
  assert.equal(
    www.headers.get("location"),
    "https://jyutman.com/search/?q=%E5%BB%A3%E6%9D%B1",
    "查詢串按原編碼照搬（URL 正規化後為 percent-encoding）",
  );

  const evil = await worker.fetch(new Request("https://evil.example/browse/"), env, ctx);
  assert.equal(evil.status, 301);
  assert.equal(evil.headers.get("location"), "https://jyutman.com/browse/");
});

test("Worker：/api 走 Hono，未知接口返回 JSON 404", async () => {
  const response = await worker.fetch(new Request("https://jyutman.com/api/nope"), env, ctx);
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { error: "無此接口" });
});

test("Worker：/api/search 響應形狀含 pre/highlight/post", async () => {
  const response = await worker.fetch(new Request("https://jyutman.com/api/search?q=白話報"), env, ctx);
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.mode, "trigram");
  assert.deepEqual(payload.results[0], {
    id: "gdvp-01-009-01",
    corpus: "gd-vernacular-paper",
    issue: "issue-01",
    page: 9,
    title: null,
    pre: "乜野叫做聖藥呢。",
    highlight: "白話報",
    post: "就係喇。",
  });
});
