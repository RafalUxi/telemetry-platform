import {
  Controller,
  Post,
  Body,
  HttpCode,
  BadRequestException,
} from '@nestjs/common';
import { z } from 'zod';
import { AuthService } from './auth.service.js';

const authZodSchema = z.object({
  email: z.email(),
  password: z.string().min(8).max(128),
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
}
