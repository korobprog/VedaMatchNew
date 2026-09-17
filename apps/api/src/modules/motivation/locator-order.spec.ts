import {
  compareLocators,
  locatorKey,
  orderTieredWithinSlots,
  orderWithinSlots,
  sortByLocator,
} from './locator-order';

const sorted = (locators: (string | null)[]) =>
  [...locators].sort(compareLocators);

describe('compareLocators', () => {
  it('ставит стихи по номерам, а не по строке (пример из VED-125)', () => {
    expect(sorted(['2.14', '2.13', '1.25', '2.11'])).toEqual([
      '1.25',
      '2.11',
      '2.13',
      '2.14',
    ]);
  });

  it('десятая глава идёт после второй', () => {
    expect(sorted(['10.8', '2.47', '9.34', '18.66'])).toEqual([
      '2.47',
      '9.34',
      '10.8',
      '18.66',
    ]);
  });

  it('2.2 раньше 2.14', () => {
    expect(compareLocators('2.2', '2.14')).toBeLessThan(0);
  });

  it('глава целиком раньше её стихов', () => {
    expect(sorted(['2.1', '2'])).toEqual(['2', '2.1']);
  });

  it('диапазон стоит после первого стиха и по концу диапазона', () => {
    expect(sorted(['1.2-3', '1.3', '1.2', '1.2-5', '1.1'])).toEqual([
      '1.1',
      '1.2',
      '1.2-3',
      '1.2-5',
      '1.3',
    ]);
  });

  it('понимает длинное и короткое тире в диапазоне', () => {
    expect(locatorKey('16.13–14')).toMatchObject({
      numbers: [16, 13],
      rangeEnd: 14,
    });
    expect(locatorKey('16.13 — 14')).toMatchObject({
      numbers: [16, 13],
      rangeEnd: 14,
    });
  });

  it('трёхуровневые номера Бхагаватам', () => {
    expect(sorted(['1.2.6', '1.1.10', '10.1.1', '1.1.2'])).toEqual([
      '1.1.2',
      '1.1.10',
      '1.2.6',
      '10.1.1',
    ]);
  });

  it('части Чайтанья-чаритамриты — в порядке книги, а не алфавита', () => {
    expect(
      sorted(['Антья 4.1', 'Мадхья 20.108', 'Ади 7.5', 'Мадхья 8.2']),
    ).toEqual(['Ади 7.5', 'Мадхья 8.2', 'Мадхья 20.108', 'Антья 4.1']);
  });

  it('лилы узнаются и в латинице, и с дефисом', () => {
    expect(locatorKey('Madhya 20.108').section).toBe(2);
    expect(locatorKey('Ади-лила 1.1').section).toBe(1);
    expect(locatorKey('Антья-лила, 3.5').section).toBe(3);
  });

  it('слово «ади» внутри другого слова частью не считается', () => {
    expect(locatorKey('Прадипа 1.1').section).toBe(0);
  });

  it('слова «глава», «стих» и название книги порядок не сбивают', () => {
    expect(
      sorted(['Бхагавад-гита 2.14', 'Глава 2, стих 13', '2.12', 'Текст 1.25']),
    ).toEqual(['Текст 1.25', '2.12', 'Глава 2, стих 13', 'Бхагавад-гита 2.14']);
  });

  it('дефис в названии книги диапазоном не считается', () => {
    expect(locatorKey('Бхагавад-гита 2.14')).toMatchObject({
      numbers: [2, 14],
      rangeEnd: null,
    });
  });

  it('пустые локаторы — в конце', () => {
    expect(sorted([null, '3.1', '', '  ', '1.1'])).toEqual([
      '1.1',
      '3.1',
      null,
      '',
      '  ',
    ]);
  });

  it('локатор без номера — после пронумерованных, но раньше пустого', () => {
    expect(sorted([null, 'Предисловие', '18.66'])).toEqual([
      '18.66',
      'Предисловие',
      null,
    ]);
  });

  it('локаторы без номеров между собой — по тексту без регистра', () => {
    expect(compareLocators('введение', 'Предисловие')).toBeLessThan(0);
  });

  it('одинаковые номера разной записи дают полный порядок', () => {
    expect(compareLocators('2.13', 'Глава 2 стих 13')).not.toBe(0);
    expect(compareLocators('2.13', '2.13')).toBe(0);
  });

  it('полноширинные цифры нормализуются', () => {
    expect(locatorKey('２.１４').numbers).toEqual([2, 14]);
  });
});

describe('sortByLocator', () => {
  it('равные локаторы упорядочены по id', () => {
    const posts = [
      { id: 'b', attributionLocator: '2.13' },
      { id: 'a', attributionLocator: '2.13' },
      { id: 'c', attributionLocator: '1.1' },
    ];
    expect(sortByLocator(posts).map((post) => post.id)).toEqual([
      'c',
      'a',
      'b',
    ]);
  });

  it('не меняет входной массив', () => {
    const posts = [
      { id: 'a', attributionLocator: '2.14' },
      { id: 'b', attributionLocator: '2.13' },
    ];
    sortByLocator(posts);
    expect(posts[0].id).toBe('a');
  });
});

describe('orderWithinSlots', () => {
  const post = (id: string, work: string | null, locator: string | null) => ({
    id,
    work,
    attributionLocator: locator,
  });

  it('переставляет стихи одной книги только по её же местам', () => {
    const items = [
      post('g214', 'bg', '2.14'),
      post('x', null, null),
      post('s1', 'sb', '1.1.2'),
      post('g113', 'bg', '1.13'),
      post('s0', 'sb', '1.1.1'),
      post('g213', 'bg', '2.13'),
    ];
    expect(
      orderWithinSlots(items, (item) => item.work).map((item) => item.id),
    ).toEqual(['g113', 'x', 's0', 'g213', 's1', 'g214']);
  });

  it('посты без источника и одиночки стоят на месте', () => {
    const items = [
      post('a', null, '9.9'),
      post('b', 'only', '1.1'),
      post('c', null, '1.1'),
    ];
    expect(
      orderWithinSlots(items, (item) => item.work).map((item) => item.id),
    ).toEqual(['a', 'b', 'c']);
  });

  it('пустой список', () => {
    expect(orderWithinSlots([], () => 'x')).toEqual([]);
  });
});

describe('orderTieredWithinSlots', () => {
  const item = (id: string, locator: string, tier?: string) => ({
    post: { id, attributionLocator: locator },
    ...(tier ? { tier } : {}),
  });

  it('не переносит стих из яруса в ярус', () => {
    const items = [
      item('a', '2.14', 'fresh'),
      item('b', '2.13', 'fresh'),
      item('c', '2.20', 'unseen'),
      item('d', '1.1', 'seen'),
      item('e', '2.11', 'unseen'),
    ];
    expect(
      orderTieredWithinSlots(items, () => 'bg').map((i) => [i.post.id, i.tier]),
    ).toEqual([
      ['b', 'fresh'],
      ['a', 'fresh'],
      ['c', 'unseen'],
      ['d', 'seen'],
      ['e', 'unseen'],
    ]);
  });

  it('без ярусов — один общий блок', () => {
    const items = [item('a', '2.14'), item('b', '2.13'), item('c', '1.25')];
    expect(
      orderTieredWithinSlots(items, () => 'bg').map((i) => i.post.id),
    ).toEqual(['c', 'b', 'a']);
    expect(orderTieredWithinSlots(items, () => 'bg')[0]).not.toHaveProperty(
      'tier',
    );
  });
});
