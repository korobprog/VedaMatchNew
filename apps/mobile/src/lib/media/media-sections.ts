import type { MediaCategory } from './media-parse';

/**
 * Разделы Медиатеки как на сайте (VED-331): корневые вкладки
 * «Всё / Традиционное / Современное» (`music-root-tabs.tsx`), отдельно —
 * «Аудиокниги» (свой раздел, в общей выдаче глав нет, VED-297), и ряд стилей
 * под ними (`styleFilterCategories` в `music-root-scope.ts`).
 */

export type MediaSectionKey = 'all' | 'audiobooks' | `root:${string}`;

export interface MediaSection {
  key: MediaSectionKey;
  label: string;
  /** Сколько записей обещает вкладка; `null` — не показываем число. */
  count: number | null;
}

export function rootSlugOf(key: MediaSectionKey): string | null {
  return key.startsWith('root:') ? key.slice('root:'.length) : null;
}

/**
 * Вкладки над списком. Корневые видны и с нулём записей — как на сайте, это
 * стабильная навигация. «Аудиокниги» — последней, только если книги есть:
 * пустой раздел обещает то, чего нет.
 */
export function mediaSections(categories: readonly MediaCategory[], hasAudiobooks: boolean): MediaSection[] {
  const roots = categories
    .filter((category) => category.kind === 'root')
    .map<MediaSection>((category) => ({
      key: `root:${category.slug}`,
      label: category.title,
      count: category.trackCount > 0 ? category.trackCount : null,
    }));
  return [
    { key: 'all', label: 'Всё', count: null },
    ...roots,
    ...(hasAudiobooks ? [{ key: 'audiobooks' as const, label: 'Аудиокниги', count: null }] : []),
  ];
}

function sameTitle(left: string, right: string): boolean {
  return left.trim().toLocaleLowerCase('ru') === right.trim().toLocaleLowerCase('ru');
}

/**
 * Стили для ряда чипов. Как на сайте: без корневых и без их тёзок-стилей
 * (на проде «Традиционное» заведено ещё и стилем с нулём записей). Плюс
 * правило приложения: стиль без единой записи не показываем — чип, который
 * открывает пустой список, на телефоне стоит места в узком ряду.
 */
export function styleChips(categories: readonly MediaCategory[]): MediaCategory[] {
  const rootTitles = categories.filter((category) => category.kind === 'root').map((category) => category.title);
  return categories.filter(
    (category) =>
      category.kind === 'style' &&
      category.trackCount > 0 &&
      !rootTitles.some((title) => sameTitle(title, category.title)),
  );
}
