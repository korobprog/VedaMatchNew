import type { ChangelogAnnouncementPublishedEvent } from '@vedamatch/shared';
import type { PrismaService } from '../../prisma/prisma.service';
import { ChatOfficialPostsService } from './chat-official-posts.service';

const NOW = new Date('2026-09-24T10:00:00Z');

function makeDeps() {
  const prisma = {
    chatOfficialPost: {
      findUnique: jest.fn().mockResolvedValue(null),
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({}),
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    chatConversation: {
      findFirst: jest.fn().mockResolvedValue({ id: 'channel' }),
    },
    chatMember: {
      findMany: jest
        .fn()
        .mockResolvedValue([{ userId: 'admin-1' }, { userId: 'admin-2' }]),
    },
    chatMessage: {
      findUnique: jest
        .fn()
        .mockResolvedValue({ authorId: 'admin-1', deletedAt: null }),
    },
  };
  const messages = {
    send: jest.fn().mockResolvedValue({ id: 'm-new' }),
    edit: jest.fn().mockResolvedValue({}),
    remove: jest.fn().mockResolvedValue({}),
  };
  const uploads = {
    copyImageIntoConversation: jest.fn(
      (conversationId: string, image: { url: string }) =>
        Promise.resolve({
          kind: 'image',
          url: `https://s3/chat/${conversationId}/copy-of-${image.url.split('/').pop()}`,
          key: 'k',
        }),
    ),
  };
  const config = {
    get: jest.fn((key: string) =>
      key === 'WEB_ORIGIN' ? 'https://vedamatch.ru,https://vedamatch.com' : undefined,
    ),
  };
  const service = new ChatOfficialPostsService(
    prisma as unknown as PrismaService,
    messages as never,
    uploads as never,
    config as never,
  );
  return { prisma, messages, uploads, service };
}

const event: ChangelogAnnouncementPublishedEvent = {
  announcementId: 'a1',
  firstPublication: true,
  title: 'Открыли «Путешествия»',
  body: 'Ищите ночлег у преданных',
  images: [{ url: 'https://s3/announcements/p.webp', width: 800, height: 600 }],
  path: '/updates/news',
  publishAt: null,
  expiresAt: null,
  actorId: 'admin-2',
};

const pendingPost = {
  id: 'p1',
  source: 'changelog.announcement',
  sourceId: 'a1',
  title: 'Открыли «Путешествия»',
  body: 'Ищите ночлег у преданных',
  path: '/updates/news',
  images: [{ url: 'https://s3/announcements/p.webp', width: 800, height: 600 }],
  authorHintId: 'admin-2',
  expiresAt: null,
  attemptCount: 1,
};

describe('ChatOfficialPostsService — приём новостей', () => {
  it('первая публикация ставит пост в очередь с картинкой и автором', async () => {
    const { service, prisma } = makeDeps();

    await service.acceptAnnouncement(event, NOW);

    expect(prisma.chatOfficialPost.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        source: 'changelog.announcement',
        sourceId: 'a1',
        title: 'Открыли «Путешествия»',
        images: event.images,
        authorHintId: 'admin-2',
        publishAt: NOW,
        expiresAt: null,
      }),
    });
  });

  it('то же событие второй раз (гонка) — дубль гасит уникальный индекс, без ошибки', async () => {
    const { service, prisma } = makeDeps();
    prisma.chatOfficialPost.create.mockRejectedValue(
      Object.assign(new Error('unique'), { code: 'P2002' }),
    );

    await expect(service.acceptAnnouncement(event, NOW)).resolves.toBeUndefined();
  });

  it('другая ошибка базы не глотается — её пишет слушатель', async () => {
    const { service, prisma } = makeDeps();
    prisma.chatOfficialPost.create.mockRejectedValue(new Error('db down'));

    await expect(service.acceptAnnouncement(event, NOW)).rejects.toThrow('db down');
  });

  it('новость с истёкшим сроком показа в канал не идёт', async () => {
    const { service, prisma } = makeDeps();

    await service.acceptAnnouncement(
      { ...event, expiresAt: '2026-09-23T00:00:00Z' },
      NOW,
    );

    expect(prisma.chatOfficialPost.create).not.toHaveBeenCalled();
    expect(prisma.chatOfficialPost.updateMany).not.toHaveBeenCalled();
  });

  it('отложенная новость ждёт своего времени', async () => {
    const { service, prisma } = makeDeps();

    await service.acceptAnnouncement(
      { ...event, publishAt: '2026-10-01T06:00:00Z' },
      NOW,
    );

    expect(prisma.chatOfficialPost.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        publishAt: new Date('2026-10-01T06:00:00Z'),
      }),
    });
  });

  it('правка ещё не вышедшего поста обновляет его, условием по статусу', async () => {
    const { service, prisma } = makeDeps();
    prisma.chatOfficialPost.findUnique.mockResolvedValue({
      id: 'p1',
      status: 'pending',
      messageId: null,
    });

    await service.acceptAnnouncement(
      { ...event, firstPublication: false, title: 'Иначе' },
      NOW,
    );

    expect(prisma.chatOfficialPost.create).not.toHaveBeenCalled();
    expect(prisma.chatOfficialPost.updateMany).toHaveBeenCalledWith({
      where: { id: 'p1', status: 'pending' },
      data: expect.objectContaining({ title: 'Иначе', status: 'pending' }),
    });
  });

  it('правка вышедшей новости правит сообщение от имени его автора', async () => {
    const { service, prisma, messages } = makeDeps();
    prisma.chatOfficialPost.findUnique
      .mockResolvedValueOnce({ id: 'p1', status: 'posted', messageId: 'm1' })
      .mockResolvedValueOnce({
        source: 'changelog.announcement',
        title: 'Иначе',
        body: 'Ищите ночлег у преданных',
        path: '/updates/news',
        message: { id: 'm1', authorId: 'admin-1', body: 'старый текст', deletedAt: null },
      });

    await service.acceptAnnouncement(
      { ...event, firstPublication: false, title: 'Иначе' },
      NOW,
    );

    expect(messages.edit).toHaveBeenCalledWith(
      'admin-1',
      'm1',
      expect.stringContaining('📰 Иначе'),
    );
    expect(prisma.chatOfficialPost.create).not.toHaveBeenCalled();
  });

  it('сохранение без изменений текста сообщение не трогает', async () => {
    const { service, prisma, messages } = makeDeps();
    const text = [
      '📰 Открыли «Путешествия»',
      '',
      'Ищите ночлег у преданных',
      '',
      'Подробнее: https://vedamatch.ru/updates/news',
    ].join('\n');
    prisma.chatOfficialPost.findUnique
      .mockResolvedValueOnce({ id: 'p1', status: 'posted', messageId: 'm1' })
      .mockResolvedValueOnce({
        source: 'changelog.announcement',
        title: event.title,
        body: event.body,
        path: event.path,
        message: { id: 'm1', authorId: 'admin-1', body: text, deletedAt: null },
      });

    await service.acceptAnnouncement({ ...event, firstPublication: false }, NOW);

    expect(messages.edit).not.toHaveBeenCalled();
  });

  it('снятие вышедшей новости удаляет сообщение и отменяет пост', async () => {
    const { service, prisma, messages } = makeDeps();
    prisma.chatOfficialPost.findUnique.mockResolvedValue({
      id: 'p1',
      status: 'posted',
      messageId: 'm1',
    });

    await service.withdrawAnnouncement({ announcementId: 'a1' });

    expect(messages.remove).toHaveBeenCalledWith('admin-1', 'm1');
    expect(prisma.chatOfficialPost.update).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: { status: 'cancelled', messageId: null },
    });
  });

  it('снятие новости, которой в канале нет, ничего не делает', async () => {
    const { service, prisma, messages } = makeDeps();

    await service.withdrawAnnouncement({ announcementId: 'a1' });

    expect(messages.remove).not.toHaveBeenCalled();
    expect(prisma.chatOfficialPost.update).not.toHaveBeenCalled();
  });
});

