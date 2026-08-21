/**
 * Разбор тела ответа, терпящий пустое.
 *
 * Nest/Express на `return null` из контроллера отдаёт 200 с пустым телом
 * (Content-Length: 0), а `response.json()` на нём падает с «Unexpected end of
 * JSON input» — и роняет весь серверный рендер страницы. Ровно так легла
 * Студия: она грузит `/motivation/postcards/event`, а тот отдаёт null, пока
 * администратор не завёл событие.
 *
 * Клиенты вызывают его вместо `response.json()`, передав `await
 * response.text()`.
 */
export function parseJsonBody<T>(text: string): T | null {
  return text ? (JSON.parse(text) as T) : null;
}
