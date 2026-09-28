/**
 * «Третий глаз» — помощник для человека с плохим зрением: камера смотрит,
 * телефон говорит (раздел «Здоровье»).
 *
 * Здесь все решения экрана, которые можно проверить без телефона: какие
 * режимы есть, когда говорить, а когда промолчать, каким кадром снимать и
 * когда отпустить камеру. Экран (`app/wellness/eye.tsx`) только исполняет.
 *
 * Почему кадр читает модель на сервере, а не телефон: распознавание текста
 * Google ML Kit на устройстве не умеет кириллицу, а ценник и упаковка в
 * магазине — это кириллица. Номер автобуса ML Kit прочёл бы, но ради одного
 * режима тянуть второй модуль камеры (VisionCamera) — отдельная работа; она
 * записана следующим шагом, а не сделана наполовину.
 */

export type EyeMode = 'transport' | 'shop' | 'scene';

export interface EyeModeInfo {
  mode: EyeMode;
  /** Надпись на кнопке режима — одно короткое слово, крупно. */
  title: string;
  /** Что произносится при включении режима. */
  announce: string;
  /**
   * Живой режим: кадр за кадром сам, без нажатий. Иначе — по кнопке: обзор
   * сцены по кругу утомляет, её спрашивают, когда нужно.
   */
  live: boolean;
  /**
   * Через сколько ту же фразу можно сказать снова. На остановке автобус стоит
   * полминуты, и «Автобус 47» каждые две секунды — это шум, из-за которого
   * пропустишь следующий. Но совсем молчать про стоящий автобус тоже нельзя:
   * человек мог отвлечься.
   */
  repeatAfterMs: number;
}

export const EYE_MODES: readonly EyeModeInfo[] = [
  {
    mode: 'transport',
    title: 'Транспорт',
    announce: 'Транспорт. Наведите камеру на дорогу — назову номер маршрута.',
    live: true,
    repeatAfterMs: 20_000,
  },
  {
    mode: 'shop',
    title: 'Магазин',
    announce: 'Магазин. Поднесите товар или ценник к камере.',
    live: true,
    repeatAfterMs: 15_000,
  },
  {
    mode: 'scene',
    title: 'Вокруг',
    announce: 'Вокруг. Нажмите большую кнопку — расскажу, что перед вами.',
    live: false,
    repeatAfterMs: 0,
  },
];

export function eyeModeInfo(mode: EyeMode): EyeModeInfo {
  return EYE_MODES.find((item) => item.mode === mode) ?? EYE_MODES[0];
}

/** Первые слова при входе. Предупреждение — как у Be My Eyes, и по делу. */
export const EYE_WELCOME =
  'Третий глаз включён. Я подсказываю, но не заменяю трость и не гожусь для перехода дороги.';

/* ------------------------------------------------------------------ */
/* Когда говорить                                                      */
/* ------------------------------------------------------------------ */

export interface SpokenPhrase {
  text: string;
  at: number;
}

/**
 * Сравнение без мелочей: модель может ответить «Автобус 47.» и «автобус 47»
 * — для уха это одна фраза.
 */
export function samePhrase(a: string, b: string): boolean {
  const norm = (text: string) =>
    text
      .toLowerCase()
      .replace(/ё/g, 'е')
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .trim();
  return norm(a) === norm(b);
}

/**
 * Предупреждение («Осторожно, ступеньки») повторяется чаще обычной фразы: его
 * пропуск дороже повтора. Но не на каждом кадре — иначе оно заглушает всё.
 */
export const EYE_WARNING_REPEAT_MS = 6_000;

/**
 * Произносить ли ответ. Новое — сразу. То же самое — не раньше
 * `repeatAfterMs`, предупреждение — не раньше {@link EYE_WARNING_REPEAT_MS}.
 * Кнопка «Спросить сейчас» всегда получает ответ вслух: человек спросил —
 * молчание выглядит поломкой.
 */
