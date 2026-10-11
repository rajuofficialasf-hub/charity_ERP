import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { RateLimitGuard } from '../rate-limit/rate-limit';
import { UsersController } from '../users/users.controller';
import { UsersService } from '../users/users.service';
import { AuthController } from './auth.controller';
import { AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';
import { OtpDeliveryService, OtpService } from './otp.service';
import { PasswordHasher } from './password-hasher';
import { PermissionResolver } from './permission-resolver';
import { PermissionVersionService } from './permission-version.service';
import { SessionService } from './session.service';
import { SessionsController } from './sessions.controller';
import { TokenService } from './token.service';

/**
 * Authentication, device sessions and user administration (AUTH.md, T1.7). The AuthGuard runs
 * before the rate limiter so that per-user and per-session limits see the caller; public routes
 * pass the AuthGuard at once and are limited by their own keys (login id, address, IP).
 */
@Module({
  controllers: [AuthController, SessionsController, UsersController],
  providers: [
    PasswordHasher,
    TokenService,
    SessionService,
    PermissionResolver,
    PermissionVersionService,
    OtpDeliveryService,
    OtpService,
    AuthService,
    UsersService,
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: RateLimitGuard },
  ],
  exports: [SessionService, PermissionVersionService, PasswordHasher, TokenService],
})
export class AuthModule {}
