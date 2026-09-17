import { redirect } from "next/navigation";
import { redirectToLogin } from "@/lib/require-user";
import { needsWelcome } from "@/lib/welcome";
import { Header } from "@/components/header";
import { MotivationTopBar } from "@/components/motivation/motivation-top-bar";
import { ReelWizard } from "@/components/motivation/reel-wizard";
import { getDonationSettings, getProfile } from "@/lib/api";
import { getMotivationCategories } from "@/lib/motivation-api";
import { BackgroundOrbs } from "@/components/landing/Orb";
import { NoiseOverlay } from "@/components/landing/NoiseOverlay";

/**
 * «Свой рилс»: мастер из трёх шагов. Из читалки приходит `?from=vedabase&
 * book=…&chapter=…&text=…` — цитата подставляется и сверяется с главой;
 * `?reel=<id>` открывает экран статуса уже созданного рилса; `?tab=cards`
 * (VED-240) — пришли из вкладки «Открытки» ленты, и первый выбор мастера
 * должен стоять на «Готовая картинка с цитатой».
 */
export default async function MotivationCreatePage({
  searchParams,
}: {
  searchParams: Promise<{
    from?: string;
    book?: string;
    chapter?: string;
    text?: string;
    reel?: string;
    tab?: string;
  }>;
}) {
  const params = await searchParams;
  const [user, donation, categories] = await Promise.all([
    getProfile(),
    getDonationSettings(),
    getMotivationCategories(),
  ]);
  if (!user) redirectToLogin("/motivation/create");
  // Новичок идёт в мастер: там тот же вопрос об этапе, но после имени
  // и города и с прогрессом. Страница анкеты остаётся для повторного
  // прохождения, её не редирект открывает, а ссылка из профиля.
  if (needsWelcome(user)) redirect("/welcome");
  const isAdmin = user.role === "admin" || user.role === "service-admin";
  const prefill =
    params.from === "vedabase" && params.book && params.chapter && params.text
      ? { book: params.book, chapter: params.chapter, text: params.text }
      : {};

  return (
    <div className="relative min-h-dvh bg-bg-0">
      <BackgroundOrbs />
      <NoiseOverlay />
      <Header user={user} />
      <main className="mx-auto max-w-2xl px-2 py-4 pb-24 sm:px-4">
        <MotivationTopBar active="feed" isAdmin={isAdmin} title="Свой рилс" />
        <p className="mt-3 max-w-prose px-2 text-sm text-text-1">
          {/* Порядок шагов обязан совпадать с мастером: подпись осталась от
              прежнего, четырёхшагового, и обещала картинку последней — а её
              выбирают вторым шагом, до проверки. Человек доходил до первого
              экрана и не находил, где приложить свой кадр. */}
          Текст → картинка → проверка. Картинку можно сделать нейросетью или
          загрузить свою. В бете — один рилс в день бесплатно, генерацию
          оплачивает проект.
        </p>
        <div className="mt-4 px-2">
          <ReelWizard
            prefill={{
              ...prefill,
              reelId: params.reel,
              tab: params.tab === "cards" ? "cards" : undefined,
            }}
            donation={donation}
            categories={categories ?? []}
            isAdmin={isAdmin}
          />
        </div>
      </main>
    </div>
  );
}
