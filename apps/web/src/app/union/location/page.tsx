import Link from "next/link";
import { redirect } from "next/navigation";
import { Header } from "@/components/header";
import { UnionLocationOnboarding } from "@/components/union/union-location-onboarding";
import { getProfile } from "@/lib/api";
import { hasCompleteUnionLocation } from "@/lib/union-location";

export default async function UnionLocationPage() {
  const user = await getProfile();
  if (!user) redirect("/login");
  if (hasCompleteUnionLocation(user)) redirect("/union");

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <Header user={user} />
      <main className="mx-auto max-w-2xl px-4 py-8">
        <Link
          href="/"
          className="mb-5 inline-flex text-sm font-medium text-amber-700 hover:text-amber-800 dark:text-amber-300"
        >
          ← На главную
        </Link>
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
          Укажите страну и город
        </h1>
        <p className="mb-6 mt-2 text-zinc-600 dark:text-zinc-400">
          Локация нужна для подбора людей рядом и корректной работы фильтров
          VedaMatch Union.
        </p>
        <UnionLocationOnboarding />
      </main>
    </div>
  );
}
