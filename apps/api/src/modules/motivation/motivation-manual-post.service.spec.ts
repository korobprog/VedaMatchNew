import { MotivationManualPostService } from './motivation-manual-post.service';
import type { MotivationManualPostInput } from '@vedamatch/shared';

const validInput: MotivationManualPostInput = {
  originalText: 'Не сдавайся на полпути.',
  originalLanguage: 'ru',
  author: 'Шрила Прабхупада',
  copy: {
    title: 'Идти до конца',
    explanation: 'Пояснение своими словами, достаточно длинное для карточки.',
  },
  profileTypes: ['devotee'],
  audienceTrack: 'vaishnava',
};

function setup(overrides: { existingQuote?: { id: string } | null } = {}) {
  const transaction = {
    motivationQuote: { create: jest.fn().mockResolvedValue({ id: 'quote-1' }) },
    motivationPost: { create: jest.fn().mockResolvedValue({ id: 'post-1' }) },
  };
  const prisma = {
    motivationQuote: {
      findUnique: jest.fn().mockResolvedValue(overrides.existingQuote ?? null),
    },
    $transaction: jest.fn((callback: (tx: typeof transaction) => unknown) =>
      callback(transaction),
    ),
  };
  const categories = {
    resolveSlug: jest.fn().mockResolvedValue('verified_quote'),
  };
  const moderation = {
    approveText: jest
      .fn()
      .mockResolvedValue({ id: 'post-1', reviewStatus: 'image_queued' }),
  };
  const service = new MotivationManualPostService(
    prisma as never,
    categories as never,
    moderation as never,
  );
  return { service, prisma, transaction, categories, moderation };
}

function postData(transaction: ReturnType<typeof setup>['transaction']) {
  return transaction.motivationPost.create.mock.calls[0][0].data;
}

describe('MotivationManualPostService', () => {
  it('sends the post straight to image generation', async () => {
    const { service, transaction, moderation } = setup();

    const result = await service.create('admin', 'actor-1', validInput);

    // Пост заводится в text_review и тем же путём, что и сгенерированный,
    // проходит одобрение текста — ради промпта и записи в аудите.
    expect(postData(transaction).reviewStatus).toBe('text_review');
    expect(moderation.approveText).toHaveBeenCalledWith(
      'admin',
      'actor-1',
      'post-1',
      undefined,
    );
    expect(result).toEqual({
      quoteId: 'quote-1',
      postId: 'post-1',
      reviewStatus: 'image_queued',
    });
  });

  it('glues the quote and the explanation the way the pipeline does', async () => {
    const { service, transaction } = setup();

    await service.create('admin', 'actor-1', validInput);

    const russian = postData(transaction).translations.create.find(
      (item: { language: string }) => item.language === 'ru',
    );
    expect(russian.text).toBe(
      'Не сдавайся на полпути.\n\nПояснение своими словами, достаточно длинное для карточки.',
    );
    expect(russian.title).toBe('Идти до конца');
  });

  it('fills untranslated languages from the primary copy', async () => {
    const { service, transaction } = setup();

    await service.create('admin', 'actor-1', {
      ...validInput,
      translations: {
        en: { title: 'Go all the way', explanation: 'An English explanation.' },
      },
    });

    const byLanguage = Object.fromEntries(
      postData(transaction).translations.create.map(
        (item: { language: string; title: string }) => [item.language, item.title],
      ),
    );
    expect(byLanguage).toEqual({
      ru: 'Идти до конца',
      // Заполненный перевод берётся как есть, незаполненный — из основного,
      // иначе карточка у читателя с этим языком была бы пустой.
      en: 'Go all the way',
      hi: 'Идти до конца',
    });
  });

  it('ignores a half-filled translation instead of publishing a blank title', async () => {
    const { service, transaction } = setup();

    await service.create('admin', 'actor-1', {
      ...validInput,
      translations: { en: { title: 'Go all the way', explanation: '  ' } },
    });

    const english = postData(transaction).translations.create.find(
      (item: { language: string }) => item.language === 'en',
    );
    expect(english.title).toBe('Идти до конца');
  });

  it('stores a quote translation only for the original language', async () => {
    const { service, transaction } = setup();

    await service.create('admin', 'actor-1', validInput);

    const created = transaction.motivationQuote.create.mock.calls[0][0].data;
    expect(created.translations.create).toEqual([
      {
        language: 'ru',
        quoteText: 'Не сдавайся на полпути.',
        translationKind: 'official',
        label: null,
      },
    ]);
  });

  it('falls back to the explanation when no Stories text is given', async () => {
    const { service, transaction } = setup();

    await service.create('admin', 'actor-1', validInput);

    const russian = postData(transaction).translations.create.find(
      (item: { language: string }) => item.language === 'ru',
    );
    expect(russian.storyText).toBe(validInput.copy.explanation);
  });

  it('records every chosen audience on the quote', async () => {
    const { service, transaction } = setup();

    await service.create('admin', 'actor-1', {
      ...validInput,
      profileTypes: ['devotee', 'yogi', 'devotee'],
    });

    const created = transaction.motivationQuote.create.mock.calls[0][0].data;
    expect(created.profiles.create).toEqual([
      { profileType: 'devotee' },
      { profileType: 'yogi' },
    ]);
    expect(postData(transaction).profileType).toBe('devotee');
  });

  it.each([
    ['originalText', { originalText: '  ' }, 'Quote text and author are required'],
    ['author', { author: '' }, 'Quote text and author are required'],
    [
      'title',
      { copy: { title: '', explanation: 'text' } },
      'Title and explanation are required',
    ],
    ['audience', { profileTypes: [] }, 'Pick at least one audience'],
    ['unknown audience', { profileTypes: ['ghost'] as never }, 'Unknown audience'],
    ['track', { audienceTrack: 'nowhere' as never }, 'Unknown audience track'],
    ['language', { originalLanguage: 'fr' }, 'Unsupported original language'],
    ['date', { contentDate: 'вчера' }, 'Invalid content date'],
  ])('rejects a bad %s', async (_name, patch, message) => {
    const { service, transaction } = setup();

    await expect(
      service.create('admin', 'actor-1', { ...validInput, ...patch }),
    ).rejects.toThrow(message);
    expect(transaction.motivationPost.create).not.toHaveBeenCalled();
  });

  it('refuses a duplicate quote', async () => {
    const { service, transaction } = setup({ existingQuote: { id: 'existing' } });

    await expect(
      service.create('admin', 'actor-1', validInput),
    ).rejects.toThrow('This quote has already been added');
    expect(transaction.motivationPost.create).not.toHaveBeenCalled();
  });

  it('requires an admin or service-admin role', async () => {
    const { service } = setup();

    await expect(
      service.create('user', 'actor-1', validInput),
    ).rejects.toThrow();
  });
});
