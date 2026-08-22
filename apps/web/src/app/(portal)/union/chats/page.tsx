import { redirect } from "next/navigation";

/**
 * Список диалогов Знакомств переехал в «Общение»: один список на портал
 * вместо чата в каждом сервисе. Страница оставлена редиректом ради старых
 * ссылок в уведомлениях и закладках.
 */
export default function UnionChatsPage() {
  redirect("/chat");
}
