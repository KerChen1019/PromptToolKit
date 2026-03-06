import {
  integer,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";

export const projects = sqliteTable("projects", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  globalSuffix: text("global_suffix").notNull().default(""),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const prompts = sqliteTable("prompts", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull(),
  title: text("title").notNull(),
  currentDraft: text("current_draft").notNull().default(""),
  currentVersionId: text("current_version_id"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const promptVersions = sqliteTable("prompt_versions", {
  id: text("id").primaryKey(),
  promptId: text("prompt_id").notNull(),
  rawText: text("raw_text").notNull(),
  commitMessage: text("commit_message"),
  operator: text("operator").notNull(),
  createdAt: text("created_at").notNull(),
});

export const snippets = sqliteTable("snippets", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull(),
  name: text("name").notNull(),
  scope: text("scope").notNull(),
  content: text("content").notNull(),
  tagsJson: text("tags_json").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const referenceAssets = sqliteTable("reference_assets", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull(),
  sourcePath: text("source_path").notNull(),
  storedPath: text("stored_path").notNull(),
  fileHash: text("file_hash").notNull(),
  width: integer("width"),
  height: integer("height"),
  linkedPromptVersionId: text("linked_prompt_version_id"),
  createdAt: text("created_at").notNull(),
});
