import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import {
  PORTAL_ACTIVITY_EVENTS,
  USER_REGISTERED_EVENT,
  type PortalActivityEvent,
  type UserRegisteredEvent,
} from '@vedamatch/shared';
import { RewardsReferralsService } from './rewards-referrals.service';

/**
 * Единственная точка, где `rewards` узнаёт о происходящем на портале.
 * Сервисы-источники не опрашиваются: они публикуют самодостаточный факт,
 * а формулировки и начисления собирает подписчик — см. контракт модуля.
 *
 * Слушаем пять имён поимённо, а не по маске: wildcard пришлось бы включать
 * в EventEmitterModule на весь портал ради одного подписчика.
 */
@Injectable()
export class RewardsListener {
  private readonly logger = new Logger(RewardsListener.name);

  constructor(private readonly referrals: RewardsReferralsService) {}

  @OnEvent(USER_REGISTERED_EVENT)
  onRegistered(event: UserRegisteredEvent): void {
    // Без await: регистрация не должна ждать реферальной механики и тем
    // более падать вместе с ней.
    void this.referrals
      .onRegistered(event)
      .catch((error) => this.fail('регистрацию', error));
  }

  @OnEvent(PORTAL_ACTIVITY_EVENTS.chat)
  @OnEvent(PORTAL_ACTIVITY_EVENTS.notices)
  @OnEvent(PORTAL_ACTIVITY_EVENTS.market)
  @OnEvent(PORTAL_ACTIVITY_EVENTS.astro)
  @OnEvent(PORTAL_ACTIVITY_EVENTS.motivation)
  onActivity(event: PortalActivityEvent): void {
    void this.referrals
      .onActivity(event.userId, event.action, new Date(event.occurredAt))
      .catch((error) => this.fail('активность', error));
  }

  private fail(what: string, error: unknown): void {
    this.logger.error(
      `Не удалось обработать ${what} в баллах`,
      error instanceof Error ? error.stack : String(error),
    );
  }
}
