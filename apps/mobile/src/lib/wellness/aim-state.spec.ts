import {
  AIM_HOLD_MS,
  AIM_STATES,
  HELP_AFTER_MS,
  MANUAL_AFTER_MS,
  aimState,
  describeAim,
  scanHelp,
  type AimState,
} from './aim-state';

const NOW = 1_000_000;

describe('aimState', () => {
  it('камера ничего не декодировала — красная', () => {
    expect(aimState({ sawAt: null, now: NOW, lookup: 'idle' })).toBe('searching');
  });

  it('код декодирован, но не сошёлся — жёлтая «вижу, но не прочитал»', () => {
    expect(aimState({ sawAt: NOW, now: NOW, lookup: 'idle' })).toBe('unstable');
  });

  it('код принят — зелёная', () => {
    expect(aimState({ sawAt: null, now: NOW, lookup: 'pending' })).toBe('read');
    expect(aimState({ sawAt: null, now: NOW, lookup: 'done' })).toBe('read');
  });

  it('зелёная не откатывается в жёлтую, когда кадр уже пустой', () => {
    expect(
      aimState({ sawAt: NOW - 10_000, now: NOW, lookup: 'pending' }),
    ).toBe('read');
  });

  describe('удержание жёлтой после неудачной попытки', () => {
    it('в пределах паузы остаётся жёлтой', () => {
      expect(
        aimState({ sawAt: NOW - AIM_HOLD_MS, now: NOW, lookup: 'idle' }),
      ).toBe('unstable');
    });

    it('за пределами паузы краснеет', () => {
      expect(
        aimState({ sawAt: NOW - AIM_HOLD_MS - 1, now: NOW, lookup: 'idle' }),
      ).toBe('searching');
    });

    it('пауза не нулевая — иначе рамка мигает в такт дрожанию руки', () => {
      expect(AIM_HOLD_MS).toBeGreaterThanOrEqual(300);
    });

    it('и не настолько длинная, чтобы жёлтая врала секундами', () => {
      expect(AIM_HOLD_MS).toBeLessThanOrEqual(2000);
    });
  });
});

describe('describeAim', () => {
  it('цвета состояний не повторяются: красная, жёлтая, зелёная', () => {
    expect(AIM_STATES.map((state) => describeAim(state).tone)).toEqual([
      'danger',
      'warning',
      'success',
    ]);
  });

  it.each(AIM_STATES)('«%s» назван словами, а не только цветом', (state) => {
    const copy = describeAim(state);
    expect(copy.title.length).toBeGreaterThan(0);
    expect(copy.hint.length).toBeGreaterThan(10);
    expect(copy.accessibilityLabel.length).toBeGreaterThan(copy.title.length);
  });

  it('красная говорит, что делать, а не только что не так', () => {
    expect(describeAim('searching').hint).toContain('рамк');
  });

  it('жёлтая объясняет, почему не прочиталось', () => {
    expect(describeAim('unstable').hint).toContain('ближе');
  });

  it('подписи состояний различимы между собой', () => {
    const titles = AIM_STATES.map((state) => describeAim(state).title);
    expect(new Set(titles).size).toBe(AIM_STATES.length);
  });

  it('ни в одной подписи нет названия цвета', () => {
    // «Загорелась зелёная рамка» ничего не говорит тому, кто её не видит, и
    // ничего не говорит тому, кто не отличает её от красной.
    for (const state of AIM_STATES) {
      const copy = describeAim(state);
      const text =
        `${copy.title} ${copy.hint} ${copy.accessibilityLabel}`.toLowerCase();
      for (const color of ['зелен', 'зелён', 'красн', 'жёлт', 'желт']) {
        expect(text).not.toContain(color);
      }
    }
  });

  it('состояния перечислены полностью', () => {
    const all: AimState[] = ['searching', 'unstable', 'read'];
    expect([...AIM_STATES].sort()).toEqual(all.sort());
  });
});

describe('scanHelp', () => {
  const at = (ms: number) => scanHelp({ startedAt: 0, now: ms, lookup: 'idle' });

  it('в первые секунды молчит: человек ещё наводит', () => {
    expect(at(0)).toEqual({ hints: [], offerManual: false });
    expect(at(HELP_AFTER_MS - 1).hints).toEqual([]);
  });

  it('после паузы подсказывает, начиная с фонарика', () => {
    const help = at(HELP_AFTER_MS);
    expect(help.hints.length).toBeGreaterThan(0);
    expect(help.hints[0]).toContain('фонарик');
    expect(help.offerManual).toBe(false);
  });

  it('пока ручного ввода нет на экране, про него и не советуют', () => {
    const help = at(HELP_AFTER_MS);
    expect(help.hints.join(' ')).not.toContain('вручную');
  });

  it('дальше открывает ручной ввод сам и советует его', () => {
    const help = at(MANUAL_AFTER_MS);
    expect(help.offerManual).toBe(true);
    expect(help.hints.at(-1)).toContain('вручную');
  });

  it('прочитанный код отменяет помощь — советы только отвлекают', () => {
    expect(scanHelp({ startedAt: 0, now: 60_000, lookup: 'pending' })).toEqual({
      hints: [],
      offerManual: false,
    });
    expect(scanHelp({ startedAt: 0, now: 60_000, lookup: 'done' }).offerManual).toBe(
      false,
    );
  });

  it('помощь приходит раньше, чем ручной ввод, и обе — в разумный срок', () => {
    expect(HELP_AFTER_MS).toBeLessThan(MANUAL_AFTER_MS);
    expect(HELP_AFTER_MS).toBeGreaterThanOrEqual(5_000);
    expect(MANUAL_AFTER_MS).toBeLessThanOrEqual(20_000);
  });

  it('советы не повторяются', () => {
    const hints = at(MANUAL_AFTER_MS).hints;
    expect(new Set(hints).size).toBe(hints.length);
  });
});
