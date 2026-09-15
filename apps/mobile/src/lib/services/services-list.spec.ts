import type { ServiceCard } from '@vedamatch/shared';
import { visibleServices } from './services-list';

function card(overrides: Partial<ServiceCard> & { slug: string }): ServiceCard {
  return {
    id: overrides.id ?? overrides.slug,
    slug: overrides.slug,
    name: overrides.name ?? 'Название',
    nameEn: overrides.nameEn ?? null,
    description: overrides.description ?? 'Описание',
    iconUrl: overrides.iconUrl ?? null,
    url: overrides.url ?? `/${overrides.slug}`,
    status: overrides.status ?? 'active',
    category: overrides.category ?? 'service',
    requiresDevoteeVerification: overrides.requiresDevoteeVerification ?? false,
  };
}

describe('visibleServices', () => {
  it('убирает «Общение» — эту вкладку заменяет нативный таб «Чаты»', () => {
    const result = visibleServices([card({ slug: 'chat' }), card({ slug: 'music' })]);
    expect(result.map((s) => s.slug)).toEqual(['music']);
  });

  it('убирает выключенные администратором сервисы', () => {
    const result = visibleServices([card({ slug: 'a', status: 'disabled' }), card({ slug: 'b' })]);
    expect(result.map((s) => s.slug)).toEqual(['b']);
  });

  it('сохраняет порядок ответа сервера и не трогает «скоро»', () => {
    const result = visibleServices([
      card({ slug: 'astro', status: 'coming_soon' }),
      card({ slug: 'market' }),
      card({ slug: 'work' }),
    ]);
    expect(result.map((s) => s.slug)).toEqual(['astro', 'market', 'work']);
    expect(result[0].status).toBe('coming_soon');
  });

  it('пустой каталог остаётся пустым списком', () => {
    expect(visibleServices([])).toEqual([]);
  });
});