describe('ChatOfficialPostsService — выпуск приложения', () => {
  const release = {
    variant: 'ru-site',
    versionCode: 1031,
    versionName: '1.4.0+abc1234',
    notes: 'Голосовые сообщения',
    path: '/app',
    builtAt: null,
  };

  it('ставит пост о версии в очередь и отвечает издателю «да»', async () => {
    const { service, prisma } = makeDeps();

    await expect(service.acceptAppRelease(release, NOW)).resolves.toBe(true);
    expect(prisma.chatOfficialPost.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        source: 'app.release',
        sourceId: 'ru-site:1031',
        title:
          'Вышла версия 1.4.0 (сборка 1031) приложения VedaMatch для Android',
        body: 'Что нового:\nГолосовые сообщения',
        path: '/app',
        publishAt: NOW,
      }),
    });
  });

  it('повтор о той же версии — «да», второго поста нет', async () => {
    const { service, prisma } = makeDeps();
    prisma.chatOfficialPost.create.mockRejectedValue(
      Object.assign(new Error('unique'), { code: 'P2002' }),
    );

    await expect(service.acceptAppRelease(release, NOW)).resolves.toBe(true);
  });

  it('база недоступна — «нет»: издатель повторит', async () => {
    const { service, prisma } = makeDeps();
    prisma.chatOfficialPost.create.mockRejectedValue(new Error('db down'));

    await expect(service.acceptAppRelease(release, NOW)).resolves.toBe(false);
  });
});

