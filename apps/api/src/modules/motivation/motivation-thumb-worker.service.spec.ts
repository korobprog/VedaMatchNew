import { ConfigService } from '@nestjs/config';
import { MAX_THUMB_ATTEMPTS } from './image-thumb';
import {
  MotivationThumbWorkerService,
  THUMB_BATCH,
} from './motivation-thumb-worker.service';

const BASE = 'https://cdn.test';
const updatedAt = new Date('2026-09-01T10:00:00.000Z');
const now = new Date('2026-09-28T12:00:00.000Z');

const candidate = {
  id: 'post-1',
  imageUrl: `${BASE}/motivation/2026-09-01/post-1/v1.png`,
  imageThumbAttempts: 0,
  updatedAt,
};

function createWorker(publicUrl = BASE) {
  const motivationPost = {
    findMany: jest.fn().mockResolvedValue([candidate]),
    updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    findUnique: jest.fn().mockResolvedValue({
      imageUrl: candidate.imageUrl,
      imageThumbUrl: null,
      updatedAt,
    }),
  };
  const thumbs = {
    upload: jest
      .fn()
      .mockImplementation((key: string) => Promise.resolve(`${BASE}/${key}`)),
    uploadWeb: jest
      .fn()
      .mockImplementation((key: string) => Promise.resolve(`${BASE}/${key}`)),
  };
  const config = {
    get: jest.fn((key: string) =>
      key === 'S3_PUBLIC_URL' ? publicUrl : undefined,
    ),
  } as unknown as ConfigService;
  const worker = new MotivationThumbWorkerService(
    { motivationPost } as never,
    thumbs as never,
    config,
  );
  return { worker, motivationPost, thumbs };
}

/** Аргумент n-го вызова мока — типизированно, без `any`. */
function callArg<T>(mock: jest.Mock, index: number): T {
  return (mock.mock.calls as [T][])[index][0];
}

const fetchMock = jest.fn();
const realFetch = global.fetch;

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({
    ok: true,
    status: 200,
    arrayBuffer: () => Promise.resolve(new Uint8Array([1, 2, 3]).buffer),
  });
  global.fetch = fetchMock;
});

afterAll(() => {
  global.fetch = realFetch;
});

