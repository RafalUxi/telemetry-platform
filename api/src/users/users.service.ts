// Users: the storage side. Logging in and tokens live in the auth module (next unit).

// [users] - .returning() always yields an array, even for one row; [users] takes its first element.

import { Injectable, Inject, ConflictException } from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as argon2 from 'argon2';
import { DB } from '../db/db.module.js';
import * as schema from '../db/schema.js';

@Injectable()
export class UsersService {
  constructor(@Inject(DB) private readonly db: NodePgDatabase<typeof schema>) {}

  async create(email: string, password: string) {
    const passwordHash = await argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: 19456,
      timeCost: 2,
      parallelism: 1,
    });

    try {
      const [users] = await this.db
        .insert(schema.users)
        .values({ email: email, password_hash: passwordHash })
        .returning({ id: schema.users.id, email: schema.users.email });
      return users;
    } catch (err) {
      if ((err as { cause?: { code?: string } }).cause?.code === '23505') {
        throw new ConflictException('email already registered');
      }
      throw err;
    }
  }
}
