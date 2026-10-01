/**
 * Рантайм-фикстура TZ-теста (VED-672): считает момент рождения и даши целиком
 * и печатает их одним JSON-ом. Имя намеренно не заканчивается на `.spec.ts` —
 * jest её не собирает, запускает только спека через child process с разными TZ.
 */
import { createHash } from 'node:crypto';
import { resolveBirthMoment } from '../birth-moment';
import { buildVedicChart } from './vedic-chart';
import { AstronomiaEphemerisProvider } from '../ephemeris/astronomia-provider';

const moment = resolveBirthMoment({
  birthDate: '1984-09-12',
  birthTime: '06:30',
  timeAccuracy: 'exact',
  latitude: 27.7172,
  longitude: 85.324,
});

const chart = buildVedicChart(new AstronomiaEphemerisProvider(), {
  bornAtUtc: moment.bornAtUtc,
  latitude: 27.7172,
  longitude: 85.324,
  timeAccuracy: 'exact',
  now: new Date('2026-10-01T00:00:00.000Z'),
});

const payload = JSON.stringify({
  bornAtUtc: moment.bornAtUtc.toISOString(),
  timezone: moment.timezone,
  utcOffsetMinutes: moment.utcOffsetMinutes,
  dasha: chart.dasha,
});

// Хеш печатается отдельно: не совпали хеши — не совпало содержимое.
const hash = createHash('sha256').update(payload).digest('hex');
const parsed = JSON.parse(payload) as Record<string, unknown>;
console.log(JSON.stringify({ hash, payload: parsed }));
