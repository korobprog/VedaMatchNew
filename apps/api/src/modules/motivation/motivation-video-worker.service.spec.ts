import { ConfigService } from '@nestjs/config';
import { MotivationVideoStatus } from '@prisma/client';
import { DEFAULT_MOTIVATION_VIDEO_PROMPT } from '@vedamatch/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { FalVideoService } from './fal-video.service';
import { MotivationGenerationService } from './motivation-generation.service';
import {
  MAX_VIDEO_ATTEMPTS,
  MotivationVideoWorkerService,
} from './motivation-video-worker.service';

type PostRow = Record<string, unknown>;

/** Настоящий 1×1 PNG: prepareFrame гоняет байты через sharp, заглушка не подойдёт. */
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

function build(options: {
  queued?: PostRow | null;
  running?: PostRow | null;
  attemptCount?: number;
  fal?: Partial<FalVideoService>;
}) {
  const updates: Array<{ where: PostRow; data: PostRow }> = [];
  const prisma = {
    motivationPost: {
      findFirst: jest.fn(async (args: { where: PostRow }) =>
        args.where.videoStatus === MotivationVideoStatus.running
          ? (options.running ?? null)
          : (options.queued ?? null),
      ),
      findUnique: jest.fn(async () => ({
        videoAttemptCount: options.attemptCount ?? 1,
      })),
      updateMany: jest.fn(async (args: { where: PostRow; data: PostRow }) => {
        updates.push(args);
        return { count: 1 };
      }),
    },
  } as unknown as PrismaService;

  const fal = {
    enabled: true,
    upload: jest.fn(async () => 'https://fal/frame.jpg'),
    submit: jest.fn(async () => ({
      requestId: 'req-1',
      statusUrl: 'https://queue/s',
      responseUrl: 'https://queue/r',
    })),
    durationSeconds: () => 5,
    poll: jest.fn(async () => ({ state: 'running' as const })),
    download: jest.fn(async () => Buffer.from('mp4')),
    ...options.fal,
  } as unknown as FalVideoService;

  const generation = {
    uploadStory: jest.fn(async () => 'https://cdn/clip.mp4'),
  } as unknown as MotivationGenerationService;

  const config = { get: () => undefined } as unknown as ConfigService;
  const worker = new MotivationVideoWorkerService(
    prisma,
    fal,
    generation,
    config,
  );
  return { worker, prisma, fal, generation, updates };
}

const runningPost = {
  id: 'p1',
  slug: 'post',
  contentDate: new Date('2026-08-18T00:00:00.000Z'),
  videoJobStatusUrl: 'https://queue/s',
  videoJobResultUrl: 'https://queue/r',
  storyCaption: false,
  translations: [],
  quote: null,
  attributionSpeaker: null,
  attributionWork: null,
  attributionLocator: null,
};

const queuedPost = {
  id: 'p2',
  slug: 'queued',
  imageUrl: 'https://cdn/pic.png',
  imagePrompt: 'тихий рассвет',
  videoPrompt: null,
};

