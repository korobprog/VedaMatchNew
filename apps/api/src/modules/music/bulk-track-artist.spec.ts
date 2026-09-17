import {
  BulkArtistError,
  cleanArtistName,
  MAX_BULK_TRACKS,
  planBulkArtist,
} from './bulk-track-artist';

describe('planBulkArtist', () => {
  it('имя — чистится и становится целью по имени', () => {
    expect(
      planBulkArtist({
        trackIds: ['t1', 't2', 't1'],
        artistName: '  Аиндра   дас ',
      }),
    ).toEqual({
      trackIds: ['t1', 't2'],
      target: { kind: 'name', name: 'Аиндра дас' },
    });
  });

  it('идентификатор — перенос к существующему', () => {
    expect(planBulkArtist({ trackIds: ['t1'], artistId: 'a1' })).toEqual({
      trackIds: ['t1'],
      target: { kind: 'id', artistId: 'a1' },
    });
  });

  it('artistId: null — снять исполнителя', () => {
    expect(planBulkArtist({ trackIds: ['t1'], artistId: null }).target).toEqual(
      { kind: 'clear' },
    );
  });

  it.each([
    [undefined, 'Пустой запрос'],
    [{ trackIds: [], artistName: 'X' }, 'Не выбрано'],
    [{ trackIds: [1], artistName: 'X' }, 'Неверный список'],
    [{ trackIds: ['t1'] }, 'Укажите исполнителя'],
    [
      { trackIds: ['t1'], artistId: 'a1', artistName: 'X' },
      'Укажите исполнителя',
    ],
    [{ trackIds: ['t1'], artistName: '   ' }, 'пустое'],
    [{ trackIds: ['t1'], artistName: 'я'.repeat(161) }, 'длиннее'],
    [{ trackIds: ['t1'], artistId: '' }, 'Неверный исполнитель'],
    [{ trackIds: ['t1'], artistName: 5 }, 'Неверное имя'],
  ])('отказывает: %j', (body, message) => {
    expect(() => planBulkArtist(body)).toThrow(BulkArtistError);
    expect(() => planBulkArtist(body)).toThrow(message);
  });

  it('держит потолок одного действия', () => {
    const trackIds = Array.from(
      { length: MAX_BULK_TRACKS + 1 },
      (_, i) => `t${i}`,
    );
    expect(() => planBulkArtist({ trackIds, artistName: 'X' })).toThrow(
      'не больше',
    );
  });
});

describe('cleanArtistName', () => {
  it('схлопывает пробелы', () => {
    expect(cleanArtistName(' A\t\tB  ')).toBe('A B');
  });
});
