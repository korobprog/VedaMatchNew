import { HiddenPeople } from "@/components/union/hidden-people";
import { UnionNav } from "@/components/union/union-nav";
import { UnionTabBar } from "@/components/union/union-tabbar";
import { UnionTopBar } from "@/components/union/union-top-bar";
import { requireUser } from "@/lib/require-user";
import {
  getUnionArchive,
  getUnionBlocks,
  getUnionChats,
  getUnionConnectionCounts,
} from "@/lib/union-api";
import { BackgroundOrbs } from "@/components/landing/Orb";
import { NoiseOverlay } from "@/components/landing/NoiseOverlay";

export default async function UnionHiddenPage() {
  await requireUser();

  const [archive, blocks, counts, chats] = await Promise.all([
    getUnionArchive().catch(() => null),
    getUnionBlocks().catch(() => null),
    getUnionConnectionCounts().catch(() => null),
    getUnionChats().catch(() => null),
  ]);

  return (
    <>
      <BackgroundOrbs />
      <NoiseOverlay />
      <main className="mx-auto max-w-6xl px-4 py-8 pb-28">
        <UnionTopBar title="Скрытые" />
        <div className="mb-6 hidden md:block">
          <h1 className="font-display text-2xl font-bold text-text-0 sm:text-3xl">
            Скрытые
          </h1>
          <p className="mt-1 text-sm text-text-1">
            Кого вы убрали из выдачи сами. Архив можно вернуть в любой момент.
          </p>
        </div>
        <UnionNav incomingPending={counts?.incomingPending ?? 0} />

        <div className="mt-6">
          <HiddenPeople
            archive={archive?.items ?? []}
            blocked={blocks?.blocked ?? []}
          />
        </div>
      </main>
      <UnionTabBar
        incomingPending={counts?.incomingPending ?? 0}
        hasUnreadChats={(chats?.unreadTotal ?? 0) > 0}
      />
    </>
  );
}
