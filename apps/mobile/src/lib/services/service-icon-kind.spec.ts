import { serviceIconKind, type ServiceIconKind } from './service-icon-kind';

const KNOWN: ServiceIconKind[] = [
  'motivation',
  'music',
  'union',
  'vedabase',
  'astro',
  'library',
  'chat',
  'contacts',
  'market',
  'notices',
  'work',
  'wellness',
  'travel',
];

describe('serviceIconKind', () => {
  it.each(KNOWN)('известный slug «%s» отдаёт свою картинку', (slug) => {
    expect(serviceIconKind(slug)).toBe(slug);
  });

  it('«devotee-space» — общий лотос, отдельной картинки на сайте у него нет', () => {
    expect(serviceIconKind('devotee-space')).toBe('default');
  });

  it('неизвестный, пустой и отсутствующий slug — общий лотос', () => {
    expect(serviceIconKind('gitabase')).toBe('default');
    expect(serviceIconKind('')).toBe('default');
    expect(serviceIconKind(null)).toBe('default');
    expect(serviceIconKind(undefined)).toBe('default');
  });

  it('category не влияет на результат — на сайте этот параметр в switch не участвует', () => {
    expect(serviceIconKind('music', 'lifestyle')).toBe('music');
    expect(serviceIconKind('music', 'core')).toBe('music');
    expect(serviceIconKind('music', null)).toBe('music');
    expect(serviceIconKind('unknown-slug', 'lifestyle')).toBe('default');
  });
});
