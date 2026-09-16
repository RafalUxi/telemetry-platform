import {
  Controller,
  Post,
  Get,
  Body,
  HttpCode,
  BadRequestException,
  UseGuards,
  Req,
} from '@nestjs/common';
import { z } from 'zod';
import { AuthService } from './auth.service.js';
import { AuthGuard } from './auth.guard.js';

const authZodSchema = z.object({
  email: z.email(),
  password: z.string().min(8).max(128),
});

const authZodSchemaRefresh = z.object({
  refreshToken: z
    .string()
    .length(43)
    .regex(/^[A-Za-z0-9_-]+$/),
});

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('login')
  @HttpCode(200)
  login(@Body() body: unknown) {
    const parse = authZodSchema.safeParse(body);
    if (!parse.success) {
      throw new BadRequestException(parse.error.issues);
    }
    return this.auth.login(parse.data.email, parse.data.password);
  }

  @Post('refresh')
  @HttpCode(200)
  refresh(@Body() body: unknown) {
    const parse = authZodSchemaRefresh.safeParse(body);
    if (!parse.success) {
      throw new BadRequestException(parse.error.issues);
    }
    return this.auth.refresh(parse.data.refreshToken);
  }

  @Post('logout')
  @HttpCode(204)
  logout(@Body() body: unknown) {
    const parse = authZodSchemaRefresh.safeParse(body);
    if (!parse.success) {
      throw new BadRequestException(parse.error.issues);
    }
    return this.auth.logout(parse.data.refreshToken);
  }

  @Get('me')
  @UseGuards(AuthGuard)
  me(@Req() request: { user: { sub: string } }) {
    return { id: request.user.sub };
  }
}
