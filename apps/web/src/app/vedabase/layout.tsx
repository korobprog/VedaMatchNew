import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Vedabase",
  description: "Офлайн-библиотека ведических книг VedaMatch",
  manifest: "/vedabase.webmanifest",
};

export default function VedabaseLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children;
}
