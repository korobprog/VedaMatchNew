import { ChatOfficialNewsListener } from './chat-official-news.listener';

describe('ChatOfficialNewsListener', () => {
  const event = {
    announcementId: 'a1',
    firstPublication: true,
    title: 't',
    body: 'b',
    images: [],
    path: '/updates/news',
    publishAt: null,
    expiresAt: null,
    actorId: null,
  };

  it('сбой очереди не рвёт шину: сохранение новости от канала не страдает', async () => {
    const posts = {
      acceptAnnouncement: jest.fn().mockRejectedValue(new Error('db down')),
      withdrawAnnouncement: jest.fn().mockRejectedValue(new Error('db down')),
    };
    const listener = new ChatOfficialNewsListener(posts as never);

    await expect(listener.onAnnouncementPublished(event)).resolves.toBeUndefined();
    await expect(
      listener.onAnnouncementWithdrawn({ announcementId: 'a1' }),
    ).resolves.toBeUndefined();
    expect(posts.acceptAnnouncement).toHaveBeenCalledWith(event);
  });

  it('о выпуске приложения отвечает издателю ответом очереди', async () => {
    const posts = { acceptAppRelease: jest.fn().mockResolvedValue(false) };
    const listener = new ChatOfficialNewsListener(posts as never);

    await expect(
      listener.onAppReleasePublished({
        variant: 'ru-site',
        versionCode: 2,
        versionName: '1.0',
        notes: null,
        path: '/app',
        builtAt: null,
      }),
    ).resolves.toBe(false);
  });
});
