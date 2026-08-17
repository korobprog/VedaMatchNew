import { redirect } from "next/navigation";
import { Header } from "@/components/header";
import { CommunityForm } from "@/components/communities/community-form";
import { getProfile } from "@/lib/api";

export const metadata = {
  title: "Новая община",
  robots: { index: false, follow: false },
};

export default async function NewCommunityPage() {
  const user = await getProfile();
  if (!user) redirect("/login");

  return (
    <div className="relative min-h-screen bg-bg-0">
      <Header user={user} />
      <main className="mx-auto max-w-2xl px-4 py-8 pb-28">
        <h1 className="mb-6 font-display text-2xl font-bold text-text-0">
          Завести общину
        </h1>
        <CommunityForm />
      </main>
    </div>
  );
}
