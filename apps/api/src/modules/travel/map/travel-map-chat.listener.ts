import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import type {
  ChatConversationContextLinkedEvent,
  TravelMapPlaceSnapshotDto,
  TravelMapPlacesSearchRequest,
} from '@vedamatch/shared';
import { TravelMapService } from './travel-map.service';

/**
 * Мост между «Картой» и «Общением». Имена событий — литералами: модуль не
 * импортирует чат, общий язык только шина.
 */
@Injectable()
export class TravelMapChatListener {
  constructor(private readonly map: TravelMapService) {}

  /** Чат спрашивает места для формы «Новая группа»; ответ — возврат из обработчика. */
  @OnEvent('travel.map.places.search')
  onSearch(
    request: TravelMapPlacesSearchRequest,
  ): Promise<TravelMapPlaceSnapshotDto[]> {
    return this.map.searchSnapshots(request.q, request.limit);
  }

  /** Событие шины общее для всех сервисов: чужие привязки не наши. */
  @OnEvent('chat.conversation.context-linked')
  async onLinked(event: ChatConversationContextLinkedEvent): Promise<void> {
    if (event.service !== 'travel-map') return;
    await this.map.linkConversation(event.contextId, event.conversationId);
  }
}
