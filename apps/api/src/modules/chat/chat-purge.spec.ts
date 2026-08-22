import { orphanStorageKeys } from './chat-purge';

describe('orphanStorageKeys', () => {
  it('отдаёт ключи, на которые больше никто не ссылается', () => {
    expect(orphanStorageKeys(['chat/a.webp', 'chat/b.webp'], [])).toEqual([
      'chat/a.webp',
      'chat/b.webp',
    ]);
  });

  it('щадит файл, который переслали в чужую переписку', () => {
    // Пересылка копирует вложение вместе с ключом: объект в бакете один на
    // обе копии, и удалять его вместе с автором нельзя.
    expect(
      orphanStorageKeys(['chat/a.webp', 'chat/b.webp'], ['chat/b.webp']),
    ).toEqual(['chat/a.webp']);
  });

  it('не спотыкается о вложения без файла: снимок карточки хранится строками', () => {
    expect(orphanStorageKeys([null, 'chat/a.webp', null], [null])).toEqual([
      'chat/a.webp',
    ]);
  });

  it('повторы схлопывает: один объект — одно удаление', () => {
    expect(orphanStorageKeys(['chat/a.webp', 'chat/a.webp'], [])).toEqual([
      'chat/a.webp',
    ]);
  });
});
