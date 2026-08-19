import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';

/** PrismaModule глобальный — PrismaService доступен без импорта. */
@Module({ controllers: [HealthController] })
export class HealthModule {}
