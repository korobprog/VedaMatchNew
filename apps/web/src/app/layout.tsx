import type { Metadata, Viewport } from "next";
import { Unbounded, Manrope, IBM_Plex_Mono } from "next/font/google";
import { cookies } from "next/headers";
import { ThemeProvider } from "@/components/theme-provider";
import { ServiceWorkerRegistrar } from "@/components/pwa/service-worker-registrar";
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

export const metadata: Metadata = {
  title: "VedaMatch Portal",
  description: "Единый вход во все сервисы VedaMatch",
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

  return (
    <html
      lang="ru"
      suppressHydrationWarning
      data-theme={resolved ?? undefined}
      data-theme-preference={preference}
      style={resolved ? { colorScheme: resolved } : undefined}
      className={`${unbounded.variable} ${manrope.variable} ${ibmPlexMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col font-body">
        <ServiceWorkerRegistrar />
        <ThemeProvider initialPreference={preference}>{children}</ThemeProvider>
      </body>
    </html>
  );
}
