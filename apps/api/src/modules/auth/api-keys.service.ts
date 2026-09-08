import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  apiKeyHint,
  generateApiKey,
  hashApiKey,
  isApiKeyUsable,
  isRequestAllowed,
} from './api-key';

/** Сколько ключей человек может держать одновременно. */
const MAX_KEYS_PER_USER = 10;

/** Реже пишем «последний раз использован», чем приходят запросы. */
const LAST_USED_THROTTLE_MS = 5 * 60 * 1000;

/**
 * Исход проверки ключа. `unusable` — ключа нет, он отозван или просрочен;
 * `forbidden` — ключ жив, но прав на этот запрос у него нет.
 */
export type ApiKeyResolution =
  | { ok: true; userId: string; scopes: string[] }
  | { ok: false; reason: 'unusable' }
  | { ok: false; reason: 'forbidden'; scopes: string[] };

export interface IssuedApiKey {
  id: string;
  name: string;
  /** Ключ целиком. Показывается один раз — потом остаётся только хеш. */
  token: string;
  scopes: string[];
  expiresAt: Date | null;
}

@Injectable()
export class ApiKeysService {
  private readonly logger = new Logger(ApiKeysService.name);
  private readonly lastUsedWrites = new Map<string, number>();

  constructor(private readonly prisma: PrismaService) {}

  async issue(
    userId: string,
    name: string,
    scopes: string[],
    expiresAt: Date | null,
  ): Promise<IssuedApiKey> {
    const live = await this.prisma.userApiKey.count({
      where: { userId, revoked: false },
    });
    // Предел не про нагрузку, а про уборку: десяток забытых ключей ещё можно
    // перебрать глазами и отозвать, сотню — уже нет.
    if (live >= MAX_KEYS_PER_USER) {
      throw new ForbiddenException(
        `Больше ${MAX_KEYS_PER_USER} ключей одновременно нельзя — отзовите ненужные`,
      );
    }

    const { token, hash } = generateApiKey();
    const key = await this.prisma.userApiKey.create({
      data: {
        userId,
        name,
        tokenHash: hash,
        hint: apiKeyHint(token),
        scopes,
        expiresAt,
      },
      select: { id: true },
    });
    return { id: key.id, name, token, scopes, expiresAt };
  }

  async list(userId: string) {
    return this.prisma.userApiKey.findMany({
      where: { userId, revoked: false },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        hint: true,
        scopes: true,
        lastUsedAt: true,
        expiresAt: true,
        createdAt: true,
      },
    });
  }

  /**
   * Отзыв, а не удаление: строка остаётся, и «ключ больше не подходит» —
   * проверяемый факт, а не отсутствие записи, которое нечем объяснить.
   */
  async revoke(userId: string, keyId: string): Promise<void> {
    await this.prisma.userApiKey.updateMany({
      where: { id: keyId, userId },
      data: { revoked: true },
    });
  }

  /**
   * Кому принадлежит предъявленный ключ и вправе ли он так поступать.
   *
   * Негодный ключ и нехватка права — разные ответы, и это не педантизм.
   * «Ключ не подошёл» на живом ключе отправляет человека выпускать новый
   * вместо того, чтобы дописать право; вышло ровно так на первой же проверке.
   * Подбору это не помогает: чтобы увидеть «нет права», ключ надо уже иметь.
   */
  async resolve(
    token: string,
    method: string,
    path: string,
    now = new Date(),
  ): Promise<ApiKeyResolution> {
    const key = await this.prisma.userApiKey.findUnique({
      where: { tokenHash: hashApiKey(token) },
      select: {
        id: true,
        userId: true,
        scopes: true,
        revoked: true,
        expiresAt: true,
      },
    });
    if (!key || !isApiKeyUsable(key, now))
      return { ok: false, reason: 'unusable' };
    if (!isRequestAllowed(key.scopes, method, path)) {
      // Отдельная запись в журнале: ключ настоящий, а лезет не туда — это либо
      // недостающее право (частая и понятная жалоба), либо чужие руки.
      this.logger.warn(
        `Ключ ${key.id} не имеет права на ${method} ${path} (есть: ${key.scopes.join(', ') || 'ничего'})`,
      );
      return { ok: false, reason: 'forbidden', scopes: key.scopes };
    }
    this.touchLastUsed(key.id, now);
    return { ok: true, userId: key.userId, scopes: key.scopes };
  }

  /** Отметка об использовании не должна задерживать или ронять запрос. */
  private touchLastUsed(keyId: string, now: Date): void {
    const written = this.lastUsedWrites.get(keyId) ?? 0;
    if (now.getTime() - written < LAST_USED_THROTTLE_MS) return;
    this.lastUsedWrites.set(keyId, now.getTime());
    void this.prisma.userApiKey
      .update({ where: { id: keyId }, data: { lastUsedAt: now } })
      .catch(() => this.lastUsedWrites.delete(keyId));
  }
}
