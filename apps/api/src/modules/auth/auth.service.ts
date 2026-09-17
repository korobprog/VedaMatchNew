import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  Injectable,
  Logger,
  OnModuleInit,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { Request, Response } from 'express';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import * as oidc from 'openid-client';
import {
  AUTH_TELEGRAM_CONNECTED_EVENT,
  AUTH_TELEGRAM_DISCONNECTED_EVENT,
  USER_REGISTERED_EVENT,
  resolveDisplayName,
  type AuthTelegramConnectedEvent,
  type AuthTelegramDisconnectedEvent,
  type Role,
  type UserRegisteredEvent,
} from '@vedamatch/shared';
import type { User } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  APP_LOGIN_CODE_TTL_MS,
  appRedirectUrl,
  verifyPkceS256,
  type AppLoginRequest,
} from './app-login';
import { judgeRevokedRefresh, rotationFamily } from './refresh-reuse';
import { appReturnPage, type AppReturnOutcome } from './app-return-page';
import { AuthProvidersService } from './auth-providers.service';
import {
  resolveContour,
  resolveReturnOrigin,
  returnOriginCandidate,
  type Contour,
} from './contour';
import { verifyTelegramInitData } from './telegram-init-data';
import { parseTelegramWebAppMode } from './telegram-webapp-mode';
import { mapTelegramProfile } from './telegram.provider';
import { readRegistrationMode } from '../billing/billing-mode';
import { assertAccountActive } from '../users/account-status';
import { isAuthProvider } from './identity-link';
import { IdentityService, type IdentitySummary } from './identity.service';
import { JwtSignService } from './jwt.service';
import { resolveLoginClient, type LoginClient } from './login-client';
import { verifyPassword } from './password';
import { toRole } from './role';
import {
  YANDEX_AUTHORIZE,
  YANDEX_INFO,
  YANDEX_TOKEN,
  mapYandexProfile,
} from './yandex.provider';

export { toRole } from './role';

/** Ответ приложению вместо cookie: пара токенов и сроки их жизни в секундах. */
export interface AppTokenResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  refreshExpiresIn: number;
}

const OIDC_COOKIE = 'oidc_flow';
const YANDEX_COOKIE = 'yandex_oidc';
const ACCESS_COOKIE = 'access_token';
const REFRESH_COOKIE = 'refresh_token';
/**
 * Не-httpOnly маркер «сессия есть». Refresh-cookie живёт на `path=/auth` и
 * не видна ни Next-proxy, ни странице; без маркера после истечения access
 * (15 мин) вошедший на секунду видит лендинг для гостя. Значение не секрет —
 * по нему только решают, показывать ли splash «Восстанавливаем сессию».
 */
const SESSION_MARKER_COOKIE = 'vm_session';

/**
 * Куда вернуть человека после входа. Принимаем только внутренний путь: одна
 * ведущая косая (не `//host`), без схемы и управляющих символов — иначе
 * open-redirect. Всё, что не прошло, превращается в `/`.
 */
export function safeReturnTo(value: unknown): string {
  if (typeof value !== 'string') return '/';
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > 2048) return '/';
  if (!trimmed.startsWith('/') || trimmed.startsWith('//')) return '/';
  if (trimmed.startsWith('/\\')) return '/';
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(trimmed)) return '/';
  if (/^\/[^/?#]*:/.test(trimmed)) return '/';
  return trimmed;
}

/**
 * Короткая строка из ненадёжного источника (query, cookie) в OIDC-payload.
 * Ограничение длины здесь, а не в потребителе: payload уезжает в cookie, и
 * килобайт мусора в query превратил бы вход в 431-ю ошибку.
 */
export function shortToken(value: unknown, maxLength = 64): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > maxLength) return null;
  if (!/^[\w-]+$/.test(trimmed)) return null;
  return trimmed;
}

