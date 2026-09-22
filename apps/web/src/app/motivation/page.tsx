import Link from "next/link";
import { redirect } from "next/navigation";
import { Shuffle } from "lucide-react";
import { redirectToLogin } from "@/lib/require-user";
import { needsWelcome } from "@/lib/welcome";
import { Header } from "@/components/header";
import { MotivationFeed } from "@/components/motivation/motivation-feed";
import { MotivationTopBar } from "@/components/motivation/motivation-top-bar";
import { ReelsChrome } from "@/components/motivation/reels-chrome";
import { ReelsFeed } from "@/components/motivation/reels-feed";
import {
  feedStyleOf,
  isPinnedCard,
  parseReelsTab,
  reelsHref,
} from "@/components/motivation/feed-style";
import { getDonationSettings, getProfile } from "@/lib/api";
import {
  getMotivationAudio,
  getMotivationCategories,
  getMotivationFeed,
  getMotivationStats,
} from "@/lib/motivation-api";
import { BackgroundOrbs } from "@/components/landing/Orb";
import { NoiseOverlay } from "@/components/landing/NoiseOverlay";

/**
 * Лента мотивации: по умолчанию — рилсы (один пост на экран, свайп вверх),
 * `?view=list` — прежняя карточная лента как запасной вид. `?tab=saved`
 * листает избранное в том же формате, `?tab=cards` — готовые открытки.
 */
