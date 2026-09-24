import {
  isPromptHour,
  localHour,
  updatePromptDecision,
  updatePromptPayload,
  type PromptCandidate,
} from './app-update-prompt';

/** 12:00 по Москве. */
const MOSCOW_NOON = new Date('2026-09-24T09:00:00Z');
/** 03:00 по Москве. */
const MOSCOW_NIGHT = new Date('2026-09-24T00:00:00Z');
const release = { variant: 'ru-site', versionCode: 1031 };

const outdated: PromptCandidate = {
  appVariant: 'ru-site',
  appVersionCode: 1030,
  updatePromptedCode: null,
  timeZone: 'Europe/Moscow',
  preference: null,
};

describe('updatePromptDecision — кто получает пуш «обновите»', () => {
  it('сборка с сайта старее вышедшей, днём — пуш', () => {
    expect(updatePromptDecision(outdated, release, MOSCOW_NOON)).toBe('push');
  });

  it('магазинная сборка — никогда: её обновляет магазин', () => {
    expect(
      updatePromptDecision(
        { ...outdated, appVariant: 'ru-store' },
        release,
        MOSCOW_NOON,
      ),
    ).toBe('none');
  });

  it('даже если за магазинной сборкой начнут следить, звать её нельзя', () => {
    expect(
      updatePromptDecision(
        { ...outdated, appVariant: 'ru-store' },
        { variant: 'ru-store', versionCode: 1031 },
        MOSCOW_NOON,
      ),
    ).toBe('none');
  });

  it('сборка другого контура — не наш выпуск', () => {
    expect(
      updatePromptDecision(
        { ...outdated, appVariant: 'com-site' },
        release,
        MOSCOW_NOON,
      ),
    ).toBe('none');
  });

  it('сборка не сказала, откуда она, — не зовём', () => {
    expect(
      updatePromptDecision({ ...outdated, appVariant: null }, release, MOSCOW_NOON),
    ).toBe('none');
  });

  it('уже обновлённый или новее — не зовём', () => {
    expect(
      updatePromptDecision(
        { ...outdated, appVersionCode: 1031 },
        release,
        MOSCOW_NOON,
      ),
    ).toBe('none');
    expect(
      updatePromptDecision(
        { ...outdated, appVersionCode: 1040 },
        release,
        MOSCOW_NOON,
      ),
    ).toBe('none');
  });

  it('версия неизвестна (сборка старше поля) — отставший', () => {
    expect(
      updatePromptDecision(
        { ...outdated, appVersionCode: null },
        release,
        MOSCOW_NOON,
      ),
    ).toBe('push');
  });

  it('об этом выпуске уже звали — второй пуш не шлём', () => {
    expect(
      updatePromptDecision(
        { ...outdated, updatePromptedCode: 1031 },
        release,
        MOSCOW_NOON,
      ),
    ).toBe('none');
  });

  it('звали о прежнем выпуске — о новом зовём снова', () => {
    expect(
      updatePromptDecision(
        { ...outdated, updatePromptedCode: 1029 },
        release,
        MOSCOW_NOON,
      ),
    ).toBe('push');
  });

  it('выключены «Новости портала» или все уведомления — не зовём и закрываем вопрос', () => {
    expect(
      updatePromptDecision(
        { ...outdated, preference: { enabled: true, announcements: false } },
        release,
        MOSCOW_NOON,
      ),
    ).toBe('skip');
    expect(
      updatePromptDecision(
        { ...outdated, preference: { enabled: false, announcements: true } },
        release,
        MOSCOW_NOON,
      ),
    ).toBe('skip');
  });

  it('ночью не будим — ждём утра, отметку не ставим', () => {
    expect(updatePromptDecision(outdated, release, MOSCOW_NIGHT)).toBe('wait');
  });

  it('ночь считается по поясу человека: во Владивостоке полдень по Москве — вечер', () => {
    // 09:00 UTC — 19:00 во Владивостоке (в окне), 23:00 UTC — 09:00 (в окне),
    // 12:00 UTC — 22:00 (вне окна).
    const vlad = { ...outdated, timeZone: 'Asia/Vladivostok' };
    expect(updatePromptDecision(vlad, release, MOSCOW_NOON)).toBe('push');
    expect(
      updatePromptDecision(vlad, release, new Date('2026-09-24T12:00:00Z')),
    ).toBe('wait');
  });
});

describe('isPromptHour / localHour', () => {
  it('окно с 9 до 21 включая 9:00 и исключая 21:00', () => {
    expect(isPromptHour(new Date('2026-09-24T06:00:00Z'), 'Europe/Moscow')).toBe(true);
    expect(isPromptHour(new Date('2026-09-24T05:59:00Z'), 'Europe/Moscow')).toBe(false);
    expect(isPromptHour(new Date('2026-09-24T17:59:00Z'), 'Europe/Moscow')).toBe(true);
    expect(isPromptHour(new Date('2026-09-24T18:00:00Z'), 'Europe/Moscow')).toBe(false);
  });

  it('без пояса и с незнакомым поясом — по Москве', () => {
    expect(localHour(MOSCOW_NOON, null)).toBe(12);
    expect(localHour(MOSCOW_NOON, 'Mars/Olympus')).toBe(12);
  });
});

describe('updatePromptPayload', () => {
  it('текст с номером версии, ссылка на /app, тег на выпуск', () => {
    expect(
      updatePromptPayload({
        variant: 'ru-site',
        versionCode: 1031,
        versionName: '1.4.0+abc1234',
      }),
    ).toEqual({
      title: 'Доступна новая версия VedaMatch',
      body: 'Вышла версия 1.4.0 (сборка 1031). Обновите приложение — это займёт минуту.',
      url: '/app',
      tag: 'app-update-ru-site-1031',
    });
  });
});
