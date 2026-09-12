// Drizzle Kit configuration: where the schema lives, where migrations are written.

import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './drizzle',
  dbCredentials: {
    url:
      process.env.DATABASE_URL ??
      'postgres://telemetry:local-dev-only@localhost:5432/telemetry',
  },
});
