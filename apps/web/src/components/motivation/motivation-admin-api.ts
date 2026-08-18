const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

function send(path: string, method: string, body?: unknown) {
  return fetch(`${API_URL}${path}`, {
    method,
    credentials: "include",
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

export async function apiRequest(path: string, method: string, body?: unknown) {
  let response = await send(path, method, body);

  // Токен доступа живёт недолго, а админ сидит на одной странице часами:
  // SilentRefresh срабатывает только на лендинге, куда proxy выбрасывает
  // при переходе. Без этого повтора кнопки начинали отвечать «Требуется
  // авторизация» до перезагрузки страницы, хотя сессия ещё жива.
  if (response.status === 401) {
    const refreshed = await fetch(`${API_URL}/auth/refresh`, {
      method: "POST",
      credentials: "include",
    }).catch(() => null);
    if (refreshed?.ok) response = await send(path, method, body);
  }

  if (!response.ok) throw new Error((await response.text()) || `Ошибка API ${response.status}`);

  // Nest на хендлере, возвращающем void (удаление поста, автора, источника,
  // категории), отвечает 200 с пустым телом, а не 204 — поэтому смотрим на само
  // тело, а не на код. Иначе `.json()` падает с «Unexpected end of JSON input»,
  // хотя запрос уже отработал.
  const text = await response.text();
  if (!text) return null;
  return JSON.parse(text);
}
