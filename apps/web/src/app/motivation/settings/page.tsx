import { redirect } from "next/navigation";
import { Header } from "@/components/header";
import { MotivationNav } from "@/components/motivation/motivation-nav";
import { MotivationSettingsForm } from "@/components/motivation/motivation-settings-form";
import { getProfile } from "@/lib/api";
import { getMotivationPreferences } from "@/lib/motivation-api";

export default async function MotivationSettingsPage() {
  const [user, preferences] = await Promise.all([getProfile(), getMotivationPreferences()]);
  if (!user) redirect("/login");
  return <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950"><Header user={user} /><main className="mx-auto max-w-3xl px-4 py-8"><h1 className="text-3xl font-bold text-zinc-900 dark:text-zinc-100">Настройки Motivation</h1><MotivationNav active="settings" /><MotivationSettingsForm initial={preferences ?? { vaishnavaPercent: 50, language: "ru" }} /></main></div>;
}
