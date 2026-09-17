import type { ChatIceServerDto } from '@vedamatch/shared';

/**
 * Один URL — одна запись `RTCIceServer` (VED-222, живая проверка BUG C):
 * `GET /chat/calls/ice-servers` кладёт TURN ТРЕМЯ схемами транспорта в
 * ОДИН объект `urls` (`buildIceServers`, `apps/api/.../turn-credentials.ts`:
 * `['turn:host:3478?transport=udp', 'turn:host:3478?transport=tcp',
 * 'turns:host:5349?transport=tcp']`) — валидно по спецификации WebRTC, но
 * на Samsung Galaxy A51 с этим массивом `RTCPeerConnection`
 * (react-native-webrtc/libwebrtc) собирал только `host`-кандидат: ни srflx,
 * ни relay ни разу, хотя тот же телефон и тот же TURN уверенно отвечали
 * `ice-probe-runner.ts` (этап 0). Единственная системная разница между
 * пробой и обычным звонком — проба всегда строит `RTCIceServer` с ОДНИМ
 * URL на запись (`ice-probe.ts#buildProbePlan`, там это оптимизация «один
 * шаг — один транспорт», а не защита от этого бага, но эффект тот же),
 * обычный звонок передавал сырой ответ сервера как есть, смешивая схемы
 * (`turn:`/`turns:`) и разные `?transport=` в одном массиве одной записи.
 *
 * Разворачивает такой список в плоский — по одной записи на URL, с теми же
 * `username`/`credential`, но только у `turn:`/`turns:` (у `stun:` они не
 * нужны и ничего не должны означать). Дублирующиеся URL схлопываются.
 */
export interface NormalizedIceServer {
  urls: string[];
  username?: string;
  credential?: string;
}

export function normalizeIceServers(servers: ChatIceServerDto[]): NormalizedIceServer[] {
  const result: NormalizedIceServer[] = [];
  const seen = new Set<string>();
  for (const server of servers) {
    for (const url of server.urls) {
      if (seen.has(url)) continue;
      seen.add(url);
      const isTurn = url.startsWith('turn:') || url.startsWith('turns:');
      const entry: NormalizedIceServer = { urls: [url] };
      if (isTurn && server.username) entry.username = server.username;
      if (isTurn && server.credential) entry.credential = server.credential;
      result.push(entry);
    }
  }
  return result;
}

export interface IceServerLogSummary {
  scheme: string;
  transport: string | null;
  hasUsername: boolean;
  hasCredential: boolean;
}

/**
 * Описание ОДНОЙ нормализованной записи для `console.warn` (VED-222, живая
 * проверка BUG C: коордиатор просил залогировать реально переданную
 * конфигурацию без секретов) — ни хоста, ни порта, ни самих значений
 * username/credential, только схема (`stun`/`turn`/`turns`), заявленный
 * транспорт (`?transport=...`, если есть) и факт наличия учётки.
 */
export function describeIceServerForLog(entry: NormalizedIceServer): IceServerLogSummary {
  const url = entry.urls[0] ?? '';
  const scheme = /^([a-z]+):/.exec(url)?.[1] ?? 'unknown';
  const transport = /transport=([a-z]+)/i.exec(url)?.[1]?.toLowerCase() ?? null;
  return {
    scheme,
    transport,
    hasUsername: Boolean(entry.username),
    hasCredential: Boolean(entry.credential),
  };
}
