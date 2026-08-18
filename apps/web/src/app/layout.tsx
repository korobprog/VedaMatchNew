import type { Metadata, Viewport } from "next";
import { Unbounded, Manrope, IBM_Plex_Mono } from "next/font/google";
import { cookies } from "next/headers";
import { NextIntlClientProvider } from "next-intl";
import { getLocale } from "next-intl/server";
import { ThemeProvider } from "@/components/theme-provider";
import { ServiceWorkerRegistrar } from "@/components/pwa/service-worker-registrar";
import { SessionGuard } from "@/components/session-guard";
import { isThemePreference, THEME_COOKIE_NAME } from "@/lib/theme";
import "./globals.css";

const unbounded = Unbounded({
  subsets: ["cyrillic", "latin"],
  weight: ["700", "800", "900"],
  variable: "--font-unbounded",
  display: "swap",
  preload: false,
});

const manrope = Manrope({
  subsets: ["cyrillic", "latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-manrope",
  display: "swap",
  preload: false,
});

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ["cyrillic", "latin"],
  weight: ["400", "500"],
  variable: "--font-mono",
  display: "swap",
  preload: false,
});

// Абсолютный адрес нужен превью в мессенджерах: og:image обязан быть полным URL.
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://vedamatch.ru";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "VedaMatch Portal",
  description: "Единый вход во все сервисы VedaMatch",
  // Картинку и её размеры Next подставляет сам из src/app/opengraph-image.png,
  // иначе Telegram берёт первое попавшееся фото со страницы.
  openGraph: {
    type: "website",
    siteName: "VedaMatch",
    locale: "ru_RU",
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

export const viewport: Viewport = {
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
  // Для «как в системе» атрибут не ставим — тему подхватит prefers-color-scheme.
  const resolved = preference === "system" ? null : preference;
  const locale = await getLocale();

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
        <NextIntlClientProvider>
          <ThemeProvider initialPreference={preference}>{children}</ThemeProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
