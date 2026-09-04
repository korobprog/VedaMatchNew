import {
  BadGatewayException,
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  OnModuleInit,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { Request, Response } from 'express';
import { createHash, randomBytes } from 'node:crypto';
import * as oidc from 'openid-client';
import {
  USER_REGISTERED_EVENT,
  resolveDisplayName,
  type Role,
  type UserRegisteredEvent,
} from '@vedamatch/shared';
import type { User } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthProvidersService } from './auth-providers.service';
import { readRegistrationMode } from '../billing/billing-mode';
import { assertAccountActive } from '../users/account-status';
import { IdentityService } from './identity.service';
import { JwtSignService } from './jwt.service';
import { verifyPassword } from './password';
import { toRole } from './role';
import {
  YANDEX_AUTHORIZE,
  YANDEX_INFO,
  YANDEX_TOKEN,
  mapYandexProfile,
} from './yandex.provider';

export { toRole } from './role';

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

  private get apiUrl(): string {
    return this.config.get<string>('API_PUBLIC_URL', 'http://localhost:4000');
  }

  private get webOrigin(): string {
    return this.config.get<string>('WEB_ORIGIN', 'http://localhost:3000');
  }

  private get cookieDomain(): string | undefined {
    return this.config.get<string>('COOKIE_DOMAIN') || undefined;
  }

  private requireGoogle(): oidc.Configuration {
    if (!this.google) {
      throw new ServiceUnavailableException('Google OAuth не сконфигурирован');
    }
    return this.google;
  }

  async startGoogleLogin(
    res: Response,
    returnTo?: string,
    referralCode?: string,
    deviceId?: string,
  ) {
    const google = this.requireGoogle();
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
    };
    res.cookie(OIDC_COOKIE, JSON.stringify(oidcPayload), {
      httpOnly: true,
      secure: this.isProd,
      sameSite: 'lax',
      domain: this.cookieDomain,
      maxAge: 10 * 60 * 1000,
      path: '/auth',
    });

    const url = oidc.buildAuthorizationUrl(google, {
      redirect_uri: `${this.apiUrl}/auth/google/callback`,
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
    const raw = (req.cookies as Record<string, string>)[OIDC_COOKIE];
    if (!raw) {
      throw new BadRequestException('OAuth-сессия не найдена или истекла');
    }
    const { codeVerifier, state, nonce, returnTo, ref, fp } = JSON.parse(
      raw,
    ) as {
      codeVerifier: string;
      state: string;
      nonce: string;
      returnTo?: string;
      ref?: string | null;
      fp?: string | null;
    };

    const currentUrl = new URL(`${this.apiUrl}${req.originalUrl}`);
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

    res.clearCookie(OIDC_COOKIE, { path: '/auth', domain: this.cookieDomain });
    await this.issueSessionAndRedirect({
      req,
      res,
      user,
      provider: 'google',
      isNewAccount,
      returnTo,
      ref,
      fp,
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
  ) {
    // Проверка здесь, а не только при выдаче списка кнопок: спрятанная
    // кнопка не делает способ недоступным, а важно, что вход невозможен.
    await this.providers.assertEnabled('yandex', req.hostname);
    const { clientId } = this.requireYandex();

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
        ref: shortToken(referralCode),
        fp: shortToken(deviceId),
      }),
      {
        httpOnly: true,
        secure: this.isProd,
        sameSite: 'lax',
        domain: this.cookieDomain,
        maxAge: 10 * 60 * 1000,
        path: '/auth',
      },
    );

    const url = new URL(YANDEX_AUTHORIZE);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('client_id', clientId);
    url.searchParams.set('redirect_uri', `${this.apiUrl}/auth/yandex/callback`);
    url.searchParams.set('state', state);
    url.searchParams.set('code_challenge', challenge);
    url.searchParams.set('code_challenge_method', 'S256');

    res.redirect(url.toString());
  }

  async handleYandexCallback(req: Request, res: Response) {
    await this.providers.assertEnabled('yandex', req.hostname);
    const { clientId, clientSecret } = this.requireYandex();

    const raw = (req.cookies as Record<string, string> | undefined)?.[
      YANDEX_COOKIE
    ];
    if (!raw) {
      throw new BadRequestException('OAuth-сессия не найдена или истекла');
    }
    res.clearCookie(YANDEX_COOKIE, {
      path: '/auth',
      domain: this.cookieDomain,
    });

    let flow: {
      verifier: string;
      state: string;
      returnTo?: string;
      ref?: string | null;
      fp?: string | null;
    };
    try {
      flow = JSON.parse(raw);
    } catch {
      throw new BadRequestException('OAuth-сессия повреждена');
    }

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

    const { user, created } = await this.identities.resolve(
      { ...mapYandexProfile(await infoRes.json()), requestIp: req.ip ?? null },
      { beforeCreate: () => this.assertRegistrationOpen() },
    );

    await this.issueSessionAndRedirect({
      req,
      res,
      user,
      provider: 'yandex',
      isNewAccount: created,
      returnTo: flow.returnTo,
      ref: flow.ref,
      fp: flow.fp,
    });
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
    ref?: string | null;
    fp?: string | null;
  }) {
    const { req, res, user, provider, isNewAccount, returnTo, ref, fp } = params;

    await assertAccountActive(this.prisma, user);
    await this.ensureContactsProfile(user.id);

    await this.prisma.loginAudit.create({
      data: {
        userId: user.id,
        provider,
        ip: req.ip,
        userAgent: req.headers['user-agent'] ?? null,
      },
    });

    if (isNewAccount) {
      this.announceRegistration(user.id, user.email, req, ref, fp);
    }

    await this.issueTokens(user.id, user.email, toRole(user.role), res);
    res.redirect(`${this.webOrigin}${safeReturnTo(returnTo)}`);
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

    await this.issueTokens(user.id, user.email, toRole(user.role), res);
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
  ) {
    const accessToken = await this.jwt.signAccessToken({
      sub: userId,
      email,
      role,
    });
    const refreshToken = randomBytes(48).toString('hex');
    const ttlDays = Number(this.config.get('REFRESH_TOKEN_TTL_DAYS', '30'));

    await this.prisma.refreshToken.create({
      data: {
        tokenHash: this.hash(refreshToken),
        userId,
        expiresAt: new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000),
      },
    });

    res.cookie(ACCESS_COOKIE, accessToken, {
      httpOnly: true,
      secure: this.isProd,
      sameSite: 'lax',
      domain: this.cookieDomain,
      maxAge: this.accessTtlMs(),
      path: '/',
    });
    res.cookie(REFRESH_COOKIE, refreshToken, {
      httpOnly: true,
      secure: this.isProd,
      sameSite: 'lax',
      domain: this.cookieDomain,
      maxAge: ttlDays * 24 * 60 * 60 * 1000,
      path: '/auth',
    });
    res.cookie(SESSION_MARKER_COOKIE, '1', {
      httpOnly: false,
      secure: this.isProd,
      sameSite: 'lax',
      domain: this.cookieDomain,
      maxAge: ttlDays * 24 * 60 * 60 * 1000,
      path: '/',
    });
  }

  private clearSessionCookies(res: Response) {
    res.clearCookie(ACCESS_COOKIE, { path: '/', domain: this.cookieDomain });
    res.clearCookie(REFRESH_COOKIE, {
      path: '/auth',
      domain: this.cookieDomain,
    });
    res.clearCookie(SESSION_MARKER_COOKIE, {
      path: '/',
      domain: this.cookieDomain,
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
      // Refresh мёртв — снимаем и маркер сессии, иначе web будет крутить
      // splash «Восстанавливаем сессию» вместо лендинга/формы входа.
      if (error instanceof UnauthorizedException) {
        res.clearCookie(SESSION_MARKER_COOKIE, {
          path: '/',
          domain: this.cookieDomain,
        });
      }
      throw error;
    }
  }

  private async rotateRefreshToken(req: Request, res: Response) {
    const token = (req.cookies as Record<string, string>)[REFRESH_COOKIE];
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
    // все токены пользователя: и у вора, и у жертвы придётся войти заново.
    if (stored.revoked) {
      await this.prisma.refreshToken.updateMany({
        where: { userId: stored.userId, revoked: false },
        data: { revoked: true },
      });
      throw new UnauthorizedException('Refresh-токен недействителен');
    }
    await assertAccountActive(this.prisma, stored.user);

    // Ротация как CAS: два одновременных refresh с одним cookie не должны
    // оба выдать пары — выигрывает тот, кто первым перевёл revoked в true.
    const rotated = await this.prisma.refreshToken.updateMany({
      where: { id: stored.id, revoked: false },
      data: { revoked: true },
    });
    if (rotated.count === 0) {
      throw new UnauthorizedException('Refresh-токен недействителен');
    }
    await this.issueTokens(
      stored.user.id,
      stored.user.email,
      toRole(stored.user.role),
      res,
    );
    return { ok: true };
  }

  async logout(req: Request, res: Response) {
    const token = (req.cookies as Record<string, string>)[REFRESH_COOKIE];
    if (token) {
      await this.prisma.refreshToken.updateMany({
        where: { tokenHash: this.hash(token) },
        data: { revoked: true },
      });
    }
    this.clearSessionCookies(res);
    return { ok: true };
  }

  /** Централизованный logout: отзыв всех refresh-токенов пользователя */
  async logoutEverywhere(userId: string, res: Response) {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revoked: false },
      data: { revoked: true },
    });
    this.clearSessionCookies(res);
    return { ok: true };
  }

  private hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
