import { Body, Controller } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard.js';
import {
  Get,
  UseGuards,
  BadRequestException,
  Post,
  HttpCode,
  Req,
  Delete,
  Param,
  Query,
  Sse,
} from '@nestjs/common';
import { DevicesService } from './devices.service.js';
import { z } from 'zod';

const devZodSchema = z.object({
  name: z.string(),
});

const deleteZodSchema = z.uuid();

const seriesSchema = z.object({
  from: z.coerce.date(),
  to: z.coerce.date(),
  points: z.coerce.number().int().min(1).max(5000),
});

@Controller('devices')
export class DevicesController {
  constructor(private readonly dev: DevicesService) {}

  @Delete(':id')
  @HttpCode(204)
  @UseGuards(AuthGuard)
  async deleteOneDevice(
    @Param('id') id: string,
    @Req() request: { user: { sub: string } },
  ) {
    const parse = deleteZodSchema.safeParse(id);
    if (!parse.success) {
      throw new BadRequestException(parse.error.issues);
    }
    const output = await this.dev.deleteOneDevice(parse.data, request.user.sub);
    return output;
  }

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

  @Get(':id/series')
  @HttpCode(200)
  @UseGuards(AuthGuard)
  async seriesForDevice(
    @Param('id') id: string,
    @Query() query: unknown,
    @Req() request: { user: { sub: string } },
  ) {
    const parseid = deleteZodSchema.safeParse(id);
    if (!parseid.success) {
      throw new BadRequestException(parseid.error.issues);
    }

    const parse = seriesSchema.safeParse(query);
    if (!parse.success) {
      throw new BadRequestException(parse.error.issues);
    }

    const output = await this.dev.seriesForDevice(
      parseid.data,
      request.user.sub,
      parse.data.from,
      parse.data.to,
      parse.data.points,
    );
    return output;
  }

  @Sse(':id/live')
  @UseGuards(AuthGuard)
  async liveForDevice(
    @Param('id') id: string,
    @Req() request: { user: { sub: string } },
  ) {
    const parseid = deleteZodSchema.safeParse(id);
    if (!parseid.success) {
      throw new BadRequestException(parseid.error.issues);
    }
    const output = await this.dev.liveForDevice(parseid.data, request.user.sub);
    return output;
  }
}
