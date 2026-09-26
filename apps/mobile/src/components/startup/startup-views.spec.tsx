import { Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { OFFLINE_BANNER_TEXT } from '@/lib/startup/startup-decision';
import { OfflineBannerFrame } from './offline-banner';
import { StartupOfflineScreen } from './startup-offline-screen';

/**
 * Экраны старта без сети: экран повтора и плашка над вкладками. Решение,
 * КОГДА их показывать, проверено в `startup-decision.spec.ts`; здесь — что
 * показанное читаемо скринридером, кнопка работает, а плашка не удваивает
 * верхний отступ экранов под собой.
 */

jest.mock('react-native-safe-area-context', () => {
  const { createContext, useContext } = jest.requireActual<typeof import('react')>('react');
  const insets = { top: 24, bottom: 16, left: 0, right: 0 };
  const SafeAreaInsetsContext = createContext(insets);
  return {
    __esModule: true,
    SafeAreaInsetsContext,
    useSafeAreaInsets: () => useContext(SafeAreaInsetsContext),
  };
});

function texts(tree: ReactTestRenderer): string[] {
  return tree.root.findAllByType(Text).map((node) => [node.props.children].flat().join(''));
}

describe('StartupOfflineScreen', () => {
  it('без сети: заголовок-«header», просьба включить интернет, «Повторить»', () => {
    const onRetry = jest.fn();
    let tree!: ReactTestRenderer;
    act(() => {
      tree = create(<StartupOfflineScreen connectivity="offline" retrying={false} onRetry={onRetry} />);
    });
    const header = tree.root.findAll((node) => node.props.accessibilityRole === 'header' && node.type === Text);
    expect(header).toHaveLength(1);
    expect(texts(tree)).toEqual(expect.arrayContaining(['Нет соединения', 'Повторить']));
    expect(texts(tree).join(' ')).toMatch(/интернет/);

    const button = tree.root.find((node) => node.props.accessibilityRole === 'button' && typeof node.props.onPress === 'function');
    act(() => button.props.onPress());
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('во время повтора кнопка занята и не нажимается', () => {
    let tree!: ReactTestRenderer;
    act(() => {
      tree = create(<StartupOfflineScreen connectivity="online" retrying onRetry={jest.fn()} />);
    });
    const button = tree.root.find((node) => node.props.accessibilityRole === 'button' && typeof node.props.onPress === 'function');
    expect(button.props.disabled).toBe(true);
    expect(button.props.accessibilityState).toEqual({ busy: true, disabled: true });
  });
});

describe('OfflineBannerFrame', () => {
  let seenTop: number | null = null;
  function Probe() {
    seenTop = useSafeAreaInsets().top;
    return null;
  }

  beforeEach(() => {
    seenTop = null;
  });

  it('без сети — плашка-«alert», экранам под ней вырез уже не нужен', () => {
    let tree!: ReactTestRenderer;
    act(() => {
      tree = create(
        <OfflineBannerFrame visible>
          <Probe />
        </OfflineBannerFrame>,
      );
    });
    expect(texts(tree)).toContain(OFFLINE_BANNER_TEXT);
    expect(tree.root.findAll((node) => node.props.accessibilityRole === 'alert')).not.toHaveLength(0);
    expect(seenTop).toBe(0);
  });

  it('с сетью — плашки нет, отступ выреза экранам прежний', () => {
    let tree!: ReactTestRenderer;
    act(() => {
      tree = create(
        <OfflineBannerFrame visible={false}>
          <Probe />
        </OfflineBannerFrame>,
      );
    });
    expect(texts(tree)).not.toContain(OFFLINE_BANNER_TEXT);
    expect(seenTop).toBe(24);
  });
});
