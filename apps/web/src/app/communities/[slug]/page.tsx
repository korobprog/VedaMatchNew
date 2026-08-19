import { Header } from "@/components/header";
import { redirectToLogin } from "@/lib/require-user";
import { CommunityView } from "@/components/communities/community-view";
import { getProfile } from "@/lib/api";

export const metadata = {
  title: "Община",
  robots: { index: false, follow: false },
};

export default async function CommunityPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const [{ slug }, user] = await Promise.all([params, getProfile()]);
  if (!user) redirectToLogin(`/communities/${slug}`);

  return (
    <div className="relative min-h-screen bg-bg-0">
      <Header user={user} />
      <main className="mx-auto max-w-3xl px-4 py-8 pb-28">
        <CommunityView slug={slug} />
      </main>
    </div>
  );
}
