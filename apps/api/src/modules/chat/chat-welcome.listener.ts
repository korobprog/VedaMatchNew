import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { resolveDisplayName } from '@vedamatch/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { ChatConversationsService } from './chat-conversations.service';
import { ChatMessagesService } from './chat-messages.service';
import { welcomeMessage } from './welcome-message';

/**
 * Имя события дублируется литералом: модули не импортируют друг друга.
 * Тот же приём, что у слушателя откликов и у чистки аккаунта.
 */
const USER_REGISTERED = 'auth.user.registered';

/**
 * Приветствие новому участнику письмом от администрации (VED-20).
 *
 * В колокольчик приветствие уходит и так, но просили другого: чтобы
 * администратор видел его в истории переписки с новым человеком. Чужие личные
 * диалоги администратору не показываются — переписку открывают только по
 * неразобранной жалобе, — поэтому единственный честный способ это сделать:
 * написать от самой администрации. Диалог становится её собственным и стоит
 * у неё в списке бесед, а новичку есть кому ответить одним нажатием.
 *
 * Пишет первый по времени администратор портала: «администрация» в чате уже
 * значит роль `admin` — такой собеседник пишет без запроса, и диалог
 * открывается сразу активным. Ни бота, ни отдельного портального аккаунта в
 * чате нет, а заводить его ради одного письма — значит завести второго
 * человека, которому никто не отвечает.
 *
 * Пуш о сообщении не шлём: колокольчик уже сказал «Добро пожаловать», и два
 * уведомления об одном событии — шум. Ровно тот же довод, что у откликов.
 */
@Injectable()
export class ChatWelcomeListener {
  private readonly logger = new Logger(ChatWelcomeListener.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly conversations: ChatConversationsService,
    private readonly messages: ChatMessagesService,
  ) {}

  @OnEvent(USER_REGISTERED)
  onUserRegistered(event: { userId: string }): void {
    void this.welcome(event.userId);
  }

  private async welcome(userId: string): Promise<void> {
    try {
      // Имя читаем сами: событие сообщает факт регистрации, а формулировку
      // собирает подписчик. `User` — одна из четырёх портальных моделей,
      // которые сервису читать разрешено, и духовное имя тянем рядом с
      // мирским: наружу идёт то, которое человек показывает везде.
      const [greeter, newcomer] = await Promise.all([
        this.prisma.user.findFirst({
          where: { role: 'admin', accountStatus: 'active' },
          orderBy: { createdAt: 'asc' },
          select: { id: true },
        }),
        this.prisma.user.findUnique({
          where: { id: userId },
          select: { name: true, spiritualName: true },
        }),
      ]);
      // Некому писать или некого приветствовать — молчим. Первым участником
      // портала бывает сам администратор: себе он не пишет.
      if (!greeter || !newcomer || greeter.id === userId) return;

      const conversation = await this.conversations.create(greeter.id, {
        kind: 'direct',
        userId,
      });
      await this.messages.send(
        greeter.id,
        conversation.id,
        { body: welcomeMessage(resolveDisplayName(newcomer)) },
        conversation.id,
        { silent: true },
      );
    } catch (error) {
      // Приветствие не дошло — регистрация от этого не страдает, и колокольчик
      // своё уже сказал. Рвать шину из-за письма нельзя.
      this.logger.warn(
        `Не удалось написать приветствие участнику ${userId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}
