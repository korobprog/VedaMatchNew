import type { CallPhase } from './call-machine';
import { backMinimizesCall, shouldShowReturnBanner } from './call-screen-return';

const ALL_PHASES: CallPhase[] = ['idle', 'outgoing', 'incoming', 'connecting', 'active', 'ended'];

describe('backMinimizesCall', () => {
  it('дозвон и разговор — сворачивает', () => {
    expect(backMinimizesCall('outgoing')).toBe(true);
    expect(backMinimizesCall('connecting')).toBe(true);
    expect(backMinimizesCall('active')).toBe(true);
  });

  it('idle/incoming/ended — нечего сворачивать', () => {
    expect(backMinimizesCall('idle')).toBe(false);
    expect(backMinimizesCall('incoming')).toBe(false);
    expect(backMinimizesCall('ended')).toBe(false);
  });
});

describe('shouldShowReturnBanner', () => {
  it('звонок идёт и экран не виден — показать плашку', () => {
    for (const phase of ['outgoing', 'connecting', 'active'] as const) {
      expect(shouldShowReturnBanner(phase, false)).toBe(true);
    }
  });

  it('экран виден — плашка не нужна, даже если звонок идёт', () => {
    for (const phase of ['outgoing', 'connecting', 'active'] as const) {
      expect(shouldShowReturnBanner(phase, true)).toBe(false);
    }
  });

  it('idle/incoming/ended — плашка не показывается независимо от видимости экрана', () => {
    for (const phase of ['idle', 'incoming', 'ended'] as const) {
      expect(shouldShowReturnBanner(phase, false)).toBe(false);
      expect(shouldShowReturnBanner(phase, true)).toBe(false);
    }
  });

  it('перебор всех фаз не бросает и не даёт true вне трёх «живых»', () => {
    for (const phase of ALL_PHASES) {
      const result = shouldShowReturnBanner(phase, false);
      expect(result).toBe(['outgoing', 'connecting', 'active'].includes(phase));
    }
  });
});
