import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient as RuPrismaClient } from '@vedamatch/ru-client';

/**
 * Клиент московской базы российского контура.
 *
 * Включение — **два** условия, а не одно. Наличия строки подключения
 * недостаточно: она может быть заведена заранее, а решение о том, куда едут
 * персональные данные, обязано быть отдельным и осознанным. До уведомления
 * Роскомнадзора о трансграничной передаче контур включать нельзя.
 *
 * **Соединение не проверяется при старте.** Иначе недоступная Москва
 * останавливала бы весь портал, а по спецификации при её недоступности
 * ломается только запись персональных данных россиян: листать, переписываться
 * и читать человек продолжает. Prisma подключается лениво, на первом запросе,
 * и ошибка приходит туда, где её можно осмысленно показать.
 */
@Injectable()
export class RuPrismaService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RuPrismaService.name);
  private client?: RuPrismaClient;

  /**
   * Контур включён. Это НЕ обещание, что Москва отвечает: доступность
   * выясняется на самой записи.
   */
  get isEnabled(): boolean {
    return this.client !== undefined;
  }

  /** Клиент московской базы. Звать только при `isEnabled`. */
  get db(): RuPrismaClient {
    if (!this.client) {
      throw new Error(
        'Российский контур не включён: RU_DATABASE_URL и RU_CONTOUR_ENABLED=true',
      );
    }
    return this.client;
  }

  onModuleInit() {
    const raw = process.env.RU_DATABASE_URL?.trim() ?? '';
    const enabled = process.env.RU_CONTOUR_ENABLED === 'true';

    if (!raw) {
      this.logger.warn(
        'RU_DATABASE_URL не задан — российский контур выключен, персональные данные пишутся только в основную базу',
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
    // заключают в них, и клиент получил бы их как часть адреса.
    const url = raw.replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1');

    this.client = new RuPrismaClient({ datasources: { db: { url } } });
    this.logger.log('Российский контур включён');
  }

  async onModuleDestroy() {
    await this.client?.$disconnect();
  }
}
