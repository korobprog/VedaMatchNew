import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import type { ChatConversationContextLinkedEvent } from '@vedamatch/shared';
import { TravelMapToursService } from './travel-map-tours.service';

/**
 * Привязка беседы к набору. Отдельный листенер, а не правка чата «Карты»:
 * событие общее, а различает места и наборы существование записи (uuid не
 * пересекаются).
 */
@Injectable()
export class TravelMapToursListener {
  constructor(private readonly tours: TravelMapToursService) {}

  @OnEvent('chat.conversation.context-linked')
  async onLinked(event: ChatConversationContextLinkedEvent): Promise<void> {
    if (event.service !== 'travel-map') return;
    await this.tours.linkConversation(event.contextId, event.conversationId);
  }
}
