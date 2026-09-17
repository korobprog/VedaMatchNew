/**
 * Контур сайта по хосту запроса — нужен ровно для одного решения на секции
 * загрузки (VED-176 → веха 7): кнопка «Открыть в Telegram» ведёт на
 * `@vedamatch_bot`, а вход через Telegram включён только на контуре
 * `vedamatch.com` (см. `apps/api/src/modules/auth/contour.ts`). На
 * `vedamatch.ru` кнопка не показывается вовсе — обещать способ входа,
 * которого на этом контуре нет, хуже, чем не упоминать его.
 *
 * Источник хоста — серверный компонент (`headers().get("host")`), значение
 * спускается вниз обычным пропом: секция вложена в клиентские `LandingPage` /
 * `VaishnavaLandingPage`, а определять контур по `window.location` там смысла
 * нет — тот же хост уже известен на сервере до первой отрисовки.
 */
export function isComContourHost(host: string | null | undefined): boolean {
  if (typeof host !== "string") return false;
  const hostname = host.trim().toLowerCase().split(":")[0];
  if (!hostname) return false;

  const labels = hostname.split(".").filter(Boolean);
  if (labels.length < 2) return false;

  const tld = labels[labels.length - 1];
  const name = labels[labels.length - 2];
  return tld === "com" && name === "vedamatch";
}
