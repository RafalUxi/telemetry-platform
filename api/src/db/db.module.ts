// The Drizzle instance, shared by the whole application.

import { Module } from '@nestjs/common';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from './schema.js';

export const DB = Symbol('DB'); // Token under which the module exposes the instance

@Module({
  providers: [
    {
      provide: DB,
      useFactory: () => {
        const pool = new Pool({
          connectionString:
            process.env.DATABASE_URL ??
            'postgres://telemetry:local-dev-only@localhost:5432/telemetry',
        });
        return drizzle(pool, { schema });
      },
    },
  ],
  exports: [DB],
})
export class DbModule {}
