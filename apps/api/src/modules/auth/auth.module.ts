import { Module } from '@nestjs/common';
import { AuthAdminService } from './auth-admin.service';
import { AuthProvidersService } from './auth-providers.service';
import { AuthController, WellKnownController } from './auth.controller';
import { AuthService } from './auth.service';
import { AuthGuard, OptionalAuthGuard } from './auth.guard';
import { IdentityService } from './identity.service';
import { JwtSignService } from './jwt.service';
import { RefreshTokenCleanupService } from './refresh-token-cleanup.service';

@Module({
  controllers: [AuthController, WellKnownController],
  providers: [
    AuthService,
    AuthProvidersService,
    AuthAdminService,
    IdentityService,
    JwtSignService,
    AuthGuard,
    OptionalAuthGuard,
    RefreshTokenCleanupService,
  ],
  exports: [
    JwtSignService,
    AuthGuard,
    OptionalAuthGuard,
    IdentityService,
    AuthProvidersService,
  ],
})
export class AuthModule {}
