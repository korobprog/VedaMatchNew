import {
  MOMENT_FANOUT_LIMIT,
  denyMomentView,
  momentFanout,
  type MomentViewerFacts,
} from './moments-access';

const NOBODY: MomentViewerFacts = {
  isAuthor: false,
  isGrantee: false,
  isCompanion: false,
  hidden: false,
  expired: false,
};

describe('видимость момента', () => {
  it('автор видит свой момент', () => {
    expect(denyMomentView('contacts', { ...NOBODY, isAuthor: true })).toBeNull();
  });

  it('тот, кому открыли активность, видит момент для собеседников', () => {
    expect(denyMomentView('contacts', { ...NOBODY, isGrantee: true })).toBeNull();
  });

  it('собеседник видит момент для собеседников', () => {
    expect(denyMomentView('contacts', { ...NOBODY, isCompanion: true })).toBeNull();
  });

  it('посторонний не видит момент для собеседников', () => {
    expect(denyMomentView('contacts', NOBODY)).toBe('not_in_audience');
  });

  it('посторонний видит публичный момент', () => {
    expect(denyMomentView('everyone', NOBODY)).toBeNull();
  });

  it('скрытие перебивает даже публичность', () => {
    expect(denyMomentView('everyone', { ...NOBODY, hidden: true })).toBe('hidden');
  });

  it('скрытие перебивает авторство: заблокированному нечего показывать', () => {
    expect(
      denyMomentView('contacts', { ...NOBODY, isAuthor: true, hidden: true }),
    ).toBe('hidden');
  });

  it('сгоревший момент не виден даже автору', () => {
    expect(
      denyMomentView('contacts', { ...NOBODY, isAuthor: true, expired: true }),
    ).toBe('gone');
  });
});

describe('рассылка события', () => {
  it('публичный момент никому не рассылается', () => {
    expect(momentFanout('everyone', ['a', 'b'])).toEqual([]);
  });

  it('момент для собеседников уходит всей аудитории без повторов', () => {
    expect(momentFanout('contacts', ['a', 'b', 'a'])).toEqual(['a', 'b']);
  });

  it('слишком широкая аудитория события не получает', () => {
    const many = Array.from({ length: MOMENT_FANOUT_LIMIT + 1 }, (_, i) => `u${i}`);
    expect(momentFanout('contacts', many)).toEqual([]);
  });
});
