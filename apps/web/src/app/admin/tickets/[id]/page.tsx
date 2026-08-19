import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { redirectToLogin } from "@/lib/require-user";
import { Header } from "@/components/header";
import { getAdminSupportTicket, getProfile } from "@/lib/api";
import { BackgroundOrbs } from "@/components/landing/Orb";
import { NoiseOverlay } from "@/components/landing/NoiseOverlay";
import { AdminTicketDetail } from "@/components/admin-ticket-detail";

export default async function AdminTicketPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getProfile();
  if (!user) redirectToLogin(`/admin/tickets/${id}`);
  if (user.role !== "admin") redirect("/");

  const ticket = await getAdminSupportTicket(id);
  if (!ticket) notFound();

  return (
    <div className="relative min-h-screen bg-bg-0">
      <BackgroundOrbs />
      <NoiseOverlay />
      <Header user={user} />
      <main className="mx-auto max-w-3xl px-4 py-8 pb-24">
        <Link
          href="/admin/tickets"
          className="mb-4 inline-block text-sm text-text-2 hover:text-text-0"
        >
          ← Все обращения
        </Link>
        <AdminTicketDetail ticket={ticket} />
      </main>
    </div>
  );
}
