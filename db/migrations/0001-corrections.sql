-- 校對上報表（docs/03 第 7 節）：一次性建立。
-- 執行：npx wrangler d1 execute jyutman --remote --file db/migrations/0001-corrections.sql
-- 重跑安全（IF NOT EXISTS）；status 取值 pending / accepted / rejected / deferred。

CREATE TABLE IF NOT EXISTS corrections (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  article_id      TEXT NOT NULL,
  page_id         TEXT,
  span_start      INTEGER,
  span_end        INTEGER,
  fragment        TEXT NOT NULL,
  selected_text   TEXT NOT NULL,
  paragraph_index INTEGER,
  type            TEXT NOT NULL,
  suggestion      TEXT,
  note            TEXT,
  status          TEXT NOT NULL DEFAULT 'pending',
  created_at      TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_corrections_fragment ON corrections (fragment);
CREATE INDEX IF NOT EXISTS idx_corrections_article ON corrections (article_id);
CREATE INDEX IF NOT EXISTS idx_corrections_status ON corrections (status);
