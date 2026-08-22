/**
 * Цвет участника беседы: имя в пузыре и подложка аватара без фото.
 *
 * В беседе на два десятка человек одинаковый цвет всех имён не помогает
 * различать говорящих: глаз цепляется за цвет раньше, чем читает слово.
 * Цвет выбирается по id — он не меняется от порядка сообщений и одинаков
 * у всех, кто смотрит одну и ту же беседу.
 *
 * Имя красится токенами (они определены в обеих темах), а подложка аватара —
 * фиксированной парой: это насыщенные средние тона, читаемые и на светлом,
 * и на тёмном фоне, и переворачивать их вместе с темой незачем.
 */
export interface AuthorPalette {
  /** Класс цвета имени. */
  name: string;
  /** Градиент подложки аватара и цвет буквы на нём. */
  avatar: { from: string; to: string; ink: string };
}

const PALETTE: AuthorPalette[] = [
  {
    name: "text-cyan",
    avatar: { from: "#23F0C7", to: "#33CCCC", ink: "#0A0614" },
  },
  {
    name: "text-violet",
    avatar: { from: "#B23EFF", to: "#6C5CE7", ink: "#F6F1FF" },
  },
  {
    name: "text-gold",
    avatar: { from: "#FFC85C", to: "#FF8A3E", ink: "#0A0614" },
  },
  {
    name: "text-blue",
    avatar: { from: "#5CCCCC", to: "#2AB5B5", ink: "#0A0614" },
  },
];

/**
 * FNV-1a, а не «умножить на 31»: у простой суммы соседние идентификаторы
 * («a1» и «b2») ложатся в один остаток, и половина участников беседы
 * оказывается одного цвета. Берём ещё и старшие биты — младшие у любого
 * умножения меняются слабее всего.
 */
export function authorPalette(userId: string): AuthorPalette {
  let hash = 0x811c9dc5;
  for (let index = 0; index < userId.length; index += 1) {
    hash ^= userId.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  const mixed = (hash ^ (hash >>> 15)) >>> 0;
  return PALETTE[mixed % PALETTE.length];
}

export function authorColor(userId: string): string {
  return authorPalette(userId).name;
}
