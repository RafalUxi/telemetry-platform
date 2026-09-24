// Stanowisko testowe: prawdziwy Postgres i prawdziwy broker w kontenerach.

import { PostgreSqlContainer } from '@testcontainers/postgresql';
import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { GenericContainer } from 'testcontainers';
import type { StartedTestContainer } from 'testcontainers';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import { AppModule } from '../src/app.module.js';
import { DB } from '../src/db/db.module.js';

export interface Stanowisko {
  app: INestApplication;
  baza: StartedPostgreSqlContainer;
  broker: StartedTestContainer;
  stop: () => Promise<void>;
}

export async function startStanowisko(): Promise<Stanowisko> {
  const baza = await new PostgreSqlContainer(
    'timescale/timescaledb:latest-pg17',
  ).start();

  const broker = await new GenericContainer('eclipse-mosquitto:2')
    .withExposedPorts(1883)
    .withCommand(['mosquitto', '-c', '/mosquitto-no-auth.conf'])
    .start();

  // Zmienne musza byc ustawione ZANIM Nest zbuduje providery -
  // DbModule i JwtModule czytaja process.env w useFactory.
  process.env.DATABASE_URL = baza.getConnectionUri();
  process.env.MQTT_URL = `mqtt://${broker.getHost()}:${broker.getMappedPort(1883)}`;
  process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'test-secret';
  process.env.MQTT_ADMIN_USERNAME = 'test';
  process.env.MQTT_ADMIN_PASSWORD = 'test';

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  await migrate(drizzle(pool), { migrationsFolder: 'drizzle' });
  await pool.end();

  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleRef.createNestApplication();
  await app.init();

  return {
    app,
    baza,
    broker,
    stop: async () => {
      await app.close();
      // Pula pg nie jest zamykana przez Nest (DbModule nie ma onModuleDestroy),
      // a zywe polaczenie w chwili gaszenia kontenera daje FATAL 57P01.
      await (
        app.get(DB) as { $client: { end: () => Promise<void> } }
      ).$client.end();
      await broker.stop();
      await baza.stop();
    },
  };
}
