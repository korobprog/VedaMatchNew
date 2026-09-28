import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { cookies } from "next/headers";
import { NextIntlClientProvider } from "next-intl";
import { getLocale } from "next-intl/server";
import { ThemeProvider } from "@/components/theme-provider";
import { TimeZoneSync } from "@/components/time-zone-sync";
import { ServiceWorkerRegistrar } from "@/components/pwa/service-worker-registrar";
import { SessionGuard } from "@/components/session-guard";
import { VpnNotice } from "@/components/vpn-notice";
import { ServiceCatalogProvider } from "@/components/service-catalog-provider";
import { MusicPlayerProvider } from "@/components/music/player/player-provider";
import { MiniPlayer } from "@/components/music/player/mini-player";
import { MusicRadioBar } from "@/components/music/radio/radio-bar";
import { MusicRadioProvider } from "@/components/music/radio/radio-provider";
import { PortalWindowsTracker } from "@/components/quick/portal-windows-tracker";
import { PortalCallProviders } from "@/components/chat/calls/portal-call-providers";
import { SpeechDock } from "@/components/speech/speech-dock";
import { WorkUploadIndicator } from "@/components/work/upload-indicator";
import { getProfile, getPublicServices } from "@/lib/api";
import { isThemePreference, THEME_COOKIE_NAME } from "@/lib/theme";
import "./globals.css";

// Шрифты лежат в репозитории (src/app/fonts, собирает scripts/build-fonts.sh),
// а не тянутся next/font/google на сборке: без ответа fonts.googleapis.com
// падал `next build` в CI. Кириллица и латиница склеены в один файл.
// Unbounded и Manrope вариативные, как их раздаёт Google, — один файл на все веса.
const unbounded = localFont({
  src: "./fonts/unbounded-700-900.woff2",
  weight: "700 900",
  variable: "--font-unbounded",
  display: "swap",
  preload: false,
});

const manrope = localFont({
  src: "./fonts/manrope-400-700.woff2",
  weight: "400 700",
  variable: "--font-manrope",
  display: "swap",
  preload: false,
});

const ibmPlexMono = localFont({
  src: [
    { path: "./fonts/ibm-plex-mono-400.woff2", weight: "400" },
    { path: "./fonts/ibm-plex-mono-500.woff2", weight: "500" },
  ],
  variable: "--font-mono",
  display: "swap",
  preload: false,
  // У next/font/google метрик для Plex Mono не было, подменного шрифта он не
  // заводил. Arial-подмена под моноширинный только исказила бы метрики.
  adjustFontFallback: false,
});

// Абсолютный адрес нужен превью в мессенджерах: og:image обязан быть полным URL.
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://vedamatch.ru";

const OG_LOCALE: Record<string, string> = { ru: "ru_RU", en: "en_US" };

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  return {
    metadataBase: new URL(SITE_URL),
    title: { default: "VedaMatch Portal", template: "%s — VedaMatch" },
    description: "Единый вход во все сервисы VedaMatch",
    // Картинку и её размеры Next подставляет сам из src/app/opengraph-image.png,
    // иначе Telegram берёт первое попавшееся фото со страницы.
    openGraph: {
      type: "website",
      siteName: "VedaMatch",
      // og:locale следует за языком интерфейса, а не прибит к ru_RU.
      locale: OG_LOCALE[locale] ?? OG_LOCALE.ru,
      url: SITE_URL,
      title: "VedaMatch Portal",
      description: "Единый вход во все сервисы VedaMatch",
    },
    twitter: {
      card: "summary_large_image",
      title: "VedaMatch Portal",
      description: "Единый вход во все сервисы VedaMatch",
    },
  };
}

