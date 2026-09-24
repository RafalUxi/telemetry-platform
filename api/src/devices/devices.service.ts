import { ConflictException, HttpException } from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../db/schema.js';
import { DB } from '../db/db.module.js';
import { and, eq } from 'drizzle-orm';
import { randomBytes } from 'node:crypto';
import mqtt, { type MqttClient } from 'mqtt';
import { Injectable, Inject, OnModuleInit, Logger } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import type { MessageEvent } from '@nestjs/common';
import { Observable } from 'rxjs';

@Injectable()
export class DevicesService implements OnModuleInit {
  private client!: MqttClient;
  private readonly logger = new Logger(DevicesService.name);

  constructor(@Inject(DB) private readonly db: NodePgDatabase<typeof schema>) {}

  async onModuleInit() {
    this.client = await mqtt.connectAsync(
      process.env.MQTT_URL ?? 'mqtt://localhost:1883',
      {
        username: process.env.MQTT_ADMIN_USERNAME,
        password: process.env.MQTT_ADMIN_PASSWORD,
        protocolVersion: 5,
      },
    );

    await this.client.subscribeAsync('$CONTROL/dynamic-security/v1/response');
    await this.client.subscribeAsync('devices/+/telemetry');

    this.client.on('error', (err) => {
      this.logger.error(err);
    });
  }

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
    const password = randomBytes(24).toString('base64url');
    let output: {};

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
      output = { id: data.id, deviceId: data.device_id, name: data.name };
    } catch (err) {
      if ((err as { cause?: { code?: string } }).cause?.code === '23505') {
        throw new ConflictException(
          'Device Id already exist -> creat device again',
        );
      }
      throw err;
    }

    const res = new Promise<{
      responses: { command: string; error?: string }[];
    }>((resolve) => {
      this.client.once('message', (topic, payload) =>
        resolve(JSON.parse(payload.toString())),
      );
    });

    const commands = [
      {
        command: 'createClient',
        username: device_id,
        password: password,
        clientid: device_id,
      },
      { command: 'createRole', rolename: 'device-' + device_id },
      {
        command: 'addRoleACL',
        rolename: 'device-' + device_id,
        acltype: 'publishClientSend',
        topic: `devices/${device_id}/telemetry`,
        priority: 1,
        allow: true,
      },
      {
        command: 'addClientRole',
        username: device_id,
        rolename: 'device-' + device_id,
      },
    ];
    await this.client.publishAsync(
      '$CONTROL/dynamic-security/v1',
      JSON.stringify({ commands }),
      {
        qos: 1,
      },
    );

    const creatAcc = await res;
    const error: string[] = [];

    for (let i = 0; i < creatAcc.responses.length; i++) {
      const err = creatAcc.responses[i].error;
      if (err !== undefined) {
        error.push(err);
      }
    }
    if (error.length > 0) {
      throw new HttpException(error, 404);
    }

    output = { ...output, password: password };

    return output;
  }

  public async deleteOneDevice(id: string, user_id: string) {
    const data = await this.db
      .delete(schema.devices)
      .where(
        and(eq(schema.devices.id, id), eq(schema.devices.user_id, user_id)),
      )
      .returning({ device_id: schema.devices.device_id });

    if (data.length === 0) {
      throw new HttpException('Delete devices goes wrong', 404);
    }

    const res = new Promise<{
      responses: { command: string; error?: string }[];
    }>((resolve) => {
      this.client.once('message', (topic, payload) =>
        resolve(JSON.parse(payload.toString())),
      );
    });

    const device_id = data[0].device_id;

    const commands = [
      {
        command: 'deleteClient',
        username: device_id,
      },
      {
        command: 'deleteRole',
        rolename: 'device-' + device_id,
      },
    ];

    await this.client.publishAsync(
      '$CONTROL/dynamic-security/v1',
      JSON.stringify({ commands }),
      {
        qos: 1,
      },
    );

    const creatAcc = await res;
    const error: string[] = [];

    for (let i = 0; i < creatAcc.responses.length; i++) {
      const err = creatAcc.responses[i].error;
      if (err !== undefined) {
        error.push(err);
      }
    }
    if (error.length > 0) {
      throw new HttpException(error, 502);
    }
  }

  public async seriesForDevice(
    id: string,
    user_id: string,
    from: Date,
    to: Date,
    points: number,
  ) {
    const data = await this.db
      .select({
        device_id: schema.devices.device_id,
      })
      .from(schema.devices)
      .where(
        and(eq(schema.devices.id, id), eq(schema.devices.user_id, user_id)),
      );

    if (data.length === 0) {
      throw new HttpException('Series for devices goes wrong', 404);
    }

    const device_id = data[0].device_id;

    const result = await this.db.execute(
      sql`select * from measurements_series(${device_id}, ${from}, ${to}, ${points})`,
    );

    const output = result.rows.map((r) => {
      return {
        t: r.t_s,
        tempAvg: r.temp_avg_s,
        tempMin: r.temp_min_s,
        tempMax: r.temp_max_s,
        humAvg: r.humidity_avg_s,
        humMin: r.humidity_min_s,
        humMax: r.humidity_max_s,
      };
    });

    return output;
  }

  public async liveForDevice(id: string, user_id: string) {
    const data = await this.db
      .select({
        device_id: schema.devices.device_id,
      })
      .from(schema.devices)
      .where(
        and(eq(schema.devices.id, id), eq(schema.devices.user_id, user_id)),
      );

    if (data.length === 0) {
      throw new HttpException('Series for devices goes wrong', 404);
    }

    return new Observable<MessageEvent>((subscriber) => {
      const handler = (topic: string, payload: Buffer) => {
        const parts = topic.split('/');
        if (parts.length > 3) return;
        if (parts[0] !== 'devices') return;
        if (parts[2] !== 'telemetry') return;

        const deviceId = parts[1];
        if (
          deviceId === undefined ||
          deviceId.length === 0 ||
          deviceId !== data[0].device_id
        ) {
          return;
        }
        return subscriber.next({ data: payload.toString() });
      };
      this.client.on('message', handler);

      return () => {
        this.client.off('message', handler);
      };
    });
  }
}
