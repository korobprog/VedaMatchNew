import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import type { AccessTokenPayload } from '@vedamatch/shared';
import {
  AppLoginRequestError,
  parseAppLoginRequest,
  type AppLoginRequest,
} from './app-login';
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
    @Req() req: Request,
    @Res() res: Response,
    @Query('returnTo') returnTo?: string,
    @Query('ref') ref?: string,
    @Query('fp') fp?: string,
    @Query('app_redirect') appRedirect?: string,
    @Query('app_challenge') appChallenge?: string,
  ) {
    const app = appLogin(appRedirect, appChallenge);
    // Хост запроса определяет контур: на нём собирается redirect_uri и домен
    // cookie, иначе вход, начатый на .com, уезжает в российский портал.
    return this.auth.startGoogleLogin(
      res,
      returnTo,
      ref,
      fp,
      req.headers.host,
      app,
    );
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
    @Query('app_redirect') appRedirect?: string,
    @Query('app_challenge') appChallenge?: string,
  ) {
    const app = appLogin(appRedirect, appChallenge);
    return this.auth.startYandexLogin(req, res, returnTo, ref, fp, app);
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

  /**
   * Мобильное приложение. Токены ходят в теле ответа, а не в cookie: у
   * приложения нет cookie-хранилища, а сохранить их в защищённое хранилище
   * телефона может только оно само. Ответы с токенами не кэшируются.
   */
  @Post('app/token')
  @Header('Cache-Control', 'no-store')
  appToken(@Body() body: { code?: unknown; codeVerifier?: unknown }) {
    return this.auth.exchangeAppLoginCode(body);
  }

  // Приложения многих людей выходят в сеть с одного адреса оператора, а
  // refresh случается каждые 15 минут: классовые 10 в минуту здесь тесны.
  @Post('app/refresh')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Header('Cache-Control', 'no-store')
  appRefresh(@Body() body: { refreshToken?: unknown }) {
    return this.auth.refreshApp(body);
  }

  @Post('app/logout')
  appLogout(@Body() body: { refreshToken?: unknown }) {
    return this.auth.logoutApp(body);
  }

  // Только для локальной разработки, как и dev-login: DEV_AUTH_ENABLED=true.
  @Post('app/dev-login')
  @Header('Cache-Control', 'no-store')
  appDevLogin(
    @Body() body: { email?: string; password?: string },
    @Req() req: Request,
  ) {
    return this.auth.devLoginApp(body, req);
  }

  @Post('logout-everywhere')
  @UseGuards(AuthGuard)
  logoutEverywhere(
    @CurrentUser() user: AccessTokenPayload,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.auth.logoutEverywhere(user.sub, res, req.headers.host);
  }
}

/** Параметры входа из приложения; кривые значения — 400, а не вход с сайта. */
function appLogin(
  appRedirect?: string,
  appChallenge?: string,
): AppLoginRequest | null {
  try {
    return parseAppLoginRequest({ appRedirect, appChallenge });
  } catch (error) {
    if (error instanceof AppLoginRequestError) {
      throw new BadRequestException(error.message);
    }
    throw error;
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
