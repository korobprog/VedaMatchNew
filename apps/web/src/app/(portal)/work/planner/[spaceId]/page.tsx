import { WorkBoardView } from "@/components/work/board-view";

export const metadata = {
  title: "Доска — Планировщик",
  robots: { index: false, follow: false },
};

export default async function WorkBoardPage({
  params,
}: {
  params: Promise<{ spaceId: string }>;
}) {
  const { spaceId } = await params;
  return (
    <main className="mx-auto max-w-[1400px] px-4 py-6 pb-28">
      <WorkBoardView spaceId={spaceId} />
    </main>
  );
}
