import {
  EYE_FRAME_MAX_BYTES,
  EYE_IDLE_PAUSE_MS,
  EYE_MODES,
  EYE_RATES,
  EYE_WARNING_REPEAT_MS,
  eyeCameraOn,
  eyeFailure,
  eyeFrameDataUrl,
  eyeModeInfo,
  failurePhrase,
  idlePauseDue,
  missingRussianVoice,
  nextRateIndex,
  nothingPhrase,
  searchingPhrase,
  showSearching,
  EYE_STALE_MS,
  phraseFontSize,
  pickEyeFrameSize,
  samePhrase,
  shouldSpeak,
  shouldSpeakFailure,
} from './eye';

describe('режимы', () => {
  it('три режима, первый — транспорт: ради него помощник и заводился', () => {
    expect(EYE_MODES.map((item) => item.mode)).toEqual(['transport', 'shop', 'scene']);
  });

  it('«Вокруг» — по кнопке, остальные живые', () => {
    expect(eyeModeInfo('transport').live).toBe(true);
    expect(eyeModeInfo('shop').live).toBe(true);
    expect(eyeModeInfo('scene').live).toBe(false);
  });

  it('у каждого режима короткое слово на кнопке и фраза при включении', () => {
    for (const item of EYE_MODES) {
      expect(item.title.split(' ')).toHaveLength(1);
      expect(item.announce.startsWith(item.title)).toBe(true);
    }
  });
});

describe('samePhrase', () => {
  it('регистр, точки и ё не делают фразу новой', () => {
    expect(samePhrase('Автобус 47.', 'автобус 47')).toBe(true);
    expect(samePhrase('Молоко «Весёлый молочник»', 'молоко веселый молочник')).toBe(true);
  });

  it('другой номер — другая фраза', () => {
    expect(samePhrase('Автобус 47', 'Автобус 47А')).toBe(false);
  });
});

describe('shouldSpeak', () => {
  const base = { now: 100_000, repeatAfterMs: 20_000, asked: false };

  it('первая фраза и новая фраза — сразу', () => {
    expect(shouldSpeak({ ...base, speech: 'Автобус 47', last: null })).toBe(true);
    expect(
      shouldSpeak({ ...base, speech: 'Автобус 12', last: { text: 'Автобус 47', at: 99_000 } }),
    ).toBe(true);
  });

  it('тот же автобус не повторяется раньше срока', () => {
    const last = { text: 'Автобус 47.', at: 90_000 };
    expect(shouldSpeak({ ...base, speech: 'автобус 47', last })).toBe(false);
    expect(shouldSpeak({ ...base, now: 110_000, speech: 'автобус 47', last })).toBe(true);
  });

  it('«Осторожно» повторяется чаще, но не на каждом кадре', () => {
    const last = { text: 'Осторожно, ступеньки вниз', at: 99_000 };
    const speech = 'Осторожно, ступеньки вниз';
    expect(shouldSpeak({ ...base, speech, last })).toBe(false);
    expect(shouldSpeak({ ...base, now: 99_000 + EYE_WARNING_REPEAT_MS, speech, last })).toBe(true);
  });

  it('прямой вопрос звучит всегда', () => {
    expect(
      shouldSpeak({
        ...base,
        asked: true,
        speech: 'Автобус 47',
        last: { text: 'Автобус 47', at: 99_999 },
      }),
    ).toBe(true);
  });

  it('пустое не говорится', () => {
    expect(shouldSpeak({ ...base, speech: '  ', last: null, asked: true })).toBe(false);
  });
});

describe('phraseFontSize', () => {
  it('короткий ответ — крупнее всего, длинный — мельче', () => {
    expect(phraseFontSize('Автобус 47, до вокзала.').fontSize).toBe(28);
    expect(phraseFontSize('а'.repeat(100)).fontSize).toBe(24);
    expect(phraseFontSize('а'.repeat(200)).fontSize).toBe(20);
  });
});

describe('поиск на экране', () => {
  it('старая фраза уступает «Ищу…» через несколько секунд без находок', () => {
    expect(showSearching({ shownAt: 0, now: EYE_STALE_MS - 1 })).toBe(false);
    expect(showSearching({ shownAt: 0, now: EYE_STALE_MS })).toBe(true);
  });

  it('у каждого режима своя подпись поиска', () => {
    const all = EYE_MODES.map((item) => searchingPhrase(item.mode));
    expect(new Set(all).size).toBe(EYE_MODES.length);
    expect(searchingPhrase('transport')).toBe('Ищу транспорт…');
  });
});

