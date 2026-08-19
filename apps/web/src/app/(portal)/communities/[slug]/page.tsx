import { CommunityView } from "@/components/communities/community-view";

export const metadata = {
  title: "Община",
  robots: { index: false, follow: false },
};

export default async function CommunityPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 pb-28">
      <CommunityView slug={slug} />
    </main>
  );
}
