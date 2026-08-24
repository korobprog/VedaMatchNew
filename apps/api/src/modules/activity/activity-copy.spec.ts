import { buildActivityTitle, isActivityFeedAction } from './activity-copy';

describe('isActivityFeedAction', () => {
  it('accepts the four actions shown in the friends feed', () => {
    expect(isActivityFeedAction('motivation.favorite-added')).toBe(true);
    expect(isActivityFeedAction('library.entry-created')).toBe(true);
    expect(isActivityFeedAction('market.listing-created')).toBe(true);
    expect(isActivityFeedAction('market.listing-favorited')).toBe(true);
  });

  it('rejects actions kept out of the feed for now', () => {
    expect(isActivityFeedAction('chat.message-sent')).toBe(false);
    expect(isActivityFeedAction('notices.notice-created')).toBe(false);
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

  it('truncates an overlong title with an ellipsis', () => {
    const long = 'а'.repeat(120);
    const title = buildActivityTitle('library.entry-created', long);
    expect(title.endsWith('…»')).toBe(true);
    expect(title.length).toBeLessThan(long.length);
  });
});
