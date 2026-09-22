import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { resolveDisplayName } from '@vedamatch/shared';
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
  | { ok: true; userId: string; agentId: string | null; scopes: string[] }
  | { ok: false; reason: 'unusable' }
  | { ok: false; reason: 'forbidden'; scopes: string[] };

export interface IssuedApiKey {
  id: string;
  name: string;
  /** Ключ целиком. Показывается один раз — потом остаётся только хеш. */
  token: string;
  scopes: string[];
  expiresAt: Date | null;
  /** Служебный аккаунт, от имени которого ходит ключ. Пусто — ключ личный. */
  agentId: string | null;
}

@Injectable()
export class ApiKeysService {
  private readonly logger = new Logger(ApiKeysService.name);
  private readonly lastUsedWrites = new Map<string, number>();

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Выпуск ключа. `agentId` превращает его в агентский: запросы таким ключом
   * идут от имени служебного аккаунта, а владелец остаётся тем, кто за ключ
   * отвечает и кого показывает история «Работы» рядом с именем агента.
   */
  async issue(
    userId: string,
    name: string,
    scopes: string[],
    expiresAt: Date | null,
    agent: { id: string; issuerRole: string } | null = null,
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

    const agentId = agent ? await this.resolveAgentAccount(agent) : null;

    const { token, hash } = generateApiKey();
    const key = await this.prisma.userApiKey.create({
      data: {
        userId,
        agentId,
        name,
        tokenHash: hash,
        hint: apiKeyHint(token),
        scopes,
        expiresAt,
      },
      select: { id: true },
    });
    return { id: key.id, name, token, scopes, expiresAt, agentId };
  }

  /**
   * Проверка перед выпуском агентского ключа.
   *
   * Выпускать его позволено только администрации, и это не перестраховка:
   * агент состоит в чужих рабочих средах, поэтому ключ на него — доступ к
   * доскам людей, которые выпускающего туда не звали. Личный ключ такого
   * свойства не имеет: он не выводит владельца за пределы его собственных
   * сред.
   *
   * Второй проверкой отсекается аккаунт живого человека: ключ «на Стаса» —
   * это чужое имя, а не служебное, сколько бы прав ни было у выпускающего.
   */
  private async resolveAgentAccount(agent: {
    id: string;
    issuerRole: string;
  }): Promise<string> {
    if (agent.issuerRole !== 'admin') {
      throw new ForbiddenException(
        'Ключ для ИИ-агента выпускает администрация: он открывает доступ к средам, где состоит агент',
      );
    }
    const account = await this.prisma.user.findUnique({
      where: { id: agent.id },
      select: { id: true, isAgent: true },
    });
    if (!account || !account.isAgent) {
      throw new ForbiddenException(
        'Такого служебного аккаунта нет: ключ от имени живого человека не выпускается',
      );
    }
    return account.id;
  }

  async list(userId: string) {
    const keys = await this.prisma.userApiKey.findMany({
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
        agent: { select: { id: true, name: true, spiritualName: true } },
      },
    });
    // Имя агента наружу — через resolveDisplayName, как у любого профиля:
    // правило портала не знает исключений для служебных аккаунтов.
    return keys.map(({ agent, ...key }) => ({
      ...key,
      agent: agent ? { id: agent.id, name: resolveDisplayName(agent) } : null,
    }));
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
   * Служебные аккаунты ИИ-агентов — чтобы форма выпуска показала, на кого
   * ключ вообще можно выписать. Имя — через resolveDisplayName.
   */
  async listAgents(actorRole: string) {
    assertAdmin(actorRole);
    const agents = await this.prisma.user.findMany({
      where: { isAgent: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, spiritualName: true },
    });
    return agents.map((agent) => ({
      id: agent.id,
      name: resolveDisplayName(agent),
    }));
  }

  /**
   * Ключи любого человека — для администрации.
   *
   * Нужны не из любопытства: человек уходит из проекта, а его ключ продолжает
   * ходить в доски, пока сам владелец не вспомнит про него. Отозвать должен
   * уметь кто-то ещё.
   *
   * Отозванные тоже показываются: «ключ был и его погасили» — ответ на вопрос
   * «почему интеграция перестала работать», а отсутствие строки ответом не
   * является.
   */
  async listForAdmin(actorRole: string, userId: string) {
    assertAdmin(actorRole);
    return this.prisma.userApiKey.findMany({
      where: { userId },
      orderBy: [{ revoked: 'asc' }, { createdAt: 'desc' }],
      select: {
        id: true,
        name: true,
        hint: true,
        scopes: true,
        lastUsedAt: true,
        expiresAt: true,
        revoked: true,
        createdAt: true,
      },
    });
  }

  /** Отзыв чужого ключа администрацией. Выпускать чужие ключи нельзя вовсе. */
  async revokeAsAdmin(actorRole: string, keyId: string): Promise<void> {
    assertAdmin(actorRole);
    await this.prisma.userApiKey.update({
      where: { id: keyId },
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
        agentId: true,
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
    return {
      ok: true,
      userId: key.userId,
      agentId: key.agentId,
      scopes: key.scopes,
    };
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

/**
 * Ключи — вход в аккаунт, а не настройка сервиса, поэтому доступ к чужим
 * закрыт для админов сервисов: их полномочия ограничены своим разделом.
 */
function assertAdmin(role: string): void {
  if (role !== 'admin') {
    throw new ForbiddenException('Доступ только для администратора');
  }
}