describe('MotivationThumbWorkerService', () => {
  it('берёт пачку постов без копии, у которых остались попытки и прошла пауза', async () => {
    const { worker, motivationPost } = createWorker();

    await worker.runBatch(now);

    const [query] = motivationPost.findMany.mock.calls[0] as [
      { where: Record<string, unknown>; take: number },
    ];
    expect(query.take).toBe(THUMB_BATCH);
    expect(query.where).toMatchObject({
      imageUrl: { not: null },
      imageThumbUrl: null,
      imageThumbAttempts: { lt: MAX_THUMB_ATTEMPTS },
    });
    expect(query.where.OR).toEqual([
      { imageThumbAttemptAt: null },
      { imageThumbAttemptAt: { lt: new Date('2026-09-28T11:50:00.000Z') } },
    ]);
  });

  it('клеймит попытку, пережимает, кладёт копию рядом и пишет её, не сдвигая updatedAt', async () => {
    const { worker, motivationPost, thumbs } = createWorker();

    const result = await worker.runBatch(now);

    expect(result).toEqual({ done: 1, failed: 0, skipped: 0 });
    // Клейм: счётчик попыток и отметка времени — до работы.
    expect(callArg(motivationPost.updateMany, 0)).toEqual({
      where: {
        id: 'post-1',
        imageUrl: candidate.imageUrl,
        imageThumbUrl: null,
        imageThumbAttempts: 0,
        updatedAt,
      },
      data: {
        imageThumbAttempts: { increment: 1 },
        imageThumbAttemptAt: now,
        updatedAt,
      },
    });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(candidate.imageUrl);
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(thumbs.upload).toHaveBeenCalledWith(
      'motivation/2026-09-01/post-1/v1-w720.webp',
      expect.any(Buffer),
    );
    expect(callArg(motivationPost.updateMany, 1)).toEqual({
      where: {
        id: 'post-1',
        imageUrl: candidate.imageUrl,
        imageThumbUrl: null,
        updatedAt,
      },
      data: {
        imageThumbUrl: `${BASE}/motivation/2026-09-01/post-1/v1-w720.webp`,
        updatedAt,
      },
    });
  });

  it('пост, который успел взять другой процесс, пропускает без скачивания', async () => {
    const { worker, motivationPost, thumbs } = createWorker();
    motivationPost.updateMany.mockResolvedValueOnce({ count: 0 });

    const result = await worker.runBatch(now);

    expect(result).toEqual({ done: 0, failed: 0, skipped: 1 });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(thumbs.upload).not.toHaveBeenCalled();
  });

  it('недоступный оригинал — неудача: попытка потрачена, копия не пишется', async () => {
    const { worker, motivationPost, thumbs } = createWorker();
    fetchMock.mockResolvedValue({ ok: false, status: 404 });

    const result = await worker.runBatch(now);

    expect(result).toEqual({ done: 0, failed: 1, skipped: 0 });
    expect(thumbs.upload).not.toHaveBeenCalled();
    expect(motivationPost.updateMany).toHaveBeenCalledTimes(1);
  });

  it('сбой пережатия тоже неудача, пачка идёт дальше', async () => {
    const { worker, motivationPost, thumbs } = createWorker();
    motivationPost.findMany.mockResolvedValue([
      candidate,
      { ...candidate, id: 'post-2' },
    ]);
    thumbs.upload.mockRejectedValueOnce(new Error('bad image'));

    const result = await worker.runBatch(now);

    expect(result).toEqual({ done: 1, failed: 1, skipped: 0 });
  });

  it('картинку сменили, пока шла копия, — старую копию не пишет', async () => {
    const { worker, motivationPost } = createWorker();
    motivationPost.findUnique.mockResolvedValue({
      imageUrl: `${BASE}/motivation/2026-09-01/post-1/v2.png`,
      imageThumbUrl: null,
      updatedAt: new Date(),
    });

    const result = await worker.runBatch(now);

    expect(result).toEqual({ done: 0, failed: 0, skipped: 1 });
    expect(motivationPost.updateMany).toHaveBeenCalledTimes(1);
  });

  it('пост тронули между чтением и записью — перечитывает и пишет с новым updatedAt', async () => {
    const { worker, motivationPost } = createWorker();
    const touched = new Date('2026-09-28T11:59:00.000Z');
    motivationPost.findUnique
      .mockResolvedValueOnce({
        imageUrl: candidate.imageUrl,
        imageThumbUrl: null,
        updatedAt,
      })
      .mockResolvedValueOnce({
        imageUrl: candidate.imageUrl,
        imageThumbUrl: null,
        updatedAt: touched,
      });
    motivationPost.updateMany
      .mockResolvedValueOnce({ count: 1 }) // клейм
      .mockResolvedValueOnce({ count: 0 }) // запись опоздала
      .mockResolvedValueOnce({ count: 1 });

    const result = await worker.runBatch(now);

    expect(result.done).toBe(1);
    const last = callArg<{
      where: { updatedAt: Date };
      data: { updatedAt: Date };
    }>(motivationPost.updateMany, 2);
    expect(last.where.updatedAt).toBe(touched);
    expect(last.data.updatedAt).toBe(touched);
  });

  it('без публичного адреса хранилища ничего не делает', async () => {
    const { worker, motivationPost } = createWorker('');

    const result = await worker.runBatch(now);

    expect(result).toEqual({ done: 0, failed: 0, skipped: 0 });
    expect(motivationPost.findMany).not.toHaveBeenCalled();
  });

  it('тик без Redis отрабатывает обе пачки и снимает флаг работы', async () => {
    const { worker, thumbs } = createWorker();

    await worker.tick();

    expect(thumbs.upload).toHaveBeenCalledTimes(1);
    expect(thumbs.uploadWeb).toHaveBeenCalledTimes(1);
    expect((worker as unknown as { running: boolean }).running).toBe(false);
  });

  describe('web-копии', () => {
    it('берёт посты без web-копии по своим полям попыток', async () => {
      const { worker, motivationPost } = createWorker();

      await worker.runWebBatch(now);

      const [query] = motivationPost.findMany.mock.calls[0] as [
        { where: Record<string, unknown>; take: number },
      ];
      expect(query.take).toBe(THUMB_BATCH);
      expect(query.where).toMatchObject({
        imageUrl: { not: null },
        imageWebUrl: null,
        imageWebAttempts: { lt: MAX_THUMB_ATTEMPTS },
      });
      expect(query.where.OR).toEqual([
        { imageWebAttemptAt: null },
        { imageWebAttemptAt: { lt: new Date('2026-09-28T11:50:00.000Z') } },
      ]);
    });

    it('клеймит, кладёт -web.webp рядом и пишет, не сдвигая updatedAt', async () => {
      const { worker, motivationPost, thumbs } = createWorker();
      motivationPost.findMany.mockResolvedValue([
        { ...candidate, imageWebAttempts: 0 },
      ]);
      motivationPost.findUnique.mockResolvedValue({
        imageUrl: candidate.imageUrl,
        imageWebUrl: null,
        updatedAt,
      });

      const result = await worker.runWebBatch(now);

      expect(result).toEqual({ done: 1, failed: 0, skipped: 0 });
      expect(callArg(motivationPost.updateMany, 0)).toEqual({
        where: {
          id: 'post-1',
          imageUrl: candidate.imageUrl,
          imageWebUrl: null,
          imageWebAttempts: 0,
          updatedAt,
        },
        data: {
          imageWebAttempts: { increment: 1 },
          imageWebAttemptAt: now,
          updatedAt,
        },
      });
      expect(thumbs.upload).not.toHaveBeenCalled();
      expect(thumbs.uploadWeb).toHaveBeenCalledWith(
        'motivation/2026-09-01/post-1/v1-web.webp',
        expect.any(Buffer),
      );
      expect(callArg(motivationPost.updateMany, 1)).toEqual({
        where: {
          id: 'post-1',
          imageUrl: candidate.imageUrl,
          imageWebUrl: null,
          updatedAt,
        },
        data: {
          imageWebUrl: `${BASE}/motivation/2026-09-01/post-1/v1-web.webp`,
          updatedAt,
        },
      });
    });

    it('картинку сменили, пока шла копия, — старую web-копию не пишет', async () => {
      const { worker, motivationPost } = createWorker();
      motivationPost.findUnique.mockResolvedValue({
        imageUrl: `${BASE}/motivation/2026-09-01/post-1/v2.png`,
        imageWebUrl: null,
        updatedAt: new Date(),
      });

      const result = await worker.runWebBatch(now);

      expect(result).toEqual({ done: 0, failed: 0, skipped: 1 });
      expect(motivationPost.updateMany).toHaveBeenCalledTimes(1);
    });
  });
});
