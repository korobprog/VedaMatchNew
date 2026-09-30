import { notFound, redirect } from "next/navigation";
import { redirectToLogin } from "@/lib/require-user";
import { getAdminTeamApplication, getProfile } from "@/lib/api";
import { TeamApplicationDetail } from "@/components/team/team-application-detail";

export default async function AdminTeamApplicationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getProfile();
  if (!user) redirectToLogin(`/admin/team-applications/${id}`);
  if (user.role !== "admin") redirect("/");

  const application = await getAdminTeamApplication(id);
  if (!application) notFound();

  return (
    <>
      <TeamApplicationDetail application={application} />
    </>
  );
}
