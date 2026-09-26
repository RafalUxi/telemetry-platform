import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { DB } from './db/db.module.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const db = app.get(DB);
  await migrate(db, { migrationsFolder: 'drizzle' });
  app.enableCors({ origin: ['http://localhost:4301'] });
  await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();
