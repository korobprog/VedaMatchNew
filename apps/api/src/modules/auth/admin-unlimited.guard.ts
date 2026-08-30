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
import type { AdminServiceSlug } from '@vedamatch/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtSignService } from './jwt.service';

const ADMIN_UNLIMITED_KEY = 'admin-unlimited';

/**
 * Помечает маршрут: администратору троттлинг на нём не считается.
 * Без аргумента — только роль `admin`. С слагом сервиса — ещё и
 * `service-admin`, которому этот сервис назначен (см. `canAdminService`).
 */
export const AdminUnlimited = (
  service?: AdminServiceSlug,
): MethodDecorator & ClassDecorator =>
  SetMetadata(ADMIN_UNLIMITED_KEY, service ?? true);

/**
 * Тот же троттлер, что и глобально (см. app.module.ts), но на маршрутах с
 * `@AdminUnlimited()` администратор проходит без лимита — иначе общий лимит
 * «дверь для спама» бьёт по нему же при разборе жалоб, где пишут пачками.
 *
 * Guard глобальный и выполняется раньше AuthGuard контроллеров — req.user
 * ещё пуст, поэтому роль читаем прямо из токена, а не из запроса. Устаревшая
 * роль в токене (до 15 минут после разжалования) не риск: это только
 * смягчение лимита, а не выдача прав. Список сервисов service-admin в токен
 * не попадает (см. AccessTokenPayload) — для него отдельный запрос в базу,
 * тем же составом, что и AuthGuard.loadAdminServices.
 */
@Injectable()
export class AdminAwareThrottlerGuard extends ThrottlerGuard {
  constructor(
    @InjectThrottlerOptions() options: ThrottlerModuleOptions,
    @InjectThrottlerStorage() storageService: ThrottlerStorage,
    reflector: Reflector,
    private readonly jwt: JwtSignService,
    private readonly prisma: PrismaService,
  ) {
    super(options, storageService, reflector);
  }

  protected async shouldSkip(context: ExecutionContext): Promise<boolean> {
    const meta = this.reflector.getAllAndOverride<
      boolean | AdminServiceSlug | undefined
    >(ADMIN_UNLIMITED_KEY, [context.getHandler(), context.getClass()]);
    if (!meta) return false;

    const req = context.switchToHttp().getRequest<Request>();
    const header = req.headers.authorization;
    const token = header?.startsWith('Bearer ')
      ? header.slice(7)
      : (req.cookies as Record<string, string> | undefined)?.access_token;
    if (!token) return false;
    try {
      const payload = await this.jwt.verifyAccessToken(token);
      if (payload.role === 'admin') return true;
      if (typeof meta !== 'string' || payload.role !== 'service-admin')
        return false;
      const scope = await this.prisma.serviceAdmin.findFirst({
        where: { userId: payload.sub, service: { slug: meta } },
        select: { userId: true },
      });
      return Boolean(scope);
    } catch {
      return false;
    }
  }
}
