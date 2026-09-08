import { Module } from '@nestjs/common';
import { ApiKeysController } from './api-keys.controller';
import { ApiKeysService } from './api-keys.service';
import { AuthProvidersService } from './auth-providers.service';
import { AuthController, WellKnownController } from './auth.controller';
import { AuthService } from './auth.service';
import { AuthGuard, OptionalAuthGuard } from './auth.guard';
import { IdentityService } from './identity.service';
import { JwtSignService } from './jwt.service';
import { RefreshTokenCleanupService } from './refresh-token-cleanup.service';

@Module({
  controllers: [ApiKeysController, AuthController, WellKnownController],
  providers: [
    AuthService,
    ApiKeysService,
    AuthProvidersService,
    IdentityService,
    JwtSignService,
    AuthGuard,
    OptionalAuthGuard,
    RefreshTokenCleanupService,
  ],
  exports: [
    JwtSignService,
    ApiKeysService,
    AuthGuard,
    OptionalAuthGuard,
    IdentityService,
    AuthProvidersService,
  ],
})
export class AuthModule {}
