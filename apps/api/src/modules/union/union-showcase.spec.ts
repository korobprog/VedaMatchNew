import { toShowcaseDraft, type ShowcaseCandidate } from './union-showcase';

function candidate(
  overrides: Partial<ShowcaseCandidate> = {},
  user: Partial<ShowcaseCandidate['user']> = {},
): ShowcaseCandidate {
  return {
    showcaseOptIn: true,
    showcaseBlockedAt: null,
    isActive: true,
    privacy: { photo: 'everyone', age: 'everyone', city: 'everyone' },
    interests: ['Йога', 'Киртан', 'Аюрведа', 'Санскрит'],
    ...overrides,
    user: {
      id: 'user-1',
      name: 'Александра',
      spiritualName: null,
      about: 'Йогиня с восьмилетним опытом.',
      birthDate: new Date('1998-01-01T00:00:00.000Z'),
      homeLocation: { city: 'Москва', country: 'Россия' },
      accountStatus: 'active',
      photoVerifiedAt: new Date('2026-08-01T00:00:00.000Z'),
      photos: [
        {
          id: 'photo-1',
          storageKey: 'union/photo-1.jpg',
          width: 1080,
          height: 1350,
        },
      ],
      ...user,
    },
  };
}

describe('toShowcaseDraft', () => {
  it('собирает карточку согласившегося участника', () => {
    const draft = toShowcaseDraft(candidate());

    expect(draft?.photo).toMatchObject({
      id: 'photo-1',
      storageKey: 'union/photo-1.jpg',
    });
    expect(draft?.card).toMatchObject({
      id: 'user-1',
      name: 'Александра',
      city: 'Москва',
      country: 'Россия',
    });
    expect(draft?.card.age).toBeGreaterThan(0);
  });

  it('показывает духовное имя, когда оно есть', () => {
    const draft = toShowcaseDraft(
      candidate({}, { spiritualName: 'Ананда д.д.' }),
    );

    expect(draft?.card.name).toBe('Ананда д.д.');
  });

  it('оставляет не больше трёх интересов', () => {
    const draft = toShowcaseDraft(candidate());

    expect(draft?.card.interests).toEqual(['Йога', 'Киртан', 'Аюрведа']);
  });

  describe('не пускает на витрину', () => {
    it('без согласия участника', () => {
      expect(toShowcaseDraft(candidate({ showcaseOptIn: false }))).toBeNull();
    });

    it('снятого администрацией', () => {
      expect(
        toShowcaseDraft(candidate({ showcaseBlockedAt: new Date() })),
      ).toBeNull();
    });

    it('со скрытой анкетой', () => {
      expect(toShowcaseDraft(candidate({ isActive: false }))).toBeNull();
    });

    it('с заблокированным аккаунтом', () => {
      expect(
        toShowcaseDraft(candidate({}, { accountStatus: 'blocked' })),
      ).toBeNull();
    });

    it('без проверки фото администрацией', () => {
      expect(
        toShowcaseDraft(candidate({}, { photoVerifiedAt: null })),
      ).toBeNull();
    });

    it('без единой фотографии', () => {
      expect(toShowcaseDraft(candidate({}, { photos: [] }))).toBeNull();
    });

    it.each(['after_match', 'hidden'] as const)(
      'с фото на уровне приватности %s',
      (photo) => {
        expect(toShowcaseDraft(candidate({ privacy: { photo } }))).toBeNull();
      },
    );

    it('когда приватность фото вообще не выставлена', () => {
      expect(toShowcaseDraft(candidate({ privacy: null }))).toBeNull();
    });
  });

  describe('сужает карточку настройками приватности', () => {
    it('прячет возраст, закрытый до мэтча', () => {
      const draft = toShowcaseDraft(
        candidate({ privacy: { photo: 'everyone', age: 'after_match' } }),
      );

      expect(draft?.card.age).toBeNull();
    });

    it('прячет город, закрытый до мэтча', () => {
      const draft = toShowcaseDraft(
        candidate({ privacy: { photo: 'everyone', city: 'after_match' } }),
      );

      expect(draft?.card.city).toBeNull();
      expect(draft?.card.country).toBeNull();
    });
  });

  describe('«О себе»', () => {
    it('обрезает длинный текст многоточием', () => {
      const draft = toShowcaseDraft(candidate({}, { about: 'а'.repeat(300) }));

      expect(draft?.card.about).toHaveLength(161);
      expect(draft?.card.about?.endsWith('…')).toBe(true);
    });

    it('оставляет короткий текст как есть', () => {
      const draft = toShowcaseDraft(candidate({}, { about: 'Практикую йогу.' }));

      expect(draft?.card.about).toBe('Практикую йогу.');
    });

    it('пустую строку отдаёт как отсутствие текста', () => {
      const draft = toShowcaseDraft(candidate({}, { about: '   ' }));

      expect(draft?.card.about).toBeNull();
    });
  });
});
