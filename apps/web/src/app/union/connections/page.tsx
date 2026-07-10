import { redirect } from "next/navigation";
import { Header } from "@/components/header";
import { ConnectionsPanel } from "@/components/union/connections-panel";
import { UnionNav } from "@/components/union/union-nav";
import { getProfile } from "@/lib/api";
import {
  getUnionConnectionCounts,
  getUnionConnectionRequests,
} from "@/lib/union-api";

const connectionsLoadError =
  "Не удалось загрузить связи. Обновите страницу и попробуйте снова.";

export default async function UnionConnectionsPage() {
  const user = await getProfile();
  if (!user) redirect("/login");

  const [requests, counts] = await Promise.all([
    getUnionConnectionRequests().catch(() => null),
    getUnionConnectionCounts().catch(() => null),
  ]);

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <Header user={user} />
      <main className="mx-auto max-w-4xl px-4 py-8">
        <h1 className="mb-6 text-2xl font-bold text-zinc-900 dark:text-zinc-100">
          Связи Union
        </h1>
        <UnionNav incomingPending={counts?.incomingPending ?? 0} />
        <ConnectionsPanel
          requests={requests}
          loadError={requests ? null : connectionsLoadError}
        />
      </main>
    </div>
  );
}
