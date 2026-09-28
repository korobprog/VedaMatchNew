/**
 * Цвета знаков трёх ходовых сервисов (VED-452): «чтобы не повторялись».
 *
 * У каждого сервиса свой любимый акцент, но три сервиса человек выбирает сам
 * (VED-86), и любимые совпадали: «Общение» и «Образование» оба мятные. Поэтому
 * цвет раздаётся по порядку: сервис берёт свой, а если его уже занял сосед
 * слева — первый свободный из трёх основных. Токены — дизайн-системы, у
 * каждого пара значений для светлой и тёмной темы.
 *
 * По умолчанию цветов три — мятный, фиолетовый и малиновый (VED-452, круг 2).
 * В круге 3 заказчик вернул золотой и попросил предложить ещё «удачные цвета,
 * главное чтобы разница была сильная», а цвет каждой кнопки — менять прямо на
 * ней. Предложены синий и салатовый: они встают в пустые места цветового
 * круга (синий — между мятой и фиолетовым, салатовый — между золотом и
 * мятой), а не рядом с уже занятыми. Контраст знака на стекле кнопки — в
 * комментариях у токенов в `globals.css`, у всех выше 3:1 для графики.
 */
export const FEATURED_PALETTE = [
  "text-cyan",
  "text-violet",
  "text-magenta",
  "text-gold",
  "text-blue",
  "text-lime",
] as const;

export type FeaturedAccent = (typeof FEATURED_PALETTE)[number];

/** Сколько цветов раздаётся без участия человека. */
const DEFAULT_ACCENTS = FEATURED_PALETTE.slice(0, 3);

/** Имя цвета для подписи кнопки выбора и скринридера. */
export const FEATURED_ACCENT_NAMES: Record<FeaturedAccent, string> = {
  "text-cyan": "мятный",
  "text-violet": "фиолетовый",
  "text-magenta": "малиновый",
  "text-gold": "золотой",
  "text-blue": "синий",
  "text-lime": "салатовый",
};

/** Заливка кружка того же цвета: классы Tailwind пишутся целиком. */
export const FEATURED_ACCENT_FILL: Record<FeaturedAccent, string> = {
  "text-cyan": "bg-cyan",
  "text-violet": "bg-violet",
  "text-magenta": "bg-magenta",
  "text-gold": "bg-gold",
  "text-blue": "bg-blue",
  "text-lime": "bg-lime",
};

export function distinctAccents(
  preferred: readonly FeaturedAccent[],
): FeaturedAccent[] {
  return resolveFeaturedAccents(preferred, null);
}

/**
 * Выбор цвета живёт в cookie рядом с выбором самих кнопок
 * (`vm_home_featured`) и по той же причине: знак красится на сервере, и
 * выбор, известный только браузеру, давал бы кнопку, которая сначала
 * рисуется своим цветом, а потом перекрашивается. Цвет привязан к месту
 * кнопки, а не к сервису: «разные цвета только для трёх главных кнопок, а не
 * для самих сервисов». Значение несёт `userId`, как и выбор кнопок.
 */
export const HOME_FEATURED_COLORS_COOKIE = "vm_home_featured_colors";

const SHORT = (accent: FeaturedAccent) => accent.slice("text-".length);

export function parseFeaturedColors(
  raw: string | undefined,
  userId: string,
): (FeaturedAccent | null)[] | null {
  if (!raw) return null;
  let value: string;
  try {
    value = decodeURIComponent(raw);
  } catch {
    return null;
  }
  const separator = value.indexOf("|");
  if (separator < 0 || value.slice(0, separator) !== userId) return null;
  const colors = value
    .slice(separator + 1)
    .split(",")
    .map(
      (name) =>
        FEATURED_PALETTE.find((accent) => SHORT(accent) === name) ?? null,
    );
  return colors.some(Boolean) ? colors : null;
}

export function serializeFeaturedColors(
  userId: string,
  accents: readonly FeaturedAccent[],
): string {
  return encodeURIComponent(`${userId}|${accents.map(SHORT).join(",")}`);
}

/**
 * Цвета кнопок: сохранённый выбор места, а где его нет — любимый цвет
 * сервиса. Повторы разводятся так же, как без выбора: у трёх кнопок цвета
 * разные всегда.
 */
export function resolveFeaturedAccents(
  preferred: readonly FeaturedAccent[],
  saved: readonly (FeaturedAccent | null)[] | null,
): FeaturedAccent[] {
  const wishes = preferred.map((wish, index) => saved?.[index] ?? wish);
  // Выбор человека сильнее любимого цвета: сначала раздаются его цвета,
  // потом остальные места берут свободные.
  const order = wishes
    .map((_, index) => index)
    .sort(
      (a, b) =>
        Number(saved?.[a] == null) - Number(saved?.[b] == null) || a - b,
    );
  const result = [...wishes];
  const used = new Set<FeaturedAccent>();
  for (const index of order) {
    const wish = wishes[index];
    const accent = used.has(wish)
      ? (DEFAULT_ACCENTS.find((color) => !used.has(color)) ??
        FEATURED_PALETTE.find((color) => !used.has(color)) ??
        wish)
      : wish;
    used.add(accent);
    result[index] = accent;
  }
  return result;
}

/**
 * Поставить цвет `accent` на кнопку `index`. Если он уже на другой кнопке,
 * они меняются цветами: иначе две кнопки стали бы одинаковыми, а смысл
 * ряда — в том, что цвета разные.
 */
export function assignFeaturedAccent(
  accents: readonly FeaturedAccent[],
  index: number,
  accent: FeaturedAccent,
): FeaturedAccent[] {
  const next = [...accents];
  const previous = next[index];
  const taken = next.indexOf(accent);
  if (taken >= 0 && taken !== index && previous !== undefined) {
    next[taken] = previous;
  }
  next[index] = accent;
  return next;
}
