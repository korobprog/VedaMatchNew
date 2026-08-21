import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { redirectToLogin } from "@/lib/require-user";
import { getAdminSupportTicket, getProfile } from "@/lib/api";
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
    <>
      <Link
        href="/admin/tickets"
        className="mb-4 inline-block text-sm text-text-2 hover:text-text-0"
      >
        ← Все обращения
      </Link>
      <AdminTicketDetail ticket={ticket} />
    </>
  );
}
