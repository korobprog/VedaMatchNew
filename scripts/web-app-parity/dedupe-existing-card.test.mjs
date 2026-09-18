import assert from 'node:assert/strict';
import { test } from 'node:test';
import { findExistingCard } from './dedupe-existing-card.mjs';

test('карточка есть → находит по id', () => {
  const cards = [
    { id: 'a1', title: 'ДОГНАТЬ. Рынок: новый фильтр' },
    { id: 'b2', title: 'СДЕЛАТЬ. Что-то другое' },
  ];
  assert.deepEqual(findExistingCard(cards, 'market'), { id: 'a1' });
});

test('карточки нет → null', () => {
  const cards = [{ id: 'b2', title: 'СДЕЛАТЬ. Что-то другое' }];
  assert.equal(findExistingCard(cards, 'market'), null);
});

test('пустой список карточек → null', () => {
  assert.equal(findExistingCard([], 'market'), null);
});

test('похожие, но разные сервисы не путаются — сравнение по префиксу, не по подстроке', () => {
  const cards = [{ id: 'm1', title: 'ДОГНАТЬ. marketplace: что-то' }];
  // 'market' даёт префикс «ДОГНАТЬ. Рынок:», карточка «ДОГНАТЬ. marketplace:»
  // содержит подстроку «market», но это не то же самое сравнение по префиксу.
  assert.equal(findExistingCard(cards, 'market'), null);
});

// Раунд 001, Н1: предыдущая версия этого файла не различала startsWith и
// includes — заголовок «ДОГНАТЬ. marketplace: …» выше не содержит префикс
// «ДОГНАТЬ. Рынок:» ни как подстроку, ни как префикс, поэтому обе
// реализации давали одинаковый (верный) результат. Здесь префикс есть
// именно как подстрока, но не в начале заголовка — startsWith должен дать
// null, includes ошибочно нашёл бы совпадение.
test('префикс где-то в середине заголовка — не совпадение (startsWith, а не includes)', () => {
  const cards = [{ id: 'x1', title: 'Черновик: ДОГНАТЬ. Рынок: старое' }];
  assert.equal(findExistingCard(cards, 'market'), null);
});

test('карточка сервиса без записи в маппинге ищется по слагу как есть', () => {
  const cards = [{ id: 'g1', title: 'ДОГНАТЬ. gitabase: старая правка' }];
  assert.deepEqual(findExistingCard(cards, 'gitabase'), { id: 'g1' });
});
