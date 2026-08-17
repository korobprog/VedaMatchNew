import type { NoticeSubscriptionKind } from '@vedamatch/shared';

/**
 * Ключ цели подписки.
 *
 * Материализован строкой по той же причине, что в `MarketSubscription`:
 * уникальный индекс по колонкам с NULL в Postgres не дедуплицирует, и один
 * человек мог бы подписаться на одну рубрику дважды.
 *
 * Город нормализуется так же, как в фильтрах ленты, — иначе «Москва» и
 * «москва» стали бы двумя разными подписками, и уведомление пришло бы дважды.
 */
export function subscriptionTargetKey(input: {
  kind: NoticeSubscriptionKind;
  rubricSlug: string | null;
  city: string | null;
  communityId: string | null;
}): string {
  if (input.kind === 'rubric') return `rubric:${input.rubricSlug ?? ''}`;
  if (input.kind === 'city') return `city:${normalizeCity(input.city ?? '')}`;
  return `community:${input.communityId ?? ''}`;
}

export function normalizeCity(city: string): string {
  return city.trim().toLocaleLowerCase('ru-RU').replace(/ё/g, 'е');
}
