import {
  catalogArtistCondition,
  catalogOnlyCondition,
} from './music-audiobook-scope';

describe('catalogOnlyCondition', () => {
  // Главная ловушка: у полутора сотен записей прода исполнитель не
  // проставлен, а условие по вложенной связи для пустой связи не совпадает
  // ни с чем. Без `artistId: null` они молча исчезли бы из каталога.
  it('каталог оставляет записи без исполнителя', () => {
    expect(catalogOnlyCondition().AND[0]).toEqual({
      OR: [{ artistId: null }, { artist: { isAudiobook: false } }],
    });
  });

  // VED-297: книга — самостоятельная единица, и её глава в Медиатеке не
  // показывается, чей бы исполнитель на ней ни стоял.
  it('глава книги в каталог не попадает', () => {
    expect(catalogOnlyCondition().AND[1]).toEqual({
      audiobookChapter: { is: null },
    });
  });

  it('оба признака складываются через AND, а не перетирают друг друга', () => {
    expect(Object.keys(catalogOnlyCondition())).toEqual(['AND']);
    expect(catalogOnlyCondition().AND).toHaveLength(2);
  });
});

describe('catalogArtistCondition', () => {
  it('карточки чтецов на витрину Медиатеки не идут', () => {
    expect(catalogArtistCondition()).toEqual({ isAudiobook: false });
  });
});
