import {
  GRAHA_NAMES,
  NAKSHATRA_NAMES,
  RASHI_NAMES,
  type AstroTodayDto,
} from "@vedamatch/shared";

/**
 * Данные карточки «Астрологии» на главной: где сегодня Луна и какая даша.
 *
 * Факты, а не генерация: советник уже показывает фразу персонального дня из
 * ИИ и напоминает о пустых данных рождения, повторять это в плитке нельзя.
 * Накшатра и дом Луны считаются детерминированно и есть всегда, когда
 * данные рождения заполнены; фраза из ИИ бывает пустой. Чистый модуль по
 * той же причине, что остальные `*-quick-access`.
 */
export interface AstroQuickAccessData {
  /** «Луна в Рохини (Вришабха), 4-й дом»; null — данных рождения нет. */
  moonLine: string | null;
  /** «Даша Гуру / Шани». */
  dashaLine: string | null;
}

const ORDINALS = [
  "1-й",
  "2-й",
  "3-й",
  "4-й",
  "5-й",
  "6-й",
  "7-й",
  "8-й",
  "9-й",
  "10-й",
  "11-й",
  "12-й",
];

export function buildAstroQuickAccess(
  today: AstroTodayDto | null,
): AstroQuickAccessData {
  if (!today) return { moonLine: null, dashaLine: null };

  const nakshatra = NAKSHATRA_NAMES[today.moonNakshatra - 1];
  const rashi = RASHI_NAMES[today.moonRashi - 1];
  const house = ORDINALS[today.moonBhava - 1];
  // Индекс вне диапазона — сломанные данные; лучше промолчать, чем показать
  // «Луна в undefined».
  if (!nakshatra || !rashi) return { moonLine: null, dashaLine: null };

  const moonLine = `Луна в ${nakshatra} (${rashi})${house ? `, ${house} дом` : ""}`;
  const maha = GRAHA_NAMES[today.currentMahadasha.lord];
  const antar = GRAHA_NAMES[today.currentAntardasha.lord];
  const dashaLine = maha && antar ? `Даша ${maha} / ${antar}` : null;

  return { moonLine, dashaLine };
}
