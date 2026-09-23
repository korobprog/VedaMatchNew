import {
  PLAYER_SETTINGS_DEFAULTS,
  parsePlayerSettingsPatch,
  playerSettingsFromRow,
} from './music-player-settings';

describe('parsePlayerSettingsPatch', () => {
  it('берёт только присланное', () => {
    expect(parsePlayerSettingsPatch({ seekBackSeconds: 30 })).toEqual({
      patch: { seekBackSeconds: 30 },
    });
    expect(parsePlayerSettingsPatch({ autoplay: false })).toEqual({
      patch: {},
    });
  });

  it('принимает все шаги из списка', () => {
    for (const step of [5, 10, 15, 30, 60]) {
      expect(parsePlayerSettingsPatch({ seekForwardSeconds: step })).toEqual({
        patch: { seekForwardSeconds: step },
      });
    }
  });

  it.each([0, -15, 37, 15.5, '15', null, Number.NaN])(
    'шаг %p отвергает',
    (value) => {
      expect(
        parsePlayerSettingsPatch({ seekBackSeconds: value as never }),
      ).toHaveProperty('error');
    },
  );

  it('выключатели — только булевы', () => {
    expect(
      parsePlayerSettingsPatch({
        playerShowSeek: true,
        playerShowBookmark: false,
        playerShowHistory: true,
      }),
    ).toEqual({
      patch: {
        playerShowSeek: true,
        playerShowBookmark: false,
        playerShowHistory: true,
      },
    });
    expect(
      parsePlayerSettingsPatch({ playerShowHistory: 'yes' as never }),
    ).toHaveProperty('error');
  });
});

describe('playerSettingsFromRow', () => {
  it('шаг вне списка заменяет умолчанием, остальное отдаёт как есть', () => {
    expect(
      playerSettingsFromRow({
        ...PLAYER_SETTINGS_DEFAULTS,
        seekBackSeconds: 45,
        seekForwardSeconds: 60,
        playerShowSeek: true,
      }),
    ).toEqual({
      ...PLAYER_SETTINGS_DEFAULTS,
      seekBackSeconds: 15,
      seekForwardSeconds: 60,
      playerShowSeek: true,
    });
  });
});
