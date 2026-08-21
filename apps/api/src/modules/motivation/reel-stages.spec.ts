import { canAppeal, reelStageOf, startOfUtcDay } from './reel-stages';

describe('reelStageOf', () => {
  it.each([
    [
      {
        status: 'published',
        reviewStatus: 'published',
        generationStage: 'published',
      },
      'published',
    ],
    [
      {
        status: 'draft',
        reviewStatus: 'rejected',
        generationStage: 'rejected',
      },
      'rejected',
    ],
    [
      { status: 'draft', reviewStatus: 'failed', generationStage: 'image' },
      'failed',
    ],
    [
      {
        status: 'draft',
        reviewStatus: 'image_review',
        generationStage: 'image_review',
      },
      'image_review',
    ],
    [
      {
        status: 'generating',
        reviewStatus: 'image_queued',
        generationStage: 'image',
      },
      'generating',
    ],
    [
      {
        status: 'draft',
        reviewStatus: 'text_review',
        generationStage: 'ai_review',
      },
      'ai_review',
    ],
    [
      {
        status: 'draft',
        reviewStatus: 'text_review',
        generationStage: 'ai_escalated',
      },
      'admin_review',
    ],
    [
      {
        status: 'draft',
        reviewStatus: 'text_review',
        generationStage: 'ai_suggested',
      },
      'admin_review',
    ],
  ] as const)('%j → %s', (post, expected) => {
    expect(reelStageOf(post)).toBe(expected);
  });
});

describe('canAppeal', () => {
  it('allows one appeal of a rejection only', () => {
    expect(canAppeal('rejected', false)).toBe(true);
    expect(canAppeal('rejected', true)).toBe(false);
    expect(canAppeal('admin_review', false)).toBe(false);
  });
});

describe('startOfUtcDay', () => {
  it('truncates to midnight UTC', () => {
    expect(startOfUtcDay(new Date('2026-08-19T23:59:59Z')).toISOString()).toBe(
      '2026-08-19T00:00:00.000Z',
    );
  });
});
