// Серверный клиент сервиса «Объявления». См. docs/service-module-contract.md
//
// Отдельный файл, а не секция в notices-api.ts, по двум причинам. Первая
// техническая: `next/headers` нельзя тянуть в модуль, который импортируют
// клиентские компоненты, — сборка падает. Вторая — имена: у большинства
// сервисов серверный клиент занимает голое имя (`astro-api.ts`), а
// браузерный получает суффикс (`astro-client-api.ts`). Доска целиком
// клиентская, голое имя досталось браузерному клиенту, и серверной половине
// пришлось называться явно.
import { cookies } from "next/headers";
import type {
  MyNoticeResponsesResponse,
  NoticeFeedResponse,
} from "@vedamatch/shared";

const API_URL = process.env.API_INTERNAL_URL ?? "http://localhost:4000";

/** null — не авторизован или сервис недоступен. Молча, как в union-api. */
async function noticesGet<T>(path: string): Promise<T | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get("access_token")?.value;
  if (!token) return null;

  const res = await fetch(`${API_URL}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (res.status === 401 || res.status === 404) return null;
  if (!res.ok) throw new Error(`API ${path} failed: ${res.status}`);
  return (await res.json()) as T;
}

/**
 * Мои объявления — первая страница, отсортированная сервером по дате
 * публикации.
 *
 * Отдельного статуса просить не нужно: `mine=true` и так отдаёт все, кроме
 * снятых админом, и советник живёт ровно ради протухших — «объявление сняли
 * по сроку, его можно вернуть» без них не построить.
 *
 * Сортировки по сроку у ленты нет: порядок задан курсорной пагинацией и
 * менять его ради одной карточки нельзя. Поэтому берём страницу
 * максимального размера и ищем ближайший срок уже на месте. У человека с
 * полусотней объявлений самое протухающее может не попасть в выборку — он
 * увидит его на странице «Мои объявления», где сроки видны все.
 */
export const getMyNoticesForAdvisor = () =>
  noticesGet<NoticeFeedResponse>("/notices?mine=true&limit=50");

/** Мои отклики — чтобы заметить те, на которые давно не ответили. */
export const getMyNoticeResponsesServer = () =>
  noticesGet<MyNoticeResponsesResponse>("/notices/responses");
