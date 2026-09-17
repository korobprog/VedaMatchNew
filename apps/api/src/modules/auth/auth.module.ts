import { Module } from '@nestjs/common';
import { AdminApiKeysController } from './admin-api-keys.controller';
import { ApiKeysController } from './api-keys.controller';
import { ApiKeysService } from './api-keys.service';
import { AuthProvidersService } from './auth-providers.service';
import { AuthController, WellKnownController } from './auth.controller';
import { AuthService } from './auth.service';
import { AuthGuard, OptionalAuthGuard } from './auth.guard';
import { IdentityService } from './identity.service';
import { JwtSignService } from './jwt.service';
import { RefreshTokenCleanupService } from './refresh-token-cleanup.service';
import { TelegramInitDataVerifierService } from './telegram-init-data-verifier.service';

@Module({
  controllers: [
    AdminApiKeysController,
    ApiKeysController,
    AuthController,
    WellKnownController,
  ],
  providers: [
    AuthService,
    ApiKeysService,
    AuthProvidersService,
    IdentityService,
    JwtSignService,
    AuthGuard,
    OptionalAuthGuard,
    RefreshTokenCleanupService,
    TelegramInitDataVerifierService,
  ],
  exports: [
    JwtSignService,
    ApiKeysService,
    AuthGuard,
    OptionalAuthGuard,
    IdentityService,
    AuthProvidersService,
    // Инфраструктура для «Уведомлений»: проверка подписи мини-приложения без
    // доступа к `UserIdentity` — см. комментарий в самом сервисе.
    TelegramInitDataVerifierService,
  ],
})
export class AuthModule {}
