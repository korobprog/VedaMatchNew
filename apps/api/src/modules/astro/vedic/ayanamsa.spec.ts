import {
  jdeFromDate,
  lahiriAyanamsa,
  normalize360,
  spicaLongitude,
  toSidereal,
} from './ayanamsa';

const at = (iso: string) => jdeFromDate(new Date(iso));

describe('аянамша Лахири', () => {
  /**
   * Определение проверяет само себя: читрапакша закреплена так, чтобы Спика стояла
   * на 180° сидерической долготы. Если это не выполняется, сломана либо звёздная
   * астрометрия, либо преобразование.
   */
  it('Спика по построению стоит ровно на 180° сидерического круга', () => {
    for (const iso of ['1900-01-01T00:00:00Z', '2026-01-01T00:00:00Z']) {
      const jde = at(iso);
      const sidereal = toSidereal(spicaLongitude(jde), lahiriAyanamsa(jde));
      expect(sidereal).toBeCloseTo(180, 9);
    }
  });

  it('растёт со временем: прецессия идёт в одну сторону', () => {
    const past = lahiriAyanamsa(at('1900-01-01T00:00:00Z'));
    const now = lahiriAyanamsa(at('2026-01-01T00:00:00Z'));
    expect(now).toBeGreaterThan(past);
  });

  /**
   * Общая прецессия по долготе — около 50.3″ в год. Это независимая физическая
   * проверка: ошибка в эпохе или единицах собственного движения ломает именно её.
   */
  it('прирост близок к общей прецессии, около 50″ в год', () => {
    const from = lahiriAyanamsa(at('1926-01-01T00:00:00Z'));
    const to = lahiriAyanamsa(at('2026-01-01T00:00:00Z'));
    const arcsecPerYear = ((to - from) * 3600) / 100;
    expect(arcsecPerYear).toBeGreaterThan(49);
    expect(arcsecPerYear).toBeLessThan(52);
  });

  /**
   * Диапазон намеренно широкий: разные школы расходятся примерно на угловую минуту,
   * и тест не должен закреплять одну конкретную реализацию как истину. Он ловит
   * грубые поломки — потерянный знак, перепутанные градусы и радианы, сдвиг эпохи.
   */
  it('на J2000 лежит около 23°50′', () => {
    const value = lahiriAyanamsa(at('2000-01-01T12:00:00Z'));
    expect(value).toBeGreaterThan(23.8);
    expect(value).toBeLessThan(23.9);
  });

  it('в 2026 году около 24°12′', () => {
    const value = lahiriAyanamsa(at('2026-01-01T00:00:00Z'));
    expect(value).toBeGreaterThan(24.1);
    expect(value).toBeLessThan(24.3);
  });
});

describe('перевод в сидерический зодиак', () => {
  it('вычитает аянамшу', () => {
    expect(toSidereal(100, 24)).toBeCloseTo(76, 10);
  });

  it('заворачивает через ноль', () => {
    expect(toSidereal(10, 24)).toBeCloseTo(346, 10);
  });
});

describe('normalize360', () => {
  it.each([
    [0, 0],
    [360, 0],
    [-1, 359],
    [720.5, 0.5],
    [-370, 350],
  ])('приводит %p к %p', (input, expected) => {
    expect(normalize360(input)).toBeCloseTo(expected, 10);
  });
});
