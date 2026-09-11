import { Controller, Get, HttpException, HttpStatus } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { PrismaService } from '../../prisma/prisma.service';
import { buildCommit } from './build-commit';

/**
 * Liveness/readiness для Docker HEALTHCHECK и балансировщика. Проверяет не
 * только процесс, но и коннект к Postgres: `SELECT 1` через пул Prisma.
 * Исключён из троттлинга — оркестратор дёргает его каждые 15–30 с, и лимит
 * 100 req/min на общий IP контейнерной сети иначе легко выбрать.
 *
 * `commit` — из какого коммита собран образ (`null`, если неизвестно). Его ждёт
 * шаг деплоя в CI: «ok» отвечает и старый контейнер, пока новый ещё собирается.
 */
@Controller('health')
@SkipThrottle()
export class HealthController {
  /** Читается один раз: коммит образа за время жизни процесса не меняется. */
  private readonly commit = buildCommit();

  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async check() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      throw new HttpException(
        { status: 'error', db: 'down', commit: this.commit },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    return { status: 'ok', db: 'ok', commit: this.commit };
  }
}
