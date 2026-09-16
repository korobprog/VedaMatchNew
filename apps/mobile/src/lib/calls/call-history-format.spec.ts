import type { ChatCallDto } from '@vedamatch/shared';
import {
  callCompanion,
  callDirection,
  callDuration,
  callSummaryLine,
  formatCallDate,
  isMissedCall,
} from './call-history-format';

const me = { id: 'me', name: 'Я', avatarUrl: null, lastSeenAt: null };
const other = { id: 'other', name: 'Собеседник', avatarUrl: null, lastSeenAt: null };

const call = (over: Partial<ChatCallDto> = {}): ChatCallDto => ({
  id: 'c1',
  conversationId: 'conv',
  kind: 'audio',
  status: 'ended',
  caller: other,
  callee: me,
  createdAt: '2026-09-09T10:00:00.000Z',
  answeredAt: '2026-09-09T10:00:05.000Z',
  endedAt: '2026-09-09T10:01:17.000Z',
  ...over,
});

describe('isMissedCall', () => {
  it('пропущен и отклонён — да, остальное — нет', () => {
    expect(isMissedCall('missed')).toBe(true);
    expect(isMissedCall('declined')).toBe(true);
    expect(isMissedCall('ended')).toBe(false);
    expect(isMissedCall('cancelled')).toBe(false);
  });
});

describe('callDirection / callCompanion', () => {
  it('звонивший — исходящий для себя, входящий для собеседника', () => {
    expect(callDirection(call(), 'me')).toBe('incoming');
    expect(callDirection(call(), 'other')).toBe('outgoing');
  });

  it('собеседник — тот, кто не мы', () => {
    expect(callCompanion(call(), 'me').id).toBe('other');
    expect(callCompanion(call(), 'other').id).toBe('me');
  });
});

describe('callDuration', () => {
  it('72 секунды разговора — «1 мин 12 с»', () => {
    expect(callDuration(call())).toBe('1 мин 12 с');
  });

  it('без ответа — null', () => {
    expect(callDuration(call({ answeredAt: null, endedAt: null }))).toBeNull();
  });

  it('меньше минуты — только секунды', () => {
    expect(
      callDuration({ answeredAt: '2026-09-09T10:00:00.000Z', endedAt: '2026-09-09T10:00:07.000Z' }),
    ).toBe('7 с');
  });
});

describe('formatCallDate', () => {
  const now = new Date('2026-09-09T18:00:00.000Z');

  it('тот же день — время', () => {
    // Час до `now` в той же секунде — какой бы ни был часовой пояс машины,
    // это тот же локальный календарный день (в отличие от фиксированной
    // UTC-метки, которая под UTC+10 и дальше на восток уже назавтра).
    const sameDay = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
    expect(formatCallDate(sameDay, now)).toMatch(/^\d{2}:\d{2}$/);
  });

  it('другой день — дата', () => {
    expect(formatCallDate('2026-09-08T10:00:00.000Z', now)).toBe('08.09.2026');
  });
});

describe('callSummaryLine', () => {
  it('склеивает направление, вид, статус, длительность и дату', () => {
    const line = callSummaryLine(call({ kind: 'video' }), 'me', new Date('2026-09-09T18:00:00.000Z'));
    expect(line).toContain('входящий · видео');
    expect(line).toContain('завершён');
    expect(line).toContain('1 мин 12 с');
  });

  it('без ответа длительность не попадает в строку', () => {
    const line = callSummaryLine(
      call({ status: 'missed', answeredAt: null, endedAt: null }),
      'me',
      new Date('2026-09-09T18:00:00.000Z'),
    );
    expect(line).not.toContain('мин');
    expect(line).not.toContain(' с');
  });
});
