import {
  CanActivate,
  createParamDecorator,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import type { AccessTokenPayload } from '@vedamatch/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { assertAccountActive } from '../users/account-status';
import { JwtSignService } from './jwt.service';

export interface AuthenticatedRequest extends Request {
  user: AccessTokenPayload;
}

/** Реже пишем «был(а) в сети», чем приходят запросы: точность до 5 минут. */
export const LAST_SEEN_THROTTLE_MS = 5 * 60 * 1000;

@Injectable()
export class AuthGuard implements CanActivate {
  private readonly lastSeenWrites = new Map<string, number>();

  constructor(
    private readonly jwt: JwtSignService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const header = req.headers.authorization;
    const token = header?.startsWith('Bearer ')
      ? header.slice(7)
      : (req.cookies as Record<string, string> | undefined)?.access_token;
    if (!token) throw new UnauthorizedException('Требуется авторизация');
    try {
      req.user = await this.jwt.verifyAccessToken(token);
    } catch {
      throw new UnauthorizedException('Токен недействителен или истёк');
    }
    await this.ensureAccountActive(req.user.sub);
    this.touchLastSeen(req.user.sub);
    return true;
  }

  private async ensureAccountActive(userId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException('Токен недействителен или истёк');
    await assertAccountActive(this.prisma, user);
  }

  /** Обновление активности не должно задерживать или ронять сам запрос. */
  private touchLastSeen(userId: string): void {
    const now = Date.now();
    const written = this.lastSeenWrites.get(userId) ?? 0;
    if (now - written < LAST_SEEN_THROTTLE_MS) return;
    this.lastSeenWrites.set(userId, now);

    void this.prisma.user
      .update({
        where: { id: userId },
        data: { lastSeenAt: new Date(now) },
      })
      .catch(() => this.lastSeenWrites.delete(userId));
  }
}

/**
 * Пропускает и гостей, и авторизованных: тикет можно создать без входа, но если
 * токен есть — обращение привязывается к аккаунту и видно в кабинете.
 */
@Injectable()
export class OptionalAuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtSignService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context
      .switchToHttp()
      .getRequest<Request & { user?: AccessTokenPayload }>();
    const header = req.headers.authorization;
    const token = header?.startsWith('Bearer ')
      ? header.slice(7)
      : (req.cookies as Record<string, string> | undefined)?.access_token;
    if (!token) return true;
    try {
      req.user = await this.jwt.verifyAccessToken(token);
    } catch {
      // Просроченный токен не должен мешать гостю отправить обращение.
    }
    return true;
  }
}

/** Как CurrentUser, но для маршрутов с OptionalAuthGuard: undefined у гостя. */
export const OptionalUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AccessTokenPayload | undefined =>
    context.switchToHttp().getRequest<{ user?: AccessTokenPayload }>().user,
);

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AccessTokenPayload =>
    context.switchToHttp().getRequest<AuthenticatedRequest>().user,
);
