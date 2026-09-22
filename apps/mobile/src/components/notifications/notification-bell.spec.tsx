import type { ReactTestInstance, ReactTestRenderer } from 'react-test-renderer';
import { act, create } from 'react-test-renderer';
import { resetUnreadCount, setUnreadCount } from '@/lib/notifications/unread-store';
import { NotificationBell } from './notification-bell';

/**
 * Колокольчик в шапке «Чатов» — единственный вход в ленту (VED-330).
 * Раунд оценки 001 отметил, что тестом он не закрыт.
 */

const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  __esModule: true,
  router: { push: (...args: unknown[]) => mockPush(...args) },
}));

jest.mock('@/theme/theme', () => ({
  __esModule: true,
  useTheme: () => ({ colors: jest.requireActual('@/theme/tokens').light }),
}));

const mounted: ReactTestRenderer[] = [];

function render(): ReactTestRenderer {
  let renderer!: ReactTestRenderer;
  act(() => {
    renderer = create(<NotificationBell />);
  });
  mounted.push(renderer);
  return renderer;
}

function bell(renderer: ReactTestRenderer): ReactTestInstance {
  return renderer.root.findAll(
    (node) =>
      typeof node.props?.onPress === 'function' && node.props?.accessibilityRole === 'button',
  )[0];
}

/** Весь видимый текст — по нему опознаётся сам значок с числом. */
function texts(renderer: ReactTestRenderer): string {
  const found: string[] = [];
  const walk = (node: unknown): void => {
    if (typeof node === 'string') return void found.push(node);
    if (Array.isArray(node)) return void node.forEach(walk);
    if (node && typeof node === 'object' && 'children' in node) {
      walk((node as { children: unknown }).children);
    }
  };
  walk(renderer.toJSON());
  return found.join(' ');
}

beforeEach(() => {
  jest.clearAllMocks();
  resetUnreadCount();
});

afterEach(() => {
  act(() => {
    while (mounted.length > 0) mounted.pop()!.unmount();
  });
});

describe('NotificationBell', () => {
  it('ведёт в ленту уведомлений', () => {
    const renderer = render();
    act(() => bell(renderer).props.onPress());
    expect(mockPush).toHaveBeenCalledWith('/notifications');
  });

  it('без непрочитанного значка нет, и число не проговаривается', () => {
    const renderer = render();
    expect(texts(renderer)).toBe('');
    expect(bell(renderer).props.accessibilityLabel).toBe('Уведомления');
  });

  it('число видно и глазами, и скринридеру', () => {
    const renderer = render();
    act(() => setUnreadCount(7));
    expect(texts(renderer)).toContain('7');
    expect(bell(renderer).props.accessibilityLabel).toBe('Уведомления, непрочитанных: 7');
  });

  it('сотня и больше ужимается в «99+», а подпись остаётся точной', () => {
    const renderer = render();
    act(() => setUnreadCount(128));
    expect(texts(renderer)).toContain('99+');
    // Скринридеру «99+» не годится — ему называем настоящее число.
    expect(bell(renderer).props.accessibilityLabel).toBe('Уведомления, непрочитанных: 128');
  });

  it('следит за общим счётчиком: лента гасит уведомление — значок меняется', () => {
    const renderer = render();
    act(() => setUnreadCount(2));
    expect(texts(renderer)).toContain('2');
    act(() => setUnreadCount(0));
    expect(texts(renderer)).toBe('');
  });

  it('зона нажатия не меньше 44', () => {
    const renderer = render();
    const style = renderer.root.findAll(
      (node) => typeof node.props?.style === 'object' && node.props?.style?.minHeight !== undefined,
    );
    const flat = [
      ...style.map((node) => node.props.style),
      ...renderer.root
        .findAll((node) => Array.isArray(node.props?.style))
        .flatMap((node) => node.props.style),
    ].filter((one) => one && typeof one === 'object' && 'minHeight' in one);
    expect(flat.length).toBeGreaterThan(0);
    for (const one of flat) {
      expect(one.minHeight).toBeGreaterThanOrEqual(44);
      expect(one.minWidth).toBeGreaterThanOrEqual(44);
    }
  });
});