describe('MotivationVideoWorkerService', () => {
  it('пока есть незаконченная задача, новую не ставит', async () => {
    // Поллинг бесплатен, постановка — нет. При заторе дешевле дочитать начатое.
    const { worker, fal } = build({
      running: runningPost,
      queued: queuedPost,
    });

    await worker.tick();

    expect(fal.poll).toHaveBeenCalledTimes(1);
    expect(fal.submit).not.toHaveBeenCalled();
  });

  it('готовый ролик кладёт в S3 с типом video/mp4 и отправляет на проверку', async () => {
    const { worker, generation, updates } = build({
      running: runningPost,
      fal: {
        poll: jest.fn(async () => ({
          state: 'ready' as const,
          videoUrl: 'https://fal/clip.mp4',
        })),
      },
    });

    await worker.tick();

    // С зашитым image/png браузер отказывался бы проигрывать ролик.
    expect(generation.uploadStory).toHaveBeenCalledWith(
      expect.stringContaining('-video.mp4'),
      expect.any(Buffer),
      'video/mp4',
    );
    const done = updates.find(
      (u) => u.data.videoStatus === MotivationVideoStatus.review,
    );
    expect(done?.data.videoUrl).toBe('https://cdn/clip.mp4');
  });

  it('невосстановимую ошибку не повторяет — тем же входом выйдет то же самое', async () => {
    const { worker, updates } = build({
      running: runningPost,
      attemptCount: 1,
      fal: {
        poll: jest.fn(async () => ({
          state: 'failed' as const,
          reason: 'file_download_error',
        })),
      },
    });

    await worker.tick();

    const failure = updates.find(
      (u) => u.data.videoErrorCode === 'file_download_error',
    );
    expect(failure?.data.videoStatus).toBe(MotivationVideoStatus.failed);
  });

  it('обычный сбой возвращает в очередь и стирает ссылки на задачу', async () => {
    const { worker, updates } = build({
      running: runningPost,
      attemptCount: 1,
      fal: {
        poll: jest.fn(async () => {
          throw new Error('provider_hiccup');
        }),
      },
    });

    await worker.tick();

    // Первым в тике идёт восстановление зависших, оно тоже пишет код ошибки —
    // поэтому ищем строго своё обновление, а не любое с кодом.
    const failure = updates.find(
      (u) => u.data.videoErrorCode === 'provider_hiccup',
    );
    expect(failure?.data.videoStatus).toBe(MotivationVideoStatus.queued);
    // Старые ссылки сбили бы поллинг на чужой результат.
    expect(failure?.data.videoJobStatusUrl).toBeNull();
    expect(failure?.data.videoJobResultUrl).toBeNull();
  });

  it('исчерпав попытки, больше не повторяет: каждый заход стоит денег', async () => {
    const { worker, updates } = build({
      running: runningPost,
      attemptCount: MAX_VIDEO_ATTEMPTS,
      fal: {
        poll: jest.fn(async () => {
          throw new Error('provider_hiccup');
        }),
      },
    });

    await worker.tick();

    const failure = updates.find(
      (u) => u.data.videoErrorCode === 'provider_hiccup',
    );
    expect(failure?.data.videoStatus).toBe(MotivationVideoStatus.failed);
  });

  it('больше двух попыток не допускает', () => {
    // Кривой запрос обошёлся в $2.50; три попытки — это $7.50 на одном посте.
    expect(MAX_VIDEO_ATTEMPTS).toBeLessThanOrEqual(2);
  });

  it('без ключа не заводит таймер и не трогает базу', async () => {
    const { worker, prisma } = build({
      queued: queuedPost,
      fal: { enabled: false },
    });

    await worker.onModuleInit();

    expect(prisma.motivationPost.findFirst).not.toHaveBeenCalled();
  });
});

describe('MotivationVideoWorkerService: промпт для видеомодели', () => {
  function startWith(queued: PostRow) {
    const prisma = {
      motivationPost: {
        findFirst: jest.fn(async (args: { where: PostRow }) =>
          args.where.videoStatus === MotivationVideoStatus.running
            ? null
            : queued,
        ),
        findUnique: jest.fn(async () => ({ videoAttemptCount: 1 })),
        aggregate: jest.fn(async () => ({ _sum: { videoCostUsd: 0 } })),
        updateMany: jest.fn(async () => ({ count: 1 })),
      },
    } as unknown as PrismaService;
    const fal = {
      enabled: true,
      durationSeconds: () => 5,
      upload: jest.fn(async () => 'https://fal/frame.jpg'),
      submit: jest.fn(async () => ({
        requestId: 'r',
        statusUrl: 's',
        responseUrl: 'u',
      })),
      poll: jest.fn(),
      download: jest.fn(),
    } as unknown as FalVideoService;
    const worker = new MotivationVideoWorkerService(
      prisma,
      fal,
      { uploadStory: jest.fn() } as unknown as MotivationGenerationService,
      { get: () => undefined } as unknown as ConfigService,
    );
    return { worker, fal };
  }

  async function tickWithStubbedImage(worker: MotivationVideoWorkerService) {
    const originalFetch = global.fetch;
    global.fetch = jest.fn(async () => ({
      ok: true,
      arrayBuffer: async () => new Uint8Array(TINY_PNG).buffer,
    })) as unknown as typeof fetch;
    try {
      await worker.tick();
    } finally {
      global.fetch = originalFetch;
    }
  }

  it('шлёт описание движения, а не промпт картинки', async () => {
    // Промпт иллюстрации описывает статичную сцену, и видеомодель понимает
    // его как «повтори этот кадр» — на выходе выходил застывший ролик.
    const { worker, fal } = startWith({
      ...queuedPost,
      imagePrompt: 'Тихий рассвет над рекой, тёплый свет, акварель',
      videoPrompt: 'Slow drifting mist over the water. Camera almost still.',
    });

    await tickWithStubbedImage(worker);

    expect(fal.submit).toHaveBeenCalledWith({
      imageUrl: 'https://fal/frame.jpg',
      prompt: 'Slow drifting mist over the water. Camera almost still.',
    });
  });

  it('без своего промпта берёт дефолт про мягкое движение', async () => {
    const { worker, fal } = startWith({ ...queuedPost, videoPrompt: null });

    await tickWithStubbedImage(worker);

    expect(fal.submit).toHaveBeenCalledWith({
      imageUrl: 'https://fal/frame.jpg',
      prompt: DEFAULT_MOTIVATION_VIDEO_PROMPT,
    });
  });

  it('берёт пост без промпта картинки: ролику он больше не нужен', async () => {
    const { worker, fal } = startWith({
      ...queuedPost,
      imagePrompt: null,
      videoPrompt: null,
    });

    await tickWithStubbedImage(worker);

    expect(fal.submit).toHaveBeenCalledTimes(1);
  });
});

