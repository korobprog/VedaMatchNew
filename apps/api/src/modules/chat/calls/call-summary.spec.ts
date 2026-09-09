import {
  callDurationSeconds,
  callSummary,
  formatDuration,
} from './call-summary';

describe('formatDuration', () => {
  it('минуты и секунды до часа, часы — сверх него', () => {
    expect(formatDuration(0)).toBe('0:00');
    expect(formatDuration(65)).toBe('1:05');
    expect(formatDuration(3599)).toBe('59:59');
    expect(formatDuration(3725)).toBe('1:02:05');
  });
});

describe('callDurationSeconds', () => {
  it('считает от ответа до завершения, без ответа — null', () => {
    expect(
      callDurationSeconds({
        kind: 'audio',
        status: 'ended',
        answeredAt: '2026-09-09T10:00:00Z',
        endedAt: '2026-09-09T10:12:34Z',
      }),
    ).toBe(754);
    expect(
      callDurationSeconds({
        kind: 'audio',
        status: 'missed',
        endedAt: new Date(),
      }),
    ).toBeNull();
  });
});

describe('callSummary', () => {
  it('состоявшийся звонок — вид и длительность', () => {
    expect(
      callSummary({
        kind: 'video',
        status: 'ended',
        answeredAt: '2026-09-09T10:00:00Z',
        endedAt: '2026-09-09T10:01:07Z',
      }),
    ).toEqual({
      title: 'Видеозвонок',
      subtitle: '1:07',
      body: 'Видеозвонок · 1:07',
    });
  });

  it('исходы без разговора называются словами', () => {
    expect(callSummary({ kind: 'audio', status: 'missed' }).body).toBe(
      'Пропущенный аудиозвонок',
    );
    expect(callSummary({ kind: 'audio', status: 'declined' }).subtitle).toBe(
      'Отклонён',
    );
    expect(callSummary({ kind: 'video', status: 'cancelled' }).body).toBe(
      'Видеозвонок отменён',
    );
    expect(callSummary({ kind: 'audio', status: 'failed' }).body).toBe(
      'Аудиозвонок оборвался',
    );
  });
});
