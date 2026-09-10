import type { WorkContactsDto } from "@vedamatch/shared";
import { plural } from "@/lib/plural";

/**
 * Тексты пустого списка в приглашении.
 *
 * Отдельно от панели, потому что решение здесь одно и целиком словесное:
 * «никого не нашлось» — это четыре разные новости, и путать их нельзя.
 * У обычного человека список — его знакомые, у администрации — весь портал,
 * и до ввода имени пустой список у неё вообще не новость, а приглашение
 * набрать запрос.
 */
export function emptyHint(contacts: WorkContactsDto, search: string): string {
  const query = search.trim();

  if (contacts.scope === "portal") {
    const min = contacts.minQuery ?? 0;
    if (query.length < min) {
      const letters = plural(min, "буквы", "букв", "букв");
      return `Начните вводить имя — ищем по всему порталу от ${min} ${letters}.`;
    }
    return "На портале никого с таким именем.";
  }

  return query
    ? "Среди знакомых никого с таким именем."
    : "Здесь появятся те, с кем вы уже знакомы на портале. Пока некого позвать — создайте ссылку и отправьте её другу в чат кнопкой выше.";
}
