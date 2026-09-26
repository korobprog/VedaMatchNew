/**
 * Цвета знаков трёх ходовых сервисов (VED-452): «чтобы не повторялись».
 *
 * У каждого сервиса свой любимый акцент, но три сервиса человек выбирает сам
 * (VED-86), и любимые совпадали: «Общение» и «Образование» оба мятные. Поэтому
 * цвет раздаётся по порядку: сервис берёт свой, а если его уже занял сосед
 * слева — первый свободный из палитры. Токены — дизайн-системы, у каждого
 * пара значений для светлой и тёмной темы.
 *
 * Цветов ровно три — мятный, фиолетовый и малиновый (VED-452, круг 2):
 * «всего три… никаких других цветов больше придумывать не надо». Золота в
 * палитре нет, поэтому три кнопки всегда занимают все три цвета.
 */
export const FEATURED_PALETTE = [
  "text-cyan",
  "text-violet",
  "text-magenta",
] as const;

export type FeaturedAccent = (typeof FEATURED_PALETTE)[number];

export function distinctAccents(
  preferred: readonly FeaturedAccent[],
): FeaturedAccent[] {
  const used = new Set<FeaturedAccent>();
  return preferred.map((wish) => {
    const accent = used.has(wish)
      ? (FEATURED_PALETTE.find((color) => !used.has(color)) ?? wish)
      : wish;
    used.add(accent);
    return accent;
  });
}
