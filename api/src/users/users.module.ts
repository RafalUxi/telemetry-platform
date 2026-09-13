import { Module } from '@nestjs/common';
import { DbModule } from '../db/db.module.js';
import { UsersController } from './users.controller.js';
import { UsersService } from './users.service.js';

@Module({
  imports: [DbModule],
  controllers: [UsersController],
  providers: [UsersService],
})
export class UsersModule {}
