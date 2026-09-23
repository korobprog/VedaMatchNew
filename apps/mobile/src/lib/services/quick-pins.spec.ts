import type { ServiceCard } from '@vedamatch/shared';
import {
  QUICK_PIN_LIMIT,
  canPinMore,
  isPinned,
  movePin,
  parseQuickPins,
  pinFromService,
  pinnableServices,
  reconcilePins,
  samePins,
  serializeQuickPins,
  togglePin,
  type QuickPin,
} from './quick-pins';

function card(overrides: Partial<ServiceCard> & { slug: string }): ServiceCard {
  return {
    id: overrides.id ?? overrides.slug,
    slug: overrides.slug,
    name: overrides.name ?? `Сервис ${overrides.slug}`,
    nameEn: null,
    description: 'Описание',
    iconUrl: null,
    url: overrides.url ?? `/${overrides.slug}`,
    status: overrides.status ?? 'active',
    category: 'service',
    requiresDevoteeVerification: false,
  };
}

const pin = (slug: string, name = `Сервис ${slug}`): QuickPin => ({ slug, name, url: `/${slug}` });
const slugs = (pins: readonly QuickPin[]) => pins.map((item) => item.slug);

describe('предел панели', () => {
  it('пять — как пунктов нижнего меню; шестой уводил бы ряд за край', () => {
    expect(QUICK_PIN_LIMIT).toBe(5);
  });

  it('шестой не закрепляется: набор не меняется, исход — «полна»', () => {
    const full = ['a', 'b', 'c', 'd', 'e'].map((slug) => pin(slug));
    const result = togglePin(full, card({ slug: 'f' }));
    expect(result.outcome).toBe('full');
    expect(slugs(result.pins)).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(canPinMore(full)).toBe(false);
  });

  it('на полной панели открепить можно — и тогда место освобождается', () => {
    const full = ['a', 'b', 'c', 'd', 'e'].map((slug) => pin(slug));
    const freed = togglePin(full, card({ slug: 'c' }));
    expect(freed.outcome).toBe('unpinned');
    expect(canPinMore(freed.pins)).toBe(true);
    expect(togglePin(freed.pins, card({ slug: 'f' })).outcome).toBe('pinned');
  });

  it('четыре из пяти — ещё можно', () => {
    expect(canPinMore(['a', 'b', 'c', 'd'].map((slug) => pin(slug)))).toBe(true);
  });
});

describe('закрепить и открепить', () => {
  it('закреплённый встаёт в конец', () => {
    const result = togglePin([pin('music')], card({ slug: 'library', name: 'Библиотека' }));
    expect(result.outcome).toBe('pinned');
    expect(result.pins).toEqual([pin('music'), { slug: 'library', name: 'Библиотека', url: '/library' }]);
  });

  it('повторное нажатие открепляет, остальные остаются в своём порядке', () => {
    const result = togglePin([pin('a'), pin('b'), pin('c')], card({ slug: 'b' }));
    expect(result.outcome).toBe('unpinned');
    expect(slugs(result.pins)).toEqual(['a', 'c']);
  });

  it('исходный набор не мутирует', () => {
    const before = [pin('a')];
    togglePin(before, card({ slug: 'b' }));
    expect(slugs(before)).toEqual(['a']);
  });

  it('isPinned смотрит на слаг', () => {
    expect(isPinned([pin('wellness')], 'wellness')).toBe(true);
    expect(isPinned([pin('wellness')], 'music')).toBe(false);
  });
});

describe('порядок стрелками', () => {
  const three = [pin('a'), pin('b'), pin('c')];

  it('«раньше» меняет с соседом слева', () => {
    expect(slugs(movePin(three, 'b', -1))).toEqual(['b', 'a', 'c']);
  });

  it('«позже» меняет с соседом справа', () => {
    expect(slugs(movePin(three, 'b', 1))).toEqual(['a', 'c', 'b']);
  });

  it('за края не уходит', () => {
    expect(slugs(movePin(three, 'a', -1))).toEqual(['a', 'b', 'c']);
    expect(slugs(movePin(three, 'c', 1))).toEqual(['a', 'b', 'c']);
  });

  it('незакреплённый не двигает ничего', () => {
    expect(slugs(movePin(three, 'zzz', 1))).toEqual(['a', 'b', 'c']);
  });

  it('исходный набор не мутирует', () => {
    movePin(three, 'a', 1);
    expect(slugs(three)).toEqual(['a', 'b', 'c']);
  });
});

