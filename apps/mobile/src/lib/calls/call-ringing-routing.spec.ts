import { routeRingingEvent, type RingingRoutingInput } from './call-ringing-routing';

const base: RingingRoutingInput = {
  platform: 'android',
  appState: 'background',
  phase: 'idle',
  isCallee: true,
};

describe('routeRingingEvent', () => {
  // ---- VED-358: живая поломка «в приложении нет окна «Принять»» ----

  it('телефон с погашенным экраном: нативный экран И машина состояний', () => {
    // Ровно та поломка: раньше обработчик потока поднимал нативный экран и
    // выходил из обработки события. Полноэкранный intent тут же выводил
    // приложение на передний план, а приложение про звонок не знало — ни
    // баннера, ни кнопки «Принять». В браузере (нативного пути нет) окно
    // было.
    expect(routeRingingEvent(base)).toEqual({ showNative: true, trackInMachine: true });
  });

  it('свёрнуто (inactive) — тоже нативный экран и тоже машина', () => {
    expect(routeRingingEvent({ ...base, appState: 'inactive' })).toEqual({
      showNative: true,
      trackInMachine: true,
    });
  });

  it('приложение на переднем плане — свой баннер, нативный экран не нужен', () => {
    expect(routeRingingEvent({ ...base, appState: 'active' })).toEqual({
      showNative: false,
      trackInMachine: true,
    });
  });

  it('iOS: нативного модуля звонков нет — остаётся машина', () => {
    expect(routeRingingEvent({ ...base, platform: 'ios' })).toEqual({
      showNative: false,
      trackInMachine: true,
    });
  });

  it('свой же исходящий с другого устройства — Telecom поднимать нечем', () => {
    // Принимать тут нечего; с самим событием машина разберётся сама
    // (VED-346, `startedHere`).
    expect(routeRingingEvent({ ...base, isCallee: false })).toEqual({
      showNative: false,
      trackInMachine: true,
    });
  });

  it('поверх идущего разговора нативный экран не поднимаем, событие всё равно отдаём', () => {
    for (const phase of ['outgoing', 'incoming', 'connecting', 'active', 'ended'] as const)
      expect(routeRingingEvent({ ...base, phase })).toEqual({
        showNative: false,
        trackInMachine: true,
      });
  });

  it('машина узнаёт о звонке при любом сочетании — «мимо машины» не бывает', () => {
    // Сторож самого правила VED-358: нативный экран — способ дозвониться
    // мимо приложения, а не повод скрыть звонок от приложения.
    for (const platform of ['android', 'ios', 'web'])
      for (const appState of ['active', 'background', 'inactive'] as const)
        for (const phase of ['idle', 'incoming', 'active'] as const)
          for (const isCallee of [true, false])
            expect(
              routeRingingEvent({ platform, appState, phase, isCallee }).trackInMachine,
            ).toBe(true);
  });
});
