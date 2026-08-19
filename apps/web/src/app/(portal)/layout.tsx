import type { ReactNode } from "react";
import { Header } from "@/components/header";
import { requireUser } from "@/lib/require-user";

/**
 * Приватные разделы портала: один guard и одна шапка на всех вместо
 * повторяющегося `getProfile → redirect → <Header/>` в каждой странице.
 * Страница отдаёт только `<main>`; фон и min-h-screen — здесь.
 */
export default async function PortalLayout({
  children,
}: {
  children: ReactNode;
}) {
  const user = await requireUser();
  return (
    <div className="relative min-h-screen bg-bg-0">
      <Header user={user} />
      {children}
    </div>
  );
}
