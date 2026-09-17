import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { SessionProvider, useSession } from '@/lib/auth/session';
import { CallProvider } from '@/lib/calls/call-provider';
import { ChatStreamProvider } from '@/lib/chat/chat-stream';
import { PushBridge } from '@/lib/push/push-bridge';
import { TelegramShell } from '@/lib/telegram/telegram-shell';
import { ThemeProvider, useTheme } from '@/theme/theme';

// Корневой layout веб-сборки (ios.vedamatch.com, веха 6 «Скорость»).
//
// На телефоне шрифты вшиты в APK и `useFonts` ждёт ~1,1 МБ TTF, прежде чем
// показать хоть что-то — без сети иначе заголовки откатились бы на системный
// шрифт. В браузере то же самое устроено иначе и ждать нечего: имена
// начертаний (`fonts.*` из `src/theme/tokens.ts`) объявлены как `@font-face`
// прямо в `public/index.html` с `font-display: swap`, поэтому браузер сам
// рисует текст системным шрифтом немедленно и подменяет его на загруженный
// woff2, как только тот придёт — без прыжка макета и без ожидания в JS.
// Экран входа поэтому не мигает пустым кадром, а показывается сразу.
export const unstable_settings = { anchor: '(tabs)' };

function RootStack() {
  const { scheme, colors } = useTheme();
  const { status } = useSession();
  if (status === 'loading') return null;
  return (
    <>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <PushBridge />
      <TelegramShell />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg0 } }}>
        <Stack.Protected guard={status === 'guest'}>
          <Stack.Screen name="login" />
          <Stack.Screen name="auth" />
        </Stack.Protected>
        <Stack.Protected guard={status === 'signed'}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="account" />
          <Stack.Screen name="chat/[id]" />
          <Stack.Screen name="chat/requests" />
          <Stack.Screen name="people/[id]" />
          <Stack.Screen name="communities/[id]" />
          <Stack.Screen name="calls-probe" />
          <Stack.Screen
            name="call/[id]"
            options={{ presentation: 'fullScreenModal', headerShown: false, gestureEnabled: false, animation: 'fade' }}
          />
        </Stack.Protected>
      </Stack>
    </>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <KeyboardProvider>
          <ThemeProvider>
            <SessionProvider>
              <ChatStreamProvider>
                <CallProvider>
                  <RootStack />
                </CallProvider>
              </ChatStreamProvider>
            </SessionProvider>
          </ThemeProvider>
        </KeyboardProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
