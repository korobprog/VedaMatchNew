import { ICE_RESTART_DEBOUNCE_MS, shouldRestartIceOnNetworkChange } from './ice-restart-policy';

const T0 = 1_000_000;

describe('shouldRestartIceOnNetworkChange', () => {
  it('wifi → cellular во время разговора, звонивший, нет предыдущего рестарта — перезапустить', () => {
    expect(shouldRestartIceOnNetworkChange('active', 'caller', 'wifi', 'cellular', T0, null)).toBe(true);
  });

  it('cellular → wifi во время разговора, звонивший — перезапустить', () => {
    expect(shouldRestartIceOnNetworkChange('active', 'caller', 'cellular', 'wifi', T0, null)).toBe(true);
  });

  it('транспорт не поменялся — не перезапускать', () => {
    expect(shouldRestartIceOnNetworkChange('active', 'caller', 'wifi', 'wifi', T0, null)).toBe(false);
  });

  it('первое известное значение сети — не смена, не перезапускать', () => {
    expect(shouldRestartIceOnNetworkChange('active', 'caller', null, 'wifi', T0, null)).toBe(false);
  });

  it('сеть пропала совсем — ждать таймер обрыва, не перезапускать', () => {
    expect(shouldRestartIceOnNetworkChange('active', 'caller', 'wifi', 'none', T0, null)).toBe(false);
  });

  it('разговор ещё не идёт (дозвон) — не перезапускать', () => {
    expect(shouldRestartIceOnNetworkChange('connecting', 'caller', 'wifi', 'cellular', T0, null)).toBe(false);
    expect(shouldRestartIceOnNetworkChange('outgoing', 'caller', 'wifi', 'cellular', T0, null)).toBe(false);
  });

  it('звонок уже кончился — не перезапускать', () => {
    expect(shouldRestartIceOnNetworkChange('ended', 'caller', 'wifi', 'cellular', T0, null)).toBe(false);
  });

  it('вызываемая сторона: не перезапускает сама — асимметрия offer/answer', () => {
    expect(shouldRestartIceOnNetworkChange('active', 'callee', 'wifi', 'cellular', T0, null)).toBe(false);
  });

  describe('дебаунс (feedback-001.md этого этапа, non-blocking п.1)', () => {
    it('вторая смена сразу после первой (флаппинг) — не перезапускать', () => {
      const lastRestartAt = T0;
      const now = T0 + ICE_RESTART_DEBOUNCE_MS - 1;
      expect(shouldRestartIceOnNetworkChange('active', 'caller', 'wifi', 'cellular', now, lastRestartAt)).toBe(
        false,
      );
    });

    it('смена ровно на границе интервала — уже можно', () => {
      const lastRestartAt = T0;
      const now = T0 + ICE_RESTART_DEBOUNCE_MS;
      expect(shouldRestartIceOnNetworkChange('active', 'caller', 'wifi', 'cellular', now, lastRestartAt)).toBe(true);
    });

    it('смена спустя долгое время после прошлого рестарта — можно', () => {
      const lastRestartAt = T0;
      const now = T0 + ICE_RESTART_DEBOUNCE_MS * 10;
      expect(shouldRestartIceOnNetworkChange('active', 'caller', 'wifi', 'cellular', now, lastRestartAt)).toBe(true);
    });

    it('рестартов ещё не было (lastRestartAtMs === null) — дебаунс не мешает первому', () => {
      expect(shouldRestartIceOnNetworkChange('active', 'caller', 'wifi', 'cellular', T0, null)).toBe(true);
    });
  });
});
