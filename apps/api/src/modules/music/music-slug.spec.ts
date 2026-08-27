import {
  buildMusicSlug,
  isReservedMusicSlug,
  withMusicSlugSuffix,
} from './music-slug';

describe('buildMusicSlug', () => {
  it('транслитерирует кириллицу', () => {
    expect(buildMusicSlug('Джая Радха-Мадхава')).toBe('dzhaya-radha-madhava');
  });

  it('пропускает латиницу насквозь', () => {
    expect(buildMusicSlug('Jaya Radha-Madhava')).toBe('jaya-radha-madhava');
  });

  it('схлопывает пробелы и служебные знаки', () => {
    expect(buildMusicSlug('  Шри   Туласи-киртан!!  ')).toBe(
      'shri-tulasi-kirtan',
    );
  });

  it('не оставляет дефисов по краям', () => {
    expect(buildMusicSlug('«Гаура-арати»')).toBe('gaura-arati');
  });

  it('даёт запасное слово, когда транслитерировать нечего', () => {
    expect(buildMusicSlug('🙏🎶')).toBe('zapis');
    expect(buildMusicSlug('गौर आरती')).toBe('zapis');
  });
});

describe('isReservedMusicSlug', () => {
  it('узнаёт слова, занятые маршрутами сервиса', () => {
    expect(isReservedMusicSlug('tracks')).toBe(true);
    expect(isReservedMusicSlug('admin')).toBe(true);
  });

  it('не трогает обычные имена', () => {
    expect(isReservedMusicSlug('gaura-arati')).toBe(false);
  });
});

describe('withMusicSlugSuffix', () => {
  it('первую попытку отдаёт без суффикса', () => {
    expect(withMusicSlugSuffix('gaura-arati', 0)).toBe('gaura-arati');
  });

  it('нумерует коллизии со второго и без пропусков', () => {
    expect(withMusicSlugSuffix('gaura-arati', 1)).toBe('gaura-arati-2');
    expect(withMusicSlugSuffix('gaura-arati', 2)).toBe('gaura-arati-3');
  });

  it('занятому слову даёт суффикс сразу, но отсчёт не пропускает', () => {
    expect(withMusicSlugSuffix('tracks', 0)).toBe('tracks-2');
    expect(withMusicSlugSuffix('tracks', 1)).toBe('tracks-3');
  });
});
