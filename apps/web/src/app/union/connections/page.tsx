import { redirect } from "next/navigation";
import { redirectToLogin } from "@/lib/require-user";
import { Header } from "@/components/header";
import { ConnectionsPanel } from "@/components/union/connections-panel";
import { UnionNav } from "@/components/union/union-nav";
import { UnionTabBar } from "@/components/union/union-tabbar";
import { getProfile } from "@/lib/api";
import {
  getUnionChats,
  getUnionConnectionCounts,
  getUnionConnectionRequests,
} from "@/lib/union-api";
import { hasCompleteUnionLocation } from "@/lib/union-location";
import { BackgroundOrbs } from "@/components/landing/Orb";
import { NoiseOverlay } from "@/components/landing/NoiseOverlay";

const connectionsLoadError =
  "Не удалось загрузить связи. Обновите страницу и попробуйте снова.";

export default async function UnionConnectionsPage() {
  const user = await getProfile();
  if (!user) redirectToLogin("/union/connections");
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
        <h1 className="mb-6 font-display text-2xl font-bold text-text-0">
          Связи Union
        </h1>
        <UnionNav incomingPending={counts?.incomingPending ?? 0} />
        <ConnectionsPanel
          requests={requests}
          loadError={requests ? null : connectionsLoadError}
        />
      </main>
      <UnionTabBar
        incomingPending={counts?.incomingPending ?? 0}
        hasUnreadChats={(chats?.unreadTotal ?? 0) > 0}
      />
    </div>
  );
}
