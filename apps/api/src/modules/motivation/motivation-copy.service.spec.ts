import { BadGatewayException, NotFoundException } from '@nestjs/common';
import { MotivationCopyService } from './motivation-copy.service';

const originalText = 'Служение — это любовь.';

function validCopy() {
  return {
    originalText,
    profileTypes: ['devotee'],
    explanation: 'Эта цитата напоминает о бескорыстной заботе и внимании к другим.',
    translations: {
      ru: { quoteText: originalText, translationKind: 'official', label: null, title: 'Служение', explanation: 'Эта цитата напоминает о бескорыстной заботе.', storyText: 'Любовь в служении' },
      en: { quoteText: 'Service is love.', translationKind: 'vedamatch', label: 'Перевод VedaMatch', title: 'Service', explanation: 'The quote points to selfless care.', storyText: 'Love through service' },
      hi: { quoteText: 'सेवा प्रेम है।', translationKind: 'vedamatch', label: 'Перевод VedaMatch', title: 'सेवा', explanation: 'यह उद्धरण निःस्वार्थ देखभाल की याद दिलाता है।', storyText: 'सेवा में प्रेम' },
    },
  };
}

describe('MotivationCopyService', () => {
  const quote = {
    id: 'quote-1', originalText, originalLanguage: 'ru', author: 'Author', work: 'Work', locator: '1.1',
    sourceType: 'vedamatch_library', sourceUrl: null, contextExcerpt: `Контекст: ${originalText}`, verified: true,
  };

  function setup(copy = validCopy()) {
    const transaction = {
      motivationQuoteTranslation: { deleteMany: jest.fn(), createMany: jest.fn() },
      motivationQuoteProfile: { deleteMany: jest.fn(), createMany: jest.fn() },
      motivationPost: { create: jest.fn().mockResolvedValue({ id: 'post-1', reviewStatus: 'text_review' }) },
    };
    const prisma = {
      motivationPost: { findUnique: jest.fn().mockResolvedValue(null) },
      motivationQuote: { findUnique: jest.fn().mockResolvedValue(quote) },
      $transaction: jest.fn((callback: (tx: typeof transaction) => unknown) => callback(transaction)),
    };
    const generation = { generateVerifiedQuoteCopy: jest.fn().mockResolvedValue(copy), generateImage: jest.fn() };
    return { service: new MotivationCopyService(prisma as never, generation as never), prisma, transaction, generation };
  }

  it('classifies, restores the original and persists a text-review candidate', async () => {
    const { service, transaction, generation } = setup();
    const result = await service.prepareCandidate('quote-1');

    expect(result).toMatchObject({ id: 'post-1', reviewStatus: 'text_review' });
    expect(transaction.motivationQuoteProfile.createMany).toHaveBeenCalledWith({ data: [{ quoteId: 'quote-1', profileType: 'devotee' }] });
    expect(transaction.motivationQuoteTranslation.createMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.arrayContaining([
        expect.objectContaining({ language: 'ru', quoteText: originalText, translationKind: 'official' }),
        expect.objectContaining({ language: 'en', translationKind: 'vedamatch', label: 'Перевод VedaMatch' }),
      ]),
    }));
    expect(transaction.motivationPost.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      quoteId: 'quote-1', reviewStatus: 'text_review', sourceVerified: true, imageUrl: null, storyImageUrl: null, imagePrompt: null,
    }) });
    expect(generation.generateImage).not.toHaveBeenCalled();
  });

  it('returns an existing post for the quote without calling AI', async () => {
    const { service, prisma, generation } = setup();
    const existing = { id: 'post-existing', quoteId: 'quote-1', reviewStatus: 'text_review' };
    prisma.motivationPost = { findUnique: jest.fn().mockResolvedValue(existing) };

    await expect(service.prepareCandidate('quote-1')).resolves.toEqual(existing);

    expect(generation.generateVerifiedQuoteCopy).not.toHaveBeenCalled();
    expect(prisma.motivationQuote.findUnique).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it.each([
    [{ ...validCopy(), originalText: 'model changed it' }, 'modified original'],
    [{ ...validCopy(), profileTypes: ['unknown'] }, 'unknown profile'],
    [{ ...validCopy(), explanation: 'one\n\ntwo\n\nthree' }, 'one or two non-empty paragraphs'],
    [{ ...validCopy(), translations: { ...validCopy().translations, en: { ...validCopy().translations.en, label: null } } }, 'translation label'],
    [{ ...validCopy(), translations: { ...validCopy().translations, en: { ...validCopy().translations.en, translationKind: 'official' } } }, 'translation kind'],
    [{ ...validCopy(), translations: { ...validCopy().translations, en: { ...validCopy().translations.en, explanation: '' } } }, 'en explanation'],
    [{ ...validCopy(), translations: { ...validCopy().translations, hi: { ...validCopy().translations.hi, explanation: 'पहला पर्याप्त अनुच्छेद।\n\nदूसरा पर्याप्त अनुच्छेद।\n\nतीसरा पर्याप्त अनुच्छेद।' } } }, 'hi explanation'],
  ])('rejects invalid model output: %s', async (copy, message) => {
    const { service } = setup(copy as ReturnType<typeof validCopy>);
    await expect(service.prepareCandidate('quote-1')).rejects.toThrow(message);
  });

  it('rejects missing or unverified quotes before calling AI', async () => {
    const { service, prisma, generation } = setup();
    prisma.motivationQuote.findUnique.mockResolvedValue(null);
    await expect(service.prepareCandidate('missing')).rejects.toBeInstanceOf(NotFoundException);
    expect(generation.generateVerifiedQuoteCopy).not.toHaveBeenCalled();

    prisma.motivationQuote.findUnique.mockResolvedValue({ ...quote, verified: false });
    await expect(service.prepareCandidate('quote-1')).rejects.toBeInstanceOf(BadGatewayException);
  });
});
