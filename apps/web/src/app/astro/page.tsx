import Link from "next/link";
import { redirect } from "next/navigation";
import { getProfile } from "@/lib/api";
import { getAstroState } from "@/lib/astro-api";
import { BirthDataForm } from "@/components/astro/birth-data-form";

export const metadata = {
  title: "Астрология — VedaMatch",
  description: "Ведическая карта рождения и персональный день",
};

export default async function AstroPage() {
  const user = await getProfile();
  if (!user) redirect("/login");

  const state = await getAstroState();
  if (!state) redirect("/login");

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-8">
      <h1 className="text-2xl font-semibold">Астрология</h1>
      <p className="mt-2 max-w-2xl text-black/70 dark:text-white/70">
        Ведическая карта строится по моменту и месту рождения. Чем точнее данные,
        тем больше разделов открывается — начните с того, что знаете сейчас.
      </p>

      {state.birthData && (
        <Link
          href="/astro/chart"
          className="mt-4 inline-block rounded-lg bg-amber-500 px-5 py-2.5 font-medium text-black"
        >
          Смотреть карту
        </Link>
      )}

      <div className="mt-8">
        <BirthDataForm initial={state} />
      </div>

      <p className="mt-10 text-sm text-black/50 dark:text-white/50">
        Материалы сервиса предназначены для самопознания и размышления и не
        заменяют медицинскую, юридическую или финансовую консультацию.
      </p>
    </main>
  );
}
