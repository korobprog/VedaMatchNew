import type { ChatTravelMapContext } from "@vedamatch/shared";

/**
 * Подпись места под названием в шапке беседы: «Вегетарианское кафе · Маяпур».
 * Пустые части пропускаются, без меты подписи нет.
 */
export function placeContextLabel(context: ChatTravelMapContext): string {
  return [context.meta?.kindLabel, context.meta?.city]
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part))
    .join(" · ");
}

/** Ссылка на карточку места: просто путь, компонент чужого сервиса не нужен. */
export function placeContextHref(context: ChatTravelMapContext): string {
  return `/travel/map/places/${encodeURIComponent(context.id)}`;
}
