import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  AdminUpdateSubscriptionRequest,
  BillingMode,
  PricingPlan,
  Role,
  SubscriptionState,
} from '@vedamatch/shared';
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
  constructor(private readonly prisma: PrismaService) {}

  /** Текущий режим биллинга; при отсутствии строки настроек — обычная бизнес-логика. */
  billingMode(): Promise<BillingMode> {
    return readBillingMode(this.prisma);
  }

  async setBillingMode(role: Role, mode: BillingMode): Promise<BillingMode> {
    if (role !== 'admin') {
      throw new ForbiddenException('Доступ только для администратора');
    }
    const updated = await this.prisma.appSettings.upsert({
      where: { id: SETTINGS_ID },
      create: { id: SETTINGS_ID, billingMode: mode },
      update: { billingMode: mode },
      select: { billingMode: true },
    });
    return updated.billingMode;
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
    role: Role,
    userId: string,
    body: AdminUpdateSubscriptionRequest,
  ): Promise<SubscriptionState> {
    if (role !== 'admin') {
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
    return toSubscriptionState(updated, new Date(), mode);
  }
}
