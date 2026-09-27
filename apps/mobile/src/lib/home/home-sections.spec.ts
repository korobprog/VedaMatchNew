import {
  HOME_SECTIONS,
  HOME_SECTIONS_DEFAULT,
  parseHomeSections,
  serializeHomeSections,
  shownHomeSections,
  withHomeSection,
} from './home-sections';

describe('что показывать на главной: умолчания', () => {
  it('блог-лента по умолчанию выключена, конференция и статусы — включены', () => {
    expect(HOME_SECTIONS_DEFAULT).toEqual({ quickConference: true, statuses: true, blog: false });
  });

  it('выбора не было — умолчания, и лента в «Чатах» не рисуется', () => {
    const sections = parseHomeSections(null);
    expect(shownHomeSections(sections, { hasUser: true })).toEqual(['quickConference', 'statuses']);
  });

  it('у каждой галочки есть подпись и пояснение, ключи не повторяются', () => {
    const keys = HOME_SECTIONS.map((section) => section.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys.sort()).toEqual(Object.keys(HOME_SECTIONS_DEFAULT).sort());
    for (const section of HOME_SECTIONS) {
      expect(section.label.trim()).not.toBe('');
      expect(section.note.trim().length).toBeGreaterThan(10);
    }
  });
});

describe('что показывать на главной: выбор человека', () => {
  it('включил ленту — она встаёт последней, под статусами, как на экране', () => {
    const sections = withHomeSection(HOME_SECTIONS_DEFAULT, 'blog', true);
    expect(shownHomeSections(sections, { hasUser: true })).toEqual(['quickConference', 'statuses', 'blog']);
  });

  it('всё выключено — над беседами пусто', () => {
    let sections = { ...HOME_SECTIONS_DEFAULT };
    for (const { key } of HOME_SECTIONS) sections = withHomeSection(sections, key, false);
    expect(shownHomeSections(sections, { hasUser: true })).toEqual([]);
  });

  it('статусы без профиля не рисуются: «Мой статус» не из чего собрать', () => {
    expect(shownHomeSections(HOME_SECTIONS_DEFAULT, { hasUser: false })).toEqual(['quickConference']);
  });

  it('то же значение — тот же объект: подписчики не дёргаются зря', () => {
    expect(withHomeSection(HOME_SECTIONS_DEFAULT, 'statuses', true)).toBe(HOME_SECTIONS_DEFAULT);
    expect(withHomeSection(HOME_SECTIONS_DEFAULT, 'statuses', false)).not.toBe(HOME_SECTIONS_DEFAULT);
  });
});

describe('что показывать на главной: хранение', () => {
  it('записанное читается обратно как было', () => {
    const sections = { quickConference: false, statuses: true, blog: true };
    expect(parseHomeSections(serializeHomeSections(sections))).toEqual(sections);
  });

  it('галочки, которой в записи нет, получают умолчание, а не «выключено»', () => {
    expect(parseHomeSections('{"blog":true}')).toEqual({ quickConference: true, statuses: true, blog: true });
  });

  it('мусор и чужие ключи не ломают чтение', () => {
    expect(parseHomeSections('not json')).toEqual(HOME_SECTIONS_DEFAULT);
    expect(parseHomeSections('[true]')).toEqual(HOME_SECTIONS_DEFAULT);
    expect(parseHomeSections('{"blog":"yes","statuses":0,"extra":true}')).toEqual(HOME_SECTIONS_DEFAULT);
    expect(JSON.parse(serializeHomeSections({ ...HOME_SECTIONS_DEFAULT, extra: true } as never))).not.toHaveProperty('extra');
  });
});
