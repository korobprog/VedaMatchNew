import { router, usePathname } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTheme } from '@/theme/theme';
import { loadTelegramWebApp, telegramLaunch, type TelegramWebApp } from './web-app';

/**
 * Веб-версия внутри Telegram: сообщить, что приложение готово, развернуть
 * его на всю высоту, покрасить шапку Telegram в цвет фона и отдать системной
 * кнопке «Назад» навигацию по экранам. Вне Telegram — ничего.
 */
export function TelegramShell() {
  const { colors } = useTheme();
  const pathname = usePathname();
  const [app, setApp] = useState<TelegramWebApp | null>(null);

  useEffect(() => {
    if (!telegramLaunch) return;
    let cancelled = false;
    void loadTelegramWebApp().then((loaded) => {
      if (cancelled || !loaded) return;
      loaded.ready();
      loaded.expand();
      // Свайп вниз по списку чатов иначе сворачивает мини-приложение.
      if (loaded.isVersionAtLeast('7.7')) loaded.disableVerticalSwipes?.();
      setApp(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!app || !app.isVersionAtLeast('6.1')) return;
    app.setHeaderColor(colors.bg0);
    app.setBackgroundColor(colors.bg0);
  }, [app, colors.bg0]);

  useEffect(() => {
    if (!app || !app.isVersionAtLeast('6.1')) return;
    const goBack = () => router.back();
    // На вкладках «Назад» закрыл бы мини-приложение — прячем.
    if (router.canGoBack()) app.BackButton.show();
    else app.BackButton.hide();
    app.BackButton.onClick(goBack);
    return () => app.BackButton.offClick(goBack);
  }, [app, pathname]);

  return null;
}
