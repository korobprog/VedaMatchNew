import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import type { NotificationEvent } from '@vedamatch/shared';
import { ChatConversationsService } from './chat-conversations.service';
import { ChatMessagesService } from './chat-messages.service';

/**
 * Имя события дублируется здесь литералом: модули не импортируют друг друга,
 * а @vedamatch/shared не собирается и значения оттуда не вывозятся.
 */
const VACANCY_RESPONSE_CREATED = 'vacancies.response.created';

type VacancyResponseCreated = Extract<
  NotificationEvent,
  { name: 'vacancies.response.created' }
>;

const KIND_LABELS: Record<VacancyResponseCreated['offerKind'], string> = {
  work: 'Работа',
  seva: 'Служение',
  task: 'Разовая задача',
};

/**
 * Отклик в «Вакансиях» открывает переписку: соискатель и автор получают
 * личный диалог, а первым сообщением уходит карточка предложения с «парой
 * слов о себе». Своего чата у «Вакансий» нет — переписка портала живёт здесь.
 *
 * Всё нужное едет в событии: заголовок, вид и id предложения, текст отклика.
 * Таблицы «Вакансий» не читаются — контракт сервисного модуля.
 *
 * Диалог создаётся от лица соискателя: он пишет первым, и по правилам чата
 * это запрос, на который автор отвечает или нет. Пуш о новом сообщении не
 * шлётся: колокольчик уже получил «Отклик на предложение», а два уведомления
 * об одном действии — шум.
 */
@Injectable()
export class ChatVacanciesListener {
  private readonly logger = new Logger(ChatVacanciesListener.name);

  constructor(
    private readonly conversations: ChatConversationsService,
    private readonly messages: ChatMessagesService,
  ) {}

  @OnEvent(VACANCY_RESPONSE_CREATED)
  async onResponseCreated(event: VacancyResponseCreated): Promise<void> {
    try {
      const conversation = await this.conversations.create(event.responderId, {
        kind: 'direct',
        userId: event.recipientId,
      });
      await this.messages.send(
        event.responderId,
        conversation.id,
        {
          body: event.message ?? 'Здравствуйте! Хочу откликнуться.',
          attachments: [
            {
              kind: 'vacancy',
              title: event.offerTitle,
              subtitle: `${KIND_LABELS[event.offerKind]} · Вакансии`,
              body: 'Отклик на предложение',
              sourceService: 'vacancies',
              sourceId: event.offerId,
            },
          ],
        },
        conversation.id,
        { silent: true },
      );
    } catch (error) {
      // Блокировка, отклонённый ранее запрос, исчерпанный лимит — отклик
      // всё равно записан у «Вакансий», и автор увидит его в воронке.
      // Диалог просто не открылся; рвать шину из-за этого нельзя.
      this.logger.warn(
        `Не удалось открыть диалог по отклику ${event.responseId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}
