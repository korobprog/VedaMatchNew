import type { Metadata } from "next";
import { LoginCard } from "@/components/login-card";
import { SessionRestore } from "@/components/session-restore";
import { getSafeReturnTo } from "@/lib/return-to";
import { needsSessionRestore } from "@/lib/session-marker";

export const metadata: Metadata = { title: "Вход" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string | string[] }>;
}) {
  const { returnTo: raw } = await searchParams;
  const returnTo = getSafeReturnTo(Array.isArray(raw) ? raw[0] : raw);
  // Сюда попадают и те, у кого истёк access, но жив refresh (страницы шлют
  // на /login?returnTo=…): им не форма нужна, а тихий refresh и возврат.
  if (await needsSessionRestore()) {
    return <SessionRestore returnTo={returnTo} />;
  }
  return <LoginCard returnTo={returnTo} />;
}
