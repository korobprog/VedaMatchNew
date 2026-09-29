import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Библиотека",
  description: "Книги ачарьев для преданных: читайте онлайн и офлайн",
};

export default function VedabaseLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children;
}
