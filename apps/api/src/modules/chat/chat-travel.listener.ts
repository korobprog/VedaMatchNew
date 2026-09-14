import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import type { TravelContactRequestedEvent } from '@vedamatch/shared';
import { ChatConversationsService } from './chat-conversations.service';
import { ChatMessagesService } from './chat-messages.service';

/**
 * Имя события литералом: модули не импортируют друг друга, а значения из
 * @vedamatch/shared на сервер не вывозятся.
 */
const TRAVEL_CONTACT_REQUESTED = 'travel.contact.requested';

/**
 * «Написать хозяину» в «Путешествиях» открывает личную переписку с владельцем
 * объекта. Первым сообщением уходит карточка объекта со строкой о заявке —
 * хозяин видит, о каком месте и каких датах речь. Своего чата у
 * «Путешествий» нет: переписка портала живёт здесь.
 *
 * Всё нужное едет в событии; таблицы «Путешествий» не читаются.
 *
 * Возвращает id беседы: издатель вызывает emitAsync и ведёт человека прямо в
 * переписку. Не вышло (блокировка, отклонённый запрос) — null, и издатель
 * отвечает понятной ошибкой, а шина не рвётся.
 */
@Injectable()
export class ChatTravelListener {
  private readonly logger = new Logger(ChatTravelListener.name);

  constructor(
    private readonly conversations: ChatConversationsService,
    private readonly messages: ChatMessagesService,
  ) {}

  @OnEvent(TRAVEL_CONTACT_REQUESTED)
  async onContactRequested(
    event: TravelContactRequestedEvent,
  ): Promise<string | null> {
    let conversationId: string;
    try {
      const conversation = await this.conversations.create(event.requesterId, {
        kind: 'direct',
        userId: event.recipientId,
      });
      conversationId = conversation.id;
    } catch (error) {
      // Блокировка или отклонённый запрос: переписки нет и не будет.
      this.logger.warn(
        `Не удалось открыть переписку по объекту ${event.stayId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return null;
    }

    try {
      await this.messages.send(
        event.requesterId,
        conversationId,
        {
          body: event.message,
          attachments: [
            {
              kind: 'stay',
              title: event.stayName,
              subtitle: `${event.stayKindLabel} · Путешествия`,
              body: event.cardBody,
              sourceService: 'travel',
              sourceId: event.stayId,
            },
          ],
        },
        conversationId,
      );
    } catch (error) {
      // Беседа есть, но сообщение не ушло — чаще всего запрос ещё не принят,
      // и второе сообщение до ответа хозяина чат не пропускает. Человека всё
      // равно ведём в переписку: там видно «дождитесь ответа», а не ложное
      // «переписка недоступна».
      this.logger.log(
        `Карточка объекта ${event.stayId} не отправлена в беседу ${conversationId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
    return conversationId;
  }
}
