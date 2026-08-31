import { ConflictException, ForbiddenException } from '@nestjs/common';
import type { AccessTokenPayload } from '@vedamatch/shared';
import { MotivationAdminReelsService } from './motivation-admin-reels.service';

const admin: AccessTokenPayload = {
  sub: 'admin-1',
  email: 'admin@example.com',
  role: 'admin',
};
const motivationServiceAdmin: AccessTokenPayload = {
  sub: 'sa-1',
  email: 'sa@example.com',
  role: 'service-admin',
  adminServices: ['motivation'],
};
const otherServiceAdmin: AccessTokenPayload = {
  sub: 'sa-2',
  email: 'sa2@example.com',
  role: 'service-admin',
  adminServices: ['music'],
};
const regularUser: AccessTokenPayload = {
  sub: 'user-1',
  email: 'user@example.com',
  role: 'user',
};

const audit = (
  action: string,
  reason: string | null = null,
  metadata: unknown = {},
) => ({
  action,
  reason,
  metadata,
  createdAt: new Date('2026-08-20T10:00:00Z'),
});

function post(overrides: Record<string, unknown> = {}) {
  return {
    id: 'post-1',
    slug: 'reel-1',
    status: 'draft',
    reviewStatus: 'rejected',
    generationStage: 'rejected',
    sourceVerified: false,
    imageUrl: null,
    likeCount: 0,
    createdAt: new Date('2026-08-20T09:00:00Z'),
    translations: [{ text: 'Цитата' }],
    author: {
      id: 'user-1',
      name: 'Пётр',
      spiritualName: 'Прабху дас',
      motivationAuthorPolicy: null,
    },
    moderationAudits: [
      audit('ai_reject', 'Реклама.', {
        actor: 'ai',
        verdict: {
          decision: 'reject',
          confidence: 0.92,
          resolved: 'reject',
          flags: ['ads'],
        },
      }),
    ],
    ...overrides,
  };
}

function build(
  posts: ReturnType<typeof post>[] = [post()],
  groups: { action: string; count: number }[] = [],
) {
  const prisma = {
    motivationPost: {
      findMany: jest.fn().mockResolvedValue(posts),
      findFirst: jest
        .fn()
        .mockResolvedValue({ id: 'post-1', reviewStatus: 'rejected' }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    motivationModerationAudit: {
      create: jest.fn().mockResolvedValue({}),
      groupBy: jest.fn().mockResolvedValue(
        groups.map((g) => ({
          action: g.action,
          _count: { action: g.count },
        })),
      ),
    },
    motivationAuthorPolicy: {
      findUnique: jest.fn().mockResolvedValue(null),
      upsert: jest
        .fn()
        .mockImplementation(
          ({ create, update }: { create?: unknown; update?: unknown }) => ({
            dailyLimit: null,
            trusted: false,
            blocked: false,
            note: null,
            ...(create ?? {}),
            ...(update ?? {}),
          }),
        ),
    },
    $transaction: jest.fn((fn: (t: unknown) => unknown) => fn(prisma)),
  };
  return { service: new MotivationAdminReelsService(prisma as never), prisma };
}

describe('MotivationAdminReelsService.list', () => {
  it('returns user reels with the worldly author name and the AI verdict', async () => {
    const { service, prisma } = build();

    const result = await service.list(admin);

    expect(prisma.motivationPost.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ origin: 'user' }),
      }),
    );
    expect(result.items[0]).toMatchObject({
      stage: 'rejected',
      // Модерация работает с настоящим человеком, а не с духовным именем.
      authorName: 'Пётр',
      rejectionReason: 'Реклама.',
      aiVerdict: expect.objectContaining({
        decision: 'reject',
        confidence: 0.92,
        flags: ['ads'],
      }),
    });
  });

  it('keeps only appealed reels for that filter', async () => {
    const appealed = post({
      id: 'post-2',
      moderationAudits: [
        audit('ai_reject', 'Реклама.'),
        audit('appeal', 'Не согласен'),
      ],
    });
    const { service } = build([post(), appealed]);

    const result = await service.list(admin, 'appealed');

    expect(result.items.map((item) => item.id)).toEqual(['post-2']);
    expect(result.items[0].appeal).toMatchObject({ message: 'Не согласен' });
  });

  it("counts today's AI decisions including admin overrides", async () => {
    const { service } = build(
      [],
      [
        { action: 'ai_approve', count: 4 },
        { action: 'ai_reject', count: 2 },
        { action: 'ai_escalate', count: 1 },
        { action: 'ai_suggest', count: 2 },
        { action: 'ai_error', count: 1 },
        { action: 'override', count: 3 },
      ],
    );

    await expect(service.list(admin)).resolves.toMatchObject({
      stats: {
        checked: 10,
        approved: 4,
        rejected: 2,
        escalated: 3,
        errors: 1,
        overridden: 3,
      },
    });
  });

  it('refuses non-admins', async () => {
    const { service } = build();
    await expect(service.list(regularUser)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('allows a service-admin scoped to motivation', async () => {
    const { service } = build();
    await expect(service.list(motivationServiceAdmin)).resolves.toBeDefined();
  });

  it('refuses a service-admin scoped to a different service', async () => {
    const { service } = build();
    await expect(service.list(otherServiceAdmin)).rejects.toThrow(
      ForbiddenException,
    );
  });
});

describe('MotivationAdminReelsService.restore', () => {
  it('returns a rejected reel to the review queue and records the override', async () => {
    const { service, prisma } = build();

    await expect(
      service.restore(admin, 'admin-1', 'post-1'),
    ).resolves.toEqual({
      id: 'post-1',
      reviewStatus: 'text_review',
    });
    expect(prisma.motivationModerationAudit.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'override',
          actorId: 'admin-1',
        }),
      }),
    );
  });

  it('refuses when the reel is not rejected', async () => {
    const { service, prisma } = build();
    prisma.motivationPost.findFirst.mockResolvedValue({
      id: 'post-1',
      reviewStatus: 'published',
    });

    await expect(service.restore(admin, 'admin-1', 'post-1')).rejects.toThrow(
      ConflictException,
    );
  });
});

describe('MotivationAdminReelsService.hide', () => {
  it('needs a reason and hides a published reel', async () => {
    const { service, prisma } = build();

    await expect(
      service.hide(admin, 'admin-1', 'post-1', '  '),
    ).rejects.toThrow('причина');
    await expect(
      service.hide(admin, 'admin-1', 'post-1', 'Не по теме'),
    ).resolves.toEqual({
      id: 'post-1',
      status: 'hidden',
    });
    expect(prisma.motivationPost.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { status: 'hidden', generationStage: 'hidden' },
      }),
    );
  });
});

describe('MotivationAdminReelsService.savePolicy', () => {
  it('stores a personal limit', async () => {
    const { service, prisma } = build();

    await expect(
      service.savePolicy(admin, 'user-1', { dailyLimit: 5 }),
    ).resolves.toMatchObject({
      dailyLimit: 5,
    });
    expect(prisma.motivationAuthorPolicy.upsert).toHaveBeenCalled();
  });

  it.each([[-1], [1000], [1.5]])('rejects limit %p', async (dailyLimit) => {
    const { service } = build();
    await expect(
      service.savePolicy(admin, 'user-1', { dailyLimit }),
    ).rejects.toThrow('лимит');
  });

  it('refuses an empty patch', async () => {
    const { service } = build();
    await expect(service.savePolicy(admin, 'user-1', {})).rejects.toThrow(
      'Нечего обновлять',
    );
  });
});
