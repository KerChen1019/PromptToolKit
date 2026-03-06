import type { Config } from "drizzle-kit";

export default {
  out: "./drizzle/migrations",
  schema: "./drizzle/schema.ts",
  dialect: "sqlite",
  dbCredentials: {
    url: "./src-tauri/dev-placeholder.db",
  },
} satisfies Config;
