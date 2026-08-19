import { NoticeDetailView } from "@/components/notices/notice-detail-view";
import { getProfile } from "@/lib/api";
import { requireUser } from "@/lib/require-user";

export const metadata = {
  title: "Объявление",
  robots: { index: false, follow: false },
};

export default async function NoticePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const [{ id }, user] = await Promise.all([params, getProfile()]);

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 pb-28">
      <NoticeDetailView id={id} />
    </main>
  );
}
