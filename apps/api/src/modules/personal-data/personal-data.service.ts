import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import type { DataResidency } from '@prisma/client';
import { RuPrismaService } from '../../prisma/ru-prisma.service';
import type { PersonalBirthSource, PersonalRecordInput } from './personal-fields';

export type PersonalWrite = {
  /** Откуда берётся: `User.dataResidency`, а не провайдер и не домен. */
  residency: DataResidency;
  /** Полное состояние персональных полей ПОСЛЕ правки, не дельта. */
  record: PersonalRecordInput;
  /** Данные рождения, если правка их касается. */
  birth?: PersonalBirthSource | null;
};

/**
 * Единственная точка записи персональных данных.
 *
 * Порядок для `ru`: сначала московская база, дождаться подтверждения, затем
 * амстердамская. **Именно порядок делает схему законной** — первая запись
 * обязана произойти в России, копия за рубежом допустима при соблюдении
 * правил трансграничной передачи. Менять порядок нельзя ни ради скорости, ни
 * ради простоты кода.
 *
 * Обращаться к московскому клиенту из сервисных модулей запрещено: иначе
 * порядок разъедется по коду и перестанет соблюдаться там, где о нём забыли.
 */
@Injectable()
export class PersonalDataService {
  private readonly logger = new Logger(PersonalDataService.name);

  constructor(private readonly ru: RuPrismaService) {}

  /**
   * Контур включён. Точки записи спрашивают это ПЕРЕД сбором персональной
   * записи: собирать её и читать ключи фотографий, когда контура нет, значит
   * добавить два запроса к каждому сохранению профиля просто так.
   */
  get isActive(): boolean {
    return this.ru.isEnabled;
  }

  /**
   * `applyGlobal` — амстердамская запись, та самая, что и раньше. Вызывается
   * после московской и только после её успеха.
   *
   * Если амстердамская упала, `copiedAt` остаётся `null`: источник истины —
   * Москва, а расхождение чинит фоновая досылка. Транзакции на две базы не
   * существует, и притворяться, что она есть, хуже, чем оставить отметку.
   */
  async write<T>(write: PersonalWrite, applyGlobal: () => Promise<T>): Promise<T> {
    // Контур выключен — прежнее поведение: всё в основную базу. Отказывать
    // здесь нельзя: до включения контура это единственный рабочий путь, и
    // 503 просто закрыл бы регистрацию россиянам.
    if (write.residency !== 'ru' || !this.ru.isEnabled) {
      return applyGlobal();
    }

    const birth = write.birth
      ? {
          bornAtUtc: write.birth.bornAtUtc,
          birthDateLocal: write.birth.birthDateLocal,
          birthTimeLocal: write.birth.birthTimeLocal,
          placeLabel: write.birth.placeLabel,
          latitude: write.birth.latitude,
          longitude: write.birth.longitude,
          timeZone: write.birth.timeZone,
        }
      : undefined;

    const { id, ...fields } = write.record;

    try {
      await this.moscowFirst(id, fields, birth);
    } catch (error) {
      // Контур включён, но Москва не ответила. Отказ, а не тихий проход в
      // Амстердам: запись мимо контура незаметна и неисправима задним числом.
      // Остальной портал при этом работает — читать и переписываться можно.
      this.logger.error(
        `Московская база не приняла запись ${id}: ${(error as Error).message}`,
      );
      throw new ServiceUnavailableException(
        'Хранилище персональных данных недоступно. Попробуйте позже.',
      );
    }

    const result = await applyGlobal();

    // Отметка о копии — не критичный шаг: если она не поставилась, досылка
    // просто отправит запись повторно, а это безопасно.
    try {
      await this.ru.db.personalRecord.update({
        where: { id },
        data: { copiedAt: new Date() },
      });
    } catch (error) {
      this.logger.warn(
        `Не удалось отметить копию ${id}, досылка подберёт: ${(error as Error).message}`,
      );
    }

    return result;
  }

  private async moscowFirst(
    id: string,
    fields: Omit<PersonalRecordInput, 'id'>,
    birth: PersonalBirthSource | undefined,
  ) {
    await this.ru.db.personalRecord.upsert({
      where: { id },
      create: {
        id,
        ...fields,
        // Вложенной записью, а не отдельным обращением: два обращения без
        // транзакции дают состояние, где запись есть, а данных рождения нет.
        ...(birth ? { birth: { create: birth } } : {}),
      },
      update: {
        ...fields,
        // Отметка сбрасывается: правка ещё не скопирована в Амстердам.
        copiedAt: null,
        ...(birth ? { birth: { upsert: { create: birth, update: birth } } } : {}),
      },
    });
  }
}
