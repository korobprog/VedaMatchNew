import type { VacancyOfferDto } from "@vedamatch/shared";
import { VACANCY_KIND_LABELS, offerTerms } from "./vacancy-labels";

/**
 * «Отправить в чат».
 *
 * Своего списка друзей здесь нет и не нужно: у портала есть общий экран
 * отправки `/chat/share`, которым пользуются Объявления, Рынок и Работа. Он
 * показывает беседы человека и сам заводит сообщение — «Вакансии» знают
 * только адрес и поля карточки.
 *
 * Полного адреса предложения в карточке нет: чат принимает в `url` только
 * объекты своего хранилища, а ссылку «Открыть предложение» карточка собирает
 * сама из пары `sourceService`/`sourceId` (см. chat-card-link.ts).
 */
const MAX_TITLE = 80;

export function buildVacancyShareHref(offer: VacancyOfferDto): string {
  const params = new URLSearchParams({
    kind: "vacancy",
    title: shareTitle(offer.title),
    subtitle: shareSubtitle(offer),
    body: offer.postedAs
      ? `Зовёт община «${offer.postedAs.name}»`
      : `Зовёт ${offer.author.name}`,
    sourceService: "vacancies",
    sourceId: offer.id,
  });
  return `/chat/share?${params.toString()}`;
}

/** Длинный заголовок режем: в списке бесед карточка стоит в одну строку. */
export function shareTitle(title: string): string {
  const trimmed = title.trim() || "Предложение";
  if (trimmed.length <= MAX_TITLE) return trimmed;
  return `${trimmed.slice(0, MAX_TITLE - 1)}…`;
}

/** «Работа · 60 000–80 000 ₽ в месяц · Москва». */
export function shareSubtitle(offer: VacancyOfferDto): string {
  const parts = [VACANCY_KIND_LABELS[offer.kind]];
  const terms = offerTerms(offer);
  if (terms) parts.push(terms);
  if (offer.isRemote) parts.push("удалённо");
  else if (offer.city) parts.push(offer.city);
  return parts.join(" · ");
}
