/**
 * AuthModule — owns the PKCE flow and JWT machinery. Exports JwtService and
 * JwtAuthGuard so guarded modules (me, sessions, documents) can protect routes.
 */
import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { DeviceCodeStore } from './device-code.store.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import { JwtService } from './jwt.service.js';

@Module({
  controllers: [AuthController],
  providers: [AuthService, JwtService, JwtAuthGuard, DeviceCodeStore],
  exports: [AuthService, JwtService, JwtAuthGuard],
})
export class AuthModule {}
