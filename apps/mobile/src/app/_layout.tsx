import { Manrope_400Regular } from '@expo-google-fonts/manrope/400Regular';
import { Manrope_500Medium } from '@expo-google-fonts/manrope/500Medium';
import { Manrope_600SemiBold } from '@expo-google-fonts/manrope/600SemiBold';
import { Manrope_700Bold } from '@expo-google-fonts/manrope/700Bold';
import { Unbounded_500Medium } from '@expo-google-fonts/unbounded/500Medium';
import { Unbounded_700Bold } from '@expo-google-fonts/unbounded/700Bold';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { SessionProvider, useSession } from '@/lib/auth/session';
import { CallProvider } from '@/lib/calls/call-provider';
import { ChatStreamProvider } from '@/lib/chat/chat-stream';
import { PushBridge } from '@/lib/push/push-bridge';
import { TelegramShell } from '@/lib/telegram/telegram-shell';
import { ThemeProvider, useTheme } from '@/theme/theme';

SplashScreen.preventAutoHideAsync().catch(() => undefined);

// Под беседой, открытой ссылкой или пушем с холодного старта, всегда лежат
// вкладки: системная стрелка «назад» ведёт в список, а не закрывает приложение.
export const unstable_settings = { anchor: '(tabs)' };

/**
 * Гость видит только экран входа, вошедший — только вкладки. Пока сессия
 * восстанавливается из хранилища, не показываем ничего: мигание экрана входа
 * перед чатами выглядит как разлогин.
 */
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
          {/* Экран звонка (VED-219): модалью на весь экран, без системной
              шапки и без жеста «назад» — трубку кладут кнопкой, не свайпом. */}
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
  // Этот файл остаётся БЕЗЫМЕННЫМ `_layout.tsx` (не `_layout.native.tsx`) не
  // просто по соглашению: `expo-router` требует ровно так — платформенный
  // файл-«близнец» (`_layout.web.tsx`) обязан иметь безымянный fallback без
  // расширения-платформы, без него сборка веба падает в рантайме с ошибкой
  // «does not have a fallback sibling file without a platform extension»
  // (проверено на практике при попытке переименовать в `.native.tsx`).
  //
  // Из-за этого правила `require.context` маршрутизатора всё равно включает
  // код ЭТОГО файла (со всеми шестью начертаниями `@expo-google-fonts`) в
  // веб-сборку отдельным чанком, хотя веб его не использует и ни разу не
  // запрашивает по сети (специфичность файла без платформенного расширения
  // ниже, чем у `_layout.web.tsx` — см. `getFileMeta` в `expo-router/build/
  // getRoutesCore.js`): чанк лежит в `dist-web` мёртвым грузом, но не
  // качается. `scripts/patch-web-preloads.mjs` вдобавок явно не предзагружает
  // именно этот чанк (`isDeadNativeLayoutChunk` в `web-preload-chunks.mjs`
  // отличает его по строке `expo-google-fonts` в содержимом), чтобы не
  // отбирать полосу у нужных файлов на медленной сети.
  //
  // Шрифты вшиты в сборку пакетами @expo-google-fonts: на телефоне без сети
  // заголовки не должны откатываться на системный шрифт. Веб-сборка эту
  // ветку не использует вовсе — см. `_layout.web.tsx` и `public/index.html`:
  // там имена начертаний объявлены как `@font-face` с `font-display: swap`,
  // ждать `useFonts` незачем.
  const [loaded, error] = useFonts({
    Unbounded_500Medium,
    Unbounded_700Bold,
    Manrope_400Regular,
    Manrope_500Medium,
    Manrope_600SemiBold,
    Manrope_700Bold,
  });

  useEffect(() => {
    if (loaded || error) SplashScreen.hideAsync().catch(() => undefined);
  }, [loaded, error]);

  if (!loaded && !error) return null;

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
