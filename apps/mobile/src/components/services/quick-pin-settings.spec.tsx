import type { ServiceCard } from '@vedamatch/shared';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { serializeQuickPins, type QuickPin } from '@/lib/services/quick-pins';
import { QUICK_PINS_STORAGE_KEY, createQuickPinsStore, type QuickPinsStore } from '@/lib/services/quick-pins-store';
import { hitTarget } from '@/theme/tokens';
import { QuickPinSettings } from './quick-pin-settings';

/**
 * Настройка панели во вкладке «Сервисы»: подсказка пустого состояния,
 * закрепление, предел, порядок стрелками — и что всё это доезжает до
 * хранилища, а не остаётся в состоянии экрана.
 */

jest.mock('expo-secure-store', () => ({
  __esModule: true,
  getItemAsync: jest.fn().mockResolvedValue(null),
  setItemAsync: jest.fn().mockResolvedValue(undefined),
}));

function card(slug: string, name: string, status: ServiceCard['status'] = 'active'): ServiceCard {
  return {
    id: slug,
    slug,
    name,
    nameEn: null,
    description: '',
    iconUrl: null,
    url: `/${slug}`,
    status,
    category: 'service',
    requiresDevoteeVerification: false,
  };
}

const CATALOG = [
  card('chat', 'Общение'),
  card('wellness', 'Здоровье'),
  card('music', 'Медиатека'),
  card('library', 'Библиотека'),
  card('market', 'Рынок'),
  card('notices', 'Объявления'),
  card('union', 'Знакомства'),
  card('astro', 'Астрология', 'coming_soon'),
];

const pin = (service: ServiceCard): QuickPin => ({ slug: service.slug, name: service.name, url: service.url });
const byName = (name: string) => CATALOG.find((item) => item.name === name)!;

async function storeWith(pins: QuickPin[]) {
  const data = new Map<string, string>([[QUICK_PINS_STORAGE_KEY, serializeQuickPins(pins)]]);
  const store = createQuickPinsStore({
    getItem: async (key) => data.get(key) ?? null,
    setItem: async (key, value) => {
      data.set(key, value);
    },
  });
  await store.load();
  const saved = () => (JSON.parse(data.get(QUICK_PINS_STORAGE_KEY) ?? '[]') as QuickPin[]).map((item) => item.name);
  return { store, saved };
}

async function render(store: QuickPinsStore): Promise<ReactTestRenderer> {
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = create(<QuickPinSettings services={CATALOG} store={store} />);
  });
  return tree;
}

const text = (tree: ReactTestRenderer) => JSON.stringify(tree.toJSON());

function pressable(tree: ReactTestRenderer, label: string) {
  return tree.root.find((node) => node.props.accessibilityLabel === label && typeof node.props.onPress === 'function');
}

async function press(tree: ReactTestRenderer, label: string) {
  await act(async () => {
    pressable(tree, label).props.onPress();
  });
}

/** Строки-переключатели в том порядке, в каком их видит человек. */
function rows(tree: ReactTestRenderer) {
  return tree.root
    .findAll((node) => node.props.accessibilityRole === 'switch' && typeof node.props.onPress === 'function', {
      deep: false,
    })
    .map((node) => ({
      name: String(node.props.accessibilityLabel).replace('Закрепить сверху: ', ''),
      on: node.props.accessibilityState.checked as boolean,
    }));
}

