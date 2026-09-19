import type { NativeConnectionInfo } from '../../../modules/vedamatch-calls';
import {
  STALE_RING_AFTER_MS,
  SERVER_RING_TIMEOUT_MS,
  hasLiveOwnCall,
  isStaleConnection,
  selectConnectionsToEnd,
} from './stale-native-calls';

const conn = (callId: string, state: NativeConnectionInfo['state'], ageMs: number): NativeConnectionInfo => ({
  callId,
  state,
  ageMs,
});

describe('isStaleConnection', () => {
  it('порог выше серверного таймера дозвона', () => {
    expect(STALE_RING_AFTER_MS).toBeGreaterThan(SERVER_RING_TIMEOUT_MS);
  });

  it('звонящий моложе порога — жив', () => {
    expect(isStaleConnection(conn('a', 'ringing', STALE_RING_AFTER_MS - 1))).toBe(false);
  });

  it('звонящий на пороге — застрял', () => {
    expect(isStaleConnection(conn('a', 'ringing', STALE_RING_AFTER_MS))).toBe(true);
  });

  it('набирающий исходящий старше порога — застрял', () => {
    expect(isStaleConnection(conn('a', 'dialing', STALE_RING_AFTER_MS + 1))).toBe(true);
  });

  it('идущий разговор и удержание по возрасту не протухают', () => {
    expect(isStaleConnection(conn('a', 'active', 10 * STALE_RING_AFTER_MS))).toBe(false);
    expect(isStaleConnection(conn('a', 'holding', 10 * STALE_RING_AFTER_MS))).toBe(false);
  });
});

describe('hasLiveOwnCall', () => {
  it('без списка (старая нативная сторона) — сырой флаг', () => {
    expect(hasLiveOwnCall({ hasOwnCall: true, systemBusy: false })).toBe(true);
    expect(hasLiveOwnCall({ hasOwnCall: false, systemBusy: false })).toBe(false);
  });

  it('уже разъединённое соединение не занимает', () => {
    expect(hasLiveOwnCall({ hasOwnCall: true, systemBusy: false, ownCalls: [conn('a', 'disconnected', 1)] })).toBe(false);
  });
});

describe('selectConnectionsToEnd', () => {
  it('случай прода: сервер не знает звонков, соединение звонит шесть минут — гасить', () => {
    expect(
      selectConnectionsToEnd({
        connections: [conn('stuck', 'ringing', 6 * 60_000)],
        serverActiveCallId: null,
        localCallId: null,
        requestElapsedMs: 300,
      }),
    ).toEqual(['stuck']);
  });

  it('соединение старше запроса, о котором сервер не знает, — гасить даже если моложе порога', () => {
    expect(
      selectConnectionsToEnd({
        connections: [conn('gone', 'ringing', 5_000)],
        serverActiveCallId: null,
        localCallId: null,
        requestElapsedMs: 300,
      }),
    ).toEqual(['gone']);
  });

  it('звонок, который сервер считает активным, — оставить', () => {
    expect(
      selectConnectionsToEnd({
        connections: [conn('live', 'ringing', 5_000), conn('old', 'ringing', 90_000)],
        serverActiveCallId: 'live',
        localCallId: null,
        requestElapsedMs: 300,
      }),
    ).toEqual(['old']);
  });

  it('звонок, который ведёт сам провайдер, — оставить, даже если сервер его ещё не вернул', () => {
    expect(
      selectConnectionsToEnd({
        connections: [conn('mine', 'dialing', 2_000)],
        serverActiveCallId: null,
        localCallId: 'mine',
        requestElapsedMs: 300,
      }),
    ).toEqual([]);
  });

  it('соединение моложе запроса (входящий пришёл, пока ждали ответ) — не трогать', () => {
    expect(
      selectConnectionsToEnd({
        connections: [conn('fresh', 'ringing', 200)],
        serverActiveCallId: null,
        localCallId: null,
        requestElapsedMs: 800,
      }),
    ).toEqual([]);
  });

  it('застрявший гасится даже при медленном запросе', () => {
    expect(
      selectConnectionsToEnd({
        connections: [conn('stuck', 'ringing', STALE_RING_AFTER_MS)],
        serverActiveCallId: null,
        localCallId: null,
        requestElapsedMs: STALE_RING_AFTER_MS + 5_000,
      }),
    ).toEqual(['stuck']);
  });

  it('нет соединений — нечего гасить', () => {
    expect(
      selectConnectionsToEnd({ connections: [], serverActiveCallId: null, localCallId: null, requestElapsedMs: 0 }),
    ).toEqual([]);
  });
});
