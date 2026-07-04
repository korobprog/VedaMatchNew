import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "VedaMatch Portal",
  description: "Единый вход во все сервисы VedaMatch",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru" className="h-full antialiased">
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
