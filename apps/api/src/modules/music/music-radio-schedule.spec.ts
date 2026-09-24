import {
  normalizeInsertMime,
  pickRadioTrack,
  planRadioSlot,
  radioInsertStatus,
  radioWindow,
  resolveInsertDuration,
  resolveInsertTime,
  validateRadioInsertFile,
} from './music-radio-schedule';

const at = (iso: string) => new Date(iso);

describe('pickRadioTrack', () => {
  it('берёт только не звучавшие на круге', () => {
    const picked = pickRadioTrack(['a', 'b', 'c'], new Set(['a', 'c']), 'c', 3);
    expect(picked).toEqual({ trackId: 'b', cycle: 3 });
  });

  it('круг кончился — новый, без повтора последней записи подряд', () => {
    for (const r of [0, 0.5, 0.99]) {
      const picked = pickRadioTrack(
        ['a', 'b'],
        new Set(['a', 'b']),
        'b',
        1,
        () => r,
      );
      expect(picked).toEqual({ trackId: 'a', cycle: 2 });
    }
  });

  it('за полный круг каждая запись звучит ровно раз', () => {
    const pool = ['a', 'b', 'c', 'd', 'e'];
    const played = new Set<string>();
    let last: string | null = null;
    for (let i = 0; i < pool.length; i += 1) {
      const picked: { trackId: string; cycle: number } = pickRadioTrack(
        pool,
        played,
        last,
        0,
      )!;
      expect(picked.cycle).toBe(0);
      expect(played.has(picked.trackId)).toBe(false);
      played.add(picked.trackId);
      last = picked.trackId;
    }
    expect(played.size).toBe(pool.length);
  });

  it('одна запись в каталоге — играет по кругу; пусто — null', () => {
    expect(pickRadioTrack(['a'], new Set(['a']), 'a', 0)).toEqual({
      trackId: 'a',
      cycle: 1,
    });
    expect(pickRadioTrack([], new Set(), null, 0)).toBeNull();
  });
});

describe('planRadioSlot', () => {
  const track = { id: 't', cycle: 2, durationMs: 300_000 };

  it('без вставок — запись целиком', () => {
    expect(planRadioSlot(0, null, track)).toEqual({
      kind: 'track',
      trackId: 't',
      cycle: 2,
      durationMs: 300_000,
    });
  });

  it('вставка, чьё время пришло, идёт первой', () => {
    expect(
      planRadioSlot(
        10_000,
        { id: 'i', atMs: 5_000, durationMs: 30_000 },
        track,
      ),
    ).toEqual({ kind: 'insert', insertId: 'i', durationMs: 30_000 });
  });

  it('вставка посреди записи обрывает её в свою минуту', () => {
    expect(
      planRadioSlot(0, { id: 'i', atMs: 120_000, durationMs: 30_000 }, track),
    ).toMatchObject({ kind: 'track', durationMs: 120_000 });
  });

  it('вставка после записи её не трогает', () => {
    expect(
      planRadioSlot(0, { id: 'i', atMs: 900_000, durationMs: 30_000 }, track),
    ).toMatchObject({ kind: 'track', durationMs: 300_000 });
  });

  it('играть нечего — null', () => {
    expect(planRadioSlot(0, null, null)).toBeNull();
  });
});

describe('radioWindow', () => {
  const slots = [
    { id: '1', startsAt: at('2026-01-01T10:00:00Z'), durationMs: 60_000 },
    { id: '2', startsAt: at('2026-01-01T10:01:00Z'), durationMs: 60_000 },
    { id: '3', startsAt: at('2026-01-01T10:02:00Z'), durationMs: 60_000 },
  ];

  it('текущий и следующий', () => {
    const w = radioWindow(slots, at('2026-01-01T10:01:30Z').getTime());
    expect(w.current?.id).toBe('2');
    expect(w.next?.id).toBe('3');
  });

  it('граница слота принадлежит следующему', () => {
    const w = radioWindow(slots, at('2026-01-01T10:01:00Z').getTime());
    expect(w.current?.id).toBe('2');
  });

  it('вне расписания — текущего нет', () => {
    const w = radioWindow(slots, at('2026-01-01T11:00:00Z').getTime());
    expect(w).toEqual({ current: null, next: null });
  });
});

describe('radioInsertStatus', () => {
  const slot = { startsAt: at('2026-01-01T10:00:00Z'), durationMs: 60_000 };
  it('до, во время и после эфира', () => {
    expect(radioInsertStatus(null, 0)).toBe('scheduled');
    expect(radioInsertStatus(slot, at('2026-01-01T09:59:00Z').getTime())).toBe(
      'scheduled',
    );
    expect(radioInsertStatus(slot, at('2026-01-01T10:00:30Z').getTime())).toBe(
      'on_air',
    );
    expect(radioInsertStatus(slot, at('2026-01-01T10:01:00Z').getTime())).toBe(
      'aired',
    );
  });
});

describe('resolveInsertTime', () => {
  const now = at('2026-01-01T10:00:00Z');
  it('пусто — сейчас', () => {
    expect(resolveInsertTime(undefined, now)).toEqual({ at: now });
    expect(resolveInsertTime('', now)).toEqual({ at: now });
  });
  it('прошедшее — сейчас, будущее — как есть', () => {
    expect(resolveInsertTime('2026-01-01T09:00:00Z', now)).toEqual({ at: now });
    expect(resolveInsertTime('2026-01-01T12:00:00Z', now)).toEqual({
      at: at('2026-01-01T12:00:00Z'),
    });
  });
  it('мусор и слишком далёкое будущее — ошибка', () => {
    expect(resolveInsertTime('завтра', now)).toHaveProperty('error');
    expect(resolveInsertTime('2026-03-01T00:00:00Z', now)).toHaveProperty(
      'error',
    );
  });
});

describe('файл вставки', () => {
  it('тип без параметров кодека и синонимы', () => {
    expect(normalizeInsertMime('audio/webm;codecs=opus')).toBe('audio/webm');
    expect(normalizeInsertMime('audio/mp3')).toBe('audio/mpeg');
    expect(normalizeInsertMime('audio/x-m4a')).toBe('audio/mp4');
  });

  it('проверка типа и размера', () => {
    expect(validateRadioInsertFile({ mime: 'audio/webm', sizeBytes: 10 })).toBe(
      null,
    );
    expect(
      validateRadioInsertFile({ mime: 'video/mp4', sizeBytes: 10 }),
    ).toMatch(/звук/);
    expect(
      validateRadioInsertFile({
        mime: 'audio/mpeg',
        sizeBytes: 30 * 1024 ** 2,
      }),
    ).toMatch(/МБ/);
  });

  it('длительность: своя, браузерная или отказ', () => {
    expect(resolveInsertDuration(12.2, undefined)).toBe(13);
    expect(resolveInsertDuration(null, '7.5')).toBe(8);
    expect(resolveInsertDuration(undefined, undefined)).toMatch(/длительность/);
    expect(resolveInsertDuration(3600, undefined)).toMatch(/минут/);
  });
});
