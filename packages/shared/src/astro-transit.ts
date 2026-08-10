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
