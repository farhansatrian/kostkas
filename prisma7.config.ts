// In production container environment variables are injected directly; in dev dotenv is loaded if present
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require("dotenv/config");
} catch {
  // no-op if dotenv is not present
}
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "./node_modules/.bin/jiti prisma/seed.ts",
  },
  datasource: {
    url: process.env["DATABASE_URL"],
  },
});

