import type { UnionProfileState } from '@vedamatch/shared';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { pressables, screenText } from '@/components/union/union-test-helpers';
import UnionEntryScreen from './index';

const mockMe = jest.fn();
const mockState = jest.fn<Promise<UnionProfileState>, []>();
const mockReplace = jest.fn();
let mockSiteLinks = true;

jest.mock('expo-router', () => {
  const { useEffect } = jest.requireActual('react');
  return {
    __esModule: true,
    useFocusEffect: (callback: () => void) => useEffect(callback, [callback]),
    router: { replace: (...args: unknown[]) => mockReplace(...args), push: jest.fn() },
    Stack: { Screen: () => null },
  };
});
jest.mock('expo-web-browser', () => ({ __esModule: true, openBrowserAsync: jest.fn(async () => ({})) }));
jest.mock('@/theme/theme', () => ({
  __esModule: true,
  useTheme: () => ({ colors: jest.requireActual('@/theme/tokens').light }),
}));
jest.mock('@/config/app-variant', () => ({
  __esModule: true,
  appVariant: () => ({ webOrigin: 'https://vedamatch.ru' }),
  appCapabilities: () => ({ siteServiceLinks: mockSiteLinks }),
}));
const fakeSession = { api: {}, user: { id: 'me' } };
jest.mock('@/lib/auth/session', () => ({ __esModule: true, useSession: () => fakeSession }));
jest.mock('@/lib/profile/profile-api', () => ({ __esModule: true, createProfileApi: () => ({ me: () => mockMe() }) }));
jest.mock('@/lib/union/union-api', () => ({
  __esModule: true,
  createUnionApi: () => ({ profileState: () => mockState() }),
}));

const HOME = { city: 'Казань', country: 'Россия', lat: 55.8, lon: 49.1 };
const NO_PROFILE: UnionProfileState = {
  profile: null,
  completeness: { percent: 0, items: [], missing: [], next: null },
};

const mounted: ReactTestRenderer[] = [];
async function render(): Promise<ReactTestRenderer> {
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(<UnionEntryScreen />);
  });
  mounted.push(renderer);
  return renderer;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockSiteLinks = true;
});
afterEach(() => {
  for (const renderer of mounted.splice(0)) act(() => renderer.unmount());
});

describe('вход в Знакомства', () => {
  it('место и анкета есть — сразу в подбор', async () => {
    mockMe.mockResolvedValue({ homeLocation: HOME });
    mockState.mockResolvedValue({ ...NO_PROFILE, profile: { id: 'p' } as UnionProfileState['profile'] });
    await render();
    expect(mockReplace).toHaveBeenCalledWith('/union/recommendations');
  });

  it('без места — сначала место, даже если анкета есть', async () => {
    mockMe.mockResolvedValue({ homeLocation: null });
    mockState.mockResolvedValue({ ...NO_PROFILE, profile: { id: 'p' } as UnionProfileState['profile'] });
    const renderer = await render();
    expect(mockReplace).not.toHaveBeenCalled();
    expect(screenText(renderer)).toContain('Укажите страну и город');
  });

  it('без анкеты — просит анкету и ведёт на сайт', async () => {
    mockMe.mockResolvedValue({ homeLocation: HOME });
    mockState.mockResolvedValue(NO_PROFILE);
    const renderer = await render();
    expect(screenText(renderer)).toContain('Заполните анкету');
    expect(pressables(renderer, 'Открыть на сайте')).toHaveLength(1);
  });

  it('сборка без ссылок на сайт кнопку на сайт не показывает', async () => {
    mockSiteLinks = false;
    mockMe.mockResolvedValue({ homeLocation: HOME });
    mockState.mockResolvedValue(NO_PROFILE);
    const renderer = await render();
    expect(pressables(renderer, 'Открыть на сайте')).toHaveLength(0);
    expect(screenText(renderer)).toContain('на сайте VedaMatch');
  });
});
