import type { GeoSearchResult } from '@vedamatch/shared';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { pressable, screenText } from '@/components/union/union-test-helpers';
import UnionLocationScreen from './location';

const mockSearch = jest.fn<Promise<GeoSearchResult[]>, [string, string]>();
const mockSave = jest.fn();
const mockReplace = jest.fn();
const mockReloadUser = jest.fn(async () => undefined);

jest.mock('expo-router', () => ({
  __esModule: true,
  router: { replace: (...args: unknown[]) => mockReplace(...args) },
  Stack: { Screen: () => null },
}));
jest.mock('react-native-safe-area-context', () => ({
  __esModule: true,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('@/components/keyboard-controller-web', () => {
  const { ScrollView } = jest.requireActual('react-native');
  return { __esModule: true, PersonKeyboardAwareScroll: ScrollView };
});
jest.mock('@/theme/theme', () => ({
  __esModule: true,
  useTheme: () => ({ colors: jest.requireActual('@/theme/tokens').light }),
}));
const fakeSession = { api: {}, user: { id: 'me' }, reloadUser: () => mockReloadUser() };
jest.mock('@/lib/auth/session', () => ({ __esModule: true, useSession: () => fakeSession }));
jest.mock('@/lib/union/union-api', () => ({
  __esModule: true,
  createUnionApi: () => ({
    searchCities: (city: string, country: string) => mockSearch(city, country),
    saveHomeLocation: (location: GeoSearchResult) => mockSave(location),
  }),
}));

const KAZAN: GeoSearchResult = { city: 'Казань', country: 'Россия', lat: 55.8, lon: 49.1, displayName: 'Казань, Татарстан, Россия' };

const mounted: ReactTestRenderer[] = [];
async function render(): Promise<ReactTestRenderer> {
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(<UnionLocationScreen />);
  });
  mounted.push(renderer);
  return renderer;
}

async function type(renderer: ReactTestRenderer, label: string, value: string) {
  await act(async () => renderer.root.findByProps({ accessibilityLabel: label }).props.onChangeText(value));
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  mockSearch.mockResolvedValue([KAZAN]);
});
afterEach(() => {
  for (const renderer of mounted.splice(0)) act(() => renderer.unmount());
  jest.useRealTimers();
});

describe('место жительства', () => {
  it('ищет город с паузой и по стране, выбранный уходит в профиль', async () => {
    mockSave.mockResolvedValue({ homeLocation: KAZAN });
    const renderer = await render();
    await type(renderer, 'Страна', 'Россия');
    await type(renderer, 'Город', 'Каз');
    expect(mockSearch).not.toHaveBeenCalled();
    await act(async () => {
      jest.advanceTimersByTime(400);
    });
    expect(mockSearch).toHaveBeenCalledWith('Каз', 'Россия');
    expect(screenText(renderer)).toContain('Татарстан');

    await act(async () => pressable(renderer, 'Казань, Россия, Татарстан').props.onPress());
    expect(screenText(renderer)).toContain('Выбрано: Казань, Россия');
    await act(async () => pressable(renderer, 'Сохранить и продолжить').props.onPress());
    expect(mockSave).toHaveBeenCalledWith(KAZAN);
    expect(mockReplace).toHaveBeenCalledWith('/union');
  });

  it('город без выбора из подсказок не сохраняется', async () => {
    const renderer = await render();
    await type(renderer, 'Город', 'Казань');
    expect(pressable(renderer, 'Сохранить и продолжить').props.disabled).toBe(true);
    expect(mockSave).not.toHaveBeenCalled();
  });

  it('одной буквы мало — не дёргаем геокодер', async () => {
    const renderer = await render();
    await type(renderer, 'Страна', 'Россия');
    await type(renderer, 'Город', 'К');
    await act(async () => {
      jest.advanceTimersByTime(1000);
    });
    expect(mockSearch).not.toHaveBeenCalled();
  });
});
