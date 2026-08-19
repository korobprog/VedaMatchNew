import { Module } from '@nestjs/common';
import { AuthController, WellKnownController } from './auth.controller';
import { AuthService } from './auth.service';
import { AuthGuard, OptionalAuthGuard } from './auth.guard';
import { JwtSignService } from './jwt.service';
import { RefreshTokenCleanupService } from './refresh-token-cleanup.service';

@Module({
  controllers: [AuthController, WellKnownController],
  providers: [
    AuthService,
    JwtSignService,
    AuthGuard,
    OptionalAuthGuard,
    RefreshTokenCleanupService,
  ],
  exports: [JwtSignService, AuthGuard, OptionalAuthGuard],
})
export class AuthModule {}
