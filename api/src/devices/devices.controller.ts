import { Body, Controller } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard.js';
import {
  Get,
  UseGuards,
  BadRequestException,
  Post,
  HttpCode,
  Req,
} from '@nestjs/common';
import { DevicesService } from './devices.service.js';
import { z } from 'zod';

const devZodSchema = z.object({
  name: z.string(),
});

@Controller('devices')
export class DevicesController {
  constructor(private readonly dev: DevicesService) {}

  @Post()
  @HttpCode(201)
  @UseGuards(AuthGuard)
  async createOneDevice(
    @Body() body: unknown,
    @Req() request: { user: { sub: string } },
  ) {
    const parse = devZodSchema.safeParse(body);
    if (!parse.success) {
      throw new BadRequestException(parse.error.issues);
    }
    const output = await this.dev.createOneDevice(
      parse.data.name,
      request.user.sub,
    );
    return output;
  }

  @Get() // Get -> without prefix
  @HttpCode(200)
  @UseGuards(AuthGuard)
  async me(@Req() request: { user: { sub: string } }) {
    const dev = await this.dev.deviceRead(request.user.sub);
    return dev;
  }
}
