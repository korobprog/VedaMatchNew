import type { ProfileLocation } from '@vedamatch/shared';
import {
  buildCreateCommunityRequest,
  emptyCommunityDraft,
  isValidLocation,
  locationLabel,
  shouldSearchGeo,
  validateCommunityDraft,
  type CommunityDraft,
} from './community-draft';

const minsk: ProfileLocation = { city: 'Минск', country: 'Беларусь', lat: 53.9, lon: 27.56, displayName: 'Минск, Беларусь' };

function draft(extra: Partial<CommunityDraft> = {}): CommunityDraft {
  return { ...emptyCommunityDraft(), name: 'Минская ятра', location: minsk, ...extra };
}

describe('emptyCommunityDraft', () => {
  it('по умолчанию — ятра по заявке, как в форме сайта', () => {
    const empty = emptyCommunityDraft();
    expect(empty.kind).toBe('yatra');
    expect(empty.joinPolicy).toBe('request_approval');
  });
});

describe('validateCommunityDraft', () => {
  it('без названия — текст сервера', () => {
    expect(validateCommunityDraft(draft({ name: '   ' }))).toBe('Укажите название общины');
  });

  it('название длиннее 120 символов не проходит', () => {
    expect(validateCommunityDraft(draft({ name: 'я'.repeat(121) }))).toBe('Название длиннее 120 символов');
  });

  it('ровно 120 символов — допустимо', () => {
    expect(validateCommunityDraft(draft({ name: 'я'.repeat(120) }))).toBeNull();
  });

  it('описание длиннее 4000 символов не проходит', () => {
    expect(validateCommunityDraft(draft({ description: 'о'.repeat(4001) }))).toBe('Описание длиннее 4000 символов');
  });

  it('адрес длиннее 300 символов не проходит', () => {
    expect(validateCommunityDraft(draft({ address: 'а'.repeat(301) }))).toBe('Адрес длиннее 300 символов');
  });

  it('город без координат — ошибка, а не молчаливая отправка', () => {
    expect(validateCommunityDraft(draft({ location: { city: 'Минск', lat: Number.NaN, lon: 27.56 } }))).toBe(
      'Город указан неверно',
    );
  });

  it('города нет вовсе — это допустимо, поле необязательное', () => {
    expect(validateCommunityDraft(draft({ location: null }))).toBeNull();
  });

  it('заполненный черновик ошибок не даёт', () => {
    expect(validateCommunityDraft(draft())).toBeNull();
  });
});

describe('isValidLocation', () => {
  it('город с координатами в пределах глобуса — годится', () => {
    expect(isValidLocation(minsk)).toBe(true);
  });

  it('широта за пределами диапазона не годится', () => {
    expect(isValidLocation({ ...minsk, lat: 91 })).toBe(false);
  });

  it('долгота за пределами диапазона не годится', () => {
    expect(isValidLocation({ ...minsk, lon: -181 })).toBe(false);
  });

  it('пустое название города не годится', () => {
    expect(isValidLocation({ ...minsk, city: '  ' })).toBe(false);
  });

  it('города нет — не годится', () => {
    expect(isValidLocation(null)).toBe(false);
  });
});

describe('buildCreateCommunityRequest', () => {
  it('обрезает пробелы и не шлёт пустые описание и адрес', () => {
    const request = buildCreateCommunityRequest(draft({ name: '  Минская ятра  ', description: '  ', address: '' }));
    expect(request.name).toBe('Минская ятра');
    expect(request.descriptionRu).toBeNull();
    expect(request.address).toBeNull();
  });

  it('несёт тип, порядок вступления и город', () => {
    const request = buildCreateCommunityRequest(draft({ kind: 'temple', joinPolicy: 'open' }));
    expect(request.kind).toBe('temple');
    expect(request.joinPolicy).toBe('open');
    expect(request.location).toEqual(minsk);
  });
});

describe('shouldSearchGeo', () => {
  it('одна буква — не ищем', () => {
    expect(shouldSearchGeo('М', null)).toBe(false);
  });

  it('две буквы — ищем', () => {
    expect(shouldSearchGeo('Ми', null)).toBe(true);
  });

  it('в поле стоит уже выбранный город — второй раз не ищем', () => {
    expect(shouldSearchGeo('Минск, Беларусь', minsk)).toBe(false);
  });

  it('человек правит выбранный город — ищем снова', () => {
    expect(shouldSearchGeo('Минск, Бел', minsk)).toBe(true);
  });

  it('пробелы не считаются за буквы', () => {
    expect(shouldSearchGeo('   ', null)).toBe(false);
  });
});

describe('locationLabel', () => {
  it('берёт полное название из геокодера', () => {
    expect(locationLabel(minsk)).toBe('Минск, Беларусь');
  });

  it('без полного названия собирает «город, страна»', () => {
    expect(locationLabel({ city: 'Минск', country: 'Беларусь', lat: 1, lon: 1 })).toBe('Минск, Беларусь');
  });

  it('города нет — подписи нет', () => {
    expect(locationLabel(null)).toBeNull();
  });
});
