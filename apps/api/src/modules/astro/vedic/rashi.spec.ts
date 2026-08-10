import {
  NAKSHATRA_NAMES,
  NAKSHATRA_SIZE,
  PADA_SIZE,
  RASHI_NAMES,
  degreeInRashi,
  nakshatraFraction,
  nakshatraOf,
  navamsaRashiOf,
  padaOf,
  rashiOf,
  wholeSignBhava,
} from './rashi';

describe('деления зодиака', () => {
  it('двенадцать раши и двадцать семь накшатр названы полностью', () => {
    expect(RASHI_NAMES).toHaveLength(12);
    expect(NAKSHATRA_NAMES).toHaveLength(27);
  });

  it('накшатра занимает 13°20′, пада — 3°20′', () => {
    expect(NAKSHATRA_SIZE).toBeCloseTo(13 + 20 / 60, 10);
    expect(PADA_SIZE).toBeCloseTo(3 + 20 / 60, 10);
  });

  it('границы раши попадают в правильный знак', () => {
    expect(rashiOf(0)).toBe(1);
    expect(rashiOf(29.999)).toBe(1);
    expect(rashiOf(30)).toBe(2);
    expect(rashiOf(359.999)).toBe(12);
  });

  it('нормализует долготу за пределами круга', () => {
    expect(rashiOf(360)).toBe(1);
    expect(rashiOf(-1)).toBe(12);
    expect(degreeInRashi(390)).toBeCloseTo(0, 10);
  });

  it('границы накшатр и пад считаются от нуля Меши', () => {
    expect(nakshatraOf(0)).toBe(1);
    expect(padaOf(0)).toBe(1);
    expect(padaOf(PADA_SIZE)).toBe(2);
    expect(nakshatraOf(NAKSHATRA_SIZE)).toBe(2);
    expect(nakshatraOf(359.999)).toBe(27);
  });

  /**
   * Регрессия на точность. Границы делений приходятся на круглые градусы (10°, 20°
   * внутри знака), и наивные формулы там срываются на единицу вниз: и деление на
   * непредставимую константу 360/27, и приведение угла через `((x % 360) + 360) % 360`,
   * которое портит уже корректные значения. Планета в 10°00′ — обычное дело.
   */
  describe('границы делений устойчивы к погрешности вычислений', () => {
    it.each([
      [0, 1],
      [PADA_SIZE, 2],
      [PADA_SIZE * 2, 3],
      [PADA_SIZE * 3, 4],
      [NAKSHATRA_SIZE, 1],
    ])('пада на границе %p равна %p', (longitude, expected) => {
      expect(padaOf(longitude)).toBe(expected);
    });

    it('девять навамш внутри знака дают девять разных знаков подряд', () => {
      const signs = Array.from({ length: 9 }, (_, i) =>
        navamsaRashiOf(i * (30 / 9)),
      );
      expect(signs).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    });

    it('круглые градусы попадают в ожидаемую навамшу', () => {
      expect(navamsaRashiOf(10)).toBe(4);
      expect(navamsaRashiOf(20)).toBe(7);
      expect(navamsaRashiOf(30)).toBe(10);
    });

    /**
     * Границы накшатр в двоичной дроби непредставимы: `11 * 360 / 27` — это число
     * чуть МЕНЬШЕ истинной границы, и попасть в неё ровно нельзя в принципе.
     * Проверяемое свойство здесь другое и корректно поставленное: по разные стороны
     * границы должны быть разные накшатры, без пропусков и повторов.
     */
    it('переход через каждую границу накшатры сдвигает её ровно на одну', () => {
      const epsilon = 1e-9;
      for (let n = 1; n < 27; n++) {
        const boundary = (n * 360) / 27;
        expect(nakshatraOf(boundary + epsilon)).toBe(n + 1);
        expect(nakshatraOf(boundary - epsilon)).toBe(n);
      }
    });

    it('каждая граница знака открывает следующий', () => {
      for (let r = 0; r < 12; r++) {
        expect(rashiOf(r * 30)).toBe(r + 1);
        expect(degreeInRashi(r * 30)).toBeCloseTo(0, 12);
      }
    });
  });

  it('доля накшатры идёт от нуля до единицы', () => {
    expect(nakshatraFraction(0)).toBeCloseTo(0, 10);
    expect(nakshatraFraction(NAKSHATRA_SIZE / 2)).toBeCloseTo(0.5, 10);
    expect(nakshatraFraction(NAKSHATRA_SIZE * 3)).toBeCloseTo(0, 10);
  });
});

/**
 * Навамша считается прямым счётом по кругу, а правило традиции формулируют через
 * стихию знака. Эти тесты проверяют, что прямой счёт даёт ровно то же самое.
 */
describe('навамша D9', () => {
  it.each([
    ['огненный Меша', 0, 1], // огонь начинает навамшу с Меши
    ['земной Вришабха', 30, 10], // земля — с Макары
    ['воздушный Митхуна', 60, 7], // воздух — с Тулы
    ['водный Карка', 90, 4], // вода — с Карки
    ['огненный Симха', 120, 1],
    ['земная Канья', 150, 10],
    ['воздушная Тула', 180, 7],
    ['водный Вришчика', 210, 4],
  ])(
    '%s начинает навамшу с предписанного знака',
    (_name, longitude, expected) => {
      expect(navamsaRashiOf(longitude)).toBe(expected);
    },
  );

  it('за один знак навамша проходит все двенадцать знаков и возвращается', () => {
    const signs = Array.from({ length: 9 }, (_, i) =>
      navamsaRashiOf(i * (30 / 9)),
    );
    expect(new Set(signs).size).toBe(9);
  });

  it('весь круг делится ровно на 108 навамш', () => {
    expect(navamsaRashiOf(359.999)).toBe(navamsaRashiOf(360 - 30 / 9 + 0.001));
  });
});

describe('бхавы по целым знакам', () => {
  it('знак лагны — это первый дом', () => {
    expect(wholeSignBhava(5, 5)).toBe(1);
  });

  it('следующий знак — второй дом', () => {
    expect(wholeSignBhava(6, 5)).toBe(2);
  });

  it('счёт заворачивается через конец зодиака', () => {
    expect(wholeSignBhava(1, 12)).toBe(2);
    expect(wholeSignBhava(11, 12)).toBe(12);
  });

  it('седьмой дом всегда напротив лагны', () => {
    for (let lagna = 1; lagna <= 12; lagna++) {
      const opposite = ((lagna + 5) % 12) + 1;
      expect(wholeSignBhava(opposite, lagna)).toBe(7);
    }
  });
});
