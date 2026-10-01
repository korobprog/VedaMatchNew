import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import type { VedicChart } from '@vedamatch/shared';
import { resolveBirthMoment } from '../birth-moment';
import { buildVedicChart } from './vedic-chart';
import { AstronomiaEphemerisProvider } from '../ephemeris/astronomia-provider';

/**
 * VED-672: детерминизм даш.
 *
 * Из двух смартфонов с одинаковыми данными рождения пришли разные Махадаши
 * и Антардаши. Математика даш вообще не знает про часовые пояса: она работает
 * с моментом UTC, поэтому здесь зафиксировано то, что обязано быть верным
 * всегда, — а именно:
 *
 * 1. Одинаковые данные (дата, время, координаты) дают побайтово одинаковый
 *    расчёт в любом системном поясе процесса. Проверяется не word-ом, а
 *    запуском фикстуры в ДВУХ дочерних процессах с разными TZ: локальный пояс
 *    устройства или сервера не должен попадать в расчёт ни в одной строке —
 *    ни в luxon при переводе местного времени в UTC, ни в astronomia при
 *    переводе даты в юлианский день.
 * 2. Повторный расчёт тем же кодом даёт тот же JSON — без гонок и без
 *    зависимости от настенных часов: момент просмотра задаётся явно.
 * 3. Эталонные значения (golden): любое изменение астрономии или перевода
 *    зон меняет их и роняет тест — правка должна быть осознанной, вместе
 *    с пересчётом эталона, а не «просто появилось».
 */

/** Воспроизводимый вход: Катманду, время известно, момент просмотра фиксирован. */
const INPUT = {
  birthDate: '1984-09-12',
  birthTime: '06:30',
  timeAccuracy: 'exact' as const,
  latitude: 27.7172,
  longitude: 85.324,
  now: new Date('2026-10-01T00:00:00.000Z'),
};

/** Репрезентативные эталоны из фикстуры; полный сверяется по хешу ниже. */
const GOLDEN = {
  bornAtUtc: '1984-09-12T01:00:00.000Z',
  timezone: 'Asia/Kathmandu',
  utcOffsetMinutes: 330,
  firstMahadasha: {
    lord: 'saturn',
    startsAt: '1984-09-12T01:00:00.000Z',
    endsAt: '1987-03-29T06:05:56.865Z',
  },
  currentMahadasha: {
    lord: 'venus',
    startsAt: '2011-03-29T06:05:56.865Z',
    endsAt: '2031-03-29T06:05:56.865Z',
  },
  /** SHA-256 всего JSON-а фикстуры: bornAtUtc + зона + полное состояние даш. */
  fixtureHash:
    'a253934b33681ea48cf0e412298f675071de8cb4c5a95b7bcd90f4c423600653',
};

const API_ROOT = resolve(__dirname, '../../../..');
const FIXTURE = resolve(__dirname, 'tz-dasha-fixture.ts');

/** Запускает фикстуру даш в дочернем процессе с указанным системным поясом. */
function runFixtureUnder(tz: string): string {
  return execFileSync(
    process.execPath,
    ['-r', 'ts-node/register/transpile-only', FIXTURE],
    {
      cwd: API_ROOT,
      env: { ...process.env, TZ: tz },
      encoding: 'utf8',
      timeout: 60_000,
    },
  ).trim();
}

function build(): VedicChart {
  const moment = resolveBirthMoment(INPUT);
  return buildVedicChart(new AstronomiaEphemerisProvider(), {
    bornAtUtc: moment.bornAtUtc,
    latitude: INPUT.latitude,
    longitude: INPUT.longitude,
    timeAccuracy: INPUT.timeAccuracy,
    now: INPUT.now,
  });
}

describe('детерминизм даш (VED-672)', () => {
  it(
    'системный пояс процесса не влияет на расчёт: TZ=UTC и TZ=Asia/Kolkata ' +
      'дают побайтово одинаковые даши',
    () => {
      const utc = runFixtureUnder('UTC');
      const kolkata = runFixtureUnder('Asia/Kolkata');

      // Главное утверждение: не «оба прошли», а «вышли одинаково».
      expect(kolkata).toBe(utc);

      const { hash, payload } = JSON.parse(utc) as {
        hash: string;
        payload: {
          bornAtUtc: string;
          timezone: string;
          utcOffsetMinutes: number;
          dasha: VedicChart['dasha'];
        };
      };
      expect(hash).toBe(GOLDEN.fixtureHash);
      expect(payload.bornAtUtc).toBe(GOLDEN.bornAtUtc);
      expect(payload.timezone).toBe(GOLDEN.timezone);
      expect(payload.utcOffsetMinutes).toBe(GOLDEN.utcOffsetMinutes);
      expect(payload.dasha!.mahadashas[0]).toEqual(GOLDEN.firstMahadasha);
      expect(payload.dasha!.currentMahadasha).toEqual(GOLDEN.currentMahadasha);
    },
    120_000,
  );

  it('повторный расчёт тем же входом даёт тот же JSON — включая границы периодов', () => {
    const first = build();
    const second = build();

    expect(JSON.stringify(second)).toBe(JSON.stringify(first));

    // И совпадает с эталоном дочернего процесса: ts-jest и ts-node,
    // process TZ этого jest и TZ дочернего процесса — один и тот же результат.
    const moment = resolveBirthMoment(INPUT);
    expect(moment.bornAtUtc.toISOString()).toBe(GOLDEN.bornAtUtc);
    expect(first.dasha!.mahadashas[0]).toEqual(GOLDEN.firstMahadasha);
    expect(first.dasha!.currentMahadasha).toEqual(GOLDEN.currentMahadasha);
    expect(first.fingerprint).toBe(second.fingerprint);
  }, 30_000);
});