describe('QuickPinSettings', () => {
  it('ничего не закреплено — подсказка здесь, счётчик 0 из 5, список свёрнут', async () => {
    const { store } = await storeWith([]);
    const tree = await render(store);
    expect(text(tree)).toContain('Закрепите до 5 сервисов');
    expect(text(tree)).toContain('"0"," из ","5"');
    expect(rows(tree)).toEqual([]);
  });

  it('в списке только то, что можно открыть: без «Общения» и «Скоро»', async () => {
    const { store } = await storeWith([]);
    const tree = await render(store);
    await press(tree, 'Настроить быстрый доступ');
    const names = rows(tree).map((row) => row.name);
    expect(names).toEqual(['Здоровье', 'Медиатека', 'Библиотека', 'Рынок', 'Объявления', 'Знакомства']);
  });

  it('закреплённые идут первыми в своём порядке, как на самой панели', async () => {
    const { store } = await storeWith([pin(byName('Рынок')), pin(byName('Здоровье'))]);
    const tree = await render(store);
    await press(tree, 'Настроить быстрый доступ');
    expect(rows(tree).slice(0, 3)).toEqual([
      { name: 'Рынок', on: true },
      { name: 'Здоровье', on: true },
      { name: 'Медиатека', on: false },
    ]);
  });

  it('нажатие закрепляет и сохраняет; повторное — открепляет', async () => {
    const { store, saved } = await storeWith([]);
    const tree = await render(store);
    await press(tree, 'Настроить быстрый доступ');
    await press(tree, 'Закрепить сверху: Медиатека');
    expect(saved()).toEqual(['Медиатека']);
    expect(text(tree)).toContain('"1"," из ","5"');
    await press(tree, 'Закрепить сверху: Медиатека');
    expect(saved()).toEqual([]);
  });

  it('шестой не закрепляется: хранилище прежнее, человеку объяснено словами', async () => {
    const five = ['Здоровье', 'Медиатека', 'Библиотека', 'Рынок', 'Объявления'].map((name) => pin(byName(name)));
    const { store, saved } = await storeWith(five);
    const tree = await render(store);
    await press(tree, 'Настроить быстрый доступ');
    const blocked = pressable(tree, 'Закрепить сверху: Знакомства');
    expect(blocked.props.accessibilityHint).toMatch(/Панель заполнена/);
    await press(tree, 'Закрепить сверху: Знакомства');
    expect(saved()).toEqual(['Здоровье', 'Медиатека', 'Библиотека', 'Рынок', 'Объявления']);
    const alert = tree.root.find((node) => node.props.accessibilityRole === 'alert');
    expect(JSON.stringify(alert.props.children)).toContain('Открепите один, чтобы закрепить «Знакомства»');
  });

  // Дефект первой сборки на A51: сообщение стояло под списком из дюжины
  // строк, за краем экрана, и шестое нажатие выглядело как «ничего».
  it('сообщение о полной панели стоит над списком, рядом со счётчиком', async () => {
    const five = ['Здоровье', 'Медиатека', 'Библиотека', 'Рынок', 'Объявления'].map((name) => pin(byName(name)));
    const { store } = await storeWith(five);
    const tree = await render(store);
    await press(tree, 'Настроить быстрый доступ');
    await press(tree, 'Закрепить сверху: Знакомства');
    const shown = text(tree);
    expect(shown.indexOf('Открепите один')).toBeGreaterThan(-1);
    expect(shown.indexOf('Открепите один')).toBeLessThan(shown.indexOf('"Здоровье"'));
  });

  it('стрелки меняют порядок и сохраняют его', async () => {
    const three = ['Здоровье', 'Медиатека', 'Библиотека'].map((name) => pin(byName(name)));
    const { store, saved } = await storeWith(three);
    const tree = await render(store);
    await press(tree, 'Настроить быстрый доступ');
    await press(tree, 'Раньше: Библиотека');
    expect(saved()).toEqual(['Здоровье', 'Библиотека', 'Медиатека']);
    await press(tree, 'Позже: Здоровье');
    expect(saved()).toEqual(['Библиотека', 'Здоровье', 'Медиатека']);
    expect(rows(tree).slice(0, 3).map((row) => row.name)).toEqual(['Библиотека', 'Здоровье', 'Медиатека']);
  });

  it('крайние стрелки выключены, у незакреплённых стрелок нет', async () => {
    const two = ['Здоровье', 'Медиатека'].map((name) => pin(byName(name)));
    const { store } = await storeWith(two);
    const tree = await render(store);
    await press(tree, 'Настроить быстрый доступ');
    const disabled = (label: string) => pressable(tree, label).props.disabled;
    expect(disabled('Раньше: Здоровье')).toBe(true);
    expect(disabled('Позже: Здоровье')).toBe(false);
    expect(disabled('Раньше: Медиатека')).toBe(false);
    expect(disabled('Позже: Медиатека')).toBe(true);
    expect(tree.root.findAll((node) => node.props.accessibilityLabel === 'Раньше: Рынок')).toHaveLength(0);
  });

  it('зоны нажатия переключателя, стрелок и кнопки «Настроить» — не меньше 44', async () => {
    const { store } = await storeWith([pin(byName('Здоровье'))]);
    const tree = await render(store);
    const size = (label: string, axis: 'minHeight' | 'minWidth') => {
      const style = pressable(tree, label).props.style({ pressed: false }).flat().filter(Boolean);
      return (Object.assign({}, ...style) as Record<string, number>)[axis];
    };
    expect(size('Настроить быстрый доступ', 'minHeight')).toBeGreaterThanOrEqual(hitTarget);
    await press(tree, 'Настроить быстрый доступ');
    expect(size('Закрепить сверху: Здоровье', 'minHeight')).toBeGreaterThanOrEqual(hitTarget);
    expect(size('Раньше: Здоровье', 'minHeight')).toBeGreaterThanOrEqual(hitTarget);
    expect(size('Раньше: Здоровье', 'minWidth')).toBeGreaterThanOrEqual(hitTarget);
  });
});
