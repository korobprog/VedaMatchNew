import type { ReactTestInstance, ReactTestRenderer } from 'react-test-renderer';
import { act, create } from 'react-test-renderer';
import type { NotificationPreferencesDto } from '@vedamatch/shared';
import { NotificationSwitchesSection } from './notification-switches-section';

/**
 * Сборка раздела «О чём уведомлять» (VED-361). Формулировки проверены
 * отдельно (`lib/notifications/notification-switch-copy.spec.ts`), здесь —
 * что тумблеры действительно два, что они независимы и что нажатие уходит на
 * сервер частичным патчем, не задевая соседа.
 */

const all: NotificationPreferencesDto = {
  enabled: true,
  chat: true,
  calls: true,
  connections: true,
  support: true,
  transits: true,
  market: true,
  notices: true,
  motivation: true,
  music: true,
  work: true,
  travel: true,
  announcements: true,
  telegram: true,
};

const mockLoad = jest.fn(async () => ({ ...all }));
const mockSave = jest.fn(async (patch: Record<string, boolean>) => ({
  ...all,
  ...patch,
}));

const fakeSession = { api: {} };
jest.mock('@/lib/auth/session', () => ({
  __esModule: true,
  useSession: () => fakeSession,
}));

jest.mock('@/theme/theme', () => ({
  __esModule: true,
  useTheme: () => ({ colors: jest.requireActual('@/theme/tokens').light }),
}));

jest.mock('@/lib/notifications/notification-preferences-api', () => ({
  __esModule: true,
  createNotificationPreferencesApi: () => ({
    load: () => mockLoad(),
    save: (patch: Record<string, boolean>) => mockSave(patch),
  }),
}));

function texts(renderer: ReactTestRenderer): string {
  const found: string[] = [];
  const walk = (node: unknown): void => {
    if (typeof node === 'string') {
      found.push(node);
      return;
    }
    if (Array.isArray(node)) {
      for (const child of node) walk(child);
      return;
    }
    if (node && typeof node === 'object' && 'children' in node) {
      walk((node as { children: unknown }).children);
    }
  };
  walk(renderer.toJSON());
  return found.join(' | ');
}

function switches(renderer: ReactTestRenderer): ReactTestInstance[] {
  // `Switch` разворачивается в несколько узлов с теми же props: берём те,
  // что действительно несут обработчик.
  return renderer.root.findAll(
    (node) =>
      node.props?.accessibilityRole === 'switch' &&
      typeof node.props?.onValueChange === 'function',
  );
}

async function render(): Promise<ReactTestRenderer> {
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(<NotificationSwitchesSection />);
  });
  return renderer;
}

beforeEach(() => {
  mockLoad.mockClear();
  mockLoad.mockResolvedValue({ ...all });
  mockSave.mockClear();
});

describe('NotificationSwitchesSection', () => {
  it('показывает два тумблера: сообщения и звонки', async () => {
    const renderer = await render();

    expect(
      switches(renderer).map((node) => node.props.accessibilityLabel),
    ).toEqual(['Уведомления о сообщениях', 'Уведомления о звонках']);
    expect(texts(renderer)).toContain('Звонки');
  });

  it('выключение звонков не трогает сообщения', async () => {
    const renderer = await render();

    await act(async () => switches(renderer)[1].props.onValueChange(false));

    expect(mockSave).toHaveBeenCalledWith({ calls: false });
    expect(switches(renderer)[0].props.value).toBe(true);
    expect(switches(renderer)[1].props.value).toBe(false);
  });

  it('выключение сообщений не трогает звонки', async () => {
    const renderer = await render();

    await act(async () => switches(renderer)[0].props.onValueChange(false));

    expect(mockSave).toHaveBeenCalledWith({ chat: false });
    expect(switches(renderer)[1].props.value).toBe(true);
    expect(texts(renderer)).toContain('Звонки при этом звонят');
  });

  it('сервер не принял правку — тумблер возвращается на место и говорит об этом', async () => {
    mockSave.mockRejectedValueOnce(new Error('сеть'));

    const renderer = await render();
    await act(async () => switches(renderer)[1].props.onValueChange(false));

    expect(switches(renderer)[1].props.value).toBe(true);
    expect(texts(renderer)).toContain('Не удалось сохранить');
  });

  it('общий выключатель портала запирает оба тумблера', async () => {
    mockLoad.mockResolvedValue({ ...all, enabled: false });

    const renderer = await render();

    for (const node of switches(renderer)) {
      expect(node.props.disabled).toBe(true);
    }
    expect(texts(renderer)).toContain('Все уведомления выключены');
  });

  it('настройки не загрузились — не обещаем, что всё включено', async () => {
    mockLoad.mockRejectedValue(new Error('сеть'));

    const renderer = await render();

    expect(switches(renderer)).toHaveLength(0);
    expect(texts(renderer)).toContain('Не удалось загрузить');
  });

  it('у тумблеров есть подсказка для скринридера', async () => {
    const renderer = await render();

    for (const node of switches(renderer)) {
      expect(typeof node.props.accessibilityHint).toBe('string');
      expect(node.props.accessibilityHint.length).toBeGreaterThan(0);
      expect(node.props.accessibilityState.checked).toBe(true);
    }
  });
});
