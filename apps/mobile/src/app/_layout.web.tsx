import { RootProviders, RootStack } from '@/components/root-shell';

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

export default function RootLayout() {
  return (
    <RootProviders>
      <RootStack />
    </RootProviders>
  );
}
