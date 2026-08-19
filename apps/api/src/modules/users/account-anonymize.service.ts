import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { UserGalleryService } from './user-gallery.service';

/** Раз в час: анонимизация не срочная, а кандидатов единицы. */
const TICK_MS = 60 * 60 * 1000;
/**
 * Сколько держим PII после финализации удаления. Окно нужно администрации
 * (restoreUser по просьбе человека, разбор жалоб); после него аккаунт
 * анонимизируется безвозвратно.
 */
export const ANONYMIZE_GRACE_DAYS = 30;
export const ANONYMIZE_GRACE_MS = ANONYMIZE_GRACE_DAYS * 24 * 60 * 60 * 1000;
/** Кандидатов за тик берём пачкой: тик короткий, хвост доберёт следующий. */
const BATCH_SIZE = 100;

/**
 * Признак уже анонимизированного аккаунта. Отдельной колонки нет: префикс
 * в email одновременно освобождает настоящий адрес (unique) и служит маркером.
 * Домен `.invalid` зарезервирован RFC 2606 — на него ничего не уйдёт.
 */
export const ANONYMIZED_EMAIL_PREFIX = 'deleted+';
export const ANONYMIZED_EMAIL_DOMAIN = 'anonymized.invalid';
export const ANONYMIZED_NAME = 'Удалённый аккаунт';

export function anonymizedEmail(userId: string): string {
  return `${ANONYMIZED_EMAIL_PREFIX}${userId}@${ANONYMIZED_EMAIL_DOMAIN}`;
}

export function isAnonymizedEmail(email: string): boolean {
  return email.startsWith(ANONYMIZED_EMAIL_PREFIX);
}

/** Условие выборки кандидатов; вынесено, чтобы его мог переиспользовать тест. */
export function anonymizeCandidatesWhere(now: Date): Prisma.UserWhereInput {
  return {
    accountStatus: 'deleted',
    deletedAt: { lt: new Date(now.getTime() - ANONYMIZE_GRACE_MS) },
    NOT: { email: { startsWith: ANONYMIZED_EMAIL_PREFIX } },
  };
}

/** Что затирается в строке User. Отдельно — чтобы тест сверял поля целиком. */
export function anonymizedUserData(userId: string): Prisma.UserUpdateInput {
  return {
    email: anonymizedEmail(userId),
    googleId: null,
    passwordHash: null,
    name: ANONYMIZED_NAME,
    spiritualName: null,
    birthDate: null,
    gender: null,
    homeLocation: Prisma.DbNull,
    socialLinks: Prisma.DbNull,
    messengers: Prisma.DbNull,
    avatarUrl: null,
    avatarKey: null,
    statusActor: 'system',
    statusChangedAt: new Date(),
  };
}

export interface AnonymizeResult {
  anonymized: number;
  storageObjects: number;
}

/**
 * Soft-delete (accountStatus = deleted) навсегда занимал email и хранил PII.
 * Воркер по истечении ANONYMIZE_GRACE_DAYS после deletedAt затирает
 * персональные данные: email → `deleted+<id>@anonymized.invalid` (адрес
 * освобождается — повторная регистрация через Google создаёт новый аккаунт),
 * googleId/пароль/имя/дата рождения/контакты/аватар → пусто, галерея и
 * астро-данные удаляются, refresh-токены отзываются. Строка User и связи
 * (объявления, сообщения) остаются: чужие данные, ссылающиеся на аккаунт,
 * не ломаются, а показываются от «Удалённого аккаунта».
 *
 * Идемпотентен: анонимизированный (по префиксу email) в выборку не попадает,
 * поэтому реплики без лока могут тикать параллельно — в худшем случае один
 * update повторится с теми же данными.
 */
@Injectable()
export class AccountAnonymizeService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AccountAnonymizeService.name);
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaService,
    private readonly gallery: UserGalleryService,
  ) {}

  onModuleInit() {
    this.timer = setInterval(() => void this.tick(), TICK_MS);
    this.timer.unref();
    void this.tick();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async tick(now = new Date()): Promise<AnonymizeResult> {
    const result: AnonymizeResult = { anonymized: 0, storageObjects: 0 };
    try {
      const candidates = await this.prisma.user.findMany({
        where: anonymizeCandidatesWhere(now),
        select: { id: true, avatarKey: true },
        orderBy: { deletedAt: 'asc' },
        take: BATCH_SIZE,
      });
      for (const candidate of candidates) {
        try {
          const keys = await this.anonymizeOne(
            candidate.id,
            candidate.avatarKey,
          );
          result.anonymized += 1;
          result.storageObjects += keys;
        } catch (error) {
          this.logger.warn(
            `Анонимизация аккаунта ${candidate.id} не удалась: ${String(error)}`,
          );
        }
      }
      if (result.anonymized > 0) {
        this.logger.log(
          `Анонимизировано аккаунтов: ${result.anonymized}, объектов хранилища: ${result.storageObjects}`,
        );
      }
    } catch (error) {
      this.logger.warn(
        `Выборка кандидатов на анонимизацию не удалась: ${String(error)}`,
      );
    }
    return result;
  }

  /**
   * Одна транзакция на аккаунт: либо PII стёрты целиком, либо строка не
   * тронута и попадёт в следующий тик. Объекты хранилища удаляются после
   * коммита: осиротевший файл в бакете лучше, чем стёртая база при живом
   * файле, а ключи из БД после транзакции уже не достать — собираем заранее.
   * Возвращает число ключей, отправленных на удаление из хранилища.
   */
  async anonymizeOne(
    userId: string,
    avatarKey: string | null,
  ): Promise<number> {
    const photos = await this.prisma.userPhoto.findMany({
      where: { userId },
      select: { storageKey: true },
    });
    const storageKeys = [
      ...(avatarKey ? [avatarKey] : []),
      ...photos.map((photo) => photo.storageKey),
    ];

    await this.prisma.$transaction([
      this.prisma.refreshToken.updateMany({
        where: { userId, revoked: false },
        data: { revoked: true },
      }),
      this.prisma.userPhoto.deleteMany({ where: { userId } }),
      this.prisma.astroBirthData.deleteMany({ where: { userId } }),
      this.prisma.user.update({
        where: { id: userId },
        data: anonymizedUserData(userId),
      }),
    ]);

    await this.gallery.removeStorageObjects(
      storageKeys,
      'анонимизации аккаунта',
    );
    return storageKeys.length;
  }
}
