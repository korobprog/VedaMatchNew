import type { ReactTestInstance, ReactTestRenderer } from 'react-test-renderer';
import { act, create } from 'react-test-renderer';
import { ApiError } from '@/lib/api/client';
import NewSupportTicketScreen from './new';

const mockCreate = jest.fn();
const mockReplace = jest.fn();
let mockParams: Record<string, string> = {};

jest.mock('expo-router', () => ({
  __esModule: true,
  Stack: { Screen: () => null },
  router: { replace: (...args: unknown[]) => mockReplace(...args), back: jest.fn() },
  useLocalSearchParams: () => mockParams,
}));

jest.mock('react-native-safe-area-context', () => ({
  __esModule: true,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('@/components/keyboard-controller-web', () => {
  const { View } = jest.requireActual('react-native');
  return { __esModule: true, ChatKeyboardAvoidingView: View, PersonKeyboardAwareScroll: View };
});

const mockSession = { api: {} };
jest.mock('@/lib/auth/session', () => ({ __esModule: true, useSession: () => mockSession }));
jest.mock('@/lib/feedback', () => ({ __esModule: true, confirmTap: jest.fn() }));

jest.mock('@/lib/support/device-facts', () => ({
  __esModule: true,
  readDeviceFacts: () => ({
    appVersion: '0.1.0+a1b2c3d',
    versionCode: 5023,
    channel: 'site',
    platform: 'android',
    osVersion: '13',
    brand: 'samsung',
    model: 'SM-A515F',
  }),
}));

jest.mock('@/lib/support/support-api', () => ({
  __esModule: true,
  createSupportApi: () => ({ create: (...args: unknown[]) => mockCreate(...args) }),
}));

const REPORT = [
  '— Сведения из приложения —',
  'Приложение: VedaMatch 0.1.0+a1b2c3d (сборка 5023, с сайта)',
  'Устройство: Samsung SM-A515F, Android 13',
];

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function render(): Promise<ReactTestRenderer> {
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(<NewSupportTicketScreen />);
  });
  return renderer;
}

function byLabel(renderer: ReactTestRenderer, label: string): ReactTestInstance {
  return renderer.root.findByProps({ accessibilityLabel: label });
}

function texts(renderer: ReactTestRenderer): string {
  return renderer.root
    .findAllByType('Text' as never)
    .map((node) => [node.props.children].flat().join(''))
    .join('\n');
}

function sendButton(renderer: ReactTestRenderer): ReactTestInstance {
  return renderer.root.findAll(
    (node) => node.props.accessibilityRole === 'button' && typeof node.props.onPress === 'function' && node.props.accessibilityState?.busy !== undefined,
  )[0];
}

async function type(renderer: ReactTestRenderer, label: string, value: string) {
  await act(async () => {
    byLabel(renderer, label).props.onChangeText(value);
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockParams = {};
  mockCreate.mockResolvedValue({ number: 12, id: 't-12' });
});

describe('Новое обращение в поддержку', () => {
  it('показывает абзац сведений слово в слово до отправки', async () => {
    const renderer = await render();
    const shown = texts(renderer);
    for (const line of REPORT) expect(shown).toContain(line);
    expect(shown).not.toContain('Экран:');
  });

  it('с экрана ошибки называет экран и подставляет тему', async () => {
    mockParams = { from: 'chat' };
    const renderer = await render();
    expect(texts(renderer)).toContain('Экран: Переписка');
    expect(byLabel(renderer, 'Тема обращения').props.value).toBe('Не открывается переписка');
  });

  it('незнакомый «откуда» из адреса в обращение не попадает', async () => {
    mockParams = { from: 'что угодно' };
    const renderer = await render();
    expect(texts(renderer)).not.toContain('Экран:');
    expect(byLabel(renderer, 'Тема обращения').props.value).toBe('');
  });

  it('отправляет текст со сведениями и открывает созданное обращение', async () => {
    const renderer = await render();
    await type(renderer, 'Тема обращения', 'Пуши');
    await type(renderer, 'Текст обращения', 'Не приходят уведомления');
    await act(async () => {
      sendButton(renderer).props.onPress();
    });
    await flush();
    expect(mockCreate).toHaveBeenCalledWith({
      subject: 'Пуши',
      category: 'other',
      message: `Не приходят уведомления\n\n${REPORT.join('\n')}`,
    });
    expect(mockReplace).toHaveBeenCalledWith({ pathname: '/support/[id]', params: { id: 't-12' } });
  });

  it('выключенные сведения не уходят и пропадают из формы', async () => {
    const renderer = await render();
    await act(async () => {
      byLabel(renderer, 'Приложить сведения о приложении').props.onValueChange(false);
    });
    expect(texts(renderer)).not.toContain(REPORT[1]);
    await type(renderer, 'Тема обращения', 'Пуши');
    await type(renderer, 'Текст обращения', 'Текст');
    await act(async () => {
      sendButton(renderer).props.onPress();
    });
    await flush();
    expect(mockCreate.mock.calls[0][0].message).toBe('Текст');
  });

  it('без текста не отправляет и говорит, чего не хватает', async () => {
    const renderer = await render();
    await type(renderer, 'Тема обращения', 'Пуши');
    await act(async () => {
      sendButton(renderer).props.onPress();
    });
    expect(mockCreate).not.toHaveBeenCalled();
    expect(texts(renderer)).toContain('Опишите, что случилось');
  });

  it('лимит сервера: объясняет, черновик остаётся, никуда не уводит', async () => {
    mockCreate.mockRejectedValue(new ApiError(429, 'Too Many Requests', null));
    const renderer = await render();
    await type(renderer, 'Тема обращения', 'Пуши');
    await type(renderer, 'Текст обращения', 'Текст');
    await act(async () => {
      sendButton(renderer).props.onPress();
    });
    await flush();
    expect(texts(renderer)).toContain('Обращений за час уже пять');
    expect(byLabel(renderer, 'Текст обращения').props.value).toBe('Текст');
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('id не нашёлся — ведёт в список обращений', async () => {
    mockCreate.mockResolvedValue({ number: 12, id: null });
    const renderer = await render();
    await type(renderer, 'Тема обращения', 'Пуши');
    await type(renderer, 'Текст обращения', 'Текст');
    await act(async () => {
      sendButton(renderer).props.onPress();
    });
    await flush();
    expect(mockReplace).toHaveBeenCalledWith('/support');
  });
});