describe('ChatOfficialPostsService — публикация очереди', () => {
  function withDue(deps: ReturnType<typeof makeDeps>, post = pendingPost) {
    deps.prisma.chatOfficialPost.findFirst.mockResolvedValue({ id: post.id });
    deps.prisma.chatOfficialPost.findUnique.mockResolvedValue(post);
  }

  it('пустая очередь — брать нечего', async () => {
    const { service, messages } = makeDeps();
    await expect(service.publishNext(NOW)).resolves.toBe(false);
    expect(messages.send).not.toHaveBeenCalled();
  });

  it('публикует пост с копией картинки от имени опубликовавшего админа', async () => {
    const deps = makeDeps();
    withDue(deps);

    await expect(deps.service.publishNext(NOW)).resolves.toBe(true);

    expect(deps.prisma.chatOfficialPost.updateMany).toHaveBeenNthCalledWith(1, {
      where: { id: 'p1', status: 'pending' },
      data: { status: 'posting', attemptCount: { increment: 1 } },
    });
    expect(deps.uploads.copyImageIntoConversation).toHaveBeenCalledWith(
      'channel',
      pendingPost.images[0],
    );
    expect(deps.messages.send).toHaveBeenCalledWith('admin-2', 'channel', {
      body: [
        '📰 Открыли «Путешествия»',
        '',
        'Ищите ночлег у преданных',
        '',
        'Подробнее: https://vedamatch.ru/updates/news',
      ].join('\n'),
      attachments: [
        expect.objectContaining({
          kind: 'image',
          url: 'https://s3/chat/channel/copy-of-p.webp',
        }),
      ],
    });
    expect(deps.prisma.chatOfficialPost.updateMany).toHaveBeenLastCalledWith({
      where: { id: 'p1', status: 'posting' },
      data: expect.objectContaining({ status: 'posted', messageId: 'm-new' }),
    });
    expect(deps.messages.remove).not.toHaveBeenCalled();
  });

  it('второй воркер тот же пост не публикует: клейм не прошёл', async () => {
    const deps = makeDeps();
    withDue(deps);
    deps.prisma.chatOfficialPost.updateMany.mockResolvedValueOnce({ count: 0 });

    await deps.service.publishNext(NOW);

    expect(deps.messages.send).not.toHaveBeenCalled();
  });

  it('картинка не скопировалась — пост выходит без неё', async () => {
    const deps = makeDeps();
    withDue(deps);
    deps.uploads.copyImageIntoConversation.mockRejectedValue(new Error('s3'));

    await deps.service.publishNext(NOW);

    expect(deps.messages.send).toHaveBeenCalledWith(
      'admin-2',
      'channel',
      expect.objectContaining({ attachments: [] }),
    );
  });

  it('автор-агент не админ канала — пишет первый администратор', async () => {
    const deps = makeDeps();
    withDue(deps, { ...pendingPost, authorHintId: 'sevak' });

    await deps.service.publishNext(NOW);

    expect(deps.messages.send.mock.calls[0][0]).toBe('admin-1');
  });

  it('новость сняли, пока пост уходил, — вышедшее сообщение удаляется', async () => {
    const deps = makeDeps();
    withDue(deps);
    deps.prisma.chatOfficialPost.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });

    await deps.service.publishNext(NOW);

    expect(deps.messages.remove).toHaveBeenCalledWith('admin-1', 'm-new');
  });

  it('срок показа кончился, пока пост ждал, — пропуск без публикации', async () => {
    const deps = makeDeps();
    withDue(deps, { ...pendingPost, expiresAt: new Date('2026-09-24T09:00:00Z') as never });

    await deps.service.publishNext(NOW);

    expect(deps.messages.send).not.toHaveBeenCalled();
    expect(deps.prisma.chatOfficialPost.updateMany).toHaveBeenLastCalledWith({
      where: { id: 'p1', status: 'posting' },
      data: { status: 'skipped' },
    });
  });

  it('канала нет — пост возвращается в очередь с причиной', async () => {
    const deps = makeDeps();
    withDue(deps);
    deps.prisma.chatConversation.findFirst.mockResolvedValue(null);

    await deps.service.publishNext(NOW);

    expect(deps.messages.send).not.toHaveBeenCalled();
    expect(deps.prisma.chatOfficialPost.updateMany).toHaveBeenLastCalledWith({
      where: { id: 'p1', status: 'posting' },
      data: { status: 'pending', errorMessage: 'Официальный канал не создан' },
    });
  });

  it('третья неудача — пост помечается failed, а не крутится вечно', async () => {
    const deps = makeDeps();
    withDue(deps, { ...pendingPost, attemptCount: 3 });
    deps.messages.send.mockRejectedValue(new Error('send failed'));

    await deps.service.publishNext(NOW);

    expect(deps.prisma.chatOfficialPost.updateMany).toHaveBeenLastCalledWith({
      where: { id: 'p1', status: 'posting' },
      data: { status: 'failed', errorMessage: 'send failed' },
    });
  });

  it('в канале нет администраторов — писать некому, пост ждёт', async () => {
    const deps = makeDeps();
    withDue(deps);
    deps.prisma.chatMember.findMany.mockResolvedValue([]);

    await deps.service.publishNext(NOW);

    expect(deps.messages.send).not.toHaveBeenCalled();
  });

  it('зависший «в работе» возвращается в очередь, исчерпавший попытки — failed', async () => {
    const deps = makeDeps();

    await deps.service.recoverStale(NOW);

    const calls = deps.prisma.chatOfficialPost.updateMany.mock.calls as [
      { where: Record<string, unknown>; data: Record<string, unknown> },
    ][];
    expect(calls[0][0].data).toEqual({
      status: 'pending',
      errorMessage: 'lease_expired',
    });
    expect(calls[0][0].where).toMatchObject({
      status: 'posting',
      updatedAt: { lt: new Date('2026-09-24T09:55:00Z') },
    });
    expect(calls[1][0].data).toEqual({
      status: 'failed',
      errorMessage: 'lease_expired',
    });
  });
});
