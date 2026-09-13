/**
 * Хост запроса → домен портала, в терминах которого написаны настройки.
 *
 * В проде API стоит на `api.vedamatch.ru`, а человек ходит на `vedamatch.ru`.
 * Сверяться сырым `req.hostname` нельзя: админ пишет в настройках домен
 * портала, и список способов оказался бы пустым на всём проде.
 */
export function portalHost(host: string): string {
  const bare = host.trim().toLowerCase().split(':')[0];
  return bare.startsWith('api.') ? bare.slice('api.'.length) : bare;
}
