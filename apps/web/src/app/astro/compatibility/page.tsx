import { getProfile } from "@/lib/api";
import { redirectToLogin } from "@/lib/require-user";
import { CompatibilityView } from "@/components/astro/compatibility-view";

export const metadata = {
  title: "Совместимость по звёздам",
  description: "Гуна-милан: совместимость натальных карт по традиции джйотиша",
};

export default async function AstroCompatibilityPage({
  searchParams,
}: {
  searchParams: Promise<{ with?: string }>;
}) {
  const user = await getProfile();
  if (!user) redirectToLogin("/astro/compatibility");

  const { with: withUserId } = await searchParams;

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-8">
      <h1 className="text-2xl font-semibold">Совместимость по звёздам</h1>
      <p className="mt-2 max-w-xl text-black/70 dark:text-white/70">
        Гуна-милан сравнивает положение Луны в двух картах по восьми
        традиционным критериям. Карта целиком другому человеку не показывается
        — видно только этот результат, и только после того, как он его примет.
      </p>

      <div className="mt-8">
        <CompatibilityView autoRequestUserId={withUserId ?? null} />
      </div>

      <p className="mt-10 text-sm text-black/50 dark:text-white/50">
        Материалы сервиса предназначены для самопознания и размышления и не
        заменяют медицинскую, юридическую или финансовую консультацию.
      </p>
    </main>
  );
}
