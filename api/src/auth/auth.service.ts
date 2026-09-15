import { Injectable, Inject } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DB } from '../db/db.module.js';
import * as schema from '../db/schema.js';
import { randomBytes, createHash } from 'node:crypto';

@Injectable()
export class AuthService {
  constructor(
    @Inject(DB) private readonly db: NodePgDatabase<typeof schema>,
    private readonly jwt: JwtService,
  ) {}

  private async issueTokens(userId: string) {
    const refreshToken = randomBytes(32).toString('base64url');
    const hash = createHash('sha256').update(refreshToken).digest('hex');
    await this.db
      .insert(schema.usersSession)
      .values({ user_id: userId, tokenHash: hash });

    const accessToken = await this.jwt.signAsync({ sub: userId });
    return { accessToken, refreshToken };
  }
}
