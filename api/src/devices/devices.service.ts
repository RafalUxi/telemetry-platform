import {
  Injectable,
  Inject,
  ConflictException,
  HttpException,
} from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../db/schema.js';
import { DB } from '../db/db.module.js';
import { and, eq } from 'drizzle-orm';
import { randomBytes } from 'node:crypto';

@Injectable()
export class DevicesService {
  constructor(@Inject(DB) private readonly db: NodePgDatabase<typeof schema>) {}

  public async deviceRead(user_id: string) {
    const data = await this.db
      .select({
        device_id: schema.devices.device_id,
        name: schema.devices.name,
        id: schema.devices.id,
      })
      .from(schema.devices)
      .where(eq(schema.devices.user_id, user_id));
    const output = data.map((d) => {
      return { name: d.name, devices: d.device_id, id: d.id };
    });
    return output;
  }

  public async createOneDevice(name: string, user_id: string) {
    const randomPrefix = randomBytes(6).toString('base64url');

    const device_id = 'dev_' + randomPrefix;
    try {
      const [data] = await this.db
        .insert(schema.devices)
        .values({ user_id: user_id, device_id: device_id, name: name })
        .returning({
          id: schema.devices.id,
          device_id: schema.devices.device_id,
          name: schema.devices.name,
        });
      return { id: data.id, deviceId: data.device_id, name: data.name };
    } catch (err) {
      if ((err as { cause?: { code?: string } }).cause?.code === '23505') {
        throw new ConflictException(
          'Device Id already exist -> creat device again',
        );
      }
      throw err;
    }
  }

  public async deleteOneDevice(id: string, user_id: string) {
    const data = await this.db
      .delete(schema.devices)
      .where(
        and(eq(schema.devices.id, id), eq(schema.devices.user_id, user_id)),
      )
      .returning();

    if (data.length === 0) {
      throw new HttpException('Delete devices goes wrong', 404);
    }
  }
}
