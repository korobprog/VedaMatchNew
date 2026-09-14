import type { TravelStayDto } from "@vedamatch/shared";

// Серверные запросы «Путешествий»: страница объекта по QR рендерится на
// сервере, чтобы гость со слабым интернетом сразу видел карточку, а превью
// ссылки в мессенджере получало название.
const API_URL = process.env.API_INTERNAL_URL ?? "http://localhost:4000";

/** Опубликованный объект по коду; null — кода нет или объект снят. */
export async function getPublicStay(
  code: string,
): Promise<TravelStayDto | null> {
  const res = await fetch(
    `${API_URL}/travel/public/stays/${encodeURIComponent(code)}`,
    { cache: "no-store" },
  );
  if (res.status === 404 || res.status === 400) return null;
  if (!res.ok) throw new Error(`travel public stay: ${res.status}`);
  return (await res.json()) as TravelStayDto;
}
