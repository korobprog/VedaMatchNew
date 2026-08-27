import { Controller, Get } from '@nestjs/common';
import { ChatConversationsService } from './chat-conversations.service';

/**
 * Единственный маршрут «Общения» без `AuthGuard`: карту общин показывает
 * публичная страница сервиса, до входа. Guard здесь не забыт — его отсутствие
 * и есть смысл контроллера, поэтому карта живёт отдельно от защищённых
 * маршрутов, а не методом в `ChatController`, где исключение из общего
 * `@UseGuards` легко потерять глазами. Тот же приём, что у
 * UnionShowcaseController.
 *
 * Наружу уходят только общины: у них адрес публичен по замыслу схемы, тогда
 * как города со счётчиком людей остаются за входом — разбор в
 * ChatPublicMapState.
 */
@Controller('chat')
export class ChatPublicMapController {
  constructor(private readonly conversations: ChatConversationsService) {}

  @Get('public-map')
  map() {
    return this.conversations.publicMap();
  }
}
