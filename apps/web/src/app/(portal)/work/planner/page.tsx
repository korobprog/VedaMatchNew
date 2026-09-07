import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { WorkSpacesView } from "@/components/work/spaces-view";

export const metadata = {
  title: "Планировщик — рабочие среды",
  description:
    "Канбан-доски для совместных дел: среда под проект, карточки и сроки.",
  robots: { index: false, follow: false },
};

export default function WorkPlannerPage() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-8 pb-28">
      <Link
        href="/work"
        className="mb-4 inline-flex items-center gap-1 text-sm text-text-1 hover:text-text-0"
      >
        <ArrowLeft aria-hidden className="size-4" />
        Работа
      </Link>
      <div className="mb-6">
        <h1 className="font-display text-2xl font-bold text-text-0 sm:text-3xl">
          Планировщик
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-text-1">
          Рабочая среда — это проект: своя доска, свои люди, свои задачи. «Мои
          дела» заведены сразу и видны только вам; в остальные приглашают
          ссылкой.
        </p>
      </div>
      <WorkSpacesView />
    </main>
  );
}
