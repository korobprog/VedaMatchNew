import Link from "next/link";
import { notFound } from "next/navigation";
import { redirectToLogin } from "@/lib/require-user";
import { getMySupportTicket, getProfile } from "@/lib/api";
import { Header } from "@/components/header";
import { BackgroundOrbs } from "@/components/landing/Orb";
import { NoiseOverlay } from "@/components/landing/NoiseOverlay";
import { SupportThread } from "@/components/support/support-thread";

export default async function MySupportTicketPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getProfile();
  if (!user) redirectToLogin(`/support/${id}`);

  const ticket = await getMySupportTicket(id);
  if (!ticket) notFound();

  return (
    <div className="relative min-h-screen bg-bg-0">
      <BackgroundOrbs />
      <NoiseOverlay />
      <Header user={user} />
      <main className="mx-auto max-w-3xl px-4 py-8 pb-24">
        <Link
          href="/support"
          className="mb-4 inline-block text-sm text-text-2 hover:text-text-0"
        >
          ← Все обращения
        </Link>
        <SupportThread ticket={ticket} mode="my" />
      </main>
    </div>
  );
}
