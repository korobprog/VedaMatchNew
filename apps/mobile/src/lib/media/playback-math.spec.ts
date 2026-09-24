import {
  clampPosition,
  formatClock,
  isStreamUrlFresh,
  listenedBetween,
  positionFromRatio,
  progressRatio,
  skipBy,
  spokenClock,
} from './playback-math';
import { LOCK_SCREEN_OPTIONS, callTransition, isCallBusy, lockScreenMetadata } from './media-session';

describe('перемотка', () => {
  it('в пределах записи', () => {
    expect(clampPosition(-1, 100)).toBe(0);
    expect(clampPosition(150, 100)).toBe(100);
    expect(clampPosition(Number.NaN, 100)).toBe(0);
    // Длительность неизвестна — верх не ограничиваем.
    expect(clampPosition(150, 0)).toBe(150);
  });

  it('±10 не выходит за края', () => {
    expect(skipBy(5, -10, 100)).toBe(0);
    expect(skipBy(95, 10, 100)).toBe(100);
    expect(skipBy(40, 10, 100)).toBe(50);
  });

  it('касание дорожки → секунда записи', () => {
    expect(positionFromRatio(0.25, 200)).toBe(50);
    expect(positionFromRatio(-1, 200)).toBe(0);
    expect(positionFromRatio(2, 200)).toBe(200);
    expect(positionFromRatio(0.5, 0)).toBe(0);
  });

  it('доля прослушанного', () => {
    expect(progressRatio(50, 200)).toBe(0.25);
    expect(progressRatio(500, 200)).toBe(1);
    expect(progressRatio(10, 0)).toBe(0);
  });
});

describe('подписи времени', () => {
  it('часы появляются только когда нужны', () => {
    expect(formatClock(0)).toBe('0:00');
    expect(formatClock(247.9)).toBe('4:07');
    expect(formatClock(3729)).toBe('1:02:09');
    expect(formatClock(Number.NaN)).toBe('0:00');
  });

  it('скринридеру — словами', () => {
    expect(spokenClock(247)).toBe('4 мин 7 с');
    expect(spokenClock(3729)).toBe('1 ч 2 мин 9 с');
    expect(spokenClock(9)).toBe('9 с');
  });
});

describe('прослушанное', () => {
  it('ход вперёд во время игры засчитывается', () => {
    expect(listenedBetween(10, 10.5, true)).toBe(0.5);
  });

  it('пауза, перемотка и первый снимок — нет', () => {
    expect(listenedBetween(10, 11, false)).toBe(0);
    expect(listenedBetween(10, 60, true)).toBe(0);
    expect(listenedBetween(60, 10, true)).toBe(0);
    expect(listenedBetween(null, 3, true)).toBe(0);
  });
});

describe('подписанная ссылка на звук', () => {
  const hour = 3600 * 1000;

  it('свежая с запасом в десять минут', () => {
    expect(isStreamUrlFresh(0, 6 * 3600, 5 * hour)).toBe(true);
    expect(isStreamUrlFresh(0, 6 * 3600, 6 * hour - 5 * 60 * 1000)).toBe(false);
  });

  it('без срока — всегда берём новую', () => {
    expect(isStreamUrlFresh(0, 0, 1)).toBe(false);
  });
});

describe('экран блокировки', () => {
  const base = { id: 't', title: 'Нрисимха-кавача', artist: null, album: null, coverUrl: null, durationSeconds: 60 };

  it('пустые поля не передаются', () => {
    expect(lockScreenMetadata(base)).toEqual({ title: 'Нрисимха-кавача' });
  });

  it('полная карточка', () => {
    expect(
      lockScreenMetadata({ ...base, artist: 'Хор', album: 'Вечер', coverUrl: 'https://cdn.example.com/c.jpg' }),
    ).toEqual({ title: 'Нрисимха-кавача', artist: 'Хор', albumTitle: 'Вечер', artworkUrl: 'https://cdn.example.com/c.jpg' });
  });

  it('в шторке есть перемотка в обе стороны', () => {
    expect(LOCK_SCREEN_OPTIONS.showSeekBackward).toBe(true);
    expect(LOCK_SCREEN_OPTIONS.showSeekForward).toBe(true);
    expect(LOCK_SCREEN_OPTIONS.isLiveStream).toBe(false);
  });
});

describe('звонок занимает звук', () => {
  it('звонок один на один — от вызова до конца разговора', () => {
    for (const phase of ['outgoing', 'incoming', 'connecting', 'active'] as const) {
      expect(isCallBusy(phase, 'idle')).toBe(true);
    }
    expect(isCallBusy('idle', 'idle')).toBe(false);
    expect(isCallBusy('ended', 'idle')).toBe(false);
  });

  it('групповой — от входа в комнату', () => {
    expect(isCallBusy('idle', 'joining')).toBe(true);
    expect(isCallBusy('idle', 'active')).toBe(true);
    expect(isCallBusy(null, 'ended')).toBe(false);
    expect(isCallBusy(undefined, undefined)).toBe(false);
  });

  it('переходы', () => {
    expect(callTransition(false, true)).toBe('started');
    expect(callTransition(true, false)).toBe('ended');
    expect(callTransition(true, true)).toBeNull();
    expect(callTransition(false, false)).toBeNull();
  });
});
