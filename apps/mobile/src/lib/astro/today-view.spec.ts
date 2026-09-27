import type { AstroTodayDto } from '@vedamatch/shared';
import { ApiError } from '@/lib/api/client';
import { NETWORK_ERROR_TEXT } from '@/lib/api/error-text';
import { TODAY_LOAD_ERROR, describeToday, todayStateOf } from './today-view';

/** Те же значения, что в тесте карточки сайта (`today-card.spec.tsx`). */
const today = (overrides: Partial<AstroTodayDto> = {}): AstroTodayDto => ({
  forDate: '2026-08-10',
  moonBhava: 7,
  moonRashi: 4,
  moonNakshatra: 15,
  currentMahadasha: { lord: 'saturn' },
  currentAntardasha: { lord: 'venus' },
  text: null,
  ...overrides,
});

describe('todayStateOf', () => {
  it('день пришёл — показываем его', () => {
    const dto = today({ text: 'фраза' });
    expect(todayStateOf({ kind: 'loaded', today: dto })).toEqual({ kind: 'ready', today: dto });
  });

  it('null от сервера — просим данные рождения, а не показываем ошибку', () => {
    expect(todayStateOf({ kind: 'loaded', today: null })).toEqual({ kind: 'needs-birth-data' });
  });

  it('без сети — человеческий текст, а не «fetch failed: java.net…»', () => {
    const error = new TypeError('Network request failed');
    expect(todayStateOf({ kind: 'failed', error })).toEqual({ kind: 'error', message: NETWORK_ERROR_TEXT });
  });

  it('5xx — общий текст про сервер, внутренности наружу не идут', () => {
    const state = todayStateOf({ kind: 'failed', error: new ApiError(502, 'Bad Gateway', null) });
    expect(state).toEqual({ kind: 'error', message: 'Сервер временно недоступен. Попробуйте позже.' });
  });

  it('непонятная ошибка без текста — запасной текст экрана', () => {
    expect(todayStateOf({ kind: 'failed', error: 'что-то' })).toEqual({ kind: 'error', message: TODAY_LOAD_ERROR });
  });
});

describe('describeToday', () => {
  it('готовая фраза — она и есть текст дня', () => {
    const view = describeToday(today({ text: '  Сегодня хорошо для партнёрства  ' }));
    expect(view.text).toBe('Сегодня хорошо для партнёрства');
    expect(view.pending).toBe(false);
  });

  it('факты: знак, накшатра и бхава Луны, период даши', () => {
    expect(describeToday(today()).facts).toEqual([
      { label: 'Луна', value: 'Карка, Свати, 7-я бхава' },
      { label: 'Период', value: 'Шани — Шукра' },
    ]);
  });

  it('без фразы — честные факты словами и «появится чуть позже», а не пустота', () => {
    const view = describeToday(today({ text: null }));
    expect(view.pending).toBe(true);
    expect(view.text).toBe('Луна сегодня в знаке Карка, в 7-й бхаве. Разбор дня появится чуть позже.');
  });

  it('пустая строка вместо фразы — тоже «ещё нет»', () => {
    expect(describeToday(today({ text: '   ' })).pending).toBe(true);
  });

  it('крайние номера таблиц — первый и последний', () => {
    const view = describeToday(today({ moonRashi: 12, moonNakshatra: 27, moonBhava: 1 }));
    expect(view.facts[0]).toEqual({ label: 'Луна', value: 'Мина, Ревати, 1-я бхава' });
  });

  it('номер вне таблицы не превращается в «undefined»', () => {
    const view = describeToday(
      today({ moonRashi: 13 as AstroTodayDto['moonRashi'], moonNakshatra: 0 as AstroTodayDto['moonNakshatra'], moonBhava: 14 }),
    );
    expect(view.facts).toEqual([{ label: 'Период', value: 'Шани — Шукра' }]);
    expect(view.text).toBe('Разбор дня появится чуть позже.');
    expect(JSON.stringify(view)).not.toContain('undefined');
  });

  it('незнакомая планета периода — строки периода нет', () => {
    const view = describeToday(
      today({ currentMahadasha: { lord: 'pluto' as AstroTodayDto['currentMahadasha']['lord'] } }),
    );
    expect(view.facts.map((fact) => fact.label)).toEqual(['Луна']);
  });
});
