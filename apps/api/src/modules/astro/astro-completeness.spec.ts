import type { AstroFeatureKey } from '@vedamatch/shared';
import {
  ASTRO_COMPLETENESS_TOTAL,
  computeAstroCompleteness,
} from './astro-completeness';

const nothing = {
  hasBirthDate: false,
  hasBirthPlace: false,
  hasBirthTime: false,
};

const unlockedKeys = (input: Parameters<typeof computeAstroCompleteness>[0]) =>
  computeAstroCompleteness(input)
    .features.filter((f) => f.unlocked)
    .map((f) => f.key);

describe('computeAstroCompleteness — шкала', () => {
  it('веса в сумме дают 100', () => {
    expect(ASTRO_COMPLETENESS_TOTAL).toBe(100);
  });

  it('пустое состояние — ноль процентов', () => {
    expect(computeAstroCompleteness(nothing).percent).toBe(0);
  });

  it('человек с датой из портального профиля стартует не с нуля', () => {
    const result = computeAstroCompleteness({ ...nothing, hasBirthDate: true });
    expect(result.percent).toBe(25);
  });

  it('полностью заполненные данные дают сто процентов', () => {
    const result = computeAstroCompleteness({
      hasBirthDate: true,
      hasBirthPlace: true,
      hasBirthTime: true,
    });
    expect(result.percent).toBe(100);
    expect(result.missing).toEqual([]);
    expect(result.next).toBeNull();
  });

  it('время весит больше остальных полей вместе взятых', () => {
    const items = computeAstroCompleteness(nothing).items;
    const time = items.find((i) => i.key === 'birthTime')!.weight;
    const rest = items
      .filter((i) => i.key !== 'birthTime')
      .reduce((sum, i) => sum + i.weight, 0);
    expect(time).toBeGreaterThanOrEqual(rest);
  });

  it('подсказывает сначала дешёвые поля, поиск времени рождения — последним', () => {
    const result = computeAstroCompleteness(nothing);
    expect(result.next).toBe('birthDate');
    expect(result.missing[result.missing.length - 1]).toBe('birthTime');
  });
});

describe('computeAstroCompleteness — что открыто', () => {
  it('по одной дате открыты только знаки грах', () => {
    expect(unlockedKeys({ ...nothing, hasBirthDate: true })).toEqual([
      'graha_signs',
    ]);
  });

  it('место без времени не открывает ничего нового', () => {
    // Лагна зависит от вращения Земли: без времени координаты бесполезны.
    expect(unlockedKeys({ ...nothing, hasBirthDate: true })).toEqual(
      unlockedKeys({ ...nothing, hasBirthDate: true, hasBirthPlace: true }),
    );
  });

  it('время без места открывает накшатру Луны и даши, но не дома', () => {
    const unlocked = unlockedKeys({
      hasBirthDate: true,
      hasBirthTime: true,
      hasBirthPlace: false,
    });
    expect(unlocked).toContain('moon_nakshatra');
    expect(unlocked).toContain('dasha');
    expect(unlocked).not.toContain('lagna');
    expect(unlocked).not.toContain('houses');
  });

  it('полные данные открывают всё', () => {
    const unlocked = unlockedKeys({
      hasBirthDate: true,
      hasBirthTime: true,
      hasBirthPlace: true,
    });
    const all: AstroFeatureKey[] = [
      'graha_signs',
      'moon_nakshatra',
      'dasha',
      'lagna',
      'houses',
      'daily_transits',
    ];
    expect(unlocked.sort()).toEqual(all.sort());
  });

  it('у закрытой возможности перечислено, чего именно не хватает', () => {
    const lagna = computeAstroCompleteness({
      ...nothing,
      hasBirthDate: true,
    }).features.find((f) => f.key === 'lagna')!;
    expect(lagna.unlocked).toBe(false);
    expect(lagna.requires.sort()).toEqual(['birthPlace', 'birthTime']);
  });

  it('у открытой возможности список требований пуст', () => {
    const signs = computeAstroCompleteness({
      ...nothing,
      hasBirthDate: true,
    }).features.find((f) => f.key === 'graha_signs')!;
    expect(signs.requires).toEqual([]);
  });
});
