import type { WorkPersonRefDto } from "@vedamatch/shared";

/**
 * Подпись человека или ИИ-агента в «Работе».
 *
 * Аватаров на доске нет, имена стоят голым текстом, поэтому «Севак» в колонке
 * исполнителя ничем не отличается от живого участника. Пометка и есть
 * единственное, что отличает программу от человека, — иначе карточка врёт про
 * то, кто над ней работает.
 *
 * Пометка идёт после имени, а не перед: списки читаются по первой букве, и
 * «ИИ Севак» ставило бы всех агентов в одно место алфавита.
 */
export const WORK_AGENT_MARK = "ИИ";

export function workPersonLabel(
  person: Pick<WorkPersonRefDto, "name" | "isAgent"> | null | undefined,
): string {
  if (!person) return "";
  return person.isAgent ? `${person.name} · ${WORK_AGENT_MARK}` : person.name;
}

/**
 * Кто стоит за действием в истории карточки: агент показывается вместе с тем,
 * чьим ключом он ходил. Аккаунт у агента один на всех, и «Севак перенёс» без
 * поручителя отвечает лишь наполовину.
 */
export function workActorLabel(
  actor: Pick<WorkPersonRefDto, "name" | "isAgent"> | null | undefined,
  onBehalfOf: Pick<WorkPersonRefDto, "name"> | null | undefined,
): string {
  const label = workPersonLabel(actor);
  if (!label || !onBehalfOf) return label;
  return `${label}, по поручению: ${onBehalfOf.name}`;
}

/**
 * Короткая подпись исполнителя на карточке доски (VED-431): первое слово
 * имени. Полное имя занимало на телефоне отдельную строку карточки —
 * «Станислав Санкаршан» справа под номером, — а карточку просили сделать
 * компактнее. Полное имя остаётся в подсказке и для скринридера.
 */
export function workPersonShortLabel(
  person: Pick<WorkPersonRefDto, "name" | "isAgent"> | null | undefined,
): string {
  if (!person) return "";
  const first = person.name.trim().split(/\s+/)[0] ?? "";
  return person.isAgent ? `${first} · ${WORK_AGENT_MARK}` : first;
}
