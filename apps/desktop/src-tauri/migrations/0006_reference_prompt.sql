ALTER TABLE reference_assets ADD COLUMN prompt_id TEXT REFERENCES prompts(id) ON DELETE SET NULL;