export const viewport: Viewport = {
  // Под вырезы и скругления телефонов: контент заходит под них, отступы даёт
  // safe-area (см. .safe-top в globals.css).
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#FBF9FF" },
    { media: "(prefers-color-scheme: dark)", color: "#0A0614" },
  ],
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Тема приходит из cookie прямо в разметке: инлайн-скрипт до первой отрисовки
  // не нужен, а React больше не встречает <script> внутри дерева компонентов.
  const cookieStore = await cookies();
  const stored = cookieStore.get(THEME_COOKIE_NAME)?.value;
  const preference = isThemePreference(stored) ? stored : "system";
  // Есть ли вообще сессия. Ровно тот же признак, по которому режет доступ
  // proxy.ts, — чтобы плеер и портал считали вошедшим одного и того же.
  const hasSession = Boolean(cookieStore.get("access_token")?.value);
  // Для «как в системе» атрибут не ставим — тему подхватит prefers-color-scheme.
  const resolved = preference === "system" ? null : preference;
  const locale = await getLocale();
  // Названия сервисов приходят из каталога, а не из копирайта в коде:
  // так правка имени в админке доезжает и до лендинга, и до шапки.
  const services = (await getPublicServices()) ?? [];
  // Кто вошёл — ради звонков (VED-231): провайдеру нужен id, а он должен
  // стоять над всеми страницами, не только над группой (portal). getProfile
  // под React.cache, так что страница и layout группы получают тот же ответ
  // без второго запроса. Сбой API не должен ронять всякую страницу — тогда
  // просто без звонков.
  const me = hasSession ? await getProfile().catch(() => null) : null;

  return (
    <html
      lang={locale}
      suppressHydrationWarning
      data-theme={resolved ?? undefined}
      data-theme-preference={preference}
      style={resolved ? { colorScheme: resolved } : undefined}
      className={`${unbounded.variable} ${manrope.variable} ${ibmPlexMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col font-body">
        {/*
          Обычный <script async>, а не next/script со стратегией
          beforeInteractive: тот кладёт <script> в дерево компонентов, и
          React 19 ругается «Encountered a script tag while rendering React
          component» на каждой странице. Асинхронный скрипт с `src` React 19
          считает ресурсом, поднимает в <head> сам и не жалуется.

          Побочная выгода — он выполняется при разборе документа, то есть
          РАНЬШЕ, чем bootstrap Next выполняет очередь `__next_s`. Ради этого
          всё и затевалось: Chrome шлёт beforeinstallprompt один раз и рано.

          Содержимое файла сверяется с installPromptCaptureScript тестом
          prompt-capture.spec.ts, чтобы копия не разъехалась с оригиналом.
        */}
        <script async src="/pwa-install-prompt.js" />
        <ServiceWorkerRegistrar />
        <SessionGuard />
        {/* Предупреждение про VPN (VED-275) — в корневом layout, а не в
            layout раздела: портал не работает с туннелем на любой странице, и
            человек должен узнать причину там, где застрял. Гостю тоже: с
            включённым VPN не открывается и лендинг. */}
        <VpnNotice />
        <NextIntlClientProvider>
          <ServiceCatalogProvider services={services}>
            <ThemeProvider initialPreference={preference}>
              {/* Вторая и последняя точка касания портала сервисом «Музыка»
                  (первая — строка в app.module.ts на бэкенде). Объявлена
                  заранее в docs/music-service-plan.md, решение 6: звук обязан
                  пережить переход между разделами, а плеер, смонтированный
                  внутри /music, умирает на первом же клике в шапке.
                  Полоса рисуется, только когда есть что играть.

                  Гостю плеера нет вовсе. Провайдер восстанавливает последнюю
                  запись из localStorage, а оно переживает выход из аккаунта —
                  и полоса всплывала поверх лендинга у человека, который
                  когда-то слушал в этом браузере. Признак сессии берём здесь,
                  в серверном компоненте: cookie httpOnly, из браузера её не
                  видно, и решить это на клиенте нечем. */}
              {hasSession ? (
                <MusicPlayerProvider>
                  {/* Часовой пояс устройства — в профиль, ради утренних
                      рассылок. Только у вошедшего: гостю профиля нет. */}
                  <TimeZoneSync />
                  {/* История окон портала (VED-118). В корневом layout, а не
                      в группе (portal): шапка с панелью горячих кнопок есть и
                      на страницах вне этой группы — в Образовании, во
                      Вдохновении, в поиске, — и окно, теряющее там свою
                      историю, вело бы себя загадочно. Гостю окон нет:
                      переключать ему нечего. */}
                  <PortalWindowsTracker />
                  {/* «Радио VM» (VED-437) — рядом с плеером и тоже на весь
                      портал: эфир переживает переход между разделами. */}
                  <MusicRadioProvider>
                    {/* Звонки (VED-231) — на всех страницах вошедшего: окно
                        «Входящий звонок» и рингтон не должны зависеть от
                        того, в какой группе маршрутов лежит страница. */}
                    <PortalCallProviders userId={me?.id}>
                      {children}
                    </PortalCallProviders>
                    <MiniPlayer />
                    <MusicRadioBar />
                    {/* Загрузки «Работы» (VED-608): задача и её скриншоты
                        догружаются после ухода с доски в другое окно
                        портала, и прогресс с итогом видно на любой
                        странице. Как у плеера: смонтированный на доске
                        индикатор умер бы вместе с ней. */}
                    <WorkUploadIndicator />
                  </MusicRadioProvider>
                </MusicPlayerProvider>
              ) : (
                children
              )}
              {/* Пульт озвучки (VED-569): «Слушать» в Блог-ленте,
                  Образовании или Вдохновении продолжает читать и после ухода
                  со страницы, и остановить его можно с любой. Вне ветки
                  сессии: читают и гостю. Пока речи нет, пульт не рисуется. */}
              <SpeechDock />
            </ThemeProvider>
          </ServiceCatalogProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
