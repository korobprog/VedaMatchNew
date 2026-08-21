import {
  CITY_PRIVACY_THRESHOLD,
  type PortalStatsPoint,
} from '@vedamatch/shared';

/**
 * Ряд графика без пропусков: день без регистраций должен быть нулём, а не
 * исчезать. Иначе линия соединяет соседние всплески и врёт про рост.
 */
export function fillDailySeries(
  counts: Map<string, number>,
  now: Date,
  days: number,
): PortalStatsPoint[] {
  const series: PortalStatsPoint[] = [];
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const date = new Date(now);
    date.setUTCDate(date.getUTCDate() - offset);
    const period = date.toISOString().slice(0, 10);
    series.push({ period, count: counts.get(period) ?? 0 });
  }
  return series;
}

/** То же для месяцев: `YYYY-MM`, включая текущий. */
export function fillMonthlySeries(
  counts: Map<string, number>,
  now: Date,
  months: number,
): PortalStatsPoint[] {
  const series: PortalStatsPoint[] = [];
  for (let offset = months - 1; offset >= 0; offset -= 1) {
    const date = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - offset, 1),
    );
    const period = date.toISOString().slice(0, 7);
    series.push({ period, count: counts.get(period) ?? 0 });
  }
  return series;
}

/**
 * Города с порогом приватности. Город, где участник один, — это почти имя и
 * фамилия, поэтому такие сводятся в общее число, а не показываются списком.
 */
export function groupCities(
  cities: Array<{ city: string | null; count: number }>,
  threshold = CITY_PRIVACY_THRESHOLD,
): { shown: Array<{ city: string; count: number }>; hiddenPeople: number } {
  const shown: Array<{ city: string; count: number }> = [];
  let hiddenPeople = 0;

  for (const row of cities) {
    const city = row.city?.trim();
    if (!city) {
      // Город не указан — это не «скрытый город», а его отсутствие.
      continue;
    }
    if (row.count >= threshold) shown.push({ city, count: row.count });
    else hiddenPeople += row.count;
  }

  shown.sort((a, b) => b.count - a.count || a.city.localeCompare(b.city, 'ru'));
  return { shown, hiddenPeople };
}
