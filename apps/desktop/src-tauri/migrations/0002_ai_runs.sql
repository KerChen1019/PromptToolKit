CREATE TABLE IF NOT EXISTS ai_runs (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  prompt_id TEXT,
  run_type TEXT NOT NULL CHECK(run_type IN ('generate','rewrite')),
  provider_id TEXT NOT NULL,
  model TEXT NOT NULL,
  input_json TEXT NOT NULL,
  output_json TEXT,
  status TEXT NOT NULL CHECK(status IN ('ok','error')),
  error_message TEXT,
  latency_ms INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (prompt_id) REFERENCES prompts(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ai_runs_project_time
ON ai_runs(project_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_runs_type_time
ON ai_runs(run_type, created_at DESC);

INSERT OR IGNORE INTO app_settings(key, value, updated_at)
VALUES ('default_llm_provider_id', '', datetime('now'));
