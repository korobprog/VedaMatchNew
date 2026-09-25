/**
 * Разделы Знакомств в приложении — строка вкладок под шапкой каждого экрана
 * (на сайте это `union-nav.tsx` + нижняя `union-tabbar.tsx`). Список, а не
 * разметка по месту: добавить раздел значит дописать строку, и видно, какие
 * разделы уже свои, не читая экраны.
 *
 * «Чаты» Знакомств сюда не входят: переписка портала одна, она в «Чатах»
 * приложения, а страницы `/union/chats` на сайте — редиректы туда же.
 */
export type UnionSectionKey = 'recommendations' | 'likes' | 'connections';

export interface UnionSection {
  key: UnionSectionKey;
  title: string;
  /** Маршрут приложения, а не адрес сайта. */
  route: `/union/${string}`;
}

export const UNION_SECTIONS: readonly UnionSection[] = [
  { key: 'recommendations', title: 'Анкеты', route: '/union/recommendations' },
  { key: 'likes', title: 'Лайки', route: '/union/likes' },
  { key: 'connections', title: 'Связи', route: '/union/connections' },
];

/** Счётчик на вкладке: больше 99 не пишем, «99+» — и так понятно, что много. */
export function badgeText(count: number): string | null {
  if (!Number.isFinite(count) || count <= 0) return null;
  return count > 99 ? '99+' : String(Math.floor(count));
}
