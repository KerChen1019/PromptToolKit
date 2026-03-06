ALTER TABLE outputs ADD COLUMN prompt_id TEXT;

CREATE INDEX IF NOT EXISTS idx_outputs_project_prompt ON outputs(project_id, prompt_id, created_at DESC);
