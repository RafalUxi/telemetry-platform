import { Module } from '@nestjs/common';
import { AuthService } from './auth.service.js';
import { AuthController } from './auth.controller.js';
import { JwtModule } from '@nestjs/jwt';
import { DbModule } from '../db/db.module.js';

// Moduł kożysta z eksportów DbModule; Wywołanie JwtModule.registerAsync({}) -> zwraca obiekt modułu

@Module({
  imports: [
    DbModule,
    JwtModule.registerAsync({
      useFactory() {
        const secret = process.env.JWT_SECRET;
        if (secret === undefined || secret === '')
          throw new Error(`secret Error: JWT_SECRET missing`);
        return {
          secret: secret,
          signOptions: { expiresIn: '15m' },
        };
      },
    }),
  ],
  providers: [AuthService],
  controllers: [AuthController],
  exports: [JwtModule],
})
export class AuthModule {}
