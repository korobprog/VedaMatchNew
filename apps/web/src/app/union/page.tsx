import { redirect } from "next/navigation";
import { Header } from "@/components/header";
import { UnionNav } from "@/components/union/union-nav";
import { UnionProfileForm } from "@/components/union/union-profile-form";
import { getProfile } from "@/lib/api";
import {
  getUnionConnectionCounts,
  getUnionProfileState,
} from "@/lib/union-api";
import { hasCompleteUnionLocation } from "@/lib/union-location";
import { BackgroundOrbs } from "@/components/landing/Orb";
import { NoiseOverlay } from "@/components/landing/NoiseOverlay";

export default async function UnionPage() {
  const user = await getProfile();
  if (!user) redirect("/login");
  if (!hasCompleteUnionLocation(user)) redirect("/union/location");

  const [state, counts] = await Promise.all([
    getUnionProfileState(),
    getUnionConnectionCounts().catch(() => null),
  ]);
  const profile = state?.profile ?? null;

  return (
    <div className="relative min-h-screen bg-bg-0">
      <BackgroundOrbs />
      <NoiseOverlay />
      <Header user={user} />
      <main className="mx-auto max-w-4xl px-4 py-8 pb-24">
        <div className="mb-6">
          <h1 className="font-display text-2xl font-bold text-text-0">
            VedaMatch Union
          </h1>
          <p className="mt-1 text-sm text-text-1">
            Осознанные знакомства и сотрудничество: семья, дружба, служение,
            проекты
          </p>
        </div>

        <UnionNav incomingPending={counts?.incomingPending ?? 0} />

        {!profile && (
          <div className="mb-6 glass rounded-2xl border border-glass-brd p-4 text-sm text-text-1">
            Добро пожаловать! Чтобы увидеть подходящих людей, заполните профиль
            Union: распределите приоритеты и расскажите о себе.
          </div>
        )}

        <UnionProfileForm profile={profile} />
      </main>
    </div>
  );
}
