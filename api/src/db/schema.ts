// Application tables. Timescale objects stay in sql/ and are not described here.

import { pgTable, uuid, text, timestamp } from 'drizzle-orm/pg-core';

export const users = pgTable(`users`, {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  password_hash: text('password_hash').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});
