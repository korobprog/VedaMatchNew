import type { ExecutionContext, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

// `jose` — ESM, а `auth.guard` тянет её через `jwt.service`. Гварды всё
// равно подменяются ниже: разбирать настоящий токен для проверки маршрутов
// не нужно. Тот же приём, что в `chat-route-order.spec.ts`.
jest.mock('jose', () => ({}));

import { AuthGuard, OptionalAuthGuard } from '../../auth/auth.guard';
import { ChatConferenceController } from './chat-conference.controller';
import { ChatConferenceService } from './chat-conference.service';
import { ChatSignedUrlsInterceptor } from '../chat-signed-urls.interceptor';

/**
 * Ссылка обязана доходить до своего обработчика.
 *
 * Nest отдаёт маршруты Express в порядке объявления, а Express берёт первый
 * подошедший. Поставь `@Get(':conversationId')` выше `@Get('links/:token')`
 * — и переход по ссылке уйдёт в «покажи ссылку моей комнаты» с токеном
 * вместо id беседы. Отвечать это будет «такой конференции нет»: приглашённый
 * упрётся в стену, а в логах не будет ни одной ошибки.
 *
 * Проверяется настоящей маршрутизацией, а не чтением файла: запрос уходит в
 * HTTP-сервер приложения.
 */
describe('порядок маршрутов конференции', () => {
  let app: INestApplication;
  const calls: { handler: string; args: unknown[] }[] = [];
  const token = 'a'.repeat(32);

  const conference = {
    invite: (...args: unknown[]) => {
      calls.push({ handler: 'invite', args });
      return { denial: null };
    },
    join: (...args: unknown[]) => {
      calls.push({ handler: 'join', args });
      return { conversationId: 'c1' };
    },
    forConversation: (...args: unknown[]) => {
      calls.push({ handler: 'forConversation', args });
      return { conversationId: 'c1' };
    },
    revoke: (...args: unknown[]) => {
      calls.push({ handler: 'revoke', args });
      return { conversationId: 'c1' };
    },
    rotate: (...args: unknown[]) => {
      calls.push({ handler: 'rotate', args });
      return { conversationId: 'c1' };
    },
  };

  const allowGuard = {
    canActivate: (context: ExecutionContext) => {
      context.switchToHttp().getRequest<{ user: unknown }>().user = {
        sub: 'viewer-id',
      };
      return true;
    },
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [ChatConferenceController],
      providers: [{ provide: ChatConferenceService, useValue: conference }],
    })
      .overrideGuard(AuthGuard)
      .useValue(allowGuard)
      .overrideGuard(OptionalAuthGuard)
      .useValue(allowGuard)
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

  it('GET links/<токен> открывает карточку приглашения', async () => {
    await request(app.getHttpServer())
      .get(`/chat/conference/links/${token}`)
      .expect(200);

    expect(calls).toEqual([{ handler: 'invite', args: [token, 'viewer-id'] }]);
  });

  it('POST links/<токен>/join ведёт в комнату', async () => {
    await request(app.getHttpServer())
      .post(`/chat/conference/links/${token}/join`)
      .expect(200);

    expect(calls).toEqual([{ handler: 'join', args: [token, 'viewer-id'] }]);
  });

  it('GET <id беседы> по-прежнему отдаёт ссылку своей комнаты', async () => {
    await request(app.getHttpServer())
      .get('/chat/conference/conv-1')
      .expect(200);

    expect(calls).toEqual([
      { handler: 'forConversation', args: ['conv-1', 'viewer-id'] },
    ]);
  });

  it('POST <id беседы>/revoke закрывает вход', async () => {
    await request(app.getHttpServer())
      .post('/chat/conference/conv-1/revoke')
      .expect(200);

    expect(calls).toEqual([
      { handler: 'revoke', args: ['conv-1', 'viewer-id'] },
    ]);
  });

  it('POST <id беседы>/link выдаёт новую ссылку', async () => {
    await request(app.getHttpServer())
      .post('/chat/conference/conv-1/link')
      .expect(200);

    expect(calls).toEqual([
      { handler: 'rotate', args: ['conv-1', 'viewer-id'] },
    ]);
  });

  // Кривой токен обязан отвечать тем же, чем несуществующий: перебором
  // нельзя узнать даже того, что комната существует.
  it('токен неверной формы — 404 и ни одного обращения к базе', async () => {
    await request(app.getHttpServer())
      .get('/chat/conference/links/короткий')
      .expect(404);

    expect(calls).toEqual([]);
  });
});
