import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient as RuPrismaClient } from '@vedamatch/ru-client';

/**
 * Клиент московской базы российского контура.
 *
 * Не падает при старте без переменных: контур включается не на всякой
 * установке, а в разработке его обычно нет вовсе. Готовность спрашивают через
 * `isConfigured`, и модуль записи по ней решает, можно ли обслуживать `ru`.
 *
 * Включение — **два** условия, а не одно. Наличия строки подключения
 * недостаточно: она может быть заведена заранее, а решение о том, куда едут
 * персональные данные, обязано быть отдельным и осознанным. До уведомления
 * Роскомнадзора о трансграничной передаче контур включать нельзя.
 */
@Injectable()
export class RuPrismaService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RuPrismaService.name);
  private client?: RuPrismaClient;

  /** Контур включён и клиент готов принимать записи. */
  get isConfigured(): boolean {
    return this.client !== undefined;
  }

  /**
   * Клиент московской базы. Звать только после проверки `isConfigured` —
   * иначе исключение, а не тихий проход мимо контура.
   */
  get db(): RuPrismaClient {
    if (!this.client) {
      throw new Error('Российский контур не настроен: RU_DATABASE_URL/RU_CONTOUR_ENABLED');
    }
    return this.client;
  }

  async onModuleInit() {
    const url = process.env.RU_DATABASE_URL?.trim();
    const enabled = process.env.RU_CONTOUR_ENABLED === 'true';

    if (!url) {
      this.logger.warn(
        'RU_DATABASE_URL не задан — российский контур выключен, записи идут только в амстердамскую базу',
      );
      return;
    }
    if (!enabled) {
      this.logger.warn(
        'RU_CONTOUR_ENABLED не равен true — контур выключен намеренно, несмотря на заданный RU_DATABASE_URL',
      );
      return;
    }

    // Кавычки вокруг значения — не редкость: в .env строку подключения часто
    // заключают в них, и клиент получает их как часть адреса.
    const clean = url.replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1');

    const client = new RuPrismaClient({ datasources: { db: { url: clean } } });
    await client.$connect();
    this.client = client;
    this.logger.log('Российский контур подключён');
  }

  async onModuleDestroy() {
    await this.client?.$disconnect();
  }
}
