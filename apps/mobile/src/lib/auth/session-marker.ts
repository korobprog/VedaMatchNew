/**
 * Не-httpOnly cookie `vm_session`, которую сервер ставит рядом с парой
 * токенов на домен портала (`auth.service.ts`, `SESSION_MARKER_COOKIE`).
 * Секрета в ней нет: по ней веб-версия решает, показать ли сразу экран
 * входа или сначала спросить профиль.
 */
export function hasSessionMarker(cookieHeader: string): boolean {
  return cookieHeader
    .split(';')
    .map((part) => part.trim())
    .some((part) => part.startsWith('vm_session=') && part.length > 'vm_session='.length);
}
