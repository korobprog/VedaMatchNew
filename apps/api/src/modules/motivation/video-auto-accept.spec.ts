import { MotivationVideoStatus } from '@prisma/client';
import { MotivationVideoWorkerService } from './motivation-video-worker.service';

type Row = Record<string, unknown>;

/**
 * Автоприёмка ролика. Раньше собранный ролик всегда вставал в `review` и ждал
 * администратора — даже когда весь остальной конвейер шёл без человека.
 */
function build(options: {
  moderationMode?: string;
  approvalAction?: string | null;
  origin?: string;
  withSettings?: boolean;
}) {
  const updates: Array<{ where: Row; data: Row }> = [];
  const running = {
    id: 'p1',
    slug: 'post',
    origin: options.origin ?? 'user',
    authorUserId: 'author-1',
    contentDate: new Date('2026-08-20T00:00:00.000Z'),
    videoJobStatusUrl: 'https://queue/s',
    videoJobResultUrl: 'https://queue/r',
    storyCaption: false,
    translations: [],
    quote: null,
    attributionSpeaker: null,
    attributionWork: null,
    attributionLocator: null,
  };
  const prisma = {
    motivationPost: {
      findFirst: jest.fn((args: { where: Row }) =>
        Promise.resolve(
          args.where.videoStatus === MotivationVideoStatus.running
            ? running
            : null,
        ),
      ),
      findUnique: jest.fn(() => Promise.resolve({ videoAttemptCount: 1 })),
      updateMany: jest.fn((args: { where: Row; data: Row }) => {
        updates.push(args);
        return Promise.resolve({ count: 1 });
      }),
    },
    motivationModerationAudit: {
      findFirst: jest.fn(() =>
        Promise.resolve(
          options.approvalAction === null
            ? null
            : { action: options.approvalAction ?? 'ai_approve' },
        ),
      ),
    },
    user: { findMany: jest.fn(() => Promise.resolve([{ id: 'admin-1' }])) },
  };
  const fal = {
    enabled: true,
    poll: jest.fn(() =>
      Promise.resolve({
        state: 'ready' as const,
        videoUrl: 'https://fal/clip.mp4',
      }),
    ),
    download: jest.fn(() => Promise.resolve(Buffer.from('mp4'))),
    durationSeconds: () => 5,
    modelId: () => 'test/model',
    audioEnabled: () => false,
  };
  const generation = {
    uploadStory: jest.fn(() => Promise.resolve('https://cdn/clip.mp4')),
  };
  const emit = jest.fn();
  const settings = {
    read: jest.fn(() =>
      Promise.resolve({
        aiModerationMode: options.moderationMode ?? 'autonomous',
      }),
    ),
  };

  const worker = new MotivationVideoWorkerService(
    prisma as never,
    fal as never,
    { enabled: false } as never,
    generation as never,
    { get: () => undefined } as never,
    { emit } as never,
    options.withSettings === false ? undefined : (settings as never),
  );
  return { worker, updates, emit };
}

function statusOf(updates: Array<{ data: Row }>): unknown {
  return updates.find((u) => u.data.videoUrl)?.data.videoStatus;
}

describe('MotivationVideoWorkerService: автоприёмка ролика', () => {
  it('в автономном режиме принимает сам и зовёт автора, а не администратора', async () => {
    const { worker, updates, emit } = build({});

    await worker.tick();

    expect(statusOf(updates)).toBe(MotivationVideoStatus.ready);
    expect(emit).toHaveBeenCalledWith('motivation.video.ready', {
      name: 'motivation.video.ready',
      recipientId: 'author-1',
      reelId: 'p1',
    });
    expect(emit).not.toHaveBeenCalledWith(
      'motivation.video.review',
      expect.anything(),
    );
  });

  it('в режиме «подсказывает» по-прежнему ждёт человека и зовёт его', async () => {
    const { worker, updates, emit } = build({ moderationMode: 'assist' });

    await worker.tick();

    expect(statusOf(updates)).toBe(MotivationVideoStatus.review);
    expect(emit).toHaveBeenCalledWith('motivation.video.review', {
      name: 'motivation.video.review',
      recipientId: 'admin-1',
      reelId: 'p1',
    });
  });

  it('если текст одобрил человек, ролик тоже идёт к нему', async () => {
    const { worker, updates } = build({ approvalAction: 'approve_text' });

    await worker.tick();

    expect(statusOf(updates)).toBe(MotivationVideoStatus.review);
  });

  it('редакционный пост человек ведёт сам', async () => {
    const { worker, updates } = build({ origin: 'editorial' });

    await worker.tick();

    expect(statusOf(updates)).toBe(MotivationVideoStatus.review);
  });

  it('без настроек не решает за человека', async () => {
    const { worker, updates } = build({ withSettings: false });

    await worker.tick();

    expect(statusOf(updates)).toBe(MotivationVideoStatus.review);
  });
});