describe('MotivationVideoWorkerService: дневной потолок', () => {
  function withSpend(spentUsd: number, limit?: string) {
    const updates: Array<{ where: PostRow; data: PostRow }> = [];
    const prisma = {
      motivationPost: {
        findFirst: jest.fn(async (args: { where: PostRow }) =>
          args.where.videoStatus === MotivationVideoStatus.running
            ? null
            : queuedPost,
        ),
        findUnique: jest.fn(async () => ({ videoAttemptCount: 1 })),
        aggregate: jest.fn(async () => ({
          _sum: { videoCostUsd: spentUsd },
        })),
        updateMany: jest.fn(async (args: { where: PostRow; data: PostRow }) => {
          updates.push(args);
          return { count: 1 };
        }),
      },
    } as unknown as PrismaService;
    const fal = {
      enabled: true,
      durationSeconds: () => 5,
      upload: jest.fn(async () => 'https://fal/frame.jpg'),
      submit: jest.fn(async () => ({
        requestId: 'r',
        statusUrl: 's',
        responseUrl: 'u',
      })),
      poll: jest.fn(),
      download: jest.fn(),
    } as unknown as FalVideoService;
    const generation = {
      uploadStory: jest.fn(),
    } as unknown as MotivationGenerationService;
    const config = {
      get: (k: string) =>
        k === 'MOTIVATION_AI_DAILY_BUDGET_USD' ? limit : undefined,
    } as unknown as ConfigService;
    return {
      worker: new MotivationVideoWorkerService(prisma, fal, generation, config),
      fal,
      updates,
    };
  }

  it('упёршись в потолок, не отправляет запрос провайдеру', async () => {
    const { worker, fal } = withSpend(4.99, '5');

    await worker.tick();

    // Списание происходит в момент постановки задачи и не отменяется,
    // поэтому проверка обязана стоять до сети, а не после.
    expect(fal.submit).not.toHaveBeenCalled();
    expect(fal.upload).not.toHaveBeenCalled();
  });

  it('потолок возвращает пост в очередь, не тратя попытку', async () => {
    const { worker, updates } = withSpend(4.99, '5');

    await worker.tick();

    const budget = updates.find((u) =>
      String(u.data.videoErrorCode ?? '').startsWith('daily_budget_exceeded'),
    );
    expect(budget?.data.videoStatus).toBe(MotivationVideoStatus.queued);
    expect(budget?.data.videoAttemptCount).toEqual({ decrement: 1 });
  });

  it('в пределах потолка работает как обычно', async () => {
    const { worker, fal } = withSpend(0.1, '5');
    const originalFetch = global.fetch;
    global.fetch = jest.fn(async () => ({
      ok: true,
      arrayBuffer: async () => new Uint8Array(TINY_PNG).buffer,
    })) as unknown as typeof fetch;

    try {
      await worker.tick();
    } finally {
      global.fetch = originalFetch;
    }

    expect(fal.upload).toHaveBeenCalledTimes(1);
    expect(fal.submit).toHaveBeenCalledTimes(1);
  });

  it('без настройки берёт осторожный потолок, а не бесконечный', async () => {
    const { worker, fal } = withSpend(100);

    await worker.tick();

    expect(fal.submit).not.toHaveBeenCalled();
  });
});
