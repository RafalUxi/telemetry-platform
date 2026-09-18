import { Injectable, Inject, UnauthorizedException } from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../db/schema.js';
import { DB } from '../db/db.module.js';
import { eq } from 'drizzle-orm';

@Injectable()
export class DevicesService {
  constructor(@Inject(DB) private readonly db: NodePgDatabase<typeof schema>) {}

  public async deviceRead(user_id: string): Promise<{}> {
    const data = await this.db
      .select({
        device_id: schema.devices.device_id,
      })
      .from(schema.devices)
      .where(eq(schema.devices.user_id, user_id));
    const output = data.map((d) => {
      return d.device_id;
    });
    return output;
  }
}
