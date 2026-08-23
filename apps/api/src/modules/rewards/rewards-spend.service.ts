import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { readBillingMode } from '../billing/billing-mode';
import { RewardsLedgerService } from './rewards-ledger.service';

/**
 * Двухфазное списание: резерв при выборе скидки → подтверждение при удачной
 * оплате или возврат при неудачной. Баллы не сгорают молча на сорвавшемся
 * платеже — ради этого и две фазы вместо одной.
 *
 * Режим `beta` закрывает всё это целиком: HTTP-эндпоинта у сервиса нет
 * вовсе, а сами методы отказывают. Так переключение режима не может по
 * недосмотру открыть списание раньше платёжного контура — а он отдельная
 * задача, и здесь заложены только интерфейс и типы операций леджера.
 */
@Injectable()
export class RewardsSpendService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: RewardsLedgerService,
  ) {}

  /** Доступно ли списание. Читается через хелпер, без импорта BillingModule. */
  async enabled(): Promise<boolean> {
    return (await readBillingMode(this.prisma)) === 'business';
  }

  private async assertEnabled(): Promise<void> {
    if (!(await this.enabled())) {
      throw new ForbiddenException(
        'Списание баллов откроется после завершения беты',
      );
    }
  }

  /**
   * Придержать баллы под конкретный счёт. Сумма уходит из доступного сразу:
   * иначе один и тот же остаток закроет две покупки в соседних вкладках.
   */
  async reserve(userId: string, amount: number, comment?: string) {
    await this.assertEnabled();
    const wanted = Math.trunc(amount);
    if (wanted <= 0)
      throw new BadRequestException('Сумма резерва должна быть положительной');

    const balance = await this.ledger.balance(userId);
    if (balance.available < wanted) {
      throw new BadRequestException('Недостаточно доступных баллов');
    }
    return this.prisma.rewardsLedgerEntry.create({
      data: {
        userId,
        type: 'reserve',
        amount: -wanted,
        comment: comment ?? 'Резерв под оплату абонемента',
      },
    });
  }

  /** Оплата прошла: резерв становится тратой. */
  async commit(reserveId: string) {
    await this.assertEnabled();
    const reserve = await this.requireOpenReserve(reserveId);
    return this.prisma.rewardsLedgerEntry.create({
      data: {
        userId: reserve.userId,
        type: 'commit',
        amount: reserve.amount,
        revokesId: reserve.id,
        referralId: reserve.referralId,
        comment: 'Баллы зачтены в оплату абонемента',
      },
    });
  }

  /** Оплата сорвалась: резерв снимается, баллы снова доступны. */
  async release(reserveId: string) {
    await this.assertEnabled();
    const reserve = await this.requireOpenReserve(reserveId);
    return this.prisma.rewardsLedgerEntry.create({
      data: {
        userId: reserve.userId,
        type: 'release',
        // Ноль, а не возврат суммы: сам резерв в баланс не входил, строка
        // только закрывает его. См. rewards-balance.ts.
        amount: 0,
        revokesId: reserve.id,
        referralId: reserve.referralId,
        comment: 'Резерв снят: оплата не прошла',
      },
    });
  }

  private async requireOpenReserve(reserveId: string) {
    const reserve = await this.prisma.rewardsLedgerEntry.findUnique({
      where: { id: reserveId },
      select: {
        id: true,
        userId: true,
        type: true,
        amount: true,
        referralId: true,
        revokedBy: { select: { id: true } },
      },
    });
    if (!reserve || reserve.type !== 'reserve') {
      throw new BadRequestException('Резерв не найден');
    }
    if (reserve.revokedBy) {
      throw new BadRequestException('Резерв уже закрыт');
    }
    return reserve;
  }
}
