import { Component, lazy, Suspense, type ReactNode } from 'react';
// Глубокий импорт мимо `react-native-gesture-handler/index.js` — намеренно
// (см. большой комментарий ниже, пункт 3): баррел реэкспортирует
// `Swipeable`/`DrawerLayout`/`PanGestureHandler`, а те при загрузке модуля
// пытаются `require('react-native-reanimated')` (необязательная интеграция,
// `reanimatedWrapper.js`, — try/catch там ловит рантайм, а не решение
// Metro включать модуль в бандл). Сам `GestureHandlerRootView` на вебе —
// тривиальный `View` (`GestureHandlerRootView.web.js` пакета) без
// реанимейтеда вовсе; в приложении больше ничего из этого пакета не
// используется впрямую (`grep -rl 'react-native-gesture-handler' src`).
import GestureHandlerRootView from 'react-native-gesture-handler/lib/module/components/GestureHandlerRootView';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { SessionProvider, useSession } from '@/lib/auth/session';
import { ChatStreamProvider } from '@/lib/chat/chat-stream';
import { ThemeProvider } from '@/theme/theme';
import { RootStack } from './root-shell-stack';

/**
 * Провайдеры корневого layout — браузер (`ios.vedamatch.com`). Список
 * экранов общий с телефоном и живёт в `root-shell-stack.tsx`; здесь —
 * только то, что на вебе устроено иначе, чтобы гость не качал JS, который
 * ему негде применить до входа.
 *
 * Отложено два тяжёлых модуля, оба тянут `react-native-reanimated` (~700 КБ
 * несжатого JS — почти треть первого экрана, замер до правки —
 * `gan-harness/perf-after.md`):
 *
 * 1. `KeyboardProvider` — не монтируется вовсе. У `react-native-keyboard-
 *    controller` есть безопасный контекст по умолчанию
 *    (`KeyboardContext` в `context.js` пакета) — без провайдера
 *    `useKeyboardContext()`/`KeyboardAwareScrollView`/`KeyboardAvoidingView`
 *    получают заглушку вместо реальных значений клавиатуры и не падают
 *    (в деве только предупреждение в консоль). Экран входа не показывает
 *    ни одного текстового поля вне `__DEV__`; отладочная форма пароля —
 *    обычный `TextInput` без keyboard-avoiding. Единственные два места, где
 *    компоненты пакета вообще используются (`chat/[id].tsx`,
 *    `people/[id].tsx`), теперь сами грузят их по требованию —
 *    `components/keyboard-controller-web.web.tsx`.
 * 2. `CallProvider` — гость не может ни принять, ни начать звонок (нет
 *    аккаунта), поэтому для `status !== 'signed'` он не монтируется вовсе:
 *    ни байта его модульного графа (WebRTC-сессия, `expo-audio` + рингтоны,
 *    `react-native-incall-manager`) не уходит в сеть, пока не вошли.
 *    Как только сессия становится `signed`, чанк грузится через `import()`
 *    в фоне: `Suspense` в `CallGate` подменяется на реальный провайдер,
 *    когда чанк готов, а до этого момента рендерит `children` без звонков —
 *    `useChatCalls()` и так по контракту может вернуть `null` (см.
 *    `call-provider.tsx`), интерфейсы это уже учитывают. `ErrorBoundary`
 *    рядом — на случай обрыва сети при загрузке чанка: без него `lazy()`
 *    уронил бы всё дерево, а не только звонки.
 */

const LazyCallProvider = lazy(() =>
  import('@/lib/calls/call-provider').then((m) => ({ default: m.CallProvider })),
);

/**
 * `fallback` — то же дерево `children`, но без звонков: если чанк не
 * загрузился (обрыв сети), после ошибки рендерим именно его, а не то же
 * упавшее поддерево `Suspense`/`LazyCallProvider` заново.
 */
class CallChunkBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    // eslint-disable-next-line no-console
    console.warn('Не удалось загрузить модуль звонков на вебе — работаем без звонков', error);
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

function CallGate({ children }: { children: ReactNode }) {
  const { status } = useSession();
  if (status !== 'signed') return <>{children}</>;
  return (
    <CallChunkBoundary fallback={children}>
      <Suspense fallback={<>{children}</>}>
        <LazyCallProvider>{children}</LazyCallProvider>
      </Suspense>
    </CallChunkBoundary>
  );
}

export { RootStack };

export function RootProviders({ children }: { children: ReactNode }) {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <SessionProvider>
            <ChatStreamProvider>
              <CallGate>{children}</CallGate>
            </ChatStreamProvider>
          </SessionProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
