import { BadRequestException } from '@nestjs/common';
import {
  parseCreatePlaceInput,
  parseHideReason,
  parseReportReason,
  parseTelegram,
  parseUpdatePlaceInput,
  parseWebsite,
} from './map-input';

const base = { kind: 'temple', name: '  Храм   Радхи  ', lat: 55.7, lng: 37.6 };

describe('parseCreatePlaceInput', () => {
  it('обязательные поля, trim и схлопывание пробелов в названии', () => {
    const out = parseCreatePlaceInput(base);
    expect(out.name).toBe('Храм Радхи');
    expect(out.description).toBe('');
    expect(out.lineage).toBeNull();
  });

  it('отклоняет неизвестный вид, короткое имя и кривые координаты', () => {
    expect(() => parseCreatePlaceInput({ ...base, kind: 'bar' })).toThrow(
      BadRequestException,
    );
    expect(() => parseCreatePlaceInput({ ...base, name: 'A' })).toThrow(
      BadRequestException,
    );
    expect(() => parseCreatePlaceInput({ ...base, lat: 91 })).toThrow(
      BadRequestException,
    );
    expect(() => parseCreatePlaceInput({ ...base, lng: -181 })).toThrow(
      BadRequestException,
    );
    expect(() => parseCreatePlaceInput({ ...base, lat: NaN })).toThrow(
      BadRequestException,
    );
    expect(() => parseCreatePlaceInput({ ...base, lat: '55' })).toThrow(
      BadRequestException,
    );
    expect(() => parseCreatePlaceInput(null)).toThrow(BadRequestException);
  });

  it('линия сохраняется у храма и сбрасывается у кафе', () => {
    expect(parseCreatePlaceInput({ ...base, lineage: 'iskcon' }).lineage).toBe(
      'iskcon',
    );
    expect(
      parseCreatePlaceInput({ ...base, kind: 'cafe', lineage: 'iskcon' })
        .lineage,
    ).toBeNull();
    expect(() => parseCreatePlaceInput({ ...base, lineage: 'nope' })).toThrow(
      BadRequestException,
    );
  });

  it('длинное описание отклоняется', () => {
    expect(() =>
      parseCreatePlaceInput({ ...base, description: 'а'.repeat(4001) }),
    ).toThrow(BadRequestException);
  });

  it('телефон обрезается по краям и ограничен 30 знаками', () => {
    expect(parseCreatePlaceInput({ ...base, phone: ' +7 900 ' }).phone).toBe(
      '+7 900',
    );
    expect(() =>
      parseCreatePlaceInput({ ...base, phone: '1'.repeat(31) }),
    ).toThrow(BadRequestException);
  });
});

describe('parseWebsite / parseTelegram', () => {
  it('сайт: только http(s)', () => {
    expect(parseWebsite('https://a.ru')).toBe('https://a.ru/');
    expect(parseWebsite('')).toBeNull();
    expect(() => parseWebsite('javascript:alert(1)')).toThrow(
      BadRequestException,
    );
    expect(() => parseWebsite('a.ru')).toThrow(BadRequestException);
  });

  it('Telegram нормализуется к @name', () => {
    expect(parseTelegram('@temple_msk')).toBe('@temple_msk');
    expect(parseTelegram('temple_msk')).toBe('@temple_msk');
    expect(parseTelegram('https://t.me/temple_msk')).toBe('@temple_msk');
    expect(parseTelegram(null)).toBeNull();
    expect(() => parseTelegram('a b')).toThrow(BadRequestException);
    expect(() => parseTelegram('https://t.me/+abcdef')).toThrow(
      BadRequestException,
    );
  });
});

describe('parseUpdatePlaceInput', () => {
  it('возвращает только присланные поля', () => {
    expect(parseUpdatePlaceInput({ name: 'Новое имя' })).toEqual({
      name: 'Новое имя',
    });
  });

  it('смена вида на не-общинный сбрасывает линию', () => {
    expect(parseUpdatePlaceInput({ kind: 'cafe' })).toEqual({
      kind: 'cafe',
      lineage: null,
    });
  });

  it('линия проверяется по текущему виду', () => {
    expect(
      parseUpdatePlaceInput({ lineage: 'iskcon' }, 'cafe').lineage,
    ).toBeNull();
    expect(parseUpdatePlaceInput({ lineage: 'iskcon' }, 'temple').lineage).toBe(
      'iskcon',
    );
  });

  it('пустая строка сбрасывает необязательное поле', () => {
    expect(parseUpdatePlaceInput({ website: '', city: '' })).toEqual({
      website: null,
      city: null,
    });
  });
});

describe('причины', () => {
  it('жалоба: 5..1000 знаков', () => {
    expect(parseReportReason({ reason: '  закрылось  ' })).toBe('закрылось');
    expect(() => parseReportReason({ reason: 'нет' })).toThrow(
      BadRequestException,
    );
    expect(() => parseReportReason({ reason: 'а'.repeat(1001) })).toThrow(
      BadRequestException,
    );
    expect(() => parseReportReason({})).toThrow(BadRequestException);
  });

  it('причина скрытия необязательна', () => {
    expect(parseHideReason(undefined)).toBeNull();
    expect(parseHideReason({})).toBeNull();
    expect(parseHideReason({ reason: ' дубль ' })).toBe('дубль');
  });
});
