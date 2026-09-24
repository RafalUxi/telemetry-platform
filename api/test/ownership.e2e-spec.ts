import request from 'supertest';
import { DB } from '../src/db/db.module.js';
import * as schema from '../src/db/schema.js';
import { eq } from 'drizzle-orm';
import { Stanowisko } from './harness.js';
import { startStanowisko } from './harness.js';
import { Server } from 'http';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';

let s: Stanowisko;
let http: Server;
let db: NodePgDatabase<typeof schema>;

beforeAll(async () => {
  s = await startStanowisko();
  http = s.app.getHttpServer();
  db = s.app.get<NodePgDatabase<typeof schema>>(DB);
}, 240_000);

export async function konto(email: string) {
  // Tu zwraca id i email
  await request(http)
    .post('/users')
    .send({ email, password: 'haslo12345' })
    .expect(201);

  // zwraca { accessToken, refreshToken }
  const l = await request(http)
    .post('/auth/login')
    .send({ email, password: 'haslo12345' })
    .expect(200);

  return l.body.accessToken;
}

it('B nie widzi urzadzenia A', async () => {
  const email_A = 'a@test.local';
  const email_B = 'b@test.local';
  const token_A = await konto(email_A);
  const token_B = await konto(email_B);

  const [user] = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.email, email_A));

  const [dev] = await db
    .insert(schema.devices)
    .values({ user_id: user.id, device_id: 'dev-testowe', name: 'kotlownia' })
    .returning({ id: schema.devices.id });

  const listaA = await request(http)
    .get('/devices')
    .set('authorization', `Bearer ${token_A}`)
    .expect(200);
  expect(listaA.body).toHaveLength(1);

  const listaB = await request(http)
    .get('/devices')
    .set('authorization', `Bearer ${token_B}`)
    .expect(200);
  expect(listaB.body).toHaveLength(0);

  await request(http)
    .get(
      `/devices/${dev.id}/series?from=2026-01-01T00:00:00Z&to=2026-01-02T00:00:00Z&points=10`,
    )
    .set('authorization', `Bearer ${token_B}`)
    .expect(404);

  await request(http)
    .delete(`/devices/${dev.id}`)
    .set('authorization', `Bearer ${token_B}`)
    .expect(404);
}, 60_000);

afterAll(async () => {
  if (s) {
    await s.stop();
  }
}, 60_000);
