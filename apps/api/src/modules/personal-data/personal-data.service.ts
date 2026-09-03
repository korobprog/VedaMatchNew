import { Injectable, ServiceUnavailableException } from '@nestjs/common';
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
  constructor(private readonly ru: RuPrismaService) {}

  /**
   * `applyGlobal` — амстердамская запись, та самая, что и раньше. Вызывается
   * после московской и только после её успеха.
   *
   * Если амстердамская упала, `copiedAt` остаётся `null`: источник истины —
   * Москва, а расхождение чинит фоновая досылка. Транзакции на две базы не
   * существует, и притворяться, что она есть, хуже, чем оставить отметку.
   */
  async write<T>(write: PersonalWrite, applyGlobal: () => Promise<T>): Promise<T> {
    if (write.residency !== 'ru') {
      return applyGlobal();
    }

    if (!this.ru.isConfigured) {
      // Отказ, а не тихий проход в Амстердам: запись мимо контура незаметна и
      // неисправима задним числом.
      throw new ServiceUnavailableException(
        'Хранилище персональных данных недоступно. Попробуйте позже.',
      );
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

    const result = await applyGlobal();

    await this.ru.db.personalRecord.update({
      where: { id },
      data: { copiedAt: new Date() },
    });

    return result;
  }
}
