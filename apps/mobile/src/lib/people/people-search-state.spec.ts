import type { ContactsCardDto } from '@vedamatch/shared';
import {
  appendNextPage,
  buildPeopleSearchQuery,
  canLoadMore,
  debounce,
  directoryEmptyMessage,
  isCurrentSearchGeneration,
  nextSearchBusy,
  nextSearchGeneration,
} from './people-search-state';

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

describe('nextSearchGeneration / isCurrentSearchGeneration', () => {
  it('ответ применим только пока поколение не сменилось новым поиском', () => {
    let generation = 0;
    generation = nextSearchGeneration(generation); // старт поиска A → поколение 1
    const searchAGeneration = generation;
    expect(isCurrentSearchGeneration(searchAGeneration, generation)).toBe(true);

    generation = nextSearchGeneration(generation); // пользователь набрал ещё — поиск B → поколение 2
    // Ответ на A пришёл после того, как B уже стартовал: устарел.
    expect(isCurrentSearchGeneration(searchAGeneration, generation)).toBe(false);
    // Ответ на B — по-прежнему актуальному поколению.
    expect(isCurrentSearchGeneration(generation, generation)).toBe(true);
  });

  it('подгрузка страницы не меняет поколение и не «отменяет» более новый поиск (раунд 004, дефект 3)', () => {
    let generation = 0;
    generation = nextSearchGeneration(generation); // поиск запущен → поколение 1
    const searchGeneration = generation;

    // Пока ответ поиска летит, пользователь докручивает СТАРУЮ выдачу —
    // подгрузка страницы запоминает то же поколение, не создаёт новое.
    const moreGeneration = generation;

    // Подгрузка страницы отвечает первой, поколение не поменялось.
    expect(isCurrentSearchGeneration(moreGeneration, generation)).toBe(true);
    // Затем приходит ответ поиска — тоже актуален, ничего не «отменяет».
    expect(isCurrentSearchGeneration(searchGeneration, generation)).toBe(true);
  });
});

describe('nextSearchBusy', () => {
  it('изменение текста поля всегда включает индикатор', () => {
    expect(nextSearchBusy(false, { type: 'input-changed' })).toBe(true);
    expect(nextSearchBusy(true, { type: 'input-changed' })).toBe(true);
  });

  it('ошибка поиска снимает индикатор так же, как успех (раунд 005, дефект 1)', () => {
    // Раньше индикатор считался по query !== appliedQuery, и appliedQuery не
    // обновлялся на ошибке — крутилка держалась вечно. `settled` не различает
    // исход, поэтому и успешный, и ошибочный ответ гасят её одинаково.
    expect(nextSearchBusy(true, { type: 'settled', generation: 1, currentGeneration: 1, mode: 'search' })).toBe(false);
    expect(nextSearchBusy(true, { type: 'settled', generation: 1, currentGeneration: 1, mode: 'refresh' })).toBe(false);
  });

  it('подгрузка страницы не трогает индикатор поиска', () => {
    expect(nextSearchBusy(true, { type: 'settled', generation: 1, currentGeneration: 1, mode: 'more' })).toBe(true);
    expect(nextSearchBusy(false, { type: 'settled', generation: 1, currentGeneration: 1, mode: 'more' })).toBe(false);
  });

  it('устаревший (не текущего поколения) ответ индикатор не гасит', () => {
    expect(nextSearchBusy(true, { type: 'settled', generation: 1, currentGeneration: 2, mode: 'search' })).toBe(true);
  });
});

describe('canLoadMore', () => {
  it('нельзя грузить дальше, пока текст в поле не совпал с применённым запросом', () => {
    expect(canLoadMore({ query: 'Моск', appliedQuery: 'Москва', hasMore: true, loadingMore: false })).toBe(false);
  });

  it('нельзя грузить дальше без hasMore или во время другой подгрузки', () => {
    expect(canLoadMore({ query: 'а', appliedQuery: 'а', hasMore: false, loadingMore: false })).toBe(false);
    expect(canLoadMore({ query: 'а', appliedQuery: 'а', hasMore: true, loadingMore: true })).toBe(false);
  });

  it('можно грузить дальше, когда запрос применён, есть следующая страница и подгрузка не идёт', () => {
    expect(canLoadMore({ query: 'Москва', appliedQuery: 'Москва', hasMore: true, loadingMore: false })).toBe(true);
    // Пробелы по краям не должны мешать сравнению.
    expect(canLoadMore({ query: ' Москва ', appliedQuery: 'Москва', hasMore: true, loadingMore: false })).toBe(true);
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