@Injectable()
export class AuthService implements OnModuleInit {
  private readonly logger = new Logger(AuthService.name);
  private google?: oidc.Configuration;
  private readonly isProd = process.env.NODE_ENV === 'production';

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly jwt: JwtSignService,
    private readonly events: EventEmitter2,
    private readonly identities: IdentityService,
    private readonly providers: AuthProvidersService,
  ) {}

  async onModuleInit() {
    const clientId = this.config.get<string>('GOOGLE_CLIENT_ID');
    const clientSecret = this.config.get<string>('GOOGLE_CLIENT_SECRET');
    if (!clientId || !clientSecret) {
      this.logger.warn(
        'GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET не заданы — вход через Google недоступен',
      );
      return;
    }
    this.google = await oidc.discovery(
      new URL('https://accounts.google.com'),
      clientId,
      clientSecret,
    );
  }

  /**
   * Контур запроса: адрес API, портал для возврата и домен cookie.
   *
   * Раньше эти три значения брались из `API_PUBLIC_URL`, `WEB_ORIGIN` и
   * `COOKIE_DOMAIN` — по одному на весь сервис, — и вход, начатый на
   * `vedamatch.com`, уезжал в российский контур. Хост сверяется со списком
   * `WEB_ORIGIN`, см. `contour.ts`: заголовок запроса сам по себе доверия не
   * заслуживает, а `redirect_uri` из него уходит в OAuth-провайдера.
   */
  private contour(host?: string | null): Contour {
    return resolveContour({
      host,
      webOrigins: this.config.get<string>('WEB_ORIGIN'),
      fallbackApiOrigin: this.config.get<string>(
        'API_PUBLIC_URL',
        'http://localhost:4000',
      ),
      fallbackCookieDomain:
        this.config.get<string>('COOKIE_DOMAIN') || undefined,
    });
  }

  private requireGoogle(): oidc.Configuration {
    if (!this.google) {
      throw new ServiceUnavailableException('Google OAuth не сконфигурирован');
    }
    return this.google;
  }

  async startGoogleLogin(
    req: Request,
    res: Response,
    returnTo?: string,
    referralCode?: string,
    deviceId?: string,
    host?: string | null,
    app?: AppLoginRequest | null,
    returnOrigin?: string,
    link?: boolean,
  ) {
    // На старте входа человек уже в браузере, и ошибке JSON-ом там делать
    // нечего: любой отказ, включая «провайдер не настроен», уезжает в
    // приложение. На колбэке 5xx остаются исключениями: там они означают
    // сбой, который должен попасть в логи как есть.
    const google = await this.startForApp(app, res, () => this.requireGoogle());
    if (!google) return;
    const contour = this.contour(host);

    // Привязка (не вход) требует живой сессии уже на старте: без неё Google
    // привязался бы к кому попало вместо человека, который жмёт «Привязать»
    // на экране «Аккаунт». Отказ — редирект назад с `?linkError=session`, а
    // не голая ошибка: разговор начала навигация браузера.
    let linkUserId: string | null = null;
    if (link) {
      linkUserId = await this.readSessionUserId(req);
      if (!linkUserId) {
        this.redirectLinkError(res, contour, returnTo, returnOrigin, 'session');
        return;
      }
    }

    const codeVerifier = oidc.randomPKCECodeVerifier();
    const codeChallenge = await oidc.calculatePKCECodeChallenge(codeVerifier);
    const state = oidc.randomState();
    const nonce = oidc.randomNonce();

    // returnTo едет в той же OIDC-cookie, что и PKCE: state остаётся
    // случайным, а путь возврата не попадает в URL Google.
    const oidcPayload = {
      codeVerifier,
      state,
      nonce,
      returnTo: safeReturnTo(returnTo),
      // Реферальный код и отпечаток устройства едут тем же путём: до
      // callback'а их больше негде сохранить, а Google-редирект их бы потерял.
      ref: shortToken(referralCode),
      fp: shortToken(deviceId),
      // Вход начат на поддомене портала (веб-версия приложения): проверяется
      // на колбэке, в контуре, который выдаёт cookie (resolveReturnOrigin).
      returnOrigin: returnOriginCandidate(returnOrigin),
      // Вход из приложения: куда вернуть код и PKCE challenge приложения.
      // Challenge Google — отдельный, он проверяется на обмене кода Google.
      app: app ?? null,
      // Привязка живой сессией: id перепроверяется на колбэке заново, а не
      // просто читается отсюда — cookie может подменить кто угодно до
      // возврата от Google.
      link: linkUserId,
    };
    res.cookie(OIDC_COOKIE, JSON.stringify(oidcPayload), {
      httpOnly: true,
      secure: this.isProd,
      sameSite: 'lax',
      domain: contour.cookieDomain,
      maxAge: 10 * 60 * 1000,
      path: '/auth',
    });

    const url = oidc.buildAuthorizationUrl(google, {
      redirect_uri: `${contour.apiOrigin}/auth/google/callback`,
      scope: 'openid email profile',
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      state,
      nonce,
    });
    res.redirect(url.href);
  }

  async handleGoogleCallback(req: Request, res: Response) {
    const google = this.requireGoogle();
    const contour = this.contour(req.headers.host);
    const raw = (req.cookies as Record<string, string>)[OIDC_COOKIE];
    if (!raw) {
      throw new BadRequestException('OAuth-сессия не найдена или истекла');
    }
    const {
      codeVerifier,
      state,
      nonce,
      returnTo,
      returnOrigin,
      ref,
      fp,
      app,
      link,
    } = JSON.parse(raw) as {
      codeVerifier: string;
      state: string;
      nonce: string;
      returnTo?: string;
      returnOrigin?: string | null;
      ref?: string | null;
      fp?: string | null;
      app?: AppLoginRequest | null;
      link?: string | null;
    };

    return this.withAppErrors(app, res, async () => {
      const currentUrl = new URL(`${contour.apiOrigin}${req.originalUrl}`);
      const tokens = await oidc.authorizationCodeGrant(google, currentUrl, {
        pkceCodeVerifier: codeVerifier,
        expectedState: state,
        expectedNonce: nonce,
        idTokenExpected: true,
      });
      const claims = tokens.claims();
      if (!claims?.email) {
        throw new UnauthorizedException('Google не вернул email');
      }
      // Аккаунт линкуется по email: без подтверждённого адреса кто угодно с
      // Google-аккаунтом на чужой непроверенный email получил бы чужой профиль.
      if (claims.email_verified !== true) {
        throw new UnauthorizedException('Google не подтвердил email');
      }

      res.clearCookie(OIDC_COOKIE, {
        path: '/auth',
        domain: contour.cookieDomain,
      });

      // Привязка способа входа живой сессией — не вход: аккаунт не ищется
      // и не заводится по email/sub, а Google-идентичность прикрепляется к
      // уже вошедшему человеку. Сессия перепроверяется здесь заново (а не
      // читается из cookie старта): подмена `oidc_flow` до колбэка не
      // должна привязать провайдера мимо владельца сессии.
      if (link) {
        await this.finishLinking({
          req,
          res,
          contour,
          expectedUserId: link,
          provider: 'google',
          externalId: claims.sub,
          returnTo,
          returnOrigin,
        });
        return;
      }

      const email = claims.email as string;
      const avatarUrl = (claims.picture as string) ?? null;

      const { user: resolved, created: isNewAccount } =
        await this.resolveGoogleProfile({
          sub: claims.sub,
          email,
          name: claims.name as string | undefined,
          picture: avatarUrl,
          requestIp: req.ip ?? null,
        });

      // Адрес и аватар Google ведёт у себя, портал их догоняет: человек сменил
      // почту — вход по прежней идентичности всё равно найдёт его аккаунт.
      // Имя не трогаем: его правят в профиле, и вход не должен затирать правку.
      const user = isNewAccount
        ? resolved
        : await this.prisma.user.update({
            where: { id: resolved.id },
            data: { email, avatarUrl },
          });

      await this.issueSessionAndRedirect({
        req,
        res,
        user,
        provider: 'google',
        isNewAccount,
        returnTo,
        returnOrigin,
        ref,
        fp,
        app,
      });
    });
  }

  private requireYandex(): { clientId: string; clientSecret: string } {
    const clientId = this.config.get<string>('YANDEX_CLIENT_ID');
    const clientSecret = this.config.get<string>('YANDEX_CLIENT_SECRET');
    if (!clientId || !clientSecret) {
      throw new ServiceUnavailableException('Яндекс ID не сконфигурирован');
    }
    return { clientId, clientSecret };
  }

  async startYandexLogin(
    req: Request,
    res: Response,
    returnTo?: string,
    referralCode?: string,
    deviceId?: string,
    app?: AppLoginRequest | null,
    returnOrigin?: string,
    link?: boolean,
  ) {
    // Проверка здесь, а не только при выдаче списка кнопок: спрятанная
    // кнопка не делает способ недоступным, а важно, что вход невозможен.
    const yandex = await this.startForApp(app, res, async () => {
      await this.providers.assertEnabled('yandex', req.hostname);
      return this.requireYandex();
    });
    if (!yandex) return;
    const contour = this.contour(req.headers.host);
    const { clientId } = yandex;

    // См. комментарий у startGoogleLogin: привязка требует живой сессии уже
    // на старте, иначе провайдер привязался бы к чужому браузеру.
    let linkUserId: string | null = null;
    if (link) {
      linkUserId = await this.readSessionUserId(req);
      if (!linkUserId) {
        this.redirectLinkError(res, contour, returnTo, returnOrigin, 'session');
        return;
      }
    }

    const verifier = randomBytes(32).toString('base64url');
    const challenge = createHash('sha256').update(verifier).digest('base64url');
    const state = randomBytes(16).toString('base64url');

    // Тот же приём, что и у Google: состояние уезжает в httpOnly cookie, а не
    // в память процесса — иначе вход развалится при перезапуске и при
    // нескольких репликах.
    res.cookie(
      YANDEX_COOKIE,
      JSON.stringify({
        verifier,
        state,
        returnTo: safeReturnTo(returnTo),
        returnOrigin: returnOriginCandidate(returnOrigin),
        ref: shortToken(referralCode),
        fp: shortToken(deviceId),
        app: app ?? null,
        link: linkUserId,
      }),
      {
        httpOnly: true,
        secure: this.isProd,
        sameSite: 'lax',
        domain: contour.cookieDomain,
        maxAge: 10 * 60 * 1000,
        path: '/auth',
      },
    );

    const url = new URL(YANDEX_AUTHORIZE);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('client_id', clientId);
    url.searchParams.set(
      'redirect_uri',
      `${contour.apiOrigin}/auth/yandex/callback`,
    );
    url.searchParams.set('state', state);
    url.searchParams.set('code_challenge', challenge);
    url.searchParams.set('code_challenge_method', 'S256');

    res.redirect(url.toString());
  }

  async handleYandexCallback(req: Request, res: Response) {
    await this.providers.assertEnabled('yandex', req.hostname);
    const contour = this.contour(req.headers.host);
    const { clientId, clientSecret } = this.requireYandex();

    const raw = (req.cookies as Record<string, string> | undefined)?.[
      YANDEX_COOKIE
    ];
    if (!raw) {
      throw new BadRequestException('OAuth-сессия не найдена или истекла');
    }
    res.clearCookie(YANDEX_COOKIE, {
      path: '/auth',
      domain: contour.cookieDomain,
    });

    let flow: {
      verifier: string;
      state: string;
      returnTo?: string;
      returnOrigin?: string | null;
      ref?: string | null;
      fp?: string | null;
      app?: AppLoginRequest | null;
      link?: string | null;
    };
    try {
      flow = JSON.parse(raw);
    } catch {
      throw new BadRequestException('OAuth-сессия повреждена');
    }

    return this.withAppErrors(flow.app, res, async () => {
      // Сравнение постоянного времени тут излишне: state не секрет и живёт
      // одну попытку, но длину проверяем — иначе пустая строка совпадёт с
      // отсутствующим параметром.
      if (!flow.state || req.query.state !== flow.state) {
        throw new BadRequestException('Не совпало состояние запроса');
      }

      const tokenRes = await fetch(YANDEX_TOKEN, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code: String(req.query.code ?? ''),
          client_id: clientId,
          client_secret: clientSecret,
          code_verifier: flow.verifier,
        }),
      });

      if (!tokenRes.ok) {
        throw new BadGatewayException('Яндекс не выдал токен');
      }

      const { access_token: accessToken } = (await tokenRes.json()) as {
        access_token?: string;
      };
      if (!accessToken) {
        throw new BadGatewayException('Яндекс не выдал токен');
      }

      const infoRes = await fetch(YANDEX_INFO, {
        headers: { authorization: `OAuth ${accessToken}` },
      });

      if (!infoRes.ok) {
        throw new BadGatewayException('Яндекс не отдал профиль');
      }

      const profile = mapYandexProfile(await infoRes.json());

      // Привязка живой сессией — см. подробный комментарий в
      // handleGoogleCallback: аккаунт не ищется по email/id, идентичность
      // прикрепляется к перепроверенному владельцу сессии.
      if (flow.link) {
        await this.finishLinking({
          req,
          res,
          contour,
          expectedUserId: flow.link,
          provider: 'yandex',
          externalId: profile.externalId,
          returnTo: flow.returnTo,
          returnOrigin: flow.returnOrigin,
        });
        return;
      }

      const { user, created } = await this.identities.resolve(
        { ...profile, requestIp: req.ip ?? null },
        { beforeCreate: () => this.assertRegistrationOpen() },
      );

      await this.issueSessionAndRedirect({
        req,
        res,
        user,
        provider: 'yandex',
        isNewAccount: created,
        returnTo: flow.returnTo,
        returnOrigin: flow.returnOrigin,
        ref: flow.ref,
        fp: flow.fp,
        app: flow.app,
      });
    });
  }

  /**
   * Ошибка входа из приложения не должна оставаться JSON-страницей в браузере:
   * человек не видит, что делать дальше. Отказы с понятным текстом (закрытая
   * регистрация, блокировка) уезжают в приложение на экран входа. Всё
   * остальное бросается как раньше и попадает в логи.
   */
  /**
   * Подготовка входа для приложения: отказ любого статуса возвращается в
   * приложение текстом, а вход с сайта бросает исключение как раньше.
   * Возвращает `null`, если ответ уже отправлен.
   */
  private async startForApp<T>(
    app: AppLoginRequest | null | undefined,
    res: Response,
    run: () => T | Promise<T>,
  ): Promise<T | null> {
    try {
      return await run();
    } catch (error) {
      if (!app || !(error instanceof HttpException)) throw error;
      res.redirect(appRedirectUrl(app.redirect, { error: error.message }));
      return null;
    }
  }

  private async withAppErrors(
    app: AppLoginRequest | null | undefined,
    res: Response,
    run: () => Promise<void>,
  ): Promise<void> {
    try {
      await run();
    } catch (error) {
      if (
        !app ||
        !(error instanceof HttpException) ||
        error.getStatus() >= 500
      ) {
        throw error;
      }
      this.returnToApp(
        res,
        appRedirectUrl(app.redirect, { error: error.message }),
        'error',
      );
    }
  }

  /**
   * Возврат в приложение с колбэка провайдера — страницей, а не редиректом:
   * см. `app-return-page.ts`. Старт входа (`startForApp`) редиректит как
   * раньше: там цепочку начало само приложение, и Chrome её пропускает.
   * В адресе одноразовый код, поэтому ответ не кэшируется.
   */
  private returnToApp(
    res: Response,
    target: string,
    outcome: AppReturnOutcome,
  ): void {
    res.setHeader('Cache-Control', 'no-store');
    res.type('html').send(appReturnPage(target, outcome));
  }

  /**
   * Общий хвост любого входа: проверка статуса аккаунта, справочный профиль,
   * журнал, реферальное событие, куки и возврат на портал. Общий намеренно —
   * у каждого нового провайдера иначе тихо теряется то проверка блокировки,
   * то реферал, и заметно это становится сильно позже.
   */
  private async issueSessionAndRedirect(params: {
    req: Request;
    res: Response;
    user: User;
    provider: string;
    isNewAccount: boolean;
    returnTo?: string;
    returnOrigin?: string | null;
    ref?: string | null;
    fp?: string | null;
    app?: AppLoginRequest | null;
  }) {
    const {
      req,
      res,
      user,
      provider,
      isNewAccount,
      returnTo,
      returnOrigin,
      ref,
      fp,
      app,
    } = params;

    // Контур и итоговый адрес возврата нужны и для метки источника входа
    // (`resolveLoginClient`), и для самого редиректа ниже — считаем один
    // раз, до записи в журнал, чтобы `LoginAudit.client` не разъезжался с
    // тем, куда человек реально попадёт.
    const contour = this.contour(req.headers.host);
    const resolvedOrigin = resolveReturnOrigin({
      requested: returnOrigin,
      webOrigins: this.config.get<string>('WEB_ORIGIN'),
      contour,
    });
    const client: LoginClient = app
      ? resolveLoginClient({ kind: 'app' })
      : resolveLoginClient({
          kind: 'oauth',
          resolvedOrigin,
          contourWebOrigin: contour.webOrigin,
        });

    await this.completeLogin({
      req,
      user,
      provider,
      isNewAccount,
      ref,
      fp,
      client,
    });

    // Приложению — одноразовый код, а не cookie: токены оно заберёт само,
    // предъявив PKCE-верификатор (см. exchangeAppLoginCode).
    if (app) {
      const code = await this.createAppLoginCode(user.id, app.challenge);
      this.returnToApp(res, appRedirectUrl(app.redirect, { code }), 'code');
      return;
    }

    await this.issueTokens(
      user.id,
      user.email,
      toRole(user.role),
      res,
      req.headers.host,
    );
    res.redirect(`${resolvedOrigin}${safeReturnTo(returnTo)}`);
  }

  /**
   * Проверки и учёт, одинаковые для любого входа, куда бы потом ни ушёл
   * ответ — редиректом (OAuth) или JSON-ом (мини-приложение Telegram).
   */
  private async completeLogin(params: {
    req: Request;
    user: User;
    provider: string;
    isNewAccount: boolean;
    ref?: string | null;
    fp?: string | null;
    /** Источник входа для воронки метрик — см. `login-client.ts`. */
    client: LoginClient;
  }) {
    const { req, user, provider, isNewAccount, ref, fp, client } = params;
    await assertAccountActive(this.prisma, user);
    await this.ensureContactsProfile(user.id);

    await this.prisma.loginAudit.create({
      data: {
        userId: user.id,
        provider,
        client,
        ip: req.ip,
        userAgent: req.headers['user-agent'] ?? null,
      },
    });

    if (isNewAccount) {
      this.announceRegistration(user.id, user.email, req, ref, fp);
    }
  }

  /**
   * Владелец сессии из `access_token` cookie — для привязки способа входа,
   * где логика ровно та же, что у AuthGuard (тот же `JwtSignService`), но
   * гостя пускать некуда: возврат `null`, решение принимает вызывающий.
   *
   * Refresh здесь намеренно не делается: `access_token` живёт 15 минут
   * (`ACCESS_TOKEN_TTL`), и человек, долго читавший экран «Аккаунт» перед
   * нажатием «Привязать», рискует получить `linkError=session`, хотя
   * `refresh_token` ещё жив. Это не дыра безопасности (человек просто
   * повторит попытку), а UX-шероховатость — закрыта на клиенте:
   * веб-версия перед переходом на `/auth/<provider>?link=1` сама дёргает
   * лёгкий запрос через `ApiClient` (`account.tsx`, `startLink`), и его
   * встроенный 401→refresh обновляет cookie ДО перехода сюда.
   */
  private async readSessionUserId(req: Request): Promise<string | null> {
    const token = (req.cookies as Record<string, string> | undefined)?.[
      ACCESS_COOKIE
    ];
    if (!token) return null;
    try {
      return (await this.jwt.verifyAccessToken(token)).sub;
    } catch {
      return null;
    }
  }

  /**
   * Отказ в привязке — редирект на экран «Аккаунт», а не JSON-ошибка:
   * разговор начала навигация браузера (`window.location.assign`), и
   * человек должен увидеть понятный текст на своём экране, а не голый ответ
   * сервера.
   */
  private redirectLinkError(
    res: Response,
    contour: Contour,
    returnTo: string | undefined,
    returnOrigin: string | null | undefined,
    code: string,
  ): void {
    const origin = resolveReturnOrigin({
      requested: returnOrigin,
      webOrigins: this.config.get<string>('WEB_ORIGIN'),
      contour,
    });
    res.redirect(`${origin}${safeReturnTo(returnTo)}?linkError=${code}`);
  }

  /**
   * Общий хвост колбэка привязки Google/Яндекс: сессия перепроверяется
   * заново (см. комментарий у `handleGoogleCallback`), идентичность
   * прикрепляется через `IdentityService.link`, отказ конфликтом уезжает
   * понятным текстом, а не 409 в браузер.
   */
  private async finishLinking(params: {
    req: Request;
    res: Response;
    contour: Contour;
    expectedUserId: string;
    provider: 'google' | 'yandex';
    externalId: string;
    returnTo?: string;
    returnOrigin?: string | null;
  }): Promise<void> {
    const {
      req,
      res,
      contour,
      expectedUserId,
      provider,
      externalId,
      returnTo,
      returnOrigin,
    } = params;
    const currentUserId = await this.readSessionUserId(req);
    if (!currentUserId || currentUserId !== expectedUserId) {
      this.redirectLinkError(res, contour, returnTo, returnOrigin, 'session');
      return;
    }
    try {
      await this.identities.link(currentUserId, provider, externalId);
    } catch (error) {
      if (error instanceof ConflictException) {
        this.redirectLinkError(
          res,
          contour,
          returnTo,
          returnOrigin,
          'conflict',
        );
        return;
      }
      throw error;
    }
    const origin = resolveReturnOrigin({
      requested: returnOrigin,
      webOrigins: this.config.get<string>('WEB_ORIGIN'),
      contour,
    });
    res.redirect(`${origin}${safeReturnTo(returnTo)}?linked=${provider}`);
  }

  /** Список способов входа для экрана «Аккаунт». */
  async listIdentities(userId: string): Promise<IdentitySummary[]> {
    return this.identities.listIdentities(userId);
  }

  /** Отвязка способа входа; провайдер из URL проверяется здесь же. */
  async unlinkIdentity(
    userId: string,
    provider: string,
  ): Promise<{ ok: true }> {
    if (!isAuthProvider(provider)) {
      throw new BadRequestException('Неизвестный способ входа');
    }
    await this.identities.unlink(userId, provider);
    if (provider === 'telegram') {
      // «Уведомления» гасят устройство `provider: 'telegram'` по этому
      // событию — сами они `UserIdentity` не читают (контракт сервисных
      // модулей), поэтому факт отвязки сообщает `auth`.
      const event: AuthTelegramDisconnectedEvent = {
        name: AUTH_TELEGRAM_DISCONNECTED_EVENT,
        userId,
      };
      this.events.emit(event.name, event);
    }
    return { ok: true };
  }

  /**
   * Привязка Telegram живой сессией (не вход): для случая, когда веб-версия
   * открыта внутри Telegram, а человек уже вошёл через Google/Яндекс и хочет
   * добавить Telegram как запасной способ.
   */
  async linkTelegram(
    userId: string,
    body: { initData?: unknown },
    req: Request,
  ): Promise<{ ok: true }> {
    await this.providers.assertEnabled('telegram', req.hostname);
    const verified = verifyTelegramInitData({
      raw: body?.initData,
      botToken: this.config.get<string>('TELEGRAM_BOT_TOKEN'),
      nowSec: Math.floor(Date.now() / 1000),
    });
    if (!verified.ok) {
      if (verified.reason === 'not-configured') {
        throw new ServiceUnavailableException(
          'Вход через Telegram не настроен',
        );
      }
      throw new UnauthorizedException('Telegram не подтвердил вход');
    }
    await this.identities.link(userId, 'telegram', String(verified.user.id));
    this.announceTelegramConnected(userId, verified.user);
    return { ok: true };
  }

  /**
   * Вход из мини-приложения Telegram (`@vedamatch_bot` → ios.vedamatch.com).
   * Подпись данных запуска проверяется у себя ключом бота; дальше — тот же
   * путь, что у OAuth: способ включён для домена, аккаунт по паре
   * «telegram + id», закрытая регистрация, общие проверки.
   *
   * Ответ зависит от `mode` (см. `telegram-webapp-mode.ts`):
   * - по умолчанию (нет `mode`) — cookie-сессия, как раньше; телефоны
   *   открывают мини-приложение top-level, и cookie там первосторонняя;
   * - `mode: 'token'` — пара токенов в теле ответа, без cookie. Нужен
   *   Telegram Desktop и web.telegram.org: там мини-приложение живёт в
   *   `<iframe>` на чужом происхождении, и cookie портала как
   *   третьесторонняя браузером режется — тот же путь токенов, что у
   *   мобильного приложения (`exchangeAppLoginCode`).
   */
  async loginWithTelegramWebApp(
    body: { initData?: unknown; ref?: unknown; fp?: unknown; mode?: unknown },
    req: Request,
    res: Response,
  ): Promise<{ ok: true } | AppTokenResponse> {
    const mode = parseTelegramWebAppMode(body?.mode);
    await this.providers.assertEnabled('telegram', req.hostname);
    const verified = verifyTelegramInitData({
      raw: body?.initData,
      botToken: this.config.get<string>('TELEGRAM_BOT_TOKEN'),
      nowSec: Math.floor(Date.now() / 1000),
    });
    if (!verified.ok) {
      if (verified.reason === 'not-configured') {
        throw new ServiceUnavailableException(
          'Вход через Telegram не настроен',
        );
      }
      throw new UnauthorizedException('Telegram не подтвердил вход');
    }

    const { user, created } = await this.identities.resolve(
      { ...mapTelegramProfile(verified.user), requestIp: req.ip ?? null },
      { beforeCreate: () => this.assertRegistrationOpen() },
    );
    await this.completeLogin({
      req,
      user,
      provider: 'telegram',
      isNewAccount: created,
      ref: shortToken(body?.ref),
      fp: shortToken(body?.fp),
      client: resolveLoginClient({ kind: 'telegram' }),
    });
    this.announceTelegramConnected(user.id, verified.user);

    if (mode === 'token') {
      return this.appTokens(user);
    }

    await this.issueTokens(
      user.id,
      user.email,
      toRole(user.role),
      res,
      req.headers.host,
    );
    return { ok: true };
  }

  /**
   * Факт «есть живая связка с Telegram» — для «Уведомлений»: заводят или
   * обновляют устройство `provider: 'telegram'`, не читая `UserIdentity`.
   * Шлётся и при входе через мини-приложение, и при привязке живой сессией:
   * оба пути одинаково подтверждают подписью бота владение чатом с ним.
   */
  private announceTelegramConnected(
    userId: string,
    telegramUser: { id: number; allowsWriteToPm?: boolean },
  ): void {
    const event: AuthTelegramConnectedEvent = {
      name: AUTH_TELEGRAM_CONNECTED_EVENT,
      userId,
      telegramUserId: String(telegramUser.id),
      canWrite: telegramUser.allowsWriteToPm === true,
    };
    this.events.emit(event.name, event);
  }

  private async createAppLoginCode(
    userId: string,
    codeChallenge: string,
  ): Promise<string> {
    const code = randomBytes(32).toString('base64url');
    await this.prisma.appLoginCode.create({
      data: {
        codeHash: this.hash(code),
        userId,
        codeChallenge,
        expiresAt: new Date(Date.now() + APP_LOGIN_CODE_TTL_MS),
      },
    });
    return code;
  }

  /**
   * Обмен одноразового кода на пару токенов. Код гасится до проверки
   * верификатора: перебирать верификаторы на одном перехваченном коде
   * нельзя, первая же неудача сжигает его. Все отказы отвечают одним текстом,
   * чтобы по ответу нельзя было отличить протухший код от чужого.
   */
  async exchangeAppLoginCode(body: {
    code?: unknown;
    codeVerifier?: unknown;
  }): Promise<AppTokenResponse> {
    const invalid = new UnauthorizedException('Код входа недействителен');
    const code = body?.code;
    if (typeof code !== 'string' || !code || code.length > 128) throw invalid;

    const stored = await this.prisma.appLoginCode.findUnique({
      where: { codeHash: this.hash(code) },
      include: { user: true },
    });
    if (!stored || stored.usedAt || stored.expiresAt < new Date()) {
      throw invalid;
    }
    const claimed = await this.prisma.appLoginCode.updateMany({
      where: { id: stored.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    if (claimed.count === 0) throw invalid;
    if (!verifyPkceS256(body.codeVerifier, stored.codeChallenge)) throw invalid;

    await assertAccountActive(this.prisma, stored.user);
    return this.appTokens(stored.user);
  }

  /** Ротация refresh-токена приложения: те же правила, что у cookie-сессии. */
  async refreshApp(body: {
    refreshToken?: unknown;
  }): Promise<AppTokenResponse> {
    const token = body?.refreshToken;
    const { user, familyId } = await this.consumeRefreshToken(
      typeof token === 'string' ? token : undefined,
    );
    return this.appTokens(user, familyId);
  }

  async logoutApp(body: { refreshToken?: unknown }) {
    const token = body?.refreshToken;
    if (typeof token === 'string' && token) {
      await this.prisma.refreshToken.updateMany({
        where: { tokenHash: this.hash(token) },
        data: { revoked: true, revokedAt: new Date() },
      });
    }
    return { ok: true };
  }

  private async appTokens(
    user: User,
    familyId?: string,
  ): Promise<AppTokenResponse> {
    const { accessToken, refreshToken, refreshTtlMs } = await this.mintTokens(
      user.id,
      user.email,
      toRole(user.role),
      familyId,
    );
    return {
      accessToken,
      refreshToken,
      expiresIn: Math.round(this.accessTtlMs() / 1000),
      refreshExpiresIn: Math.round(refreshTtlMs / 1000),
    };
  }

  /**
   * Claims Google → аккаунт. Вынесено из колбэка: openid-client ESM-only и в
   * тестах заглушен, а поиск человека проверять надо.
   *
   * Поиск идёт только по паре «google + sub». Совпадение почты аккаунты не
   * связывает: прежний код дописывал googleId найденному по адресу, и со
   * вторым провайдером это стало бы способом забрать чужой аккаунт.
   */
  async resolveGoogleProfile(claims: {
    sub: string;
    email: string;
    name?: string | null;
    picture?: string | null;
    requestIp?: string | null;
  }) {
    return this.identities.resolve(
      {
        provider: 'google',
        externalId: claims.sub,
        email: claims.email,
        name: claims.name ?? claims.email,
        avatarUrl: claims.picture ?? undefined,
        requestIp: claims.requestIp,
      },
      // Закрытая регистрация не трогает уже заведённых: отказ получает
      // только тот, для кого пришлось бы создать новую запись.
      { beforeCreate: () => this.assertRegistrationOpen() },
    );
  }

  /**
   * Единственная точка касания auth с реферальной программой: факт
   * регистрации со всем, что нужно подписчику. О баллах здесь не знают —
   * сумма, уровни и антифрод живут в модуле `rewards`, а событие
   * самодостаточно, чтобы он не дочитывал ничего из чужих таблиц.
   */
  private announceRegistration(
    userId: string,
    email: string,
    req: Request,
    referralCode?: string | null,
    deviceId?: string | null,
  ): void {
    const event: UserRegisteredEvent = {
      name: USER_REGISTERED_EVENT,
      userId,
      email,
      referralCode: shortToken(referralCode),
      referralSource: null,
      ip: req.ip ?? null,
      deviceId: shortToken(deviceId),
      occurredAt: new Date().toISOString(),
    };
    this.events.emit(event.name, event);
  }

  /** Приём новых аккаунтов закрыт — вход существующих это не затрагивает. */
  private async assertRegistrationOpen(): Promise<void> {
    const { mode, note } = await readRegistrationMode(this.prisma);
    if (mode === 'open') return;
    throw new ForbiddenException(
      note?.trim() || 'Регистрация новых участников сейчас закрыта',
    );
  }

  /**
   * Карточка справочника людей заводится вместе с пользователем: человек
   * должен быть в списке участников сразу после регистрации, ничего не
   * заполняя. Содержимое карточки берётся из профиля join-ом, поэтому пустых
   * полей достаточно.
   *
   * Вызывается на каждом входе, а не только при создании User: так в
   * справочник дотягиваются и те, кто зарегистрировался раньше этой правки.
   * `createMany` со `skipDuplicates` вместо `create` — параллельный вход
   * второй вкладкой не должен ронять авторизацию конфликтом уникального
   * `userId`.
   *
   * Логика продублирована из `PeopleService.ensureProfile` намеренно:
   * ChatModule импортирует AuthModule, и обратная зависимость сделала бы
   * их циклическими. Значения совпадают с `chat/people/people-defaults.ts` и
   * с бэкфиллом миграции `20260814090000_contacts_profile_for_every_user`;
   * менять их нужно во всех трёх местах.
   */
  private async ensureContactsProfile(userId: string): Promise<void> {
    try {
      await this.prisma.contactsProfile.createMany({
        data: [{ userId, status: 'active', visibility: 'everyone' }],
        skipDuplicates: true,
      });
    } catch (error) {
      // Справочник не должен мешать входу: логиним и идём дальше.
      this.logger.error(
        `Не удалось создать карточку справочника для ${userId}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  /** Включён ли вход по логину и паролю. В production недоступен никогда. */
  get devAuthEnabled(): boolean {
    return (
      !this.isProd &&
      this.config.get<string>('DEV_AUTH_ENABLED', 'false') === 'true'
    );
  }

  /**
   * Вход по email и паролю для локальной отладки: Google OAuth требует реального
   * аккаунта и внешнего редиректа, что мешает тестировать демо-профили Union.
   */
  async devLogin(
    body: { email?: string; password?: string; returnTo?: string },
    req: Request,
    res: Response,
  ) {
    const user = await this.verifyDevCredentials(body, req);
    await this.issueTokens(
      user.id,
      user.email,
      toRole(user.role),
      res,
      req.headers.host,
    );
    return {
      ok: true,
      returnTo: safeReturnTo(body?.returnTo),
      user: {
        id: user.id,
        email: user.email,
        name: resolveDisplayName(user),
      },
    };
  }

  /** Dev-вход из приложения на эмуляторе: те же проверки, токены в ответе. */
  async devLoginApp(
    body: { email?: string; password?: string },
    req: Request,
  ): Promise<AppTokenResponse> {
    return this.appTokens(await this.verifyDevCredentials(body, req));
  }

  private async verifyDevCredentials(
    body: { email?: string; password?: string },
    req: Request,
  ): Promise<User> {
    if (!this.devAuthEnabled) {
      throw new ServiceUnavailableException('Dev-вход отключён');
    }
    const email = body?.email?.trim().toLowerCase();
    const password = body?.password;
    if (!email || !password) {
      throw new BadRequestException('Укажите email и пароль');
    }

    const user = await this.prisma.user.findUnique({ where: { email } });
    const invalid = new UnauthorizedException('Неверный email или пароль');
    if (!user?.passwordHash) throw invalid;
    if (!(await verifyPassword(password, user.passwordHash))) throw invalid;

    await assertAccountActive(this.prisma, user);
    await this.ensureContactsProfile(user.id);

    await this.prisma.loginAudit.create({
      data: {
        userId: user.id,
        provider: 'dev-password',
        ip: req.ip,
        userAgent: req.headers['user-agent'] ?? null,
      },
    });
    return user;
  }

  /** Список демо-аккаунтов для формы dev-входа. */
  async devAccounts() {
    if (!this.devAuthEnabled) {
      throw new ServiceUnavailableException('Dev-вход отключён');
    }
    const users = await this.prisma.user.findMany({
      where: { isDemo: true, passwordHash: { not: null } },
      select: { email: true, name: true },
      orderBy: { name: 'asc' },
    });
    return { accounts: users };
  }

  private async issueTokens(
    userId: string,
    email: string,
    role: Role,
    res: Response,
    host?: string | null,
    familyId?: string,
  ) {
    const contour = this.contour(host);
    const { accessToken, refreshToken, refreshTtlMs } = await this.mintTokens(
      userId,
      email,
      role,
      familyId,
    );
    const ttlDays = refreshTtlMs / (24 * 60 * 60 * 1000);

    res.cookie(ACCESS_COOKIE, accessToken, {
      httpOnly: true,
      secure: this.isProd,
      sameSite: 'lax',
      domain: contour.cookieDomain,
      maxAge: this.accessTtlMs(),
      path: '/',
    });
    res.cookie(REFRESH_COOKIE, refreshToken, {
      httpOnly: true,
      secure: this.isProd,
      sameSite: 'lax',
      domain: contour.cookieDomain,
      maxAge: ttlDays * 24 * 60 * 60 * 1000,
      path: '/auth',
    });
    res.cookie(SESSION_MARKER_COOKIE, '1', {
      httpOnly: false,
      secure: this.isProd,
      sameSite: 'lax',
      domain: contour.cookieDomain,
      maxAge: ttlDays * 24 * 60 * 60 * 1000,
      path: '/',
    });
  }

  /**
   * Пара токенов и запись refresh в базе. Куда их отдать, решает вызывающий.
   * Без `familyId` — новый вход и новое семейство; ротация передаёт своё.
   */
  private async mintTokens(
    userId: string,
    email: string,
    role: Role,
    familyId: string = randomUUID(),
  ) {
    const accessToken = await this.jwt.signAccessToken({
      sub: userId,
      email,
      role,
    });
    const refreshToken = randomBytes(48).toString('hex');
    const ttlDays = Number(this.config.get('REFRESH_TOKEN_TTL_DAYS', '30'));
    const refreshTtlMs = ttlDays * 24 * 60 * 60 * 1000;

    await this.prisma.refreshToken.create({
      data: {
        tokenHash: this.hash(refreshToken),
        userId,
        familyId,
        expiresAt: new Date(Date.now() + refreshTtlMs),
      },
    });
    return { accessToken, refreshToken, refreshTtlMs };
  }

  private clearSessionCookies(res: Response, host?: string | null) {
    const contour = this.contour(host);
    res.clearCookie(ACCESS_COOKIE, { path: '/', domain: contour.cookieDomain });
    res.clearCookie(REFRESH_COOKIE, {
      path: '/auth',
      domain: contour.cookieDomain,
    });
    res.clearCookie(SESSION_MARKER_COOKIE, {
      path: '/',
      domain: contour.cookieDomain,
    });
  }

  /**
   * Время жизни access-cookie равно TTL самого JWT (ACCESS_TOKEN_TTL, формат
   * jose: 15m / 1h / 30s), иначе при смене конфига cookie и токен разъедутся.
   */
  private accessTtlMs(): number {
    const raw = this.config.get<string>('ACCESS_TOKEN_TTL', '15m');
    const match = /^(\d+)\s*([smhd])$/.exec(raw.trim());
    if (!match) return 15 * 60 * 1000;
    const unit = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[match[2]]!;
    return Number(match[1]) * unit;
  }

  async refresh(req: Request, res: Response) {
    try {
      return await this.rotateRefreshToken(req, res);
    } catch (error) {
      // Refresh мёртв — снимаем все cookie сессии. Маркер — чтобы web не
      // крутил splash «Восстанавливаем сессию». Саму refresh-cookie — чтобы
      // вкладка не предъявляла отозванный токен снова: потоки событий сайта
      // переподключаются через refresh бесконечно, и каждый такой повтор
      // отзывал все сессии человека, включая приложение (VED-233).
      // Гонка ротации сюда не доходит: проигравший запрос получает свою
      // пару (см. consumeRefreshToken), так что 401 здесь — сессии нет.
      if (error instanceof UnauthorizedException) {
        this.clearSessionCookies(res, req.headers.host);
      }
      throw error;
    }
  }

  private async rotateRefreshToken(req: Request, res: Response) {
    const { user, familyId } = await this.consumeRefreshToken(
      (req.cookies as Record<string, string>)[REFRESH_COOKIE],
    );
    await this.issueTokens(
      user.id,
      user.email,
      toRole(user.role),
      res,
      req.headers.host,
      familyId,
    );
    return { ok: true };
  }

  /**
   * Проверка и гашение refresh-токена, общая для cookie-сессии и приложения.
   * Возвращает владельца и семейство для новой пары; пару выдаёт вызывающий.
   */
  private async consumeRefreshToken(
    token: string | undefined,
  ): Promise<{ user: User; familyId: string }> {
    if (!token) throw new UnauthorizedException('Нет refresh-токена');

    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: this.hash(token) },
      include: { user: true },
    });
    if (!stored || stored.expiresAt < new Date()) {
      throw new UnauthorizedException('Refresh-токен недействителен');
    }
    // Повторное предъявление уже отозванного токена — признак кражи
    // (легитимный клиент после ротации им больше не пользуется). Отзываем
    // семейство токена: и у вора, и у жертвы этого входа придётся войти
    // заново. Остальные входы человека не трогаем, а повтор сразу после
    // ротации — тот же клиент, ему новая пара; см. refresh-reuse.ts.
    if (stored.revoked) {
      const verdict = judgeRevokedRefresh(stored, new Date());
      if (verdict.kind === 'reissue') {
        // Живой токен в семействе — вход не закрыт. После выхода или отзыва
        // семейства живых нет, и свежий `revokedAt` пары не даёт.
        const alive = await this.prisma.refreshToken.count({
          where: { familyId: verdict.familyId, revoked: false },
        });
        if (alive === 0) {
          throw new UnauthorizedException('Refresh-токен недействителен');
        }
        await assertAccountActive(this.prisma, stored.user);
        return { user: stored.user, familyId: verdict.familyId };
      }
      await this.prisma.refreshToken.updateMany({
        where: verdict.where,
        data: { revoked: true, revokedAt: new Date() },
      });
      throw new UnauthorizedException('Refresh-токен недействителен');
    }
    await assertAccountActive(this.prisma, stored.user);

    // Ротация как CAS: токен гасит ровно один запрос. Проигравший — второй
    // запрос того же клиента в ту же миллисекунду (две вкладки); ему такая
    // же пара того же семейства, как повтору в окне. Живой токен победителя
    // здесь не проверяем: победитель мог ещё не успеть его записать.
    // Семейство проставляется и старому токену: его повтор должен найти
    // продолжение цепочки, даже если токен выдан до появления семейств.
    const familyId = rotationFamily(stored);
    await this.prisma.refreshToken.updateMany({
      where: { id: stored.id, revoked: false },
      data: { revoked: true, revokedAt: new Date(), familyId },
    });
    return { user: stored.user, familyId };
  }

  async logout(req: Request, res: Response) {
    const token = (req.cookies as Record<string, string>)[REFRESH_COOKIE];
    if (token) {
      await this.prisma.refreshToken.updateMany({
        where: { tokenHash: this.hash(token) },
        data: { revoked: true, revokedAt: new Date() },
      });
    }
    this.clearSessionCookies(res, req.headers.host);
    return { ok: true };
  }

  /** Централизованный logout: отзыв всех refresh-токенов пользователя */
  async logoutEverywhere(userId: string, res: Response, host?: string | null) {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revoked: false },
      data: { revoked: true, revokedAt: new Date() },
    });
    this.clearSessionCookies(res, host);
    return { ok: true };
  }

  private hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