export default async function MotivationPage({
  searchParams,
}: {
  searchParams: Promise<{
    view?: string;
    tab?: string;
    post?: string;
    order?: string;
    category?: string;
    speaker?: string;
    work?: string;
  }>;
}) {
  const params = await searchParams;
  const view = params.view === "list" ? "list" : "reels";
  const tab = parseReelsTab(params.tab);
  /* Случайный порядок. Живёт в адресе, а не в настройках: это не то, что
     выбирают однажды и надолго, — это «перемешай сейчас», и уходить за ним
     на страницу настроек дороже, чем нажать кнопку над лентой. */
  const order = params.order === "random" ? ("random" as const) : undefined;
  /* Лента одной папки. Тоже в адресе: из неё выходят кнопкой «назад», и
     состояние, которого нет в ссылке, при этом теряется молча. */
  const category = params.category || undefined;
  /* Фильтр по автору и источнику (VED-206) — там же, в адресе, и по той же
     причине. Повторённый параметр приходит массивом — его не принимаем. */
  const text = (value: unknown) =>
    typeof value === "string" && value.trim() ? value.trim() : undefined;
  const attribution = { speaker: text(params.speaker), work: text(params.work) };
  /* Две ленты (VED-121): «Для вас» — нейросеть и цитата поверх, «Открытки» —
     готовые картинки с напечатанным текстом. Список остаётся общим: у него
     нет вкладок, и прятать там половину публикаций было бы нечем объяснить. */
  const style = view === "reels" ? feedStyleOf(tab) : undefined;
  const [user, feedResult, donation, stats, audio, categories] =
    await Promise.all([
    getProfile(),
    // `?post=slug` открывает ленту на конкретном рилсе — так работает переход
    // из мастера и из «Моих рилсов».
    //
    // Отказ ленты откладываем, а не бросаем сразу: у новичка без этапа пути
    // API отвечает 400 «Сначала пройдите самоидентификацию», а запрос идёт
    // параллельно с профилем — и страница падала в «Страница не открылась»
    // раньше, чем редирект в мастер успевал сработать. Сначала решаем, куда
    // вести человека, и только потом поднимаем настоящую ошибку.
    getMotivationFeed(
      tab === "saved" ? "favorites" : "all",
      params.post,
      order,
      category,
      undefined,
      style,
      attribution,
    ).then(
      (value) => ({ value, error: null }),
      (error: unknown) => ({ value: null, error }),
    ),
    getDonationSettings(),
    getMotivationStats(),
    // Фон для чтения. Пустой список — кнопки музыки в ленте не будет.
    getMotivationAudio(),
    // Кнопки категорий на пустых экранах ленты (VED-135) — из меню своей
    // ленты (VED-139). Из избранного кнопки ведут в «Для вас».
    view === "reels"
      ? getMotivationCategories(style ?? "art")
      : Promise.resolve(null),
  ]);
  if (!user) redirectToLogin("/motivation");
  // Новичок идёт в мастер: там тот же вопрос об этапе, но после имени
  // и города и с прогрессом. Страница анкеты остаётся для повторного
  // прохождения, её не редирект открывает, а ссылка из профиля.
  if (needsWelcome(user)) redirect("/welcome");
  if (feedResult.error) throw feedResult.error;
  const feed = feedResult.value;
  const isAdmin = user.role === "admin" || user.role === "service-admin";
  const initial = feed ?? { items: [], nextCursor: null };

  /* Вкладка не выбрана явно, а просят открытку — ведём в «Открытки». Ссылок
     вида `?post=` много: мастер, «Мои», плитки папки, админка, — и открытка,
     открытая в «Для вас», тянула бы за собой ленту другого стиля. То же для
     папки, где лежат одни открытки: иначе она открылась бы пустой. */
  if (view === "reels" && !params.tab) {
    if (isPinnedCard(params.post, initial.items[0])) {
      redirect(reelsHref({ tab: "cards", order, category, post: params.post, ...attribution }));
    }
    if (category && initial.items.length === 0) {
      const cards = await getMotivationFeed(
        "all",
        undefined,
        order,
        category,
        undefined,
        "cards",
        attribution,
      );
      if (cards?.items.length) {
        redirect(reelsHref({ tab: "cards", order, category, ...attribution }));
      }
    }
  }

  if (view === "list") {
    return (
      <div className="relative min-h-dvh bg-bg-0">
        <BackgroundOrbs />
        <NoiseOverlay />
        <Header user={user} />
        <main className="mx-auto max-w-3xl px-2 py-4 pb-24 sm:px-4">
          <MotivationTopBar
            active="feed"
            isAdmin={isAdmin}
            // Порядок переезжает вместе с человеком: вернуться к рилсам и
            // молча получить другую ленту — не то, о чём просили.
            action={{
              href: order ? "/motivation?order=random" : "/motivation",
              label: "Рилсы",
            }}
            count={stats?.published}
          />
          <div className="mt-4 px-2">
            {/* Перемешать — и здесь тоже: список и рилсы показывают одну и ту
                же ленту, и порядок у неё должен переключаться одинаково. */}
            <Link
              href={
                order
                  ? "/motivation?view=list"
                  : "/motivation?view=list&order=random"
              }
              className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-glass-brd bg-glass px-3 py-1.5 text-xs font-medium text-text-1 hover:text-text-0"
            >
              <Shuffle className="size-3.5" aria-hidden />
              {order ? "По порядку" : "Вперемешку"}
            </Link>
            <MotivationFeed initial={initial} order={order} />
          </div>
        </main>
      </div>
    );
  }

  return (
    // Рилс — на весь экран, без общей шапки портала и строки навигации над
    // ним: они отняли бы у видео как раз ту высоту, ради которой открывают
    // полноэкранную ленту. Кнопка назад и меню разделов теперь свои,
    // прозрачным оверлеем поверх кадра — см. ReelsChrome.
    <div className="relative h-dvh min-h-[560px] bg-bg-0">
      <BackgroundOrbs />
      <NoiseOverlay />
      <div className="relative mx-auto h-full w-full max-w-[480px]">
        <ReelsFeed
          /* Лента держит публикации в своём состоянии. Без ключа переход по
             вкладке внутри приложения приносил новую первую страницу, а на
             экране оставалась прежняя: в «Открытках» листались афоризмы
             «Для вас». Другая вкладка, порядок или папка — другая лента. */
          key={[
            tab,
            order ?? "",
            category ?? "",
            params.post ?? "",
            attribution.speaker ?? "",
            attribution.work ?? "",
          ].join("|")}
          initial={initial}
          tab={tab}
          donation={donation}
          order={order}
          category={category}
          speaker={attribution.speaker}
          work={attribution.work}
          isAdmin={isAdmin}
          audio={audio}
          categories={categories ?? []}
        />
        <ReelsChrome
          isAdmin={isAdmin}
          order={order}
          count={stats?.published}
          tab={tab}
        />
      </div>
    </div>
  );
}
