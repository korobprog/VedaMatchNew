import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import type { AccessTokenPayload } from '@vedamatch/shared';
import { AuthAdminService } from './auth-admin.service';
import type { AuthProviderPatch } from './auth-admin.service';
import { AuthProvidersService } from './auth-providers.service';
import { isAuthAdmin } from './is-admin';
import { AuthService } from './auth.service';
import { AdminUnlimited } from './admin-unlimited.guard';
import { AuthGuard, CurrentUser } from './auth.guard';
import { JwtSignService } from './jwt.service';

@Controller('auth')
@Throttle({ default: { limit: 10, ttl: 60_000 } })
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly providers: AuthProvidersService,
    private readonly admin: AuthAdminService,
  ) {}

  /**
   * Управление способами входа. Права — как у любого сервиса портала: роль
   * `admin` или назначенный менеджер сервиса `auth`. Отдельных логинов под
   * сервисы нет, права выдаются участнику портала.
   */
  @Get('admin/providers')
  @UseGuards(AuthGuard)
  @AdminUnlimited('auth')
  adminProviders(@CurrentUser() user: AccessTokenPayload) {
    if (!isAuthAdmin(user)) throw new ForbiddenException('Недостаточно прав');
    return this.admin.list();
  }

  @Patch('admin/providers/:provider')
  @UseGuards(AuthGuard)
  @AdminUnlimited('auth')
  adminUpdateProvider(
    @CurrentUser() user: AccessTokenPayload,
    @Param('provider') provider: string,
    @Body() body: AuthProviderPatch,
  ) {
    if (!isAuthAdmin(user)) throw new ForbiddenException('Недостаточно прав');
    return this.admin.update(
      user.sub,
      provider as Parameters<AuthAdminService['update']>[1],
      body ?? {},
    );
  }

  /**
   * Какие способы входа показывать. Список приходит с сервера, а не зашит во
   * фронт: иначе каждое переключение галочки требовало бы пересборки.
   *
   * `host` — домен портала, под которым открыт сайт. Он нужен явно: список
   * запрашивает серверный компонент страницы входа по внутреннему адресу
   * (`http://api:4000`), и `req.hostname` там — `api`, а не домен человека.
   * Доверять параметру безопасно: он влияет только на состав кнопок, а сам
   * вход каждый обработчик сверяет по настоящему хосту запроса
   * (см. assertEnabled).
   */
  // Классовые 10/мин здесь не годятся: список запрашивает серверный компонент
  // страницы входа, и все посетители приходят к API с одного адреса.
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  @Get('providers')
  async authProviders(@Req() req: Request, @Query('host') host?: string) {
    return { providers: await this.providers.visibleFor(host || req.hostname) };
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
