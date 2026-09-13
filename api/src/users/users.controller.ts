// HTTP surface for users.

import {
  Controller,
  Post,
  Body,
  HttpCode,
  BadRequestException,
} from '@nestjs/common';
import { z } from 'zod';
import { UsersService } from './users.service.js';

const usersZodSchema = z.object({
  email: z.email(),
  password: z.string().min(8).max(128),
});

@Controller('users') // Path: /users
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Post() // Post: /users
  @HttpCode(201) // Success -> id and email
  create(@Body() body: unknown) {
    const parsed = usersZodSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.users.create(parsed.data.email, parsed.data.password);
  }
}
