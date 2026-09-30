import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import type {
  TravelMapGroupRequestedEvent,
  TravelMapTourMembershipEvent,
} from '@vedamatch/shared';
import { ChatConversationsService } from './chat-conversations.service';

/** Имя события литералом: модули не импортируют друг друга. */
const TRAVEL_MAP_GROUP_REQUESTED = 'travel.map.group.requested';
const TRAVEL_MAP_TOUR_MEMBERSHIP = 'travel.map.tour.membership';

/**
 * «Группа места» на карте путешествий: чат заводит открытую группу, привязанную
 * к точке, и возвращает id беседы. Всё нужное едет в событии; таблицы карты не
 * читаются. Первым сообщением ничего не шлём: группа начинается пустой.
 *
 * Не вышло — null и предупреждение в лог: издатель отвечает понятной ошибкой,
 * шина не рвётся.
 */
@Injectable()
export class ChatTravelMapListener {
  private readonly logger = new Logger(ChatTravelMapListener.name);

  constructor(private readonly conversations: ChatConversationsService) {}

  @OnEvent(TRAVEL_MAP_GROUP_REQUESTED)
  async onGroupRequested(
    event: TravelMapGroupRequestedEvent,
  ): Promise<string | null> {
    try {
      const conversation = await this.conversations.create(event.requesterId, {
        kind: 'group',
        visibility: 'public',
        title: event.title,
        place: {
          id: event.placeId,
          kind: event.kind ?? 'place',
          title: event.title,
          kindLabel: event.kindLabel,
          lat: event.lat,
          lng: event.lng,
          city: event.city,
        },
      });
      return conversation.id;
    } catch (error) {
      this.logger.warn(
        `Не удалось завести группу места ${event.placeId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return null;
    }
  }

  /**
   * Запись на экскурсию и выход из неё: гид (создатель группы, значит владелец)
   * зовёт человека в группу или убирает. addMembers идемпотентен (upsert), а
   * повторный выход/блокировка бросают ошибку: гасим её предупреждением.
   */
  @OnEvent(TRAVEL_MAP_TOUR_MEMBERSHIP)
  async onTourMembership(event: TravelMapTourMembershipEvent): Promise<void> {
    try {
      if (event.action === 'joined')
        await this.conversations.addMembers(
          event.guideId,
          event.conversationId,
          [event.userId],
        );
      else
        await this.conversations.removeMember(
          event.guideId,
          event.conversationId,
          event.userId,
        );
    } catch (error) {
      this.logger.warn(
        `Не удалось обновить состав группы экскурсии ${event.conversationId} (${event.action}): ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}
