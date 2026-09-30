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
      <AdminTicketDetail ticket={ticket} />
    </>
  );
}
