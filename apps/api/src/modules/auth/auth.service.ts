import {
  BadRequestException,
  Injectable,
  Logger,
  OnModuleInit,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { createHash, randomBytes } from 'node:crypto';
import * as oidc from 'openid-client';
import type { Role } from '@vedamatch/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtSignService } from './jwt.service';

const OIDC_COOKIE = 'oidc_flow';
const ACCESS_COOKIE = 'access_token';
const REFRESH_COOKIE = 'refresh_token';

/** Prisma enum → внешняя роль ('service_admin' → 'service-admin') */
export function toRole(dbRole: string): Role {
  return dbRole.replace('_', '-') as Role;
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

  async startGoogleLogin(res: Response) {
    const google = this.requireGoogle();
    const codeVerifier = oidc.randomPKCECodeVerifier();
    const codeChallenge = await oidc.calculatePKCECodeChallenge(codeVerifier);
    const state = oidc.randomState();
    const nonce = oidc.randomNonce();

    res.cookie(OIDC_COOKIE, JSON.stringify({ codeVerifier, state, nonce }), {
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
    const { codeVerifier, state, nonce } = JSON.parse(raw) as {
      codeVerifier: string;
      state: string;
      nonce: string;
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

    const user = await this.prisma.user.upsert({
      where: { email: claims.email as string },
      update: {
        googleId: claims.sub,
        name: (claims.name as string) ?? (claims.email as string),
        avatarUrl: (claims.picture as string) ?? null,
      },
      create: {
        email: claims.email as string,
        googleId: claims.sub,
        name: (claims.name as string) ?? (claims.email as string),
        avatarUrl: (claims.picture as string) ?? null,
      },
    });

    await this.prisma.loginAudit.create({
      data: {
        userId: user.id,
        provider: 'google',
        ip: req.ip,
        userAgent: req.headers['user-agent'] ?? null,
      },
    });

    res.clearCookie(OIDC_COOKIE, { path: '/auth', domain: this.cookieDomain });
    await this.issueTokens(user.id, user.email, toRole(user.role), res);
    res.redirect(this.webOrigin);
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
      maxAge: 15 * 60 * 1000,
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
  }

  async refresh(req: Request, res: Response) {
    const token = (req.cookies as Record<string, string>)[REFRESH_COOKIE];
    if (!token) throw new UnauthorizedException('Нет refresh-токена');

    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: this.hash(token) },
      include: { user: true },
    });
    if (!stored || stored.revoked || stored.expiresAt < new Date()) {
      throw new UnauthorizedException('Refresh-токен недействителен');
    }

    // Ротация: старый токен отзываем, выдаём новую пару
    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revoked: true },
    });
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
    res.clearCookie(ACCESS_COOKIE, { path: '/', domain: this.cookieDomain });
    res.clearCookie(REFRESH_COOKIE, {
      path: '/auth',
      domain: this.cookieDomain,
    });
    return { ok: true };
  }

  /** Централизованный logout: отзыв всех refresh-токенов пользователя */
  async logoutEverywhere(userId: string, res: Response) {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revoked: false },
      data: { revoked: true },
    });
    res.clearCookie(ACCESS_COOKIE, { path: '/', domain: this.cookieDomain });
    res.clearCookie(REFRESH_COOKIE, {
      path: '/auth',
      domain: this.cookieDomain,
    });
    return { ok: true };
  }

  private hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
