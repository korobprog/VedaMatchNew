import {
  audiobookArtistCondition,
  audiobookScopeCondition,
} from './music-audiobook-scope';

describe('audiobookScopeCondition', () => {
  it('раздел «Аудиокниги» — только записи отмеченных чтецов', () => {
    expect(audiobookScopeCondition('audiobooks')).toEqual({
      artist: { isAudiobook: true },
    });
  });

  // Главная ловушка: у полутора сотен записей прода исполнитель не
  // проставлен, а условие по вложенной связи для пустой связи не совпадает
  // ни с чем. Без `artistId: null` они молча исчезли бы из каталога.
  it('каталог оставляет записи без исполнителя', () => {
    expect(audiobookScopeCondition('catalog')).toEqual({
      OR: [{ artistId: null }, { artist: { isAudiobook: false } }],
    });
  });

  it('срезы не пересекаются: отмеченный чтец в каталог не попадает', () => {
    const catalog = audiobookScopeCondition('catalog');
    const audiobooks = audiobookScopeCondition('audiobooks');

    expect(catalog).not.toEqual(audiobooks);
    expect('OR' in catalog && catalog.OR[1]).toEqual({
      artist: { isAudiobook: false },
    });
  });
});

describe('audiobookArtistCondition', () => {
  it('карточки чтецов и карточки Медиатеки разведены отметкой', () => {
    expect(audiobookArtistCondition('audiobooks')).toEqual({
      isAudiobook: true,
    });
    expect(audiobookArtistCondition('catalog')).toEqual({
      isAudiobook: false,
    });
  });
});
