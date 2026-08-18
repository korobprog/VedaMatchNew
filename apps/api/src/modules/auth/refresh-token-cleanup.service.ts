import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

/** Раз в час: чаще незачем, таблица растёт со скоростью ротаций (~4/час/сессия). */
const TICK_MS = 60 * 60 * 1000;
/** Отозванные держим неделю: хвост нужен для reuse-detection в AuthService.refresh. */
export const REVOKED_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Каждый refresh создаёт новую строку RefreshToken и помечает старую
 * revoked — без чистки таблица растёт бесконечно (~100 строк на активную
 * сессию в сутки). Удаляем протухшие и давно отозванные. deleteMany
 * идемпотентен, поэтому lease-лок между репликами не нужен.
 */
@Injectable()
export class RefreshTokenCleanupService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(RefreshTokenCleanupService.name);
  private timer?: NodeJS.Timeout;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    this.timer = setInterval(() => void this.tick(), TICK_MS);
    this.timer.unref();
    void this.tick();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async tick(now = new Date()): Promise<number> {
    try {
      const { count } = await this.prisma.refreshToken.deleteMany({
        where: {
          OR: [
            { expiresAt: { lt: now } },
            {
              revoked: true,
              createdAt: { lt: new Date(now.getTime() - REVOKED_RETENTION_MS) },
            },
          ],
        },
      });
      if (count > 0) this.logger.log(`Удалено refresh-токенов: ${count}`);
      return count;
    } catch (error) {
      this.logger.warn(`Чистка refresh-токенов не удалась: ${String(error)}`);
      return 0;
    }
  }
}
