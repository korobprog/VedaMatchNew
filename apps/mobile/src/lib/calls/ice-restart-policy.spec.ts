import { shouldRestartIceOnNetworkChange } from './ice-restart-policy';

describe('shouldRestartIceOnNetworkChange', () => {
  it('wifi → cellular во время разговора, звонивший — перезапустить', () => {
    expect(shouldRestartIceOnNetworkChange('active', 'caller', 'wifi', 'cellular')).toBe(true);
  });

  it('cellular → wifi во время разговора, звонивший — перезапустить', () => {
    expect(shouldRestartIceOnNetworkChange('active', 'caller', 'cellular', 'wifi')).toBe(true);
  });

  it('транспорт не поменялся — не перезапускать', () => {
    expect(shouldRestartIceOnNetworkChange('active', 'caller', 'wifi', 'wifi')).toBe(false);
  });

  it('первое известное значение сети — не смена, не перезапускать', () => {
    expect(shouldRestartIceOnNetworkChange('active', 'caller', null, 'wifi')).toBe(false);
  });

  it('сеть пропала совсем — ждать таймер обрыва, не перезапускать', () => {
    expect(shouldRestartIceOnNetworkChange('active', 'caller', 'wifi', 'none')).toBe(false);
  });

  it('разговор ещё не идёт (дозвон) — не перезапускать', () => {
    expect(shouldRestartIceOnNetworkChange('connecting', 'caller', 'wifi', 'cellular')).toBe(false);
    expect(shouldRestartIceOnNetworkChange('outgoing', 'caller', 'wifi', 'cellular')).toBe(false);
  });

  it('звонок уже кончился — не перезапускать', () => {
    expect(shouldRestartIceOnNetworkChange('ended', 'caller', 'wifi', 'cellular')).toBe(false);
  });

  it('вызываемая сторона: не перезапускает сама — асимметрия offer/answer', () => {
    expect(shouldRestartIceOnNetworkChange('active', 'callee', 'wifi', 'cellular')).toBe(false);
  });
});
