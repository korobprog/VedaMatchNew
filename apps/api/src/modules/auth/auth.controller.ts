import { Controller, Get, Post, Req, Res, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import type { AccessTokenPayload } from '@vedamatch/shared';
import { AuthService } from './auth.service';
import { AuthGuard, CurrentUser } from './auth.guard';
import { JwtSignService } from './jwt.service';

@Controller('auth')
@Throttle({ default: { limit: 10, ttl: 60_000 } })
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Get('google')
  google(@Res() res: Response) {
    return this.auth.startGoogleLogin(res);
  }

  @Get('google/callback')
  googleCallback(@Req() req: Request, @Res() res: Response) {
    return this.auth.handleGoogleCallback(req, res);
  }

  @Post('refresh')
  refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.auth.refresh(req, res);
  }

  @Post('logout')
  logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.auth.logout(req, res);
  }

  @Post('logout-everywhere')
  @UseGuards(AuthGuard)
  logoutEverywhere(
    @CurrentUser() user: AccessTokenPayload,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.auth.logoutEverywhere(user.sub, res);
  }
}

@Controller('.well-known')
export class WellKnownController {
  constructor(private readonly jwt: JwtSignService) {}

  // Будущие сервисы VedaMatch валидируют access JWT по этому эндпоинту
  @Get('jwks.json')
  jwks() {
    return this.jwt.getJwks();
  }
}
