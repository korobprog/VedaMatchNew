import { decideIncomingCallPresentation } from './incoming-call-presentation';

describe('decideIncomingCallPresentation', () => {
  it('фон/блокировка — всегда нативный путь, свой баннер и рингтон молчат', () => {
    for (const appState of ['background', 'inactive'] as const) {
      for (const source of ['push', 'sse'] as const) {
        expect(
          decideIncomingCallPresentation({ appState, source, nativeShownFor: false }),
        ).toEqual({ showNative: true, showInAppUi: false, playInAppRingtone: false });
      }
    }
  });

  it('фон/блокировка, нативный уже показан — не дублируем (дедуп по callId)', () => {
    expect(
      decideIncomingCallPresentation({ appState: 'background', source: 'push', nativeShownFor: true }),
    ).toEqual({ showNative: false, showInAppUi: false, playInAppRingtone: false });
  });

  it('передний план — свой баннер и рингтон, нативный не нужен', () => {
    expect(
      decideIncomingCallPresentation({ appState: 'active', source: 'sse', nativeShownFor: false }),
    ).toEqual({ showNative: false, showInAppUi: true, playInAppRingtone: true });
  });

  it('передний план, нативный уже был показан (звонили в фоне, потом открыли) — баннер не дублируем', () => {
    expect(
      decideIncomingCallPresentation({ appState: 'active', source: 'push', nativeShownFor: true }),
    ).toEqual({ showNative: false, showInAppUi: false, playInAppRingtone: false });
  });

  it('решение не зависит от source — push и sse дают одинаковый результат при равных остальных полях', () => {
    for (const appState of ['active', 'background', 'inactive', 'unknown'] as const) {
      for (const nativeShownFor of [true, false]) {
        const push = decideIncomingCallPresentation({ appState, source: 'push', nativeShownFor });
        const sse = decideIncomingCallPresentation({ appState, source: 'sse', nativeShownFor });
        expect(push).toEqual(sse);
      }
    }
  });
});
