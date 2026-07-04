import { Module } from '@nestjs/common';
import { AuthController, WellKnownController } from './auth.controller';
import { AuthService } from './auth.service';
import { AuthGuard } from './auth.guard';
import { JwtSignService } from './jwt.service';

@Module({
  controllers: [AuthController, WellKnownController],
  providers: [AuthService, JwtSignService, AuthGuard],
  exports: [JwtSignService, AuthGuard],
})
export class AuthModule {}
