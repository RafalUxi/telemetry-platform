import { Module } from '@nestjs/common';
import { DevicesService } from './devices.service.js';
import { DevicesController } from './devices.controller.js';
import { DbModule } from '../db/db.module.js';
import { AuthModule } from '../auth/auth.module.js';

@Module({
  imports: [DbModule, AuthModule],
  providers: [DevicesService],
  controllers: [DevicesController],
})
export class DevicesModule {}
