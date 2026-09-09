import { createHmac } from 'node:crypto';

/**
 * Короткоживущие учётки TURN по схеме coturn `use-auth-secret`
 * (long-term credentials поверх общего секрета):
 * username = `<unix-expiry>:<userId>`,
 * password = base64(HMAC-SHA1(secret, username)).
 *
 * Постоянный пароль наружу не отдаётся: учётка, утёкшая из вкладки,
 * протухает сама, и по её имени видно, чей это был звонок.
 */
export const TURN_CREDENTIAL_TTL_SECONDS = 10 * 60;

/** 443 занят Traefik'ом, поэтому TLS по умолчанию на штатном порту TURN. */
export const DEFAULT_TURN_TLS_PORT = 5349;

export interface TurnCredentials {
  username: string;
  credential: string;
  /** Unix-время истечения в секундах — то же, что в начале username. */
  expiresAt: number;
}

export function buildTurnCredentials(
  secret: string,
  userId: string,
  now: Date = new Date(),
  ttlSeconds: number = TURN_CREDENTIAL_TTL_SECONDS,
): TurnCredentials {
  const expiresAt = Math.floor(now.getTime() / 1000) + ttlSeconds;
  const username = `${expiresAt}:${userId}`;
  const credential = createHmac('sha1', secret)
    .update(username)
    .digest('base64');
  return { username, credential, expiresAt };
}

/** Запись в формате `RTCIceServer` — то, что уходит в `RTCPeerConnection`. */
export interface IceServerEntry {
  urls: string[];
  username?: string;
  credential?: string;
}

/**
 * Список ICE-серверов для браузера. TURN выдаётся по трём транспортам:
 * UDP — основной, TCP и TLS — когда UDP до зарубежного хоста задушен
 * (см. docs/chat-calls-plan.md, раздел о сети). Без TURN остаётся только
 * публичный STUN: прямое соединение попробуется, релея не будет.
 */
export function buildIceServers(
  turnHost: string | undefined,
  credentials: TurnCredentials | null,
  tlsPort: number = DEFAULT_TURN_TLS_PORT,
): IceServerEntry[] {
  const servers: IceServerEntry[] = [
    { urls: ['stun:stun.l.google.com:19302'] },
  ];
  if (!turnHost || !credentials) return servers;
  servers.unshift({ urls: [`stun:${turnHost}:3478`] });
  servers.push({
    urls: [
      `turn:${turnHost}:3478?transport=udp`,
      `turn:${turnHost}:3478?transport=tcp`,
      `turns:${turnHost}:${tlsPort}?transport=tcp`,
    ],
    username: credentials.username,
    credential: credentials.credential,
  });
  return servers;
}
