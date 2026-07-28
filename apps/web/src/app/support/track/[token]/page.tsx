import Link from "next/link";
import { notFound } from "next/navigation";
import { getSupportTicketByToken } from "@/lib/api";
import { Navbar } from "@/components/landing/Navbar";
import { BackgroundOrbs } from "@/components/landing/Orb";
import { NoiseOverlay } from "@/components/landing/NoiseOverlay";
import { SupportThread } from "@/components/support/support-thread";

/** Гостевая страница по секретной ссылке — из поиска её быть не должно. */
export const metadata = { robots: { index: false, follow: false } };

export default async function TrackSupportTicketPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const ticket = await getSupportTicketByToken(token);
  if (!ticket) notFound();

  return (
    <div className="relative min-h-screen bg-bg-0">
      <BackgroundOrbs />
      <NoiseOverlay />
      <Navbar />
      <main className="mx-auto max-w-3xl px-4 pt-28 pb-24">
        <SupportThread ticket={ticket} mode="track" token={token} />
        <p className="mt-6 text-sm text-text-2">
          Сохраните эту ссылку — она открывает обращение без входа в аккаунт.{" "}
          <Link href="/support" className="underline hover:text-text-1">
            Новое обращение
          </Link>
        </p>
      </main>
    </div>
  );
}
