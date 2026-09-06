import { BadRequestException, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { AuthProvider } from '@prisma/client';
import type { AdminAuditEvent } from '@vedamatch/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { portalHost } from './auth-providers.service';

export type AuthProviderRow = {
  provider: AuthProvider;
  enabled: boolean;
  domains: string[];
  sortOrder: number;
  updatedAt: string;
  /** Заданы ли ключи провайдера в окружении. Значений наружу не отдаём. */
  configured: boolean;
};

export type AuthProviderPatch = {
  enabled?: boolean;
  domains?: string[];
  sortOrder?: number;
};

/** Переменные, без которых включённый способ входа отдаёт 503. */
const REQUIRED_ENV: Partial<Record<AuthProvider, string[]>> = {
  google: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'],
  yandex: ['YANDEX_CLIENT_ID', 'YANDEX_CLIENT_SECRET'],
  vk: ['VK_CLIENT_ID', 'VK_CLIENT_SECRET'],
  // У входа по почте ключей провайдера нет — он появится во втором плане
  // вместе с почтовым транспортом.
  email: [],
};

const MAX_DOMAINS = 20;
const MAX_DOMAIN_LENGTH = 253;

/**
 * Управление способами входа из админки.
 *
 * До этого раздела единственным способом включить провайдера был SQL-запрос
 * внутрь контейнера: вслепую, без журнала и без отката кнопкой. Включение
 * способа входа видно всем пользователям сразу, поэтому оно обязано быть
 * обычным действием администрации, а не вылазкой в консоль.
 */
@Injectable()
export class AuthAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
  ) {}

  async list(): Promise<AuthProviderRow[]> {
    const rows = await this.prisma.authProviderSetting.findMany({
      orderBy: { sortOrder: 'asc' },
    });
    return rows.map((row) => ({
      provider: row.provider,
      enabled: row.enabled,
      domains: row.domains,
      sortOrder: row.sortOrder,
      updatedAt: row.updatedAt.toISOString(),
      configured: this.isConfigured(row.provider),
    }));
  }

  async update(
    actorId: string,
    provider: AuthProvider,
    patch: AuthProviderPatch,
  ): Promise<AuthProviderRow> {
    const before = await this.prisma.authProviderSetting.findUnique({
      where: { provider },
    });
    if (!before) {
      throw new BadRequestException('Неизвестный способ входа');
    }

    // Включать способ без ключей нельзя: снаружи это выглядит как рабочая
    // кнопка, которая у всех падает в 503. Выключать можно всегда — отказ от
    // способа не должен зависеть от того, настроен он или нет.
    if (patch.enabled === true && !this.isConfigured(provider)) {
      throw new BadRequestException(
        `Способ не настроен: не заданы ${(REQUIRED_ENV[provider] ?? []).join(', ')}`,
      );
    }

    const data: AuthProviderPatch = {};
    if (patch.enabled !== undefined) data.enabled = patch.enabled;
    if (patch.sortOrder !== undefined) {
      if (!Number.isInteger(patch.sortOrder) || patch.sortOrder < 0) {
        throw new BadRequestException('Порядок — целое число не меньше нуля');
      }
      data.sortOrder = patch.sortOrder;
    }
    if (patch.domains !== undefined) {
      data.domains = this.normalizeDomains(patch.domains);
    }

    const row = await this.prisma.authProviderSetting.update({
      where: { provider },
      data,
    });

    // В журнал уходит «было → стало», а не только факт: по одной записи
    // «изменили Яндекс» через месяц не понять, включили его или выключили.
    const event: AdminAuditEvent = {
      actorId,
      action: 'auth.provider-changed',
      targetType: 'platform',
      targetId: provider,
      details: {
        provider,
        enabled: `${before.enabled} → ${row.enabled}`,
        domains: `${before.domains.join(', ') || '—'} → ${row.domains.join(', ') || '—'}`,
        sortOrder: `${before.sortOrder} → ${row.sortOrder}`,
      },
    };
    this.events.emit('admin.action', event);

    return {
      provider: row.provider,
      enabled: row.enabled,
      domains: row.domains,
      sortOrder: row.sortOrder,
      updatedAt: row.updatedAt.toISOString(),
      configured: this.isConfigured(provider),
    };
  }

  /**
   * Домены приводятся к тому же виду, в каком с ними сверяется `portalHost`:
   * иначе админ впишет «https://VedaMatch.ru/» и способ не покажется нигде, а
   * причина будет невидима.
   */
  private normalizeDomains(input: string[]): string[] {
    if (input.length > MAX_DOMAINS) {
      throw new BadRequestException(`Не больше ${MAX_DOMAINS} доменов`);
    }
    const seen = new Set<string>();
    for (const raw of input) {
      const host = portalHost(
        String(raw)
          .trim()
          .replace(/^https?:\/\//i, '')
          .replace(/\/.*$/, ''),
      );
      if (!host) continue;
      if (host.length > MAX_DOMAIN_LENGTH || /[^a-z0-9.:-]/.test(host)) {
        throw new BadRequestException(`Непохоже на домен: ${raw}`);
      }
      seen.add(host);
    }
    return [...seen];
  }

  private isConfigured(provider: AuthProvider): boolean {
    const required = REQUIRED_ENV[provider] ?? [];
    return required.every((name) => Boolean(process.env[name]?.trim()));
  }
}
