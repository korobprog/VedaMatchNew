import { redirect } from "next/navigation";
import { Header } from "@/components/header";
import { UnionNav } from "@/components/union/union-nav";
import { UnionTabBar } from "@/components/union/union-tabbar";
import { UnionProfileForm } from "@/components/union/union-profile-form";
import { getProfile } from "@/lib/api";
import { BlockedUsersPanel } from "@/components/union/blocked-users-panel";
import {
  getUnionChats,
  getUnionBlocks,
  getUnionConnectionCounts,
  getUnionProfileState,
} from "@/lib/union-api";
import { hasCompleteUnionLocation } from "@/lib/union-location";
import { BackgroundOrbs } from "@/components/landing/Orb";
import { NoiseOverlay } from "@/components/landing/NoiseOverlay";

export default async function UnionProfilePage() {
  const user = await getProfile();
  if (!user) redirect("/login");
  if (!hasCompleteUnionLocation(user)) redirect("/union/location");

  const [state, counts, blocks, chats] = await Promise.all([
    getUnionProfileState(),
    getUnionConnectionCounts().catch(() => null),
    getUnionBlocks().catch(() => null),
    getUnionChats().catch(() => null),
  ]);
  const profile = state?.profile ?? null;

  return (
    <div className="relative min-h-screen bg-bg-0">
      <BackgroundOrbs />
      <NoiseOverlay />
      <Header user={user} />
      <main className="mx-auto max-w-4xl px-4 py-8 pb-28">
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

        <UnionProfileForm
          profile={profile}
          completeness={
            state?.completeness ?? {
              percent: 0,
              items: [],
              missing: [],
              next: null,
            }
          }
        />

        <div className="mt-6">
          <BlockedUsersPanel blocked={blocks?.blocked ?? []} />
        </div>
      </main>
      <UnionTabBar
        incomingPending={counts?.incomingPending ?? 0}
        hasUnreadChats={(chats?.unreadTotal ?? 0) > 0}
      />
    </div>
  );
}
