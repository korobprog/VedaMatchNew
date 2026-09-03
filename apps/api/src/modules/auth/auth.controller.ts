import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import type { AccessTokenPayload } from '@vedamatch/shared';
import { AuthProvidersService } from './auth-providers.service';
import { AuthService } from './auth.service';
import { AuthGuard, CurrentUser } from './auth.guard';
import { JwtSignService } from './jwt.service';

@Controller('auth')
@Throttle({ default: { limit: 10, ttl: 60_000 } })
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly providers: AuthProvidersService,
  ) {}

  /**
   * Какие способы входа показывать. Список приходит с сервера, а не зашит во
   * фронт: иначе каждое переключение галочки требовало бы пересборки.
   */
  // Классовые 10/мин здесь не годятся: список запрашивает серверный компонент
  // страницы входа, и все посетители приходят к API с одного адреса.
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  @Get('providers')
  async authProviders(@Req() req: Request) {
    return { providers: await this.providers.visibleFor(req.hostname) };
  }

  /**
   * `ref` и `fp` приезжают из веба: реферальный код из cookie `vm_ref` и
   * отпечаток устройства из `vm_fp`. Отдельными параметрами, а не cookie:
   * веб и API живут на разных доменах, и общая cookie есть не во всякой
   * установке. Оба уезжают в ту же OIDC-cookie, что и `returnTo`.
   */
  @Get('google')
  google(
    @Res() res: Response,
    @Query('returnTo') returnTo?: string,
    @Query('ref') ref?: string,
    @Query('fp') fp?: string,
  ) {
    return this.auth.startGoogleLogin(res, returnTo, ref, fp);
  }

  @Get('google/callback')
  googleCallback(@Req() req: Request, @Res() res: Response) {
    return this.auth.handleGoogleCallback(req, res);
  }

  // Видимость способа проверяет сам обработчик (assertEnabled): выключенный
  // Яндекс обязан отказывать, а не просто прятать кнопку.
  @Get('yandex')
  yandex(
    @Req() req: Request,
    @Res() res: Response,
    @Query('returnTo') returnTo?: string,
    @Query('ref') ref?: string,
    @Query('fp') fp?: string,
  ) {
    return this.auth.startYandexLogin(req, res, returnTo, ref, fp);
  }

  @Get('yandex/callback')
  yandexCallback(@Req() req: Request, @Res() res: Response) {
    return this.auth.handleYandexCallback(req, res);
  }

  // Только для локальной разработки: включается DEV_AUTH_ENABLED=true.
  @Post('dev-login')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  devLogin(
    @Body() body: { email?: string; password?: string; returnTo?: string },
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.auth.devLogin(body, req, res);
  }

  @Get('dev-accounts')
  devAccounts() {
    return this.auth.devAccounts();
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
