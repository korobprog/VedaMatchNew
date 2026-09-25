import fs from 'node:fs';
import path from 'node:path';
import { recommendationsQuery } from './recommendations-query';
import { UNION_COLLECTIONS, collectionByKey } from './union-collections';

describe('подборки', () => {
  it('ключи уникальны', () => {
    const keys = UNION_COLLECTIONS.map((collection) => collection.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  /**
   * Те же подборки, что на сайте: сравниваем строку запроса каждой с тем,
   * что записано у сайта. Цель там — старым `intention=`, у нас — `intentions`
   * (сервер понимает оба), поэтому цели сравниваются по значению.
   */
  it('совпадают с подборками сайта', () => {
    const web = fs.readFileSync(
      path.join(__dirname, '../../../../web/src/app/(portal)/union/collections/page.tsx'),
      'utf8',
    );
    const webQueries = [...web.matchAll(/query: "([^"]+)"/g)].map((match) => match[1].replace('intention=', 'intentions='));
    const mine = UNION_COLLECTIONS.map((collection) => recommendationsQuery(collection.filters).slice(1));
    expect(mine).toEqual(webQueries);
  });

  it('ключ из маршрута — подборка, чужой — без фильтра', () => {
    expect(collectionByKey('match')?.filters).toEqual({ minScore: 70 });
    expect(collectionByKey(['near'])?.title).toBe('Рядом');
    expect(collectionByKey('../hack')).toBeNull();
    expect(collectionByKey(undefined)).toBeNull();
  });
});
