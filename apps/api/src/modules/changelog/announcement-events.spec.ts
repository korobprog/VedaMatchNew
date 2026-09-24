import {
  ANNOUNCEMENT_PUBLISHED,
  ANNOUNCEMENT_WITHDRAWN,
  ANNOUNCEMENTS_PATH,
  announcementEventsAfterSave,
  type AnnouncementEventSource,
} from './announcement-events';

const published: AnnouncementEventSource = {
  id: 'a1',
  status: 'published',
  titleRu: 'Обновили чат',
  bodyRu: 'Теперь есть реакции',
  publishAt: null,
  expiresAt: null,
  images: [{ url: 'https://s3/announcements/x.webp', width: 800, height: 600 }],
};

describe('announcementEventsAfterSave', () => {
  it('создана опубликованной — первая публикация со всем, что нужно каналу', () => {
    expect(announcementEventsAfterSave(null, published, 'admin-1')).toEqual([
      {
        name: ANNOUNCEMENT_PUBLISHED,
        payload: {
          announcementId: 'a1',
          firstPublication: true,
          title: 'Обновили чат',
          body: 'Теперь есть реакции',
          images: [
            { url: 'https://s3/announcements/x.webp', width: 800, height: 600 },
          ],
          path: ANNOUNCEMENTS_PATH,
          publishAt: null,
          expiresAt: null,
          actorId: 'admin-1',
        },
      },
    ]);
  });

  it('черновик сняли в публикацию — тоже первая публикация', () => {
    const [event] = announcementEventsAfterSave(
      { status: 'draft' },
      published,
      null,
    );
    expect(event.name).toBe(ANNOUNCEMENT_PUBLISHED);
    expect(event.payload).toMatchObject({ firstPublication: true });
  });

  it('правка опубликованной — не первая: канал поправит, а не заведёт новый пост', () => {
    const [event] = announcementEventsAfterSave(
      { status: 'published' },
      published,
      null,
    );
    expect(event.payload).toMatchObject({ firstPublication: false });
  });

  it('расписание едет в событии датами ISO — время назначает подписчик', () => {
    const [event] = announcementEventsAfterSave(
      null,
      {
        ...published,
        publishAt: new Date('2026-10-01T09:00:00Z'),
        expiresAt: new Date('2026-10-08T09:00:00Z'),
      },
      null,
    );
    expect(event.payload).toMatchObject({
      publishAt: '2026-10-01T09:00:00.000Z',
      expiresAt: '2026-10-08T09:00:00.000Z',
    });
  });

  it('опубликованную вернули в черновик — снятие', () => {
    expect(
      announcementEventsAfterSave(
        { status: 'published' },
        { ...published, status: 'draft' },
        null,
      ),
    ).toEqual([{ name: ANNOUNCEMENT_WITHDRAWN, payload: { announcementId: 'a1' } }]);
  });

  it('черновик остался черновиком — шине сообщать нечего', () => {
    expect(
      announcementEventsAfterSave(
        { status: 'draft' },
        { ...published, status: 'draft' },
        null,
      ),
    ).toEqual([]);
    expect(
      announcementEventsAfterSave(null, { ...published, status: 'draft' }, null),
    ).toEqual([]);
  });

  it('лишние поля картинки (ключ хранилища) наружу не едут', () => {
    const [event] = announcementEventsAfterSave(
      null,
      {
        ...published,
        images: [
          { url: 'u', width: 1, height: 2, storageKey: 'secret' } as never,
        ],
      },
      null,
    );
    expect(event.payload).toMatchObject({
      images: [{ url: 'u', width: 1, height: 2 }],
    });
    expect(JSON.stringify(event.payload)).not.toContain('secret');
  });
});
