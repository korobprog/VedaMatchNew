import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  AdminAuditEvent,
  AdminUpdateDonationRequest,
  AdminUpdateSubscriptionRequest,
  BillingMode,
  DonationSettingsDto,
  PricingPlan,
  Role,
  SubscriptionState,
} from '@vedamatch/shared';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  extendPaidUntil,
  toSubscriptionState,
  VEDAMATCH_PLAN,
} from './subscription';

import {
  APP_SETTINGS_ID as SETTINGS_ID,
  readBillingMode,
} from './billing-mode';
import {
  MAX_DONATION_TEXT,
  toPublicDonation,
  validateRequisites,
} from './donation';

const DONATION_FIELDS = {
  donationEnabled: true,
  donationText: true,
  donationRequisites: true,
} as const;

const SUBSCRIPTION_FIELDS = {
  createdAt: true,
  trialEndsAt: true,
  subscriptionPaidUntil: true,
  subscriptionNote: true,
} as const;

const MAX_NOTE_LENGTH = 500;
const MAX_ADD_MONTHS = 36;

@Injectable()
export class BillingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
  ) {}

  /** Текущий режим биллинга; при отсутствии строки настроек — обычная бизнес-логика. */
  billingMode(): Promise<BillingMode> {
    return readBillingMode(this.prisma);
  }

  /** Реквизиты пожертвований для кнопки «поддержать»: пусто, пока админ не включил. */
  async donation(): Promise<DonationSettingsDto> {
    return toPublicDonation(
      await this.prisma.appSettings.findUnique({
        where: { id: SETTINGS_ID },
        select: DONATION_FIELDS,
      }),
    );
  }

  /** Админский вид: сырые поля, чтобы форма показывала и выключенное. */
  async adminDonation(role: Role) {
    this.assertAdmin(role);
    const settings = await this.prisma.appSettings.findUnique({
      where: { id: SETTINGS_ID },
      select: DONATION_FIELDS,
    });
    const pub = toPublicDonation(
      settings ? { ...settings, donationEnabled: true } : null,
    );
    return {
      enabled: settings?.donationEnabled ?? false,
      text: settings?.donationText ?? '',
      requisites: pub.requisites,
    };
  }

  async updateDonation(role: Role, body: AdminUpdateDonationRequest) {
    this.assertAdmin(role);
    const data: {
      donationEnabled?: boolean;
      donationText?: string | null;
      donationRequisites?: Prisma.InputJsonValue;
    } = {};
    if (body && 'enabled' in body) {
      if (typeof body.enabled !== 'boolean')
        throw new BadRequestException('Флаг включения должен быть булевым');
      data.donationEnabled = body.enabled;
    }
    if (body && 'text' in body) {
      const text =
        typeof body.text === 'string' ? body.text.trim() || null : null;
      if (text && text.length > MAX_DONATION_TEXT)
        throw new BadRequestException(
          `Текст не длиннее ${MAX_DONATION_TEXT} символов`,
        );
      data.donationText = text;
    }
    if (body && 'requisites' in body)
      data.donationRequisites = validateRequisites(
        body.requisites,
      ) as unknown as Prisma.InputJsonValue;
    if (Object.keys(data).length === 0)
      throw new BadRequestException('Нечего обновлять');
    await this.prisma.appSettings.upsert({
      where: { id: SETTINGS_ID },
      create: { id: SETTINGS_ID, ...data },
      update: data,
      select: { id: true },
    });
    return this.adminDonation(role);
  }

  private assertAdmin(role: Role) {
    if (role !== 'admin')
      throw new ForbiddenException('Доступ только для администратора');
  }

  async plan(): Promise<PricingPlan> {
    return { ...VEDAMATCH_PLAN, mode: await this.billingMode() };
  }

  async state(userId: string): Promise<SubscriptionState> {
    const [user, mode] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: userId },
        select: SUBSCRIPTION_FIELDS,
      }),
      this.billingMode(),
    ]);
    if (!user) throw new NotFoundException('Пользователь не найден');
    return toSubscriptionState(user, new Date(), mode);
  }

  async adminUpdate(
    admin: { sub: string; role: Role },
    userId: string,
    body: AdminUpdateSubscriptionRequest,
  ): Promise<SubscriptionState> {
    if (admin.role !== 'admin') {
      throw new ForbiddenException('Доступ только для администратора');
    }
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: SUBSCRIPTION_FIELDS,
    });
    if (!user) throw new NotFoundException('Пользователь не найден');

    const data: {
      subscriptionPaidUntil?: Date | null;
      subscriptionNote?: string | null;
    } = {};

    if (body?.addMonths !== undefined) {
      const months = Number(body.addMonths);
      if (!Number.isInteger(months) || months < 1 || months > MAX_ADD_MONTHS) {
        throw new BadRequestException(
          `Продление возможно на 1–${MAX_ADD_MONTHS} месяцев`,
        );
      }
      data.subscriptionPaidUntil = extendPaidUntil(
        user.subscriptionPaidUntil,
        months,
      );
    } else if (body && 'paidUntil' in body) {
      if (body.paidUntil === null) {
        data.subscriptionPaidUntil = null;
      } else {
        const parsed = new Date(String(body.paidUntil));
        if (Number.isNaN(parsed.getTime())) {
          throw new BadRequestException(
            'Некорректная дата оплаченного доступа',
          );
        }
        data.subscriptionPaidUntil = parsed;
      }
    }

    if (body && 'note' in body) {
      const note = body.note?.trim() || null;
      if (note && note.length > MAX_NOTE_LENGTH) {
        throw new BadRequestException(
          `Заметка не длиннее ${MAX_NOTE_LENGTH} символов`,
        );
      }
      data.subscriptionNote = note;
    }

    if (Object.keys(data).length === 0) {
      throw new BadRequestException('Нечего обновлять');
    }

    const [updated, mode] = await Promise.all([
      this.prisma.user.update({
        where: { id: userId },
        data,
        select: SUBSCRIPTION_FIELDS,
      }),
      this.billingMode(),
    ]);

    const event: AdminAuditEvent = {
      actorId: admin.sub,
      action: 'user.subscription-changed',
      targetType: 'user',
      targetId: userId,
      details: {
        paidUntil: updated.subscriptionPaidUntil?.toISOString() ?? null,
        note: updated.subscriptionNote,
      },
    };
    this.events.emit('admin.action', event);
    return toSubscriptionState(updated, new Date(), mode);
  }
}
