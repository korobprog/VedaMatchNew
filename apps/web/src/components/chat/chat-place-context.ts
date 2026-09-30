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

/** Набор на дату ведёт на страницу набора, остальное — на карточку места. */
export function placeContextHref(context: ChatTravelMapContext): string {
  const base =
    context.meta?.kind === "tour" ? "/travel/map/tours" : "/travel/map/places";
  return `${base}/${encodeURIComponent(context.id)}`;
}

/** Подпись над названием в шапке беседы. */
export function placeContextTitle(context: ChatTravelMapContext): string {
  return context.meta?.kind === "tour" ? "Группа набора" : "Группа места";
}
