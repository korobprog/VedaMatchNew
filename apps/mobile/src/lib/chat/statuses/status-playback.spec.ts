import type { ChatStatusAuthorDto, ChatStatusDto } from '@vedamatch/shared';
import {
  authorWithStatuses,
  capturesDismissPan,
  directCompanionKey,
  firstUnseen,
  isDismissSwipe,
  progressFills,
  ringOf,
  runsOnTimer,
  shouldMarkViewed,
  statusA11yLabel,
  statusDurationMs,
  stepStatus,
} from './status-playback';

const status = (over: Partial<ChatStatusDto> = {}): ChatStatusDto => ({
  id: 's',
  text: 'Текст',
  media: null,
  createdAt: '',
  expiresAt: '',
  viewed: false,
  viewCount: null,
  ...over,
});

const video = (durationSec: number | null): ChatStatusDto =>
  status({
    media: { kind: 'video', url: '', posterUrl: null, width: null, height: null, durationSec },
  });

const author = (count: number, viewed = 0): ChatStatusAuthorDto => ({
  user: { id: 'u', name: 'У' },
  statuses: Array.from({ length: count }, (_, at) => status({ id: `s${at}`, viewed: at < viewed })),
  unseen: count - viewed,
});

describe('statusDurationMs (VED-129)', () => {
  it('фото и короткий текст — пять секунд', () => {
    expect(statusDurationMs(status())).toBe(5000);
  });

  it('длинный текст — дольше, но не больше двенадцати секунд', () => {
    expect(statusDurationMs(status({ text: 'а'.repeat(180) }))).toBe(9000);
    expect(statusDurationMs(status({ text: 'а'.repeat(700) }))).toBe(12_000);
  });

  it('ролик — сколько длится, без длительности — 15 секунд, не больше минуты', () => {
    expect(statusDurationMs(video(23))).toBe(23_000);
    expect(statusDurationMs(video(null))).toBe(15_000);
    expect(statusDurationMs(video(600))).toBe(60_000);
  });
});

describe('stepStatus', () => {
  const authors = [author(2), author(1)];

  it('внутри автора — к следующему статусу', () => {
    expect(stepStatus(authors, { author: 0, status: 0 }, 1)).toEqual({ author: 0, status: 1 });
  });

  it('за последним — первый у следующего автора', () => {
    expect(stepStatus(authors, { author: 0, status: 1 }, 1)).toEqual({ author: 1, status: 0 });
  });

  it('за самым последним — конец', () => {
    expect(stepStatus(authors, { author: 1, status: 0 }, 1)).toBeNull();
  });

  it('назад от первого — последний у предыдущего автора', () => {
    expect(stepStatus(authors, { author: 1, status: 0 }, -1)).toEqual({ author: 0, status: 1 });
    expect(stepStatus(authors, { author: 0, status: 0 }, -1)).toBeNull();
  });

  it('несуществующий автор — конец, а не падение', () => {
    expect(stepStatus(authors, { author: 5, status: 0 }, 1)).toBeNull();
  });

  it('открывается с первого непросмотренного', () => {
    expect(firstUnseen(author(3, 2))).toBe(2);
    expect(firstUnseen(author(2, 2))).toBe(0);
  });
});

describe('authorWithStatuses и ringOf', () => {
  it('пустой ответ и ответ без списка — статусов нет', () => {
    expect(authorWithStatuses(null)).toBeNull();
    expect(authorWithStatuses({ ...author(0) })).toBeNull();
    expect(authorWithStatuses({ user: { id: 'u', name: 'У' }, unseen: 0 } as unknown as ChatStatusAuthorDto)).toBeNull();
    expect(ringOf(null)).toBeNull();
  });

  it('кружок: секций по числу статусов, зелёных — по непросмотренным', () => {
    expect(ringOf(author(3, 1))).toEqual({ total: 3, unseen: 2 });
  });

  it('свой кружок — зелёный целиком (VED-494)', () => {
    expect(ringOf(author(2), true)).toEqual({ total: 2, unseen: 2 });
  });
});

describe('progressFills', () => {
  it('пройденные целиком, текущая на долю, будущие пустые', () => {
    expect(progressFills(3, 1, 0.4)).toEqual([1, 0.4, 0]);
  });

  it('доля зажимается в 0..1 и не бывает NaN', () => {
    expect(progressFills(2, 0, 1.7)).toEqual([1, 0]);
    expect(progressFills(2, 0, Number.NaN)).toEqual([0, 0]);
    expect(progressFills(0, 0, 0.5)).toEqual([]);
  });
});

describe('таймер и отметка просмотра', () => {
  it('ролик таймером не листается, фото и текст — да', () => {
    expect(runsOnTimer(status())).toBe(true);
    expect(runsOnTimer(video(10))).toBe(false);
  });

  it('просмотр отмечается у чужого непросмотренного и один раз', () => {
    const sent = new Set<string>();
    expect(shouldMarkViewed(status({ id: 'a' }), false, sent)).toBe(true);
    sent.add('a');
    expect(shouldMarkViewed(status({ id: 'a' }), false, sent)).toBe(false);
    expect(shouldMarkViewed(status({ id: 'b', viewed: true }), false, sent)).toBe(false);
    expect(shouldMarkViewed(status({ id: 'c' }), true, sent)).toBe(false);
  });
});

describe('свайп вниз', () => {
  it('жест забирается только у явного движения вниз', () => {
    expect(capturesDismissPan(0, 20)).toBe(true);
    expect(capturesDismissPan(30, 20)).toBe(false);
    expect(capturesDismissPan(0, -30)).toBe(false);
    expect(capturesDismissPan(0, 5)).toBe(false);
  });

  it('закрывает далёкий или быстрый свайп', () => {
    expect(isDismissSwipe(150, 0)).toBe(true);
    expect(isDismissSwipe(60, 1.2)).toBe(true);
    expect(isDismissSwipe(60, 0.2)).toBe(false);
    expect(isDismissSwipe(20, 3)).toBe(false);
  });
});

describe('directCompanionKey', () => {
  it('только личные беседы, без повторов, порядок не важен', () => {
    const key = directCompanionKey([
      { kind: 'direct', companion: { id: 'b' } },
      { kind: 'group', companion: { id: 'x' } },
      { kind: 'direct', companion: { id: 'a' } },
      { kind: 'direct', companion: { id: 'b' } },
      { kind: 'direct', companion: null },
    ]);
    expect(key).toBe('a,b');
  });
});

describe('statusA11yLabel', () => {
  it('говорит число новых, когда они есть', () => {
    expect(statusA11yLabel('Станислав', 2)).toBe('Статусы: Станислав, новых 2');
    expect(statusA11yLabel('Станислав', 0)).toBe('Статусы: Станислав');
  });
});
