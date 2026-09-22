import type { ExecutionContext, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

// `jose` — ESM, а `auth.guard` тянет её через `jwt.service`. Гвард всё равно
// подменяется ниже: разбирать настоящий токен для проверки маршрутов не нужно.
jest.mock('jose', () => ({}));

import { AuthGuard } from '../auth/auth.guard';
import { ChatController } from './chat.controller';
import { ChatColorTemplatesService } from './chat-color-templates.service';
import { ChatConversationThemeService } from './chat-conversation-theme.service';
import { ChatConversationsService } from './chat-conversations.service';
import { ChatEmojiService } from './chat-emoji.service';
import { ChatMessagesService } from './chat-messages.service';
import { ChatReportsService } from './chat-reports.service';
import { ChatSignedUrlsInterceptor } from './chat-signed-urls.interceptor';
import { ChatUploadsService } from './chat-uploads.service';
import { PeopleService } from './people/people.service';

/**
 * Выход из беседы обязан доходить до `leave`.
 *
 * Nest отдаёт маршруты Express в порядке объявления, а Express берёт первый
 * подошедший. Пока `@Delete('conversations/:id/members/:userId')` стоял выше
 * `@Delete('conversations/:id/members/me')`, запрос «выйти из беседы» попадал
 * в `removeMember` с `targetId = 'me'` и получал «Участник не найден» — то
 * есть человек оставался в беседе, а экран у него закрывался.
 *
 * Проверяется настоящей маршрутизацией: запрос уходит в HTTP-сервер
 * приложения, а не сверяется текст файла или метаданные декораторов.
 */
describe('выход из беседы доходит до своего обработчика', () => {
  let app: INestApplication;
  const calls: { handler: string; args: unknown[] }[] = [];

  const conversations = {
    leave: (...args: unknown[]) => {
      calls.push({ handler: 'leave', args });
      return { ok: true };
    },
    removeMember: (...args: unknown[]) => {
      calls.push({ handler: 'removeMember', args });
      return { ok: true };
    },
  };

  beforeAll(async () => {
    // Пустышка, а не Proxy с универсальным геттером: такой Proxy выглядит
    // как thenable, и внедрение зависимостей на нём зависает навсегда.
    const unused = {};
    const moduleRef = await Test.createTestingModule({
      controllers: [ChatController],
      providers: [
        { provide: ChatConversationsService, useValue: conversations },
        { provide: ChatMessagesService, useValue: unused },
        { provide: ChatReportsService, useValue: unused },
        { provide: ChatUploadsService, useValue: unused },
        { provide: PeopleService, useValue: unused },
        { provide: ChatColorTemplatesService, useValue: unused },
        { provide: ChatConversationThemeService, useValue: unused },
        { provide: ChatEmojiService, useValue: unused },
      ],
    })
      .overrideGuard(AuthGuard)
      .useValue({
        canActivate: (context: ExecutionContext) => {
          context.switchToHttp().getRequest<{ user: unknown }>().user = {
            sub: 'viewer-id',
          };
          return true;
        },
      })
      .overrideInterceptor(ChatSignedUrlsInterceptor)
      .useValue({
        intercept: (_context: unknown, next: { handle: () => unknown }) =>
          next.handle(),
      })
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterEach(() => {
    calls.length = 0;
  });

  afterAll(async () => {
    await app?.close();
  });

  it('DELETE .../members/me вызывает leave, а не removeMember', async () => {
    await request(app.getHttpServer())
      .delete('/chat/conversations/c1/members/me')
      .expect(200);

    expect(calls).toEqual([{ handler: 'leave', args: ['viewer-id', 'c1'] }]);
  });

  it('DELETE .../members/<id> по-прежнему вызывает removeMember', async () => {
    await request(app.getHttpServer())
      .delete('/chat/conversations/c1/members/u2')
      .expect(200);

    expect(calls).toEqual([
      { handler: 'removeMember', args: ['viewer-id', 'c1', 'u2'] },
    ]);
  });
});
