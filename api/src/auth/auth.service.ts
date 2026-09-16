import { Injectable, Inject, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DB } from '../db/db.module.js';
import * as schema from '../db/schema.js';
import { randomBytes, createHash } from 'node:crypto';
import { eq } from 'drizzle-orm';
import * as argon2 from 'argon2';
import { get } from 'node:http';

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

  public async login(email: string, password: string) {
    const [data] = await this.db
      .select({
        id: schema.users.id,
        password: schema.users.password_hash,
      })
      .from(schema.users)
      .where(eq(schema.users.email, email))
      .limit(1);

    if (!data) {
      await argon2.verify(
        '$argon2id$v=19$m=19456,t=2,p=1$jL2h2m4kVX8aKzR7W5aQpw$aA3gL2vPqQ9X4Y8kM5bR7zW1eT8uO9iH6jL4kV2mC3s',
        'takieOHasło',
      );
      throw new UnauthorizedException('Wrong email or password');
    }

    const isPassword = await argon2.verify(data.password, password);

    if (!isPassword) {
      throw new UnauthorizedException('Wrong email or password');
    } else {
      return this.issueTokens(data.id);
    }
  }

  public async refresh(refreshToken: string) {
    const hash = createHash('sha256').update(refreshToken).digest('hex');

    const [id] = await this.db
      .delete(schema.usersSession)
      .where(eq(schema.usersSession.tokenHash, hash))
      .returning({
        user_id: schema.usersSession.user_id,
        expires: schema.usersSession.expiresAt,
      });

    if (id === undefined || id.expires.getTime() <= Date.now()) {
      throw new UnauthorizedException();
    }

    return this.issueTokens(id.user_id);
  }
}
