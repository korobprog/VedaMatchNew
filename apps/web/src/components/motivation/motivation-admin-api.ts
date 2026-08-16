const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export async function apiRequest(path: string, method: string, body?: unknown) {
  const response = await fetch(`${API_URL}${path}`, {
    method,
    credentials: "include",
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) throw new Error((await response.text()) || `Ошибка API ${response.status}`);

  // Nest на хендлере, возвращающем void (удаление поста, автора, источника,
  // категории), отвечает 200 с пустым телом, а не 204 — поэтому смотрим на само
  // тело, а не на код. Иначе `.json()` падает с «Unexpected end of JSON input»,
  // хотя запрос уже отработал.
  const text = await response.text();
  if (!text) return null;
  return JSON.parse(text);
}
