import { Controller } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard.js';
import { Get, UseGuards, HttpCode, Req } from '@nestjs/common';
import { DevicesService } from './devices.service.js';

@Controller('devices')
export class DevicesController {
  constructor(private readonly dev: DevicesService) {}

  @Get() // Get -> without prefix
  @HttpCode(200)
  @UseGuards(AuthGuard)
  async me(@Req() request: { user: { sub: string } }) {
    const dev = await this.dev.deviceRead(request.user.sub);
    return dev;
  }
}
