import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { TRAVEL_STAY_KIND_LABELS } from "@vedamatch/shared";
import { StayView } from "@/components/travel/stay-view";
import { getPublicStay } from "@/lib/travel-server-api";

type Props = { params: Promise<{ code: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { code } = await params;
  const stay = await getPublicStay(code);
  if (!stay) return { title: "Объект не найден" };
  return {
    // Суффикс «— VedaMatch» дописывает шаблон корневого layout.
    title: `${stay.name} — ${TRAVEL_STAY_KIND_LABELS[stay.kind]}`,
    description: stay.description.slice(0, 160) || stay.address,
    // Страница по QR со стойки, а не витрина: в поиск её не отдаём.
    robots: { index: false, follow: false },
  };
}

/**
 * Страница объекта по QR. Живёт вне группы `(portal)`: та требует входа, а
 * гость сканирует код телефоном и аккаунта у него обычно нет.
 */
export default async function PublicStayPage({ params }: Props) {
  const { code } = await params;
  const stay = await getPublicStay(code);
  if (!stay) notFound();

  return (
    <div className="min-h-dvh bg-bg-0">
      <main className="mx-auto w-full max-w-3xl px-4 py-8">
        <p className="mb-6 text-sm text-text-2">
          <Link href="/" className="underline-offset-4 hover:underline">
            VedaMatch
          </Link>{" "}
          · Путешествия · ночлег
        </p>
        <StayView stayId={stay.id} initialStay={stay} publicMode />
      </main>
    </div>
  );
}