export function shouldSpeak(input: {
  speech: string;
  last: SpokenPhrase | null;
  now: number;
  repeatAfterMs: number;
  asked: boolean;
}): boolean {
  const { speech, last, now, repeatAfterMs, asked } = input;
  if (!speech.trim()) return false;
  if (asked || !last) return true;
  if (!samePhrase(speech, last.text)) return true;
  const warning = /^осторожно/i.test(speech.trim());
  const wait = warning ? Math.min(repeatAfterMs, EYE_WARNING_REPEAT_MS) : repeatAfterMs;
  return now - last.at >= wait;
}

/**
 * Что сказать, когда человек спросил сам, а модель ничего не нашла. В живом
 * режиме пустой кадр молчит, но на прямой вопрос нужен прямой ответ.
 */
export function nothingPhrase(mode: EyeMode): string {
  switch (mode) {
    case 'transport':
      return 'Транспорта не вижу.';
    case 'shop':
      return 'Товара не вижу. Поднесите ближе к камере.';
    case 'scene':
      return 'Ничего не разобрать. Попробуйте повернуть телефон.';
  }
}

/**
 * Размер шрифта фразы на экране. Короткий ответ («Автобус 47») — самым
 * крупным, чтобы дочитать его глазами. Длинный крупным не влезает: на
 * телефоне пользователя приветствие шрифтом 28 закрыло весь видоискатель, и
 * зона «Спросить сейчас» сжалась в полоску.
 */
export function phraseFontSize(text: string): { fontSize: number; lineHeight: number } {
  const length = text.trim().length;
  if (length <= 60) return { fontSize: 28, lineHeight: 36 };
  if (length <= 140) return { fontSize: 24, lineHeight: 31 };
  return { fontSize: 20, lineHeight: 27 };
}

/* ------------------------------------------------------------------ */
/* Кадр                                                                */
/* ------------------------------------------------------------------ */

/**
 * Длинная сторона кадра. Номер автобуса через дорогу — это несколько
 * десятков пикселей на 1280-кадре; меньше — модель видит пятно. Больше — кадр
 * дольше едет по мобильной сети, а ответ нужен, пока автобус не уехал.
 */
export const EYE_FRAME_SIDE = 1280;

/** Качество JPEG: цифры табло читаются, кадр ~150–250 КБ. */
export const EYE_FRAME_QUALITY = 0.5;

/** Предел сервера (`eye-vision.ts`, `EYE_IMAGE_MAX_BYTES`), продублирован. */
export const EYE_FRAME_MAX_BYTES = 700 * 1024;

/**
 * Разрешение из списка камеры («1920x1080» и подобные): самое маленькое, у
 * которого длинная сторона не меньше цели; если все меньше — самое крупное.
 */
export function pickEyeFrameSize(
  sizes: readonly string[],
  target = EYE_FRAME_SIDE,
): string | null {
  const parsed = sizes
    .map((size) => {
      const match = /^(\d+)\s*[x×]\s*(\d+)$/i.exec(size.trim());
      if (!match) return null;
      return { size, longest: Math.max(Number(match[1]), Number(match[2])) };
    })
    .filter((item): item is { size: string; longest: number } => item !== null);
  if (!parsed.length) return null;
  const big = parsed
    .filter((item) => item.longest >= target)
    .sort((a, b) => a.longest - b.longest);
  if (big.length) return big[0].size;
  return parsed.sort((a, b) => b.longest - a.longest)[0].size;
}

/** Готовый data-URL, либо `null`, если кадр не влез в предел сервера. */
export function eyeFrameDataUrl(base64: string): string | null {
  if (Math.floor((base64.length * 3) / 4) > EYE_FRAME_MAX_BYTES) return null;
  return `data:image/jpeg;base64,${base64}`;
}

/* ------------------------------------------------------------------ */
/* Ритм живого режима                                                  */
/* ------------------------------------------------------------------ */

/**
 * Пауза между кадрами. Следующий кадр — не раньше, чем пришёл ответ на
 * предыдущий (очереди запросов нет), и не чаще раза в `EYE_MIN_GAP_MS`.
 * Пока телефон говорит, новый кадр не снимается: иначе новая фраза оборвёт
 * недосказанную, а человек не успеет дослушать номер.
 */
export const EYE_MIN_GAP_MS = 1_500;

