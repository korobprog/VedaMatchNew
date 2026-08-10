import { BadRequestException } from '@nestjs/common';
import {
  UNKNOWN_TIME_FALLBACK,
  resolveBirthMoment,
  resolveTimezone,
} from './birth-moment';

const MOSCOW = { latitude: 55.7558, longitude: 37.6173 };
const MUMBAI = { latitude: 19.076, longitude: 72.8777 };
const ULM = { latitude: 48.4011, longitude: 9.9876 };

describe('resolveTimezone', () => {
  it('определяет зону по координатам', () => {
    expect(resolveTimezone(MOSCOW.latitude, MOSCOW.longitude)).toBe(
      'Europe/Moscow',
    );
    expect(resolveTimezone(MUMBAI.latitude, MUMBAI.longitude)).toBe(
      'Asia/Kolkata',
    );
  });

  it('отклоняет координаты вне диапазона', () => {
    expect(() => resolveTimezone(91, 0)).toThrow(BadRequestException);
    expect(() => resolveTimezone(0, 181)).toThrow(BadRequestException);
    expect(() => resolveTimezone(Number.NaN, 0)).toThrow(BadRequestException);
  });
});

/**
 * Ядро всего слоя. Ошибка в час здесь сдвигает асцендент примерно на 15° —
 * половину дома, — и при этом выглядит как совершенно правдоподобная карта.
 */
describe('resolveBirthMoment — исторические часовые пояса', () => {
  const base = {
    timeAccuracy: 'exact' as const,
    ...MOSCOW,
  };

  it('учитывает декретное время СССР вместе с летним: май 1987 — это UTC+4', () => {
    const moment = resolveBirthMoment({
      ...base,
      birthDate: '1987-05-12',
      birthTime: '06:20',
    });
    expect(moment.utcOffsetMinutes).toBe(240);
    expect(moment.bornAtUtc.toISOString()).toBe('1987-05-12T02:20:00.000Z');
  });

  it('учитывает отмену летнего времени: январь 2016 в Москве — UTC+3', () => {
    const moment = resolveBirthMoment({
      ...base,
      birthDate: '2016-01-01',
      birthTime: '12:00',
    });
    expect(moment.utcOffsetMinutes).toBe(180);
  });

  it('в одном и том же городе смещение зависит от эпохи', () => {
    const soviet = resolveBirthMoment({
      ...base,
      birthDate: '1987-05-12',
      birthTime: '12:00',
    });
    const modern = resolveBirthMoment({
      ...base,
      birthDate: '2016-05-12',
      birthTime: '12:00',
    });
    expect(soviet.utcOffsetMinutes).not.toBe(modern.utcOffsetMinutes);
  });

  it('до введения часовых поясов действует местное среднее время', () => {
    // В Германии поясное время ввели в 1893 году; в 1879-м Ульм жил по своему
    // солнечному времени, смещённому на неполный час.
    const moment = resolveBirthMoment({
      ...ULM,
      timeAccuracy: 'exact',
      birthDate: '1879-03-14',
      birthTime: '11:30',
    });
    expect(moment.utcOffsetMinutes).not.toBe(60);
    expect(moment.utcOffsetMinutes).toBeGreaterThan(50);
    expect(moment.utcOffsetMinutes).toBeLessThan(60);
  });

  it('поддерживает получасовые пояса', () => {
    const moment = resolveBirthMoment({
      ...MUMBAI,
      timeAccuracy: 'exact',
      birthDate: '1994-11-03',
      birthTime: '01:15',
    });
    expect(moment.utcOffsetMinutes).toBe(330);
    // Ночное рождение по местному времени приходится на предыдущие сутки по UTC.
    expect(moment.bornAtUtc.toISOString()).toBe('1994-11-02T19:45:00.000Z');
  });
});

describe('resolveBirthMoment — неизвестное время', () => {
  it('считает карту на полдень местного времени', () => {
    const moment = resolveBirthMoment({
      ...MOSCOW,
      birthDate: '1990-04-01',
      birthTime: null,
      timeAccuracy: 'unknown',
    });
    expect(moment.resolvedTime).toBe(UNKNOWN_TIME_FALLBACK);
  });

  it('игнорирует переданное время, если точность помечена как неизвестная', () => {
    const moment = resolveBirthMoment({
      ...MOSCOW,
      birthDate: '1990-04-01',
      birthTime: '23:45',
      timeAccuracy: 'unknown',
    });
    expect(moment.resolvedTime).toBe(UNKNOWN_TIME_FALLBACK);
  });

  it('требует время, когда точность заявлена', () => {
    expect(() =>
      resolveBirthMoment({
        ...MOSCOW,
        birthDate: '1990-04-01',
        birthTime: null,
        timeAccuracy: 'exact',
      }),
    ).toThrow(BadRequestException);
  });
});

describe('resolveBirthMoment — проверка ввода', () => {
  const valid = {
    ...MOSCOW,
    birthDate: '1990-04-01',
    birthTime: '10:00',
    timeAccuracy: 'exact' as const,
  };

  it.each(['01.04.1990', '1990-4-1', '', 'вчера'])(
    'отклоняет дату «%s»',
    (birthDate) => {
      expect(() => resolveBirthMoment({ ...valid, birthDate })).toThrow(
        BadRequestException,
      );
    },
  );

  it.each(['10-00', '25:00', '10:75', '9:00'])(
    'отклоняет время «%s»',
    (birthTime) => {
      expect(() => resolveBirthMoment({ ...valid, birthTime })).toThrow(
        BadRequestException,
      );
    },
  );

  it('отклоняет неизвестный часовой пояс', () => {
    expect(() =>
      resolveBirthMoment({ ...valid, timezone: 'Europe/Atlantis' }),
    ).toThrow(BadRequestException);
  });

  it('принимает ручное переопределение зоны для приграничных мест', () => {
    const moment = resolveBirthMoment({ ...valid, timezone: 'Europe/Kyiv' });
    expect(moment.timezone).toBe('Europe/Kyiv');
  });

  it('помечает несуществующее локальное время в час перевода стрелок', () => {
    // 26 марта 2000 года Москва перешла на летнее время в 02:00 → 03:00,
    // и 02:30 в этот день не существовало. Luxon молча сдвинет его на час —
    // признак нужен, чтобы это не прошло незамеченным.
    const moment = resolveBirthMoment({
      ...MOSCOW,
      birthDate: '2000-03-26',
      birthTime: '02:30',
      timeAccuracy: 'exact',
    });
    expect(moment.nonexistentLocalTime).toBe(true);
    expect(moment.utcOffsetMinutes).toBe(240);
  });

  it('обычное время признаком не помечается', () => {
    const moment = resolveBirthMoment({
      ...MOSCOW,
      birthDate: '2000-03-26',
      birthTime: '10:30',
      timeAccuracy: 'exact',
    });
    expect(moment.nonexistentLocalTime).toBe(false);
  });
});
