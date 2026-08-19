import { Controller, Get, HttpException, HttpStatus } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Liveness/readiness для Docker HEALTHCHECK и балансировщика. Проверяет не
 * только процесс, но и коннект к Postgres: `SELECT 1` через пул Prisma.
 * Исключён из троттлинга — оркестратор дёргает его каждые 15–30 с, и лимит
 * 100 req/min на общий IP контейнерной сети иначе легко выбрать.
 */
@Controller('health')
@SkipThrottle()
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async check() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      throw new HttpException(
        { status: 'error', db: 'down' },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    return { status: 'ok', db: 'ok' };
  }
}
