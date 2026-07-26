import type { Metadata, Viewport } from "next";
import { Unbounded, Manrope, IBM_Plex_Mono } from "next/font/google";
import { ThemeProvider, themeInitScript } from "@/components/theme-provider";
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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ru"
      suppressHydrationWarning
      className={`${unbounded.variable} ${manrope.variable} ${ibmPlexMono.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="flex min-h-full flex-col font-body">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
