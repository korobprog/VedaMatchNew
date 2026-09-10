import { createHash, randomBytes } from 'node:crypto';

/**
 * Приглашение в рабочую среду — ссылка, которую пересылают в мессенджер.
 *
 * В базе лежит хеш, а не токен: дамп таблицы не должен открывать доступ к
 * чужим доскам, а показать ссылку целиком нужно ровно один раз — в ответе на
 * создание. Тот же приём, что у любого секрета портала.
 */

/** 32 байта энтропии: перебор ссылки не окупается ни при какой скорости. */
const TOKEN_BYTES = 32;

export const WORK_INVITE_DEFAULT_DAYS = 7;
export const WORK_INVITE_MAX_DAYS = 90;

export interface WorkInviteSecret {
  token: string;
  tokenHash: string;
}

export function createWorkInviteToken(): WorkInviteSecret {
  const token = randomBytes(TOKEN_BYTES).toString('base64url');
  return { token, tokenHash: hashWorkInviteToken(token) };
}

export function hashWorkInviteToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Ссылка целиком. База знает только хеш, поэтому собирается здесь и сразу. */
export function workInviteUrl(webUrl: string, token: string): string {
  return `${webUrl.replace(/\/+$/, '')}/work/join/${token}`;
}

/**
 * Адрес портала для ссылки-приглашения — из `WEB_ORIGIN`.
 *
 * Это единственная переменная про адрес веба, которая на портале заведена: по
 * ней собирается CORS и ссылки в письмах. Пока сервис спрашивал собственное
 * `WEB_URL`, которого нет ни в одном окружении, прод молча выдавал людям
 * приглашения на `http://localhost:3000`.
 *
 * В CORS адресов бывает несколько через запятую, а ссылка нужна одна — берём
 * первый. Пустое значение оставляем локальным: в dev так и есть.
 */
export function portalWebUrl(configured: string | undefined): string {
  const first = (configured ?? '').split(',')[0]?.trim();
  return first || 'http://localhost:3000';
}

export function workInviteExpiry(now: Date, days?: number): Date {
  const clamped = Math.min(
    Math.max(Math.trunc(days ?? WORK_INVITE_DEFAULT_DAYS), 1),
    WORK_INVITE_MAX_DAYS,
  );
  return new Date(now.getTime() + clamped * 24 * 60 * 60 * 1000);
}

export type WorkInviteState = 'active' | 'revoked' | 'expired' | 'exhausted';

/**
 * Почему ссылка не работает. Три разные причины и три разных объяснения:
 * «отозвана» просят у того, кто звал, «истекла» — просят продлить, а
 * «исчерпана» означает, что мест по этой ссылке больше нет.
 */
export function workInviteState(
  invite: {
    revokedAt: Date | null;
    expiresAt: Date;
    maxUses: number;
    useCount: number;
  },
  now: Date,
): WorkInviteState {
  if (invite.revokedAt) return 'revoked';
  if (invite.expiresAt.getTime() <= now.getTime()) return 'expired';
  if (invite.maxUses > 0 && invite.useCount >= invite.maxUses) {
    return 'exhausted';
  }
  return 'active';
}

export function workInviteStateMessage(state: WorkInviteState): string {
  switch (state) {
    case 'revoked':
      return 'Приглашение отозвано. Попросите новую ссылку.';
    case 'expired':
      return 'Срок приглашения истёк. Попросите новую ссылку.';
    case 'exhausted':
      return 'По этой ссылке больше нельзя войти: мест не осталось.';
    case 'active':
      return '';
  }
}
