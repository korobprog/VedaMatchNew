import type { ChatMapCommunity } from "@vedamatch/shared";

/**
 * Сводка по общинам для публичной страницы «Общения».
 *
 * Считается из того же ответа, что рисует метки, а не из отдельного запроса
 * статистики: два источника разошлись бы на глазах у гостя — «12 общин» над
 * картой с одной точкой. Отсюда и подписи: это «общин на карте», а не «общин
 * в портале», и цифра обязана сходиться с тем, что видно.
 */
export interface CommunityMapSummary {
  /** Общин с указанным местом — ровно столько меток на карте. */
  communities: number;
  /** Городов, в которых они стоят. */
  cities: number;
  /** Открытых каналов и групп суммарно: куда можно войти самому. */
  talks: number;
}

/**
 * Город приводится к ключу так же, как `cityKey` в схеме (trim + lower):
 * «Москва» и «москва » — один город, и считать их за два значило бы завысить
 * охват на ровном месте.
 */
function cityKey(city: string | null | undefined): string | null {
  const trimmed = city?.trim().toLowerCase();
  return trimmed ? trimmed : null;
}

export function summarizeCommunities(
  communities: ChatMapCommunity[],
): CommunityMapSummary {
  const cities = new Set<string>();
  let talks = 0;

  for (const point of communities) {
    const key = cityKey(point.city);
    if (key) cities.add(key);
    talks += point.channels + point.groups;
  }

  return { communities: communities.length, cities: cities.size, talks };
}
