import { notFound, redirect } from "next/navigation";
import { redirectToLogin } from "@/lib/require-user";
import { Header } from "@/components/header";
import { RecommendationCard } from "@/components/union/recommendation-card";
import { UnionNav } from "@/components/union/union-nav";
import { getProfile } from "@/lib/api";
import {
  getUnionConnectionCounts,
  getUnionUserCard,
} from "@/lib/union-api";
import { hasCompleteUnionLocation } from "@/lib/union-location";
import { BackgroundOrbs } from "@/components/landing/Orb";
import { NoiseOverlay } from "@/components/landing/NoiseOverlay";

type Params = Promise<{ id: string }>;

export default async function UnionUserPage({ params }: { params: Params }) {
  const user = await getProfile();
  if (!user) {
    const { id } = await params;
    redirectToLogin(`/union/users/${id}`);
  }
  if (!hasCompleteUnionLocation(user)) redirect("/union/location");

  const { id } = await params;
  const [card, counts] = await Promise.all([
    getUnionUserCard(id),
    getUnionConnectionCounts().catch(() => null),
  ]);
  if (!card) notFound();

  return (
    <div className="relative min-h-screen bg-bg-0">
      <BackgroundOrbs />
      <NoiseOverlay />
      <Header user={user} />
      <main className="mx-auto max-w-4xl px-4 py-8 pb-24">
        <h1 className="mb-6 font-display text-2xl font-bold text-text-0">
          Профиль Union
        </h1>
        <UnionNav incomingPending={counts?.incomingPending ?? 0} />
        <div className="max-w-md">
          <RecommendationCard item={card} />
        </div>
      </main>
    </div>
  );
}
