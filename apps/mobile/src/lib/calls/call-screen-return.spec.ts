import type { CallPhase } from './call-machine';
import {
  backMinimizesCall,
  nextNavigatedCallId,
  shouldAutoNavigateToCallScreen,
  shouldShowReturnBanner,
} from './call-screen-return';

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

describe('shouldAutoNavigateToCallScreen', () => {
  it('звонок в «экранной» фазе, ещё не показывался — да', () => {
    for (const phase of ['outgoing', 'connecting', 'active', 'ended'] as const) {
      expect(shouldAutoNavigateToCallScreen(phase, 'c1', null)).toBe(true);
      expect(shouldAutoNavigateToCallScreen(phase, 'c1', 'other-call')).toBe(true);
    }
  });

  it('этот же звонок уже показывался — нет, при любой фазе', () => {
    for (const phase of ['outgoing', 'connecting', 'active', 'ended'] as const) {
      expect(shouldAutoNavigateToCallScreen(phase, 'c1', 'c1')).toBe(false);
    }
  });

  it('idle/incoming — экрану нечего показывать, независимо от метки', () => {
    expect(shouldAutoNavigateToCallScreen('idle', 'c1', null)).toBe(false);
    expect(shouldAutoNavigateToCallScreen('incoming', 'c1', null)).toBe(false);
  });

  it('нет звонка — нет и перехода', () => {
    expect(shouldAutoNavigateToCallScreen('outgoing', null, null)).toBe(false);
  });
});

describe('nextNavigatedCallId', () => {
  it('экран стал виден — метка встаёт на текущий звонок', () => {
    expect(nextNavigatedCallId(true, 'c1', null)).toBe('c1');
    expect(nextNavigatedCallId(true, 'c1', 'stale')).toBe('c1');
  });

  it('экран ушёл с виду — метка не сбрасывается (сама суть фикса feedback-002.md)', () => {
    expect(nextNavigatedCallId(false, 'c1', 'c1')).toBe('c1');
    expect(nextNavigatedCallId(false, null, 'c1')).toBe('c1');
  });
});

/**
 * Сценарии из `feedback-002.md` — провайдер целиком не тестируется (сеть,
 * WebRTC, `expo-router`), но его решения о навигации — чистая функция двух
 * этих функций плюс `shouldShowReturnBanner`. Симулируем цикл
 * «фаза меняется → эффект решает, пушить ли → экран (если открылся)
 * сообщает о своей видимости» тем же порядком вызовов, что в
 * `call-provider.tsx`.
 */
describe('сценарии автоперехода (feedback-002.md)', () => {
  function simulate(events: Array<{ phase: CallPhase; screenMounted?: boolean }>) {
    const callId = 'c1';
    let navigatedCallId: string | null = null;
    const pushes: CallPhase[] = [];
    for (const event of events) {
      if (shouldAutoNavigateToCallScreen(event.phase, callId, navigatedCallId)) {
        navigatedCallId = callId;
        pushes.push(event.phase);
      }
      if (event.screenMounted !== undefined) {
        navigatedCallId = nextNavigatedCallId(event.screenMounted, callId, navigatedCallId);
      }
    }
    return { pushes, navigatedCallId };
  }

  it('назад → ответ собеседника: экран открылся один раз, повторно не выдёргивает', () => {
    const result = simulate([
      { phase: 'outgoing', screenMounted: true }, // провайдер пушит, экран монтируется
      { phase: 'outgoing', screenMounted: false }, // пользователь нажал «назад»
      { phase: 'connecting' }, // собеседник ответил, пользователь всё ещё в другом разделе
      { phase: 'active' },
    ]);
    expect(result.pushes).toEqual(['outgoing']);
  });

  it('назад → вернуться → ответ: повторного пуша на уже открытый экран нет', () => {
    const result = simulate([
      { phase: 'outgoing', screenMounted: true },
      { phase: 'outgoing', screenMounted: false }, // «назад»
      { phase: 'outgoing', screenMounted: true }, // «Вернуться» — прямой router.push мимо этой функции,
      // но экран сообщает о видимости точно так же
      { phase: 'connecting' }, // ответ, пока экран уже открыт вручную
      { phase: 'active' },
    ]);
    expect(result.pushes).toEqual(['outgoing']);
  });

  it('назад → ended: финал не выдёргивает пользователя из другого раздела', () => {
    const result = simulate([
      { phase: 'outgoing', screenMounted: true },
      { phase: 'outgoing', screenMounted: false }, // «назад»
      { phase: 'ended' }, // собеседник отклонил/не ответил, пока пользователь ушёл
    ]);
    expect(result.pushes).toEqual(['outgoing']);
  });

  it('входящий принят с баннера: экран для нового звонка открывается', () => {
    const result = simulate([
      { phase: 'incoming' }, // баннер, экран ещё не поднимался
      { phase: 'connecting' }, // «Ответить» на баннере
      { phase: 'active' },
    ]);
    expect(result.pushes).toEqual(['connecting']);
  });

  it('отказ в разрешении при «Ответить»: экран для ещё не показанного звонка поднимается на ended', () => {
    const result = simulate([{ phase: 'incoming' }, { phase: 'ended' }]);
    expect(result.pushes).toEqual(['ended']);
  });
});
