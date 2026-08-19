import { redirect } from "next/navigation";
import { redirectToLogin } from "@/lib/require-user";
import { Header } from "@/components/header";
import { UnionLikesPanel } from "@/components/union/union-likes-panel";
import { UnionNav } from "@/components/union/union-nav";
import { UnionTabBar } from "@/components/union/union-tabbar";
import { UnionTopBar } from "@/components/union/union-top-bar";
import { getProfile } from "@/lib/api";
import {
  getUnionChats,
  getUnionConnectionCounts,
  getUnionConnectionRequests,
} from "@/lib/union-api";
import { hasCompleteUnionLocation } from "@/lib/union-location";
import { BackgroundOrbs } from "@/components/landing/Orb";
import { NoiseOverlay } from "@/components/landing/NoiseOverlay";

export default async function UnionLikesPage() {
  const user = await getProfile();
  if (!user) redirectToLogin("/union/likes");
  if (!hasCompleteUnionLocation(user)) redirect("/union/location");

  const [requests, counts, chats] = await Promise.all([
    getUnionConnectionRequests().catch(() => null),
    getUnionConnectionCounts().catch(() => null),
    getUnionChats().catch(() => null),
  ]);

  return (
    <div className="relative min-h-screen bg-bg-0">
      <BackgroundOrbs />
      <NoiseOverlay />
      <Header user={user} />
      <main className="mx-auto max-w-4xl px-4 py-8 pb-28">
        <UnionTopBar title="Лайки" />
        <div className="mb-6 hidden md:block">
          <h1 className="font-display text-2xl font-bold text-text-0">Лайки</h1>
          <p className="mt-1 text-sm text-text-1">
            Люди, которые уже проявили интерес и ждут вашего ответа.
          </p>
        </div>
        <UnionNav incomingPending={counts?.incomingPending ?? 0} />
        <UnionLikesPanel requests={requests} />
      </main>
      <UnionTabBar
        incomingPending={counts?.incomingPending ?? 0}
        hasUnreadChats={(chats?.unreadTotal ?? 0) > 0}
      />
    </div>
  );
}
