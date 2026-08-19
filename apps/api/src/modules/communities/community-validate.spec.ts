import {
  COMMUNITY_DESCRIPTION_MAX_LENGTH,
  COMMUNITY_MEMBER_TITLE_MAX_LENGTH,
  COMMUNITY_NAME_MAX_LENGTH,
} from '@vedamatch/shared';
import {
  COMMUNITY_VALIDATION_MESSAGES,
  MAX_ADDRESS_LENGTH,
  isValidLocation,
  validateCommunity,
  validateMemberTitle,
} from './community-validate';

const valid = {
  kind: 'yatra' as const,
  name: 'Московская ятра',
  location: { city: 'Москва', lat: 55.75, lon: 37.62 },
};

describe('validateCommunity: создание', () => {
  it('пропускает заполненную карточку', () => {
    expect(validateCommunity(valid, { requireName: true })).toBeNull();
  });

  it('требует название и тип', () => {
    expect(
      validateCommunity({ ...valid, name: '   ' }, { requireName: true }),
    ).toBe('name_required');
    expect(
      validateCommunity({ ...valid, kind: null }, { requireName: true }),
    ).toBe('kind_invalid');
  });

  it('ловит длинные поля', () => {
    expect(
      validateCommunity(
        { ...valid, name: 'я'.repeat(COMMUNITY_NAME_MAX_LENGTH + 1) },
        { requireName: true },
      ),
    ).toBe('name_too_long');
    expect(
      validateCommunity(
        {
          ...valid,
          description: 'я'.repeat(COMMUNITY_DESCRIPTION_MAX_LENGTH + 1),
        },
        { requireName: true },
      ),
    ).toBe('description_too_long');
    expect(
      validateCommunity(
        { ...valid, address: 'я'.repeat(MAX_ADDRESS_LENGTH + 1) },
        { requireName: true },
      ),
    ).toBe('address_too_long');
  });

  it('отвергает неизвестный порядок вступления', () => {
    expect(
      validateCommunity(
        { ...valid, joinPolicy: 'whenever' as never },
        { requireName: true },
      ),
    ).toBe('join_policy_invalid');
  });
});

describe('validateCommunity: правка', () => {
  it('пустой патч ничего не ломает', () => {
    // PATCH без имени не значит «стереть имя».
    expect(validateCommunity({}, { requireName: false })).toBeNull();
  });

  it('но переданное пустое имя — это попытка стереть, и она отвергается', () => {
    expect(validateCommunity({ name: '' }, { requireName: false })).toBe(
      'name_required',
    );
  });
});

describe('isValidLocation', () => {
  it('половина координаты хуже отсутствующей', () => {
    expect(
      isValidLocation({ city: 'Москва', lat: 55.75, lon: Number.NaN }),
    ).toBe(false);
    expect(
      isValidLocation({
        city: 'Москва',
        lat: undefined as unknown as number,
        lon: 37.62,
      }),
    ).toBe(false);
  });

  it('держит границы диапазона', () => {
    expect(isValidLocation({ city: 'Полюс', lat: 90, lon: 180 })).toBe(true);
    expect(isValidLocation({ city: 'Никуда', lat: 91, lon: 0 })).toBe(false);
    expect(isValidLocation({ city: 'Никуда', lat: 0, lon: -181 })).toBe(false);
  });

  it('требует непустой город', () => {
    expect(isValidLocation({ city: '  ', lat: 55.75, lon: 37.62 })).toBe(false);
  });
});

describe('validateMemberTitle', () => {
  it('пустое служение допустимо', () => {
    expect(validateMemberTitle(null)).toBeNull();
    expect(validateMemberTitle('пуджари')).toBeNull();
  });

  it('длинное — нет', () => {
    expect(
      validateMemberTitle('я'.repeat(COMMUNITY_MEMBER_TITLE_MAX_LENGTH + 1)),
    ).toBe('title_too_long');
  });
});

describe('сообщения об ошибках', () => {
  it('есть на каждый код: наружу коды не отдаются', () => {
    const codes = Object.keys(COMMUNITY_VALIDATION_MESSAGES);
    expect(codes).toHaveLength(10);
    for (const code of codes) {
      expect(
        COMMUNITY_VALIDATION_MESSAGES[
          code as keyof typeof COMMUNITY_VALIDATION_MESSAGES
        ],
      ).toBeTruthy();
    }
  });
});
