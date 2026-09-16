import {
  AUDIO_ROUTE_LABELS,
  currentRouteLabel,
  parseAudioRouteEvent,
  shouldShowRoutePicker,
} from './audio-route';

describe('parseAudioRouteEvent', () => {
  it('разбирает обычный payload с двумя устройствами', () => {
    expect(
      parseAudioRouteEvent({
        availableAudioDeviceList: '["SPEAKER_PHONE","EARPIECE"]',
        selectedAudioDevice: 'EARPIECE',
      }),
    ).toEqual({ available: ['SPEAKER_PHONE', 'EARPIECE'], selected: 'EARPIECE' });
  });

  it('пустой selectedAudioDevice — нет выбора', () => {
    expect(
      parseAudioRouteEvent({ availableAudioDeviceList: '["SPEAKER_PHONE"]', selectedAudioDevice: '' }),
    ).toEqual({ available: ['SPEAKER_PHONE'], selected: null });
  });

  it('битый JSON — пустой список, не падает', () => {
    expect(parseAudioRouteEvent({ availableAudioDeviceList: '[oops', selectedAudioDevice: 'EARPIECE' })).toEqual({
      available: [],
      selected: 'EARPIECE',
    });
  });

  it('незнакомое имя устройства отфильтровывается', () => {
    expect(
      parseAudioRouteEvent({ availableAudioDeviceList: '["SPEAKER_PHONE","USB"]', selectedAudioDevice: 'USB' }),
    ).toEqual({ available: ['SPEAKER_PHONE'], selected: null });
  });

  it('поля отсутствуют вовсе — пустое состояние', () => {
    expect(parseAudioRouteEvent({})).toEqual({ available: [], selected: null });
  });
});

describe('shouldShowRoutePicker', () => {
  it('два устройства и меньше — простой переключатель, без пикера', () => {
    expect(shouldShowRoutePicker({ available: ['SPEAKER_PHONE', 'EARPIECE'], selected: null })).toBe(false);
    expect(shouldShowRoutePicker({ available: ['SPEAKER_PHONE'], selected: null })).toBe(false);
  });

  it('подключён Bluetooth — три маршрута, показать пикер', () => {
    expect(
      shouldShowRoutePicker({ available: ['SPEAKER_PHONE', 'EARPIECE', 'BLUETOOTH'], selected: null }),
    ).toBe(true);
  });
});

describe('currentRouteLabel', () => {
  it('есть выбор от библиотеки — его подпись', () => {
    expect(currentRouteLabel({ available: [], selected: 'BLUETOOTH' }, false)).toBe(AUDIO_ROUTE_LABELS.BLUETOOTH);
  });

  it('выбора ещё нет, видеозвонок по умолчанию — громкая связь', () => {
    expect(currentRouteLabel({ available: [], selected: null }, true)).toBe(AUDIO_ROUTE_LABELS.SPEAKER_PHONE);
  });

  it('выбора ещё нет, аудиозвонок по умолчанию — телефон', () => {
    expect(currentRouteLabel({ available: [], selected: null }, false)).toBe(AUDIO_ROUTE_LABELS.EARPIECE);
  });
});
