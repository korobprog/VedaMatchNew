import Link from "next/link";
import { redirectToLogin } from "@/lib/require-user";
import { getAstroState } from "@/lib/astro-api";
import { BirthDataForm } from "@/components/astro/birth-data-form";

export const metadata = {
  title: "Астрология",
  description: "Ведическая карта рождения и персональный день",
};

export default async function AstroPage() {
  // Вход проверяет PortalLayout; сюда доходит только вошедший. Остаётся
  // случай, когда сервис не отдал состояние, — тогда всё же на вход.
  const state = await getAstroState();
  if (!state) redirectToLogin("/astro");

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-8">
      <h1 className="text-2xl font-semibold">Астрология</h1>
      <p className="mt-2 max-w-2xl text-text-1">
        Ведическая карта строится по моменту и месту рождения. Чем точнее данные,
        тем больше разделов открывается — начните с того, что знаете сейчас.
      </p>

      {/* Книга карт доступна всегда, а не только после своей карты: вести
          чужие можно и до того, как заполнил собственные данные. */}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        {state.birthData && (
          <Link
            href="/astro/chart"
            className="btn-mint inline-block rounded-lg px-5 py-2.5 font-medium"
          >
            Смотреть карту
          </Link>
        )}
        <Link
          href="/astro/subjects"
          className="inline-block rounded-lg border border-glass-brd px-5 py-2.5 font-medium text-text-1 transition hover:text-text-0"
        >
          Мои карты
        </Link>
      </div>

      <div className="mt-8">
        <BirthDataForm initial={state} />
      </div>

      <p className="mt-10 text-sm text-text-2">
        Материалы сервиса предназначены для самопознания и размышления и не
        заменяют медицинскую, юридическую или финансовую консультацию.
      </p>
    </main>
  );
}
