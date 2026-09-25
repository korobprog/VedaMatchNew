import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { pressable, screenText } from '@/components/union/union-test-helpers';
import { unionUser } from '@/lib/union/union-fixtures';
import UnionHiddenScreen from './hidden';

const mockArchive = jest.fn();
const mockBlocks = jest.fn();
const mockUnarchive = jest.fn(async (_id: string) => ({}));
const mockUnblock = jest.fn(async (_id: string) => ({}));

jest.mock('expo-router', () => {
  const { useEffect } = jest.requireActual('react');
  return {
    __esModule: true,
    useFocusEffect: (callback: () => void) => useEffect(callback, [callback]),
    router: { push: jest.fn(), replace: jest.fn() },
    Stack: { Screen: () => null },
  };
});
jest.mock('react-native-safe-area-context', () => ({
  __esModule: true,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('@/theme/theme', () => ({
  __esModule: true,
  useTheme: () => ({ colors: jest.requireActual('@/theme/tokens').light }),
}));
const fakeSession = { api: {}, user: { id: 'me' } };
jest.mock('@/lib/auth/session', () => ({ __esModule: true, useSession: () => fakeSession }));
jest.mock('@/lib/union/union-api', () => ({
  __esModule: true,
  createUnionApi: () => ({
    archiveList: () => mockArchive(),
    blocks: () => mockBlocks(),
    unarchive: (id: string) => mockUnarchive(id),
    unblock: (id: string) => mockUnblock(id),
    connectionCounts: async () => ({ incomingPending: 0 }),
  }),
}));

const mounted: ReactTestRenderer[] = [];
async function render(): Promise<ReactTestRenderer> {
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(<UnionHiddenScreen />);
  });
  mounted.push(renderer);
  return renderer;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockArchive.mockResolvedValue({ items: [{ user: unionUser({ id: 'u-a', name: 'Шьям' }), archivedAt: '2026-09-20T00:00:00Z' }] });
  mockBlocks.mockResolvedValue({ blocked: [{ userId: 'u-b', name: 'Мадхава', createdAt: '2026-09-20T00:00:00Z' }] });
});
afterEach(() => {
  for (const renderer of mounted.splice(0)) act(() => renderer.unmount());
});

describe('скрытые', () => {
  it('архив — с числом на вкладке; «Вернуть» возвращает в выдачу и перечитывает', async () => {
    const renderer = await render();
    expect(screenText(renderer)).toContain('Архив · 1');
    expect(screenText(renderer)).toContain('Шьям');
    await act(async () => pressable(renderer, 'Вернуть Шьям в выдачу').props.onPress());
    expect(mockUnarchive).toHaveBeenCalledWith('u-a');
    expect(mockArchive).toHaveBeenCalledTimes(2);
  });

  it('заблокированных можно разблокировать прямо в списке', async () => {
    const renderer = await render();
    await act(async () => pressable(renderer, 'Заблокированные · 1').props.onPress());
    expect(screenText(renderer)).toContain('Мадхава');
    await act(async () => pressable(renderer, 'Разблокировать Мадхава').props.onPress());
    expect(mockUnblock).toHaveBeenCalledWith('u-b');
  });

  it('пустой архив объясняет, как туда попадают', async () => {
    mockArchive.mockResolvedValue({ items: [] });
    const renderer = await render();
    expect(screenText(renderer)).toContain('Архив пуст');
  });
});
