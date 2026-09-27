import {
  GRAHA_NAMES,
  NAKSHATRA_NAMES,
  RASHI_NAMES,
  type AstroTodayDto,
} from "@vedamatch/shared";
import { formatDegrees } from "./astro-degrees";

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
  /**
   * «Луна в Рохини (Вришабха 15°23′), 4-й дом»; без градусов, если API их
   * не прислал; null — данных рождения нет.
   */
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

  const degree = moonDegreeText(today.moonDegreeInRashi);
  const moonLine = `Луна в ${nakshatra} (${rashi}${degree ? ` ${degree}` : ""})${house ? `, ${house} дом` : ""}`;
  const maha = GRAHA_NAMES[today.currentMahadasha.lord];
  const antar = GRAHA_NAMES[today.currentAntardasha.lord];
  const dashaLine = maha && antar ? `Даша ${maha} / ${antar}` : null;

  return { moonLine, dashaLine };
}

/**
 * Градус Луны в знаке или null. Поле необязательное (старый API его не
 * отдаёт), а значение вне [0, 30) — сломанные данные: знак рядом уже назван,
 * «Вришабха 45°» было бы враньём.
 */
function moonDegreeText(degree: number | undefined): string | null {
  if (typeof degree !== "number" || !Number.isFinite(degree)) return null;
  if (degree < 0 || degree >= 30) return null;
  return formatDegrees(degree);
}
