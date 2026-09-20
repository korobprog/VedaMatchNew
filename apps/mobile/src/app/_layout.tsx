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
import { useEffect, useState } from 'react';
import { RootProviders, RootStack } from '@/components/root-shell';
import { FONT_LOAD_TIMEOUT_MS, shouldWaitForFonts } from '@/lib/font-load-guard';

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

  // Белый экран навсегда (регрессия на Samsung A51, `font-load-guard.ts`):
  // `useFonts` иногда не резолвится и не реджектится — раньше `return null`
  // ниже не имел выхода из этого состояния вообще. Если за 3 с ни `loaded`,
  // ни `error` не пришли — рендерим приложение как есть: недогруженный
  // шрифт откатится на системный (`fonts.body`/`fonts.display` в
  // `theme/tokens.ts` — обычные строковые имена начертаний, отсутствующее
  // просто не применится), что лучше вечно пустого экрана.
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    if (loaded || error) return undefined;
    const timer = setTimeout(() => {
      // eslint-disable-next-line no-console
      console.warn(`[fonts] useFonts не отдал ни loaded, ни error за ${FONT_LOAD_TIMEOUT_MS} мс — рендерим приложение без ожидания`);
      setTimedOut(true);
    }, FONT_LOAD_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [loaded, error]);

  useEffect(() => {
    if (error) {
      // eslint-disable-next-line no-console
      console.warn('[fonts] useFonts вернул ошибку — рендерим приложение с тем, что успело загрузиться', error);
    }
  }, [error]);

  useEffect(() => {
    if (loaded || error || timedOut) SplashScreen.hideAsync().catch(() => undefined);
  }, [loaded, error, timedOut]);

  if (shouldWaitForFonts(loaded, Boolean(error), timedOut)) return null;

  return (
    <RootProviders>
      <RootStack />
    </RootProviders>
  );
}
