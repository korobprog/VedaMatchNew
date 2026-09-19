import { IBMPlexMono_400Regular } from '@expo-google-fonts/ibm-plex-mono/400Regular';
import { IBMPlexMono_600SemiBold } from '@expo-google-fonts/ibm-plex-mono/600SemiBold';
import { Manrope_400Regular } from '@expo-google-fonts/manrope/400Regular';
import { Manrope_500Medium } from '@expo-google-fonts/manrope/500Medium';
import { Manrope_600SemiBold } from '@expo-google-fonts/manrope/600SemiBold';
import { Manrope_700Bold } from '@expo-google-fonts/manrope/700Bold';
import { Unbounded_500Medium } from '@expo-google-fonts/unbounded/500Medium';
import { Unbounded_700Bold } from '@expo-google-fonts/unbounded/700Bold';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { RootProviders, RootStack } from '@/components/root-shell';

SplashScreen.preventAutoHideAsync().catch(() => undefined);

// Под беседой, открытой ссылкой или пушем с холодного старта, всегда лежат
// вкладки: системная стрелка «назад» ведёт в список, а не закрывает приложение.
export const unstable_settings = { anchor: '(tabs)' };

export default function RootLayout() {
  // Безымянный `_layout.tsx`, а не `.native.tsx`: `expo-router` требует
  // fallback рядом с платформенным `_layout.web.tsx`, иначе веб-сборка
  // падает в рантайме. В браузере используется `_layout.web.tsx`.
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
    // Цифры голосовых сообщений (`fonts.mono`, VED-286) — тот же выбор,
    // что `--font-mono` на сайте (`apps/web/src/app/globals.css`): IBM Plex
    // Mono, табличные цифры фиксированной ширины, чтобы время не «прыгало».
    IBMPlexMono_400Regular,
    IBMPlexMono_600SemiBold,
  });

  useEffect(() => {
    if (loaded || error) SplashScreen.hideAsync().catch(() => undefined);
  }, [loaded, error]);

  if (!loaded && !error) return null;

  return (
    <RootProviders>
      <RootStack />
    </RootProviders>
  );
}