describe('что можно закрепить', () => {
  it('без «Общения», выключенных и «Скоро» — порядок каталога', () => {
    const result = pinnableServices([
      card({ slug: 'chat' }),
      card({ slug: 'astro', status: 'coming_soon' }),
      card({ slug: 'music' }),
      card({ slug: 'old', status: 'disabled' }),
      card({ slug: 'wellness' }),
    ]);
    expect(result.map((item) => item.slug)).toEqual(['music', 'wellness']);
  });
});

describe('сохранение и чтение', () => {
  it('ничего не сохранено — панель пуста, а не набор по умолчанию', () => {
    expect(parseQuickPins(null)).toEqual([]);
    expect(parseQuickPins('')).toEqual([]);
  });

  it('записанное читается обратно тем же набором в том же порядке', () => {
    const pins = [pin('wellness', 'Здоровье'), pin('music', 'Медиатека'), pin('library', 'Библиотека')];
    expect(parseQuickPins(serializeQuickPins(pins))).toEqual(pins);
  });

  it('лишние поля в хранилище не пишутся', () => {
    const raw = serializeQuickPins([{ ...pin('a'), extra: 1 } as QuickPin]);
    expect(JSON.parse(raw)).toEqual([{ slug: 'a', name: 'Сервис a', url: '/a' }]);
  });

  it('битый JSON и не-массив — пусто, без падения', () => {
    expect(parseQuickPins('{не json')).toEqual([]);
    expect(parseQuickPins('{"slug":"a"}')).toEqual([]);
    expect(parseQuickPins('42')).toEqual([]);
  });

  it('непонятные записи молча отбрасываются, понятные остаются', () => {
    const raw = JSON.stringify([
      'music',
      null,
      { slug: '', name: 'Пусто', url: '/x' },
      { slug: 'a', name: '   ', url: '/a' },
      { slug: 'b', url: '/b' },
      { slug: 'c', name: 'Ц', url: 7 },
      pin('ok'),
    ]);
    expect(slugs(parseQuickPins(raw))).toEqual(['ok']);
  });

  it('дубли — сбой хранилища, остаётся первый', () => {
    const raw = JSON.stringify([pin('a', 'Первый'), pin('b'), pin('a', 'Второй')]);
    const result = parseQuickPins(raw);
    expect(slugs(result)).toEqual(['a', 'b']);
    expect(result[0].name).toBe('Первый');
  });

  it('сверх предела не читается: набор из прошлой версии не ломает панель', () => {
    const raw = JSON.stringify(['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((slug) => pin(slug)));
    expect(slugs(parseQuickPins(raw))).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('samePins сравнивает содержимое и порядок', () => {
    expect(samePins([pin('a'), pin('b')], [pin('a'), pin('b')])).toBe(true);
    expect(samePins([pin('a'), pin('b')], [pin('b'), pin('a')])).toBe(false);
    expect(samePins([pin('a')], [pin('a', 'Другое имя')])).toBe(false);
  });

  it('pinFromService берёт только слаг, имя и адрес', () => {
    expect(pinFromService(card({ slug: 'music', name: 'Медиатека' }))).toEqual({
      slug: 'music',
      name: 'Медиатека',
      url: '/music',
    });
  });
});

describe('сведение с каталогом', () => {
  it('имя и адрес — из каталога, порядок — человека', () => {
    const pins = [pin('library', 'Старое имя'), pin('music', 'Музыка')];
    const result = reconcilePins(pins, [
      card({ slug: 'music', name: 'Медиатека', url: '/media' }),
      card({ slug: 'library', name: 'Библиотека' }),
    ]);
    expect(result).toEqual([
      { slug: 'library', name: 'Библиотека', url: '/library' },
      { slug: 'music', name: 'Медиатека', url: '/media' },
    ]);
  });

  it('пропавший, выключенный и ушедший в «Скоро» убираются', () => {
    const pins = [pin('gone'), pin('off'), pin('soon'), pin('music')];
    const result = reconcilePins(pins, [
      card({ slug: 'off', status: 'disabled' }),
      card({ slug: 'soon', status: 'coming_soon' }),
      card({ slug: 'music' }),
    ]);
    expect(slugs(result)).toEqual(['music']);
  });

  it('новые сервисы каталога сами не закрепляются', () => {
    expect(reconcilePins([], [card({ slug: 'music' })])).toEqual([]);
  });
});
