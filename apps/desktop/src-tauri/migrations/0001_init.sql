PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  global_suffix TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS prompts (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  title TEXT NOT NULL,
  current_draft TEXT NOT NULL DEFAULT '',
  current_version_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS prompt_versions (
  id TEXT PRIMARY KEY,
  prompt_id TEXT NOT NULL,
  raw_text TEXT NOT NULL,
  commit_message TEXT,
  operator TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (prompt_id) REFERENCES prompts(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS snippets (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  name TEXT NOT NULL,
  scope TEXT NOT NULL CHECK(scope IN ('prefix','suffix','free')),
  content TEXT NOT NULL,
  tags_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS prompt_snippet_links (
  id TEXT PRIMARY KEY,
  prompt_version_id TEXT NOT NULL,
  snippet_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (prompt_version_id) REFERENCES prompt_versions(id) ON DELETE CASCADE,
  FOREIGN KEY (snippet_id) REFERENCES snippets(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS reference_assets (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  source_path TEXT NOT NULL,
  stored_path TEXT NOT NULL,
  file_hash TEXT NOT NULL,
  width INTEGER,
  height INTEGER,
  linked_prompt_version_id TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS tags (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(project_id, name),
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS reference_asset_tags (
  id TEXT PRIMARY KEY,
  reference_asset_id TEXT NOT NULL,
  tag_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(reference_asset_id, tag_id),
  FOREIGN KEY (reference_asset_id) REFERENCES reference_assets(id) ON DELETE CASCADE,
  FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS copy_events (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  prompt_id TEXT NOT NULL,
  prompt_version_id TEXT NOT NULL,
  copied_at TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  plain_text TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS outputs (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  source_path TEXT NOT NULL,
  stored_path TEXT NOT NULL,
  model_hint TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS output_attributions (
  id TEXT PRIMARY KEY,
  output_id TEXT NOT NULL,
  prompt_version_id TEXT NOT NULL,
  score INTEGER NOT NULL,
  reason TEXT NOT NULL,
  confirmed INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  FOREIGN KEY (output_id) REFERENCES outputs(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS ai_provider_secrets_ref (
  id TEXT PRIMARY KEY,
  key_name TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ai_providers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  kind TEXT NOT NULL,
  base_url TEXT NOT NULL,
  model TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  secret_ref_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (secret_ref_id) REFERENCES ai_provider_secrets_ref(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_prompts_project ON prompts(project_id);
CREATE INDEX IF NOT EXISTS idx_prompt_versions_prompt ON prompt_versions(prompt_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_snippets_project_scope ON snippets(project_id, scope);
CREATE INDEX IF NOT EXISTS idx_reference_assets_project ON reference_assets(project_id);
CREATE INDEX IF NOT EXISTS idx_copy_events_project_time ON copy_events(project_id, copied_at DESC);
CREATE INDEX IF NOT EXISTS idx_outputs_project_time ON outputs(project_id, created_at DESC);
