import type { GrahaId, NakshatraIndex, RashiIndex } from './astro-chart';

/**
 * Ежедневный персональный день. Единственный по-настоящему «дневной» сигнал —
 * транзитная Луна: она проходит бхаву целиком за ~2.25 суток, остальные грахи
 * стоят в доме неделями и месяцами и для ежедневной рассылки бесполезны.
 */
export interface AstroTodayDto {
  forDate: string;
  /** Бхава транзитной Луны относительно натальной лагны, 1..12. */
  moonBhava: number;
  moonRashi: RashiIndex;
  moonNakshatra: NakshatraIndex;
  currentMahadasha: { lord: GrahaId };
  currentAntardasha: { lord: GrahaId };
  /** Готовая фраза; null — ещё не сгенерирована (при недоступном ИИ). */
  text: string | null;
}

/** Личные настройки рассылки персонального дня. */
export interface AstroTransitPreferenceDto {
  /** Час местного времени 0..23. */
  pushHour: number;
  /** Пояс, по которому считается час: из портального профиля. null — Москва. */
  timeZone: string | null;
  /** Пояс выбран руками, а не определён устройством. */
  timeZoneLocked: boolean;
}

export interface UpdateAstroTransitPreferenceRequest {
  pushHour: number;
}

export const ASTRO_PUSH_HOUR_DEFAULT = 9;
