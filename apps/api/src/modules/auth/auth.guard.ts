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
    this.touchLastSeen(req.user.sub);
    return true;
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

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AccessTokenPayload =>
    context.switchToHttp().getRequest<AuthenticatedRequest>().user,
);
