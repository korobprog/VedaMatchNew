import {
  PLAYBACK_QUEUE_MAX,
  keepExistingInOrder,
  normalizePlaybackQueue,
} from './playback-queue';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';

describe('normalizePlaybackQueue', () => {
  // Позиция сохраняется без очереди — хранимую очередь это не стирает.
  it('treats a missing queue as «leave it as it is»', () => {
    expect(normalizePlaybackQueue(undefined)).toBeUndefined();
    expect(normalizePlaybackQueue(null)).toBeUndefined();
    expect(normalizePlaybackQueue('A,B')).toBeUndefined();
  });

  it('keeps track ids in order and drops junk', () => {
    expect(normalizePlaybackQueue([A, 7, '', 'x; drop', B])).toEqual([A, B]);
  });

  it('keeps an empty queue as a real «nothing queued»', () => {
    expect(normalizePlaybackQueue([])).toEqual([]);
  });

  it('cuts an oversized queue', () => {
    const many = Array.from({ length: PLAYBACK_QUEUE_MAX + 20 }, () => A);
    expect(normalizePlaybackQueue(many)).toHaveLength(PLAYBACK_QUEUE_MAX);
  });
});

describe('keepExistingInOrder', () => {
  it('drops tracks that are gone and keeps the queue order', () => {
    expect(keepExistingInOrder([B, A, B], new Set([B]))).toEqual([B, B]);
  });
});
