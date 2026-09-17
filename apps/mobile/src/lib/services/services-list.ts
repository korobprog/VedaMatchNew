import type { ServiceCard } from '@vedamatch/shared';

/**
 * Видимые пользователю сервисы каталога (VED-174).
 *
 * Убирает `chat`: нативная вкладка «Чаты» уже покрывает переписку, показывать
 * «Общение» второй раз ссылкой на сайт — дубль, которого не должно быть по
 * правилу сторов (список сервисов — второстепенная вкладка,
 * `docs/mobile-app-store-links.md`) и по README (`apps/mobile/README.md:3-5`).
 * Убирает `disabled`: `GET /services` в теории может отдать такую карточку
 * администратору, обычному пользователю показывать её не нужно.
 * Порядок остальных не трогает — его задаёт `sortOrder` на сервере.
 */
export function visibleServices(cards: readonly ServiceCard[]): ServiceCard[] {
  return cards.filter((card) => card.slug !== 'chat' && card.status !== 'disabled');
}