describe('nothingPhrase', () => {
  it('на прямой вопрос у каждого режима свой ответ', () => {
    const phrases = EYE_MODES.map((item) => nothingPhrase(item.mode));
    expect(new Set(phrases).size).toBe(EYE_MODES.length);
  });
});

describe('кадр', () => {
  const A51 = ['4608x3456', '4000x3000', '1920x1080', '1280x720', '640x480'];

  it('самое маленькое разрешение не меньше 1280', () => {
    expect(pickEyeFrameSize(A51)).toBe('1280x720');
    expect(pickEyeFrameSize(['4000x3000', '1920x1440'])).toBe('1920x1440');
  });

  it('все меньше — самое крупное; мусор — null', () => {
    expect(pickEyeFrameSize(['640x480', '800x600'])).toBe('800x600');
    expect(pickEyeFrameSize(['auto'])).toBeNull();
    expect(pickEyeFrameSize([])).toBeNull();
  });

  it('data-URL, пока кадр влезает в предел сервера', () => {
    expect(eyeFrameDataUrl('/9j/4A==')).toBe('data:image/jpeg;base64,/9j/4A==');
    const big = 'A'.repeat(Math.ceil(((EYE_FRAME_MAX_BYTES + 3) * 4) / 3));
    expect(eyeFrameDataUrl(big)).toBeNull();
  });
});

describe('камера и пауза', () => {
  it('ушли с экрана или свернули приложение — камеры нет', () => {
    expect(eyeCameraOn({ focused: false, appActive: true, paused: false, live: true })).toBe(false);
    expect(eyeCameraOn({ focused: true, appActive: false, paused: false, live: true })).toBe(false);
  });

  it('живой режим на паузе отпускает камеру, режим «по кнопке» держит', () => {
    expect(eyeCameraOn({ focused: true, appActive: true, paused: true, live: true })).toBe(false);
    expect(eyeCameraOn({ focused: true, appActive: true, paused: false, live: true })).toBe(true);
    expect(eyeCameraOn({ focused: true, appActive: true, paused: true, live: false })).toBe(true);
  });

  it('автопауза — после долгой тишины', () => {
    expect(idlePauseDue({ lastFoundAt: 0, now: EYE_IDLE_PAUSE_MS - 1 })).toBe(false);
    expect(idlePauseDue({ lastFoundAt: 0, now: EYE_IDLE_PAUSE_MS })).toBe(true);
  });
});

describe('ошибки', () => {
  it('код ответа → вид ошибки', () => {
    expect(eyeFailure(0)).toBe('offline');
    expect(eyeFailure(429)).toBe('busy');
    expect(eyeFailure(400)).toBe('bad-frame');
    expect(eyeFailure(413)).toBe('bad-frame');
    expect(eyeFailure(503)).toBe('unavailable');
  });

  it('у каждой ошибки своя фраза', () => {
    const all = (['offline', 'busy', 'bad-frame', 'unavailable'] as const).map(failurePhrase);
    expect(new Set(all).size).toBe(4);
  });

  it('одна и та же ошибка не звучит по кругу', () => {
    expect(shouldSpeakFailure('offline', null)).toBe(true);
    expect(shouldSpeakFailure('offline', 'offline')).toBe(false);
    expect(shouldSpeakFailure('unavailable', 'offline')).toBe(true);
  });
});

describe('голос', () => {
  it('русский голос есть — предупреждения нет', () => {
    expect(missingRussianVoice([{ language: 'en-US' }, { language: 'ru-RU' }])).toBe(false);
    expect(missingRussianVoice([{ language: 'ru_RU' }])).toBe(false);
  });

  it('только чужие голоса — предупреждаем; пустой список — не пугаем', () => {
    expect(missingRussianVoice([{ language: 'en-US' }, { language: 'rw-RW' }])).toBe(true);
    expect(missingRussianVoice([])).toBe(false);
  });

  it('темп ходит по кругу и начинается с обычного', () => {
    expect(EYE_RATES[0].rate).toBe(1);
    expect(nextRateIndex(EYE_RATES.length - 1)).toBe(0);
    expect(nextRateIndex(0)).toBe(1);
  });
});