/** После ошибки сети не долбим сервер: пауза длиннее. */
export const EYE_ERROR_GAP_MS = 4_000;

/** Дольше ответа не ждём: автобус уедет, свежий кадр полезнее. */
export const EYE_REQUEST_TIMEOUT_MS = 15_000;

/**
 * Живой режим сам встаёт на паузу, если долго ничего не находит. Камера
 * непрерывно — это нагрев и батарея, а телефон, забытый в руке с включённым
 * помощником, разрядится к вечеру. Пять минут — с запасом на ожидание
 * автобуса с большим интервалом.
 */
export const EYE_IDLE_PAUSE_MS = 5 * 60_000;

export function idlePauseDue(input: {
  lastFoundAt: number;
  now: number;
}): boolean {
  return input.now - input.lastFoundAt >= EYE_IDLE_PAUSE_MS;
}

export const EYE_IDLE_PHRASE =
  'Долго ничего не нахожу — ставлю на паузу, чтобы беречь батарею. Нажмите большую кнопку, чтобы продолжить.';

/**
 * Камера включена, только когда экран на виду, приложение на переднем плане
 * и помощник не на паузе. На Android камеру отпускает размонтирование
 * `CameraView` (см. `camera-power.ts`).
 */
export function eyeCameraOn(input: {
  focused: boolean;
  appActive: boolean;
  paused: boolean;
  live: boolean;
}): boolean {
  if (!input.focused || !input.appActive) return false;
  // Режим «по кнопке» держит камеру включённой: кадр нужен мгновенно, как
  // только человек нажал, а прогрев камеры — это секунда.
  if (!input.live) return true;
  return !input.paused;
}

/* ------------------------------------------------------------------ */
/* Ошибки вслух                                                         */
/* ------------------------------------------------------------------ */

export type EyeFailure = 'offline' | 'busy' | 'unavailable' | 'bad-frame';

/**
 * Разбор ошибки запроса. На вход — код ответа сервера, `0` — нет связи или
 * вышел таймаут.
 */
export function eyeFailure(status: number): EyeFailure {
  if (status === 0) return 'offline';
  if (status === 429) return 'busy';
  if (status === 400 || status === 413) return 'bad-frame';
  return 'unavailable';
}

export function failurePhrase(failure: EyeFailure): string {
  switch (failure) {
    case 'offline':
      return 'Нет связи с сервером. Пробую снова.';
    case 'busy':
      return 'Слишком часто. Подождите немного.';
    case 'bad-frame':
      return 'Кадр не получился. Пробую снова.';
    case 'unavailable':
      return 'Сервер не отвечает. Пробую снова.';
  }
}

/**
 * Ошибку проговариваем один раз, а не на каждом кадре: «нет связи» по кругу
 * заглушает всё. Снова — только когда ошибка сменилась или после успеха.
 */
export function shouldSpeakFailure(
  failure: EyeFailure,
  lastSpokenFailure: EyeFailure | null,
): boolean {
  return failure !== lastSpokenFailure;
}

/* ------------------------------------------------------------------ */
/* Голос                                                               */
/* ------------------------------------------------------------------ */

/**
 * Есть ли на телефоне русский голос синтезатора. Без него Android молча
 * читает английским голосом или не читает вовсе — и человек решит, что
 * помощник сломан. На вход — `Speech.getAvailableVoicesAsync()`.
 *
 * Пустой список — не «голоса нет»: на части телефонов движок отдаёт список
 * только после первого `speak`. Тогда не пугаем предупреждением зря.
 */
export function missingRussianVoice(
  voices: readonly { language: string }[],
): boolean {
  if (!voices.length) return false;
  return !voices.some((voice) => /^ru([-_]|$)/i.test(voice.language));
}

/** Темп речи: слабовидящие со временем слушают быстрее. */
export const EYE_RATES = [
  { rate: 1, title: 'Обычная речь' },
  { rate: 1.3, title: 'Быстрая речь' },
  { rate: 0.85, title: 'Медленная речь' },
] as const;

export function nextRateIndex(index: number): number {
  return (index + 1) % EYE_RATES.length;
}
