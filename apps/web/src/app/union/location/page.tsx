import Link from "next/link";
import { redirect } from "next/navigation";
import { Header } from "@/components/header";
import { UnionLocationOnboarding } from "@/components/union/union-location-onboarding";
import { getProfile } from "@/lib/api";
import { hasCompleteUnionLocation } from "@/lib/union-location";
import { BackgroundOrbs } from "@/components/landing/Orb";
import { NoiseOverlay } from "@/components/landing/NoiseOverlay";

export default async function UnionLocationPage() {
  const user = await getProfile();
  if (!user) redirect("/login");
  if (hasCompleteUnionLocation(user)) redirect("/union");

  return (
    <div className="relative min-h-screen bg-bg-0">
      <BackgroundOrbs />
      <NoiseOverlay />
      <Header user={user} />
      <main className="mx-auto max-w-2xl px-4 py-8 pb-24">
        <Link
          href="/"
          className="mb-5 inline-flex text-sm font-medium text-text-1 hover:text-magenta"
        >
          ← На главную
        </Link>
        <h1 className="font-display text-2xl font-bold text-text-0">
          Укажите страну и город
        </h1>
        <p className="mb-6 mt-2 text-text-1">
          Локация нужна для подбора людей рядом и корректной работы фильтров
          VedaMatch Union.
        </p>
        <UnionLocationOnboarding />
      </main>
    </div>
  );
}
