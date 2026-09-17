import type { ReactNode } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { SessionProvider } from '@/lib/auth/session';
import { CallProvider } from '@/lib/calls/call-provider';
import { ChatStreamProvider } from '@/lib/chat/chat-stream';
import { ThemeProvider } from '@/theme/theme';
import { RootStack } from './root-shell-stack';

/**
 * Провайдеры корневого layout — телефон (Android/iOS). Список экранов
 * общий для обеих платформ и живёт в `root-shell-stack.tsx`: заведённый
 * только в одном файле экран на другой платформе молча не откроется.
 *
 * На телефоне `KeyboardProvider` и `CallProvider` висят всегда —
 * `react-native-reanimated` в бинарнике и так есть целиком, откладывать
 * нечего. Веб-версия отличается: там то же самое стоит ~700 КБ несжатого
 * JS в первом экране, поэтому `root-shell.web.tsx` грузит их по требованию
 * — см. комментарий там и `gan-harness/perf-after.md`.
 */
export { RootStack };

export function RootProviders({ children }: { children: ReactNode }) {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <KeyboardProvider>
          <ThemeProvider>
            <SessionProvider>
              <ChatStreamProvider>
                <CallProvider>{children}</CallProvider>
              </ChatStreamProvider>
            </SessionProvider>
          </ThemeProvider>
        </KeyboardProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
