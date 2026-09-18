import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { UsersModule } from './users/users.module.js';
import { AuthModule } from './auth/auth.module.js';
import { DevicesModule } from './devices/devices.module.js';

@Module({
  imports: [UsersModule, AuthModule, DevicesModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
