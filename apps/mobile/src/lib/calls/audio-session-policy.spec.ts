import { isAudioSessionLive, shouldEnableProximity } from './audio-session-policy';

describe('isAudioSessionLive', () => {
  it('connecting и active — сессия жива', () => {
    expect(isAudioSessionLive('connecting')).toBe(true);
    expect(isAudioSessionLive('active')).toBe(true);
  });

  it('idle/outgoing/incoming/ended — сессии ещё/уже нет', () => {
    expect(isAudioSessionLive('idle')).toBe(false);
    expect(isAudioSessionLive('outgoing')).toBe(false);
    expect(isAudioSessionLive('incoming')).toBe(false);
    expect(isAudioSessionLive('ended')).toBe(false);
  });
});

describe('shouldEnableProximity', () => {
  it('аудио, active, экран виден, earpiece — включить', () => {
    expect(shouldEnableProximity('active', 'audio', true, 'EARPIECE')).toBe(true);
  });

  it('аудио, connecting (уже захвачен микрофон), экран виден, earpiece — включить', () => {
    expect(shouldEnableProximity('connecting', 'audio', true, 'EARPIECE')).toBe(true);
  });

  it('маршрут ещё неизвестен (null) — трактуется как earpiece по умолчанию', () => {
    expect(shouldEnableProximity('active', 'audio', true, null)).toBe(true);
  });

  it('видеозвонок — никогда, даже на earpiece', () => {
    expect(shouldEnableProximity('active', 'video', true, 'EARPIECE')).toBe(false);
  });

  it('громкая связь — выключить', () => {
    expect(shouldEnableProximity('active', 'audio', true, 'SPEAKER_PHONE')).toBe(false);
  });

  it('Bluetooth/наушники — выключить', () => {
    expect(shouldEnableProximity('active', 'audio', true, 'BLUETOOTH')).toBe(false);
    expect(shouldEnableProximity('active', 'audio', true, 'WIRED_HEADSET')).toBe(false);
  });

  it('экран звонка не виден (свернули «назад») — выключить, даже на earpiece', () => {
    expect(shouldEnableProximity('active', 'audio', false, 'EARPIECE')).toBe(false);
  });

  it('разговор ещё не идёт (гудки) — выключить', () => {
    expect(shouldEnableProximity('outgoing', 'audio', true, 'EARPIECE')).toBe(false);
    expect(shouldEnableProximity('incoming', 'audio', true, 'EARPIECE')).toBe(false);
  });

  it('разговор кончился — выключить', () => {
    expect(shouldEnableProximity('ended', 'audio', true, 'EARPIECE')).toBe(false);
  });
});
