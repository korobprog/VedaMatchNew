import { ExecutionContext, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  InjectThrottlerOptions,
  InjectThrottlerStorage,
  ThrottlerGuard,
  type ThrottlerModuleOptions,
  type ThrottlerStorage,
} from '@nestjs/throttler';
import type { Request } from 'express';
import { JwtSignService } from './jwt.service';

const ADMIN_UNLIMITED_KEY = 'admin-unlimited';

/** Помечает маршрут: администратору троттлинг на нём не считается. */
export const AdminUnlimited = (): MethodDecorator & ClassDecorator =>
  SetMetadata(ADMIN_UNLIMITED_KEY, true);

/**
 * Тот же троттлер, что и глобально (см. app.module.ts), но на маршрутах с
 * `@AdminUnlimited()` администратор проходит без лимита — иначе общий лимит
 * «дверь для спама» бьёт по нему же при разборе жалоб, где пишут пачками.
 *
 * Guard глобальный и выполняется раньше AuthGuard контроллеров — req.user
 * ещё пуст, поэтому роль читаем прямо из токена, а не из запроса. Устаревшая
 * роль в токене (до 15 минут после разжалования) не риск: это только
 * смягчение лимита, а не выдача прав.
 */
@Injectable()
export class AdminAwareThrottlerGuard extends ThrottlerGuard {
  constructor(
    @InjectThrottlerOptions() options: ThrottlerModuleOptions,
    @InjectThrottlerStorage() storageService: ThrottlerStorage,
    reflector: Reflector,
    private readonly jwt: JwtSignService,
  ) {
    super(options, storageService, reflector);
  }

  protected async shouldSkip(context: ExecutionContext): Promise<boolean> {
    const exempt = this.reflector.getAllAndOverride<boolean>(
      ADMIN_UNLIMITED_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!exempt) return false;

    const req = context.switchToHttp().getRequest<Request>();
    const header = req.headers.authorization;
    const token = header?.startsWith('Bearer ')
      ? header.slice(7)
      : (req.cookies as Record<string, string> | undefined)?.access_token;
    if (!token) return false;
    try {
      const payload = await this.jwt.verifyAccessToken(token);
      return payload.role === 'admin';
    } catch {
      return false;
    }
  }
}
