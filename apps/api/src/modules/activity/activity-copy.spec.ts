import { buildActivityTitle, isActivityFeedAction } from './activity-copy';

describe('isActivityFeedAction', () => {
  it('accepts the public actions shown in the friends feed', () => {
    expect(isActivityFeedAction('motivation.favorite-added')).toBe(true);
    expect(isActivityFeedAction('library.entry-created')).toBe(true);
    expect(isActivityFeedAction('market.listing-created')).toBe(true);
    expect(isActivityFeedAction('market.listing-favorited')).toBe(true);
    expect(isActivityFeedAction('notices.notice-created')).toBe(true);
  });

  // Граница проходит по публичности результата, а не по числу сервисов:
  // переписка и дата рождения приватны, и в чужой ленте им делать нечего.
  it('rejects private actions', () => {
    expect(isActivityFeedAction('chat.message-sent')).toBe(false);
    expect(isActivityFeedAction('astro.birth-data-saved')).toBe(false);
  });
});

describe('buildActivityTitle', () => {
  it('names the section for a like without a title', () => {
    expect(buildActivityTitle('motivation.favorite-added', undefined)).toBe(
      'Лайк публикации во Вдохновении',
    );
  });

  it('quotes the entry title when the publisher sent one', () => {
    expect(
      buildActivityTitle('library.entry-created', 'Бхагавад-гита как она есть'),
    ).toBe('Новый материал: «Бхагавад-гита как она есть»');
    expect(buildActivityTitle('library.entry-created', undefined)).toBe(
      'Новый материал в Образовании',
    );
  });

  it('distinguishes a new listing from a liked one', () => {
    expect(buildActivityTitle('market.listing-created', 'Мала из туласи')).toBe(
      'Новое объявление: «Мала из туласи»',
    );
    expect(
      buildActivityTitle('market.listing-favorited', 'Мала из туласи'),
    ).toBe('Лайк лота «Мала из туласи»');
  });

  // Обе карточки говорят о новой записи, но словом «объявление» уже подписан
  // лот Рынка — в одной полосе они обязаны читаться по-разному.
  it('does not repeat the market wording for a notices card', () => {
    const market = buildActivityTitle(
      'market.listing-created',
      'Мала из туласи',
    );
    const notice = buildActivityTitle(
      'notices.notice-created',
      'Нужны руки на переезд',
    );
    expect(notice).toBe('Новое на доске: «Нужны руки на переезд»');
    expect(notice.startsWith('Новое объявление')).toBe(false);
    expect(notice).not.toBe(market);
    expect(buildActivityTitle('notices.notice-created', undefined)).toBe(
      'Новая запись на доске объявлений',
    );
  });

  it('truncates an overlong title with an ellipsis', () => {
    const long = 'а'.repeat(120);
    const title = buildActivityTitle('library.entry-created', long);
    expect(title.endsWith('…»')).toBe(true);
    expect(title.length).toBeLessThan(long.length);
  });
});

describe('buildActivityTitle — Музыка', () => {
  // «Лайк» уже занят Вдохновением и Рынком: третье одинаковое начало в одной
  // бегущей полосе человек не различит.
  it('does not start a music card with the word already used twice', () => {
    const title = buildActivityTitle(
      'music.track-favorited',
      'Джая Радха-Мадхава',
    );
    expect(title).toBe('В избранное: «Джая Радха-Мадхава»');
    expect(title.startsWith('Лайк')).toBe(false);
  });

  it('names the playlist and falls back without a title', () => {
    expect(
      buildActivityTitle('music.playlist-published', 'Вечерняя арати'),
    ).toBe('Плейлист «Вечерняя арати»');
    expect(buildActivityTitle('music.playlist-published', undefined)).toBe(
      'Новый плейлист в Музыке',
    );
  });

  it('accepts both music actions into the feed', () => {
    expect(isActivityFeedAction('music.track-favorited')).toBe(true);
    expect(isActivityFeedAction('music.playlist-published')).toBe(true);
  });
});
