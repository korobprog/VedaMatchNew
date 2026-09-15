import type { ContactsCardDto } from '@vedamatch/shared';
import { appendNextPage, buildPeopleSearchQuery, debounce, directoryEmptyMessage, isStaleSearch } from './people-search-state';

function card(userId: string): ContactsCardDto {
  return {
    userId,
    name: `Человек ${userId}`,
    headline: null,
    statusLine: null,
    about: null,
    offers: null,
    avatarUrl: null,
    city: null,
    country: null,
    age: null,
    languages: [],
    ashram: null,
    format: 'any',
    spiritualStage: null,
    isVerifiedDevotee: false,
    isPhotoVerified: false,
    tags: [],
    contacts: null,
  };
}

describe('debounce', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('вызывает функцию один раз после серии быстрых вызовов', () => {
    const fn = jest.fn();
    const debounced = debounce(fn, 350);

    debounced('a');
    jest.advanceTimersByTime(100);
    debounced('b');
    jest.advanceTimersByTime(100);
    debounced('c');
    expect(fn).not.toHaveBeenCalled();

    jest.advanceTimersByTime(350);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith('c');
  });

  it('cancel() не даёт отложенному вызову выполниться', () => {
    const fn = jest.fn();
    const debounced = debounce(fn, 350);

    debounced('a');
    debounced.cancel();
    jest.advanceTimersByTime(1000);
    expect(fn).not.toHaveBeenCalled();
  });
});

describe('isStaleSearch', () => {
  it('устаревшим считается любой запрос, кроме самого последнего', () => {
    expect(isStaleSearch(1, 2)).toBe(true);
    expect(isStaleSearch(2, 2)).toBe(false);
  });
});

describe('buildPeopleSearchQuery', () => {
  it('пустой запрос без q, страницы 1 и без pageSize — пустая строка', () => {
    expect(buildPeopleSearchQuery({})).toBe('');
    expect(buildPeopleSearchQuery({ q: '  ', page: 1 })).toBe('');
  });

  it('обрезает q и опускает первую страницу', () => {
    expect(buildPeopleSearchQuery({ q: '  Москва  ', page: 1, pageSize: 20 })).toBe('?q=%D0%9C%D0%BE%D1%81%D0%BA%D0%B2%D0%B0&pageSize=20');
  });

  it('передаёт page со второй страницы', () => {
    expect(buildPeopleSearchQuery({ page: 2 })).toBe('?page=2');
  });
});

describe('appendNextPage', () => {
  it('приклеивает новую страницу без дублей по userId', () => {
    const current = [card('a'), card('b')];
    const next = [card('b'), card('c')];
    expect(appendNextPage(current, next).map((item) => item.userId)).toEqual(['a', 'b', 'c']);
  });

  it('пустая следующая страница ничего не меняет', () => {
    const current = [card('a')];
    expect(appendNextPage(current, [])).toEqual(current);
  });
});

describe('directoryEmptyMessage', () => {
  it('разный текст для пустого и заполненного поля поиска', () => {
    expect(directoryEmptyMessage('')).toBe('В справочнике пока никого нет.');
    expect(directoryEmptyMessage('   ')).toBe('В справочнике пока никого нет.');
    expect(directoryEmptyMessage('Москва')).toBe('Ничего не нашлось. Попробуйте другое имя или город.');
  });
});
