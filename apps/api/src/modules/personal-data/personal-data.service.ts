import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { DataResidency } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { RuPrismaService } from '../../prisma/ru-prisma.service';
import type { ConsentGrant } from './policy-version';
import {
  PERSONAL_SELECT,
  type PersonalBirthSource,
  type PersonalRecordInput,
} from './personal-fields';

/**
 * Что меняет операция. Всё, чего здесь нет, дочитывается из основной базы:
 * в Москву уезжает полное состояние, а не дельта.
 */
export type PersonalPatch = {
  fields?: Record<string, unknown>;
  addPhotoKeys?: string[];
  removePhotoKeys?: string[];
  birth?: PersonalBirthSource | null;
};

export type PersonalWrite = {
  /** Откуда берётся: `User.dataResidency`, а не провайдер и не домен. */
  residency: DataResidency;
  /** Полное состояние персональных полей ПОСЛЕ правки, не дельта. */
  record: PersonalRecordInput;
  /** Данные рождения, если правка их касается. */
  birth?: PersonalBirthSource | null;
  /** Согласия, данные в этот момент. Хранятся в РФ вместе с самой записью. */
  consents?: ConsentGrant[];
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

  constructor(
    private readonly prisma: PrismaService,
    private readonly ru: RuPrismaService,
  ) {}

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

    // Согласия — отдельным обращением, а не вложенным в upsert: у записи их
    // может уже не быть (создание) или уже быть (повторный вход), и обе ветки
    // upsert пришлось бы писать по-разному. Уникальность по паре
    // «вид + версия» делает повтор безвредным.
    if (write.consents?.length) {
      try {
        await this.ru.db.personalConsent.createMany({
          data: write.consents.map((consent) => ({
            id: randomUUID(),
            recordId: id,
            kind: consent.kind,
            policyVersion: consent.policyVersion,
            grantedIp: consent.grantedIp ?? null,
          })),
          skipDuplicates: true,
        });
      } catch (error) {
        // Несохранённое согласие не повод отказать во входе: сам факт
        // фиксируется журналом, а запись догоняется повтором.
        this.logger.warn(
          `Согласия ${id} не записались: ${(error as Error).message}`,
        );
      }
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

  /**
   * Правка персональных данных существующего человека.
   *
   * Точки записи не собирают персональную запись сами: перечень полей должен
   * читаться в одном месте, иначе граница контура разъедется по коду. Сюда
   * передаётся только то, что операция меняет; остальное дочитывается из
   * основной базы.
   *
   * Ключи фотографий передаются дельтой, а не набором: вызывающий знает, какой
   * снимок добавляет или убирает, а полный список знаем мы.
   */
  async writeFor<T>(
    userId: string,
    applyGlobal: () => Promise<T>,
    patch: PersonalPatch = {},
  ): Promise<T> {
    // Контур выключен — прежний путь без единого лишнего запроса.
    if (!this.isActive) return applyGlobal();

    const before = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { ...PERSONAL_SELECT, dataResidency: true },
    });
    if (!before) return applyGlobal();

    const fields = patch.fields ?? {};
    const value = <K extends keyof typeof before>(key: K) =>
      (key in fields ? (fields as Record<string, unknown>)[key] : before[key]);

    const photoKeys = await this.nextPhotoKeys(userId, patch);

    return this.write(
      {
        residency: before.dataResidency,
        record: {
          id: userId,
          email: value('email') as string,
          name: value('name') as string,
          spiritualName: (value('spiritualName') as string | null) ?? null,
          birthDate: (value('birthDate') as Date | null) ?? null,
          gender: (value('gender') as string | null) ?? null,
          avatarKey: (value('avatarKey') as string | null) ?? null,
          photoKeys,
        },
        birth: patch.birth,
      },
      applyGlobal,
    );
  }

  /**
   * Пересобрать персональную запись, когда основная база уже изменилась.
   *
   * Нужен там, где порядок «Россия первой» неприменим: например при удалении
   * фотографии, где ключ известен только после транзакции, а стирание
   * первичной записи за рубежом не создаёт.
   */
  async sync(userId: string, patch: PersonalPatch = {}): Promise<void> {
    await this.writeFor(userId, async () => undefined, patch);
  }

  /**
   * Стереть персональную запись в контуре. Право на удаление обязано доходить
   * до российской базы, иначе «удалённый» аккаунт продолжает там жить.
   *
   * Ошибка не пробрасывается: отказать в удалении хуже, чем удалить не везде
   * сразу. Несостоявшееся стирание видно в журнале и чинится повтором.
   */
  async erase(userId: string): Promise<void> {
    if (!this.isActive) return;
    try {
      await this.ru.db.personalRecord.deleteMany({ where: { id: userId } });
    } catch (error) {
      this.logger.error(
        `Не удалось стереть запись ${userId} в контуре: ${(error as Error).message}`,
      );
    }
  }

  private async nextPhotoKeys(
    userId: string,
    patch: PersonalPatch,
  ): Promise<string[]> {
    const photos = await this.prisma.userPhoto.findMany({
      where: { userId },
      select: { storageKey: true },
      orderBy: { sortOrder: 'asc' },
    });
    const removed = new Set(patch.removePhotoKeys ?? []);
    const keys = photos
      .map((photo) => photo.storageKey)
      .filter((key) => !removed.has(key));
    for (const key of patch.addPhotoKeys ?? []) {
      if (!keys.includes(key)) keys.push(key);
    }
    return keys;
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
