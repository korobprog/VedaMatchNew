import { ASTRO_COMPATIBILITY_PURPOSES } from "@vedamatch/shared";
import { CompatibilityView } from "@/components/astro/compatibility-view";

export const metadata = {
  title: "Совместимость по звёздам",
  description: "Гуна-милан: совместимость натальных карт по традиции джйотиша",
};

export default async function AstroCompatibilityPage({
  searchParams,
}: {
  searchParams: Promise<{ with?: string; purpose?: string }>;
}) {

  const { with: withUserId, purpose } = await searchParams;
  // Цель приходит из карточки Знакомств вместе со ссылкой. Чужое значение в
  // адресе — не повод слать запрос неизвестно ради чего: непонятное просто
  // отбрасываем, и человек выберет цель сам.
  const preset = ASTRO_COMPATIBILITY_PURPOSES.find((known) => known === purpose);

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-8">
      <h1 className="text-2xl font-semibold">Совместимость по звёздам</h1>
      <p className="mt-2 max-w-xl text-text-1">
        Гуна-милан сравнивает положение Луны в двух картах. Сколько критериев
        пойдёт в расчёт, зависит от цели: сватовской счёт ведётся по всем
        восьми, а делу, дружбе и служению часть из них отвечает не на тот
        вопрос. Карта целиком другому человеку не показывается — видно только
        результат, и только после того, как он его примет.
      </p>

      <div className="mt-8">
        <CompatibilityView
          autoRequestUserId={withUserId ?? null}
          presetPurpose={preset ?? null}
        />
      </div>

      <p className="mt-10 text-sm text-text-2">
        Материалы сервиса предназначены для самопознания и размышления и не
        заменяют медицинскую, юридическую или финансовую консультацию.
      </p>
    </main>
  );
}
